import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  isService,
  readSession,
  resolveActor,
  type AdminSession,
} from '../../../auth/admin-auth.js';
import { isDuplicateKey, tx } from '../../../config/db.js';
import { ERR, can, errText, type Role } from '../../../lib/domain.js';
import { daysSince, makeCode, taka } from '../../../lib/format.js';
import {
  cookBalances,
  lockCook,
  post,
  refundEscrow,
  releaseEscrow,
  splitEscrow,
} from '../../../logic/ledger.js';
import {
  getSettings,
  getTopupConfig,
  saveTopupConfig,
  topupConfigured,
} from '../../../logic/settings.js';
import { approveTopup, rejectTopup, statusOf } from '../../../logic/topup-requests.js';
import { payWithdrawal, rejectWithdrawal } from '../../../logic/withdrawals.js';
import { notify } from '../../../logic/wallet.js';
import {
  AuditLog,
  Dispute,
  Kitchen,
  LedgerEntry,
  Order,
  PayoutItem,
  PayoutRun,
  TopUp,
  Withdrawal,
} from '../../../models/index.js';

/**
 * Payouts and disputes — the two money surfaces the admin API was missing.
 *
 * Ported from the panel's `actions/money.ts` and `actions/orders.ts` rather
 * than redesigned: the panel is about to become a client of these, and an
 * endpoint that settles a dispute differently from the server action it
 * replaces would be a silent change in what an operator's click means.
 *
 * Nothing here edits money. Every movement is a ledger entry, every entry is
 * idempotent on a key built from what it settles, and every state change
 * carries an audit row written in the same transaction — a money action
 * without an attributable record is an unattributable movement.
 */

const fail = (reply: never, code: string, status = 400) =>
  (reply as unknown as { status: (n: number) => { send: (b: unknown) => unknown } })
    .status(status)
    .send({ error: code, message: errText(code) });

/**
 * Who is acting, according to the panel — but only if the panel proved it is
 * the panel.
 *
 * The service token is the actual authentication; the actor header is what it
 * is allowed to assert once authenticated. Taking the actor on its own would
 * mean anybody who can reach this port is finance.
 */
async function actorOf(request: FastifyRequest): Promise<AdminSession | null> {
  const service = request.headers['x-service-token'];
  if (isService(typeof service === 'string' ? service : undefined)) {
    const raw = request.headers['x-actor'];
    if (typeof raw === 'string') {
      try {
        const actor = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        if (actor?.email && actor?.role) {
          /* The row, not the cookie: a deactivated operator is refused and a
             changed role is the row's. See `resolveActor`. */
          return resolveActor(
            {
              sub: String(actor.sub ?? ''),
              email: String(actor.email),
              name: String(actor.name ?? actor.email),
              role: actor.role as Role,
            },
            { required: false },
          );
        }
      } catch {
        /* A malformed actor header is no actor, not an error. */
      }
    }
  }

  /* Falls back to a session the backend issued itself, so the API is usable
     directly — for a script, or before the panel is migrated. */
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return readSession(header.slice(7).trim());
  }
  return null;
}

/** Require a capability, or refuse. Authorisation lives next to the data. */
async function require(
  request: FastifyRequest,
  reply: never,
  capability: string,
): Promise<AdminSession | null> {
  const actor = await actorOf(request);
  if (!actor) {
    fail(reply, 'unauthenticated', 401);
    return null;
  }
  if (!can(actor.role, capability)) {
    fail(reply, 'admin-forbidden', 403);
    return null;
  }
  return actor;
}

/** Every state-changing action writes one of these, in the same transaction. */
async function audit(
  actor: AdminSession,
  entry: {
    action: string;
    targetType: string;
    targetId: string;
    summary?: string;
    before?: unknown;
    after?: unknown;
  },
  session?: Parameters<typeof AuditLog.create>[1] extends { session: infer S } ? S : never,
) {
  await AuditLog.create(
    [
      {
        actorId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        ...entry,
        summary: entry.summary ?? '',
        before: entry.before ?? null,
        after: entry.after ?? null,
      },
    ],
    session ? { session } : undefined,
  );
}

/**
 * Mongoose casts a malformed id by throwing, so an id that could never match
 * arrives as a 500 for what is really a 404. Checked before every lookup.
 */
const isId = (value: string) => /^[a-f\d]{24}$/i.test(value);

type DisputeNote = { at: string; by: string; text: string };

/* The field is Mixed, so nothing but a check guarantees it is still a list. */
const notesOf = (value: unknown): DisputeNote[] => (Array.isArray(value) ? value : []);

const sumOf = (rows: { total?: number }[]) => rows[0]?.total ?? 0;

export async function moneyRoutes(app: FastifyInstance) {
  /* ---------------- payouts ---------------- */

  /**
   * The runs, and what each cook is owed right now.
   *
   * The owed column is folded live from the ledger rather than read from a
   * stored balance — a stored total is a second source of truth and one of
   * them will be wrong.
   */
  app.get('/payouts', async (request, reply) => {
    const actor = await require(request, reply as never, 'ledger.read');
    if (!actor) return;

    const query = z
      .object({ take: z.coerce.number().max(50).default(12) })
      .parse(request.query ?? {});

    /* `owed` is what a batch run could pay: the ledger balance less any open
       withdrawal. A cook's reserved money is theirs but spoken for, so it is
       reported beside the row and kept out of the figures a run is cut from. */
    const [settings, gross, owed, runs] = await Promise.all([
      getSettings(),
      cookBalances(),
      cookBalances(undefined, { excludeReserved: true }),
      PayoutRun.find().sort({ createdAt: -1 }).limit(query.take).lean(),
    ]);

    const runIds = runs.map((run) => String(run._id));
    const [kitchens, items, paid] = await Promise.all([
      /* A kitchenId on a ledger row is whatever the order carried. One that is
         not an ObjectId would make the whole $in cast throw, so the names are
         looked up for the ids that can have one and the rest fall back. */
      Kitchen.find({ _id: { $in: owed.map((row) => row.kitchenId).filter(isId) } })
        .select('name area')
        .lean(),
      PayoutItem.find({ payoutRunId: { $in: runIds } })
        .sort({ amount: -1 })
        .lean(),
      LedgerEntry.aggregate<{ _id: null; total: number }>([
        { $match: { kind: 'payout' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const kitchenOf = new Map(kitchens.map((k) => [String(k._id), k]));
    const grossOf = new Map(gross.map((row) => [row.kitchenId, row.amount]));
    const itemsOf = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsOf.get(item.payoutRunId) ?? [];
      list.push(item);
      itemsOf.set(item.payoutRunId, list);
    }

    const due = owed.filter((row) => row.amount >= settings.payoutMinimum);
    const carried = owed.filter((row) => row.amount < settings.payoutMinimum);
    const total = (rows: { amount: number }[]) => rows.reduce((sum, row) => sum + row.amount, 0);

    return {
      owed: owed.map((row) => ({
        kitchenId: row.kitchenId,
        kitchenName: kitchenOf.get(row.kitchenId)?.name ?? row.kitchenId,
        area: kitchenOf.get(row.kitchenId)?.area ?? '',
        amount: row.amount,
        reserved: (grossOf.get(row.kitchenId) ?? row.amount) - row.amount,
        // Below the minimum a cook is not skipped, they are carried.
        carried: row.amount < settings.payoutMinimum,
      })),
      due: { count: due.length, total: total(due) },
      carried: { count: carried.length, total: total(carried) },
      paidEver: sumOf(paid),
      minimum: settings.payoutMinimum,
      runs: runs.map((run) => ({
        ...run,
        id: String(run._id),
        items: (itemsOf.get(String(run._id)) ?? []).map((item) => ({
          ...item,
          id: String(item._id),
        })),
      })),
    };
  });

  /**
   * Draft a run from what cooks are currently owed.
   *
   * A draft first, so the numbers can be read before money is said to have
   * moved: nothing reaches the ledger until `/pay`. Anyone under the minimum
   * is left out and carries to the next run — paying ৳12 by hand costs more
   * than the ৳12.
   */
  app.post('/payouts', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const body = z
      .object({ method: z.string().default('bKash'), note: z.string().default('') })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    /* One draft at a time. Two drafts cut from the same balances both say the
       cook is owed the full amount, and paying both pays it twice — the
       ledger's idempotency key is per run, so it would not notice. The
       existing run's id travels in the refusal so the operator can open it. */
    const open = await PayoutRun.findOne({ status: 'draft' }).select({ code: 1 }).lean();
    if (open) {
      return reply.status(409).send({
        error: ERR.DUPLICATE,
        message: `${open.code} is still a draft. Pay or cancel it before drafting another.`,
        detail: { runId: String(open._id), code: open.code },
      });
    }

    const settings = await getSettings();
    /* Net of open withdrawals: a run cut from the gross balance would pay a
       cook the very money they asked to withdraw. */
    const owed = (await cookBalances(undefined, { excludeReserved: true })).filter(
      (row) => row.amount >= settings.payoutMinimum,
    );
    if (!owed.length) return fail(reply as never, ERR.NOTHING_TO_PAY);

    const kitchens = await Kitchen.find({
      _id: { $in: owed.map((row) => row.kitchenId).filter(isId) },
    })
      .select('name')
      .lean();
    const nameOf = new Map(kitchens.map((k) => [String(k._id), k.name]));

    const total = owed.reduce((sum, row) => sum + row.amount, 0);

    const run = await tx(async (session) => {
      const [created] = await PayoutRun.create(
        [
          {
            code: makeCode('PR'),
            status: 'draft',
            method: body.data.method,
            note: body.data.note,
            total,
            cookCount: owed.length,
            createdBy: actor.email,
          },
        ],
        { session },
      );

      /* The amounts are frozen onto the items here. A cook who earns more
         between the draft and the payment is paid what the run says and the
         difference lands in the next one — a run whose total moves after an
         operator has read it is not a document anybody can approve. */
      await PayoutItem.create(
        owed.map((row) => ({
          payoutRunId: String(created._id),
          kitchenId: row.kitchenId,
          kitchenName: nameOf.get(row.kitchenId) ?? row.kitchenId,
          amount: row.amount,
        })),
        /* `ordered` is not optional here: Mongoose refuses a multi-document
           create on a session without it, so a run with two or more cooks —
           every real run — threw a 500 before anything was written. */
        { session, ordered: true },
      );

      await audit(
        actor,
        {
          action: 'payout.draft',
          targetType: 'PayoutRun',
          targetId: String(created._id),
          summary: `${created.code} — ${owed.length} cooks, ${taka(total)}`,
          after: { total, cookCount: owed.length, method: body.data.method },
        },
        session as never,
      );

      return created;
    });

    return { id: String(run._id), code: run.code, total, cookCount: owed.length };
  });

  /**
   * Mark a run paid, and post the ledger entries that say so.
   *
   * `cook` → `external`: the money has left the platform. Each entry carries
   * an idempotency key built from the run and the kitchen, so a double-clicked
   * "Mark paid" pays once — the second post is refused by the unique index
   * rather than by anything this route remembers.
   *
   * The amounts were frozen onto the items at draft time, and a balance can
   * fall between then and now — a refund posted against a released order, an
   * adjustment, a second draft that somebody paid first. So every item is
   * checked against the cook's balance *inside the transaction*, and one
   * that no longer has cover is skipped rather than posted: a payout that
   * overdraws a cook's account is money the platform invented. A run with a
   * skip in it lands on `partial`, never `paid`, so the carried cooks are not
   * reported as settled.
   */
  app.post('/payouts/:id/pay', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    /* A run that is not there and a run that is no longer a draft are the same
       refusal to the caller — this run cannot be paid — and the vocabulary has
       one code for it. */
    if (!isId(id)) return fail(reply as never, ERR.RUN_CLOSED, 404);

    const out = await tx(async (session) => {
      const run = await PayoutRun.findById(id).session(session).lean();
      if (!run) return { ok: false as const, error: ERR.RUN_CLOSED, status: 404 };
      if (run.status !== 'draft') return { ok: false as const, error: ERR.RUN_CLOSED, status: 400 };

      const items = await PayoutItem.find({ payoutRunId: id }).session(session).lean();

      /* The same per-cook lock a withdrawal's "Mark paid" takes, so the two
         cannot each read cover from one snapshot and both post. */
      for (const item of items) await lockCook(session, item.kitchenId);

      /* One fold for every cook rather than one per item, read on the same
         session so it sees exactly the ledger this transaction will append
         to. Net of open withdrawals: money a cook has asked for is paid by
         that request, not by this run. */
      const balances = await cookBalances(session, { excludeReserved: true });
      const owedTo = new Map(balances.map((row) => [row.kitchenId, row.amount]));

      let paid = 0;
      let paidTotal = 0;
      /* Entries that were already there — a retry of a run whose first attempt
         committed. Not paid *by this call*, and not a skip either. */
      let duplicate = 0;
      const skipped: { kitchenId: string; kitchenName: string; amount: number; owed: number }[] = [];

      for (const item of items) {
        const owed = owedTo.get(item.kitchenId) ?? 0;
        if (owed < item.amount) {
          skipped.push({
            kitchenId: item.kitchenId,
            kitchenName: item.kitchenName,
            amount: item.amount,
            owed,
          });
          continue;
        }

        const entry = await post(session, {
          kind: 'payout',
          amount: item.amount,
          from: 'cook',
          to: 'external',
          fromRef: item.kitchenId,
          payoutRunId: id,
          note: `Payout ${run.code} via ${run.method}`,
          idemKey: `payout:${id}:${item.kitchenId}`,
        });
        if (!entry.posted) {
          duplicate++;
          continue;
        }
        paid++;
        paidTotal += item.amount;

        /* Told once per run: `notify` files nothing while the same key is
           still unread, which is the dedupe a bare create here lacked. */
        await notify(session, {
          audience: 'cook',
          kind: 'payout',
          key: `cook:payout:${id}:${item.kitchenId}`,
          kitchenId: item.kitchenId,
          title: 'You have been paid',
          body: `${taka(item.amount)} sent via ${run.method}.`,
          broadcastBy: actor.email,
        });
      }

      const status = skipped.length ? 'partial' : 'paid';

      await PayoutRun.updateOne(
        { _id: id },
        { status, paidAt: new Date(), paidBy: actor.email },
        { session },
      );

      await audit(
        actor,
        {
          action: 'payout.paid',
          targetType: 'PayoutRun',
          targetId: id,
          summary: `${run.code} — ${taka(paidTotal)} to ${paid} of ${items.length} cooks${
            skipped.length ? `, ${skipped.length} skipped for lack of cover` : ''
          }`,
          before: { status: 'draft' },
          after: { status, total: run.total, paidTotal, posted: paid, duplicate, skipped },
        },
        session as never,
      );

      return {
        ok: true as const,
        code: run.code,
        status,
        total: run.total,
        paidTotal,
        cooks: items.length,
        paid,
        duplicate,
        skipped,
      };
    });

    if (!out.ok) return fail(reply as never, out.error, out.status);
    return {
      code: out.code,
      status: out.status,
      total: out.total,
      paidTotal: out.paidTotal,
      cooks: out.cooks,
      paid: out.paid,
      duplicate: out.duplicate,
      skipped: out.skipped,
    };
  });

  /** Drop a draft. Nothing was posted, so there is nothing to reverse. */
  app.post('/payouts/:id/cancel', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    if (!isId(id)) return fail(reply as never, ERR.RUN_CLOSED, 404);

    const out = await tx(async (session) => {
      const run = await PayoutRun.findById(id).session(session).lean();
      if (!run) return { ok: false as const, error: ERR.RUN_CLOSED, status: 404 };
      /* Only a draft. A paid run has ledger entries behind it, and cancelling
         it would say money came back that never did. */
      if (run.status !== 'draft') return { ok: false as const, error: ERR.RUN_CLOSED, status: 400 };

      await PayoutRun.updateOne({ _id: id }, { status: 'cancelled' }, { session });
      await audit(
        actor,
        {
          action: 'payout.cancel',
          targetType: 'PayoutRun',
          targetId: id,
          summary: `${run.code} cancelled before payment`,
          before: { status: 'draft' },
          after: { status: 'cancelled' },
        },
        session as never,
      );

      return { ok: true as const, code: run.code };
    });

    if (!out.ok) return fail(reply as never, out.error, out.status);
    return { code: out.code, moved: 0 };
  });

  /* ---------------- cook withdrawals ---------------- */

  /**
   * Requests cooks have filed, newest first, with the kitchen's name.
   *
   * `status` defaults to the open ones: the queue an operator works is the
   * requests nobody has acted on. The counts come back with every page so the
   * tab can say how many are waiting without a second call.
   */
  app.get('/withdrawals', async (request, reply) => {
    const actor = await require(request, reply as never, 'ledger.read');
    if (!actor) return;

    const query = z
      .object({
        status: z.enum(['requested', 'paid', 'rejected', 'cancelled', 'all']).default('requested'),
        take: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(request.query ?? {});

    const where = query.status === 'all' ? {} : { status: query.status };
    const [rows, counts] = await Promise.all([
      Withdrawal.find(where).sort({ requestedAt: -1 }).limit(query.take).lean(),
      Withdrawal.aggregate<{ _id: string; count: number; amount: number }>([
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);

    const ids = [...new Set(rows.map((row) => row.kitchenId))];
    const kitchens = await Kitchen.find({ _id: { $in: ids.filter(isId) } })
      .select('name area')
      .lean();
    const kitchenOf = new Map(kitchens.map((k) => [String(k._id), k]));

    return {
      withdrawals: rows.map((row) => ({
        id: String(row._id),
        code: row.code,
        kitchenId: row.kitchenId,
        kitchenName: kitchenOf.get(row.kitchenId)?.name ?? row.kitchenId,
        area: kitchenOf.get(row.kitchenId)?.area ?? '',
        amount: row.amount,
        method: row.method,
        account: row.account,
        status: row.status,
        requestedAt: row.requestedAt,
        decidedAt: row.decidedAt,
        decidedBy: row.decidedBy,
        note: row.note,
      })),
      counts: Object.fromEntries(counts.map((c) => [c._id, { count: c.count, amount: c.amount }])),
    };
  });

  /** "Mark paid": the one place a withdrawal posts to the ledger. */
  app.post('/withdrawals/:id/pay', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const out = await payWithdrawal(id, actor);
    if (!out.ok) {
      return reply
        .status(out.error === ERR.NO_WITHDRAWAL ? 404 : 400)
        .send({ error: out.error, message: errText(out.error), detail: out.detail });
    }
    return out.result;
  });

  app.post('/withdrawals/:id/reject', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z.object({ note: z.string().trim().min(1).max(300) }).safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const out = await rejectWithdrawal(id, body.data.note, actor);
    if (!out.ok) {
      return reply
        .status(out.error === ERR.NO_WITHDRAWAL ? 404 : 400)
        .send({ error: out.error, message: errText(out.error), detail: out.detail });
    }
    return out.result;
  });

  /* ---------------- manual top-ups ---------------- */

  /**
   * Where customers are told to send money. Finance reads it; changing it is a
   * `payout.write` act, because pointing the app at a different number is
   * pointing customers' money at it.
   */
  app.get('/topup-config', async (request, reply) => {
    const actor = await require(request, reply as never, 'ledger.read');
    if (!actor) return;
    const config = await getTopupConfig();
    return { ...config, configured: topupConfigured(config) };
  });

  app.post('/topup-config', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const number = z
      .string()
      .trim()
      .regex(/^(\+?880|0)?1[3-9]\d{8}$/)
      .or(z.literal(''));
    const body = z
      .object({ bkash: number.optional(), nagad: number.optional(), note: z.string().trim().max(300).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.BAD_REQUEST);

    const before = await getTopupConfig();
    await saveTopupConfig(body.data, actor.email);
    const after = await getTopupConfig();
    await audit(actor, {
      action: 'topup.config',
      targetType: 'Setting',
      targetId: 'topup',
      summary: 'Top-up receiving numbers changed',
      before,
      after,
    });
    return { ...after, configured: topupConfigured(after) };
  });

  /** Customers' manual top-up requests: the pending queue plus recent decisions. */
  app.get('/topup-requests', async (request, reply) => {
    const actor = await require(request, reply as never, 'ledger.read');
    if (!actor) return;

    const query = z
      .object({
        status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
        take: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(request.query ?? {});

    /* Only rows that came through the manual flow carry a txnId. */
    const where: Record<string, unknown> = { txnId: { $type: 'string' } };
    if (query.status !== 'all') where.status = query.status;

    const [rows, counts] = await Promise.all([
      TopUp.find(where).sort({ at: -1 }).limit(query.take).lean(),
      TopUp.aggregate<{ _id: string; count: number; amount: number }>([
        { $match: { txnId: { $type: 'string' } } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      requests: rows.map((row) => ({
        id: String(row._id),
        customerKey: row.customerKey,
        amount: row.amount,
        method: row.method,
        txnId: row.txnId,
        senderNumber: row.senderNumber,
        status: statusOf(row),
        note: row.note,
        at: row.at,
        decidedAt: row.decidedAt,
        decidedBy: row.decidedBy,
      })),
      counts: Object.fromEntries(counts.map((c) => [c._id, { count: c.count, amount: c.amount }])),
    };
  });

  app.post('/topup-requests/:id/approve', async (request, reply) => {
    const actor = await require(request, reply as never, 'topup.reconcile');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const out = await approveTopup(id, actor);
    if (!out.ok) {
      return reply
        .status(out.error === ERR.NO_TOPUP ? 404 : 400)
        .send({ error: out.error, message: errText(out.error), detail: out.detail });
    }
    return out.result;
  });

  app.post('/topup-requests/:id/reject', async (request, reply) => {
    const actor = await require(request, reply as never, 'topup.reconcile');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z.object({ note: z.string().trim().min(1).max(300) }).safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const out = await rejectTopup(id, body.data.note, actor);
    if (!out.ok) {
      return reply
        .status(out.error === ERR.NO_TOPUP ? 404 : 400)
        .send({ error: out.error, message: errText(out.error), detail: out.detail });
    }
    return out.result;
  });

  /* ---------------- escrow ---------------- */

  /**
   * Money held against food that arrived, past the window in which the
   * customer was meant to confirm it.
   *
   * In the app only the customer releases escrow. When they never do, the
   * money sits in `held` forever: the customer has paid, the cook has cooked,
   * and neither has what they are owed. This is the queue of exactly that.
   */
  app.get('/escrow/aged', async (request, reply) => {
    const actor = await require(request, reply as never, 'ledger.read');
    if (!actor) return;

    const query = z
      .object({ take: z.coerce.number().max(200).default(50) })
      .parse(request.query ?? {});

    const settings = await getSettings();
    const cutoff = new Date(Date.now() - settings.escrowAutoReleaseDays * 86_400_000);
    /* Both states hold money. `delivered` is the courier's word and the
       customer has not answered yet; `completed` is the customer confirming,
       which closes the order but no longer releases the hold — that is an
       operator's call now. Filtering on `delivered` alone would hide every
       order a customer had actually confirmed, which is the half of this
       queue that is most ready to pay out. */
    const where = {
      payment: 'held',
      status: { $in: ['delivered', 'completed'] },
      deliveredAt: { $lt: cutoff },
    };

    const [rows, count, held] = await Promise.all([
      /* Oldest first: the queue is worked from the end that has waited most. */
      Order.find(where).sort({ deliveredAt: 1 }).limit(query.take).lean(),
      Order.countDocuments(where),
      Order.aggregate<{ _id: null; total: number }>([
        { $match: where },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      orders: rows.map((order) => ({
        ...order,
        id: String(order._id),
        days: daysSince(order.deliveredAt),
      })),
      count,
      total: sumOf(held),
      windowDays: settings.escrowAutoReleaseDays,
      cutoff,
    };
  });

  /**
   * Release everything that has sat past the auto-release window.
   *
   * One transaction per order rather than one big one: a single bad row must
   * not roll back forty good releases. A failure is counted and the sweep
   * carries on, because the alternative is that the worst order on the board
   * holds every other cook's money hostage.
   */
  app.post('/escrow/sweep', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const settings = await getSettings();
    const cutoff = new Date(Date.now() - settings.escrowAutoReleaseDays * 86_400_000);

    const [aged, contested] = await Promise.all([
      Order.find({
        payment: 'held',
        status: { $in: ['delivered', 'completed'] },
        deliveredAt: { $lt: cutoff },
      })
        /* `kitchenId` and `title` are here for the notification below, not for
           the sweep itself — a cook has to be told their money landed, and this
           is one of the two places that can tell them. */
        .select('code kitchenId title mealId')
        .lean(),
      /* Money under an open case belongs to the case. The sweep must not
         decide it in the cook's favour because the calendar said so; those
         orders are left where they are, and counted so the operator can see
         what the sweep declined to touch. */
      Dispute.find({ status: { $in: ['open', 'investigating'] } })
        .select({ orderId: 1 })
        .lean(),
    ]);
    const disputed = new Set(contested.map((row) => row.orderId));
    const due = aged.filter((order) => !disputed.has(String(order._id)));

    let released = 0;
    let total = 0;
    const failures: { orderId: string; code: string; error: string }[] = [];

    for (const order of due) {
      const id = String(order._id);
      const out = await tx(async (session) => {
        const result = await releaseEscrow(session, id, {
          note: `Auto-released after ${settings.escrowAutoReleaseDays} days`,
        });
        if (!result.ok) return result;

        await Order.updateOne({ _id: id }, { status: 'completed' }, { session });

        await notify(session, {
          audience: 'cook',
          kind: 'payment-released',
          key: `cook:payment-released:${id}`,
          title: 'Payment released',
          body: `${taka(result.result.cook)} for ${order.title ?? 'your order'} is in your wallet.`,
          kitchenId: order.kitchenId,
          mealId: order.mealId ?? undefined,
          orderId: id,
        });

        await audit(
          actor,
          {
            action: 'escrow.auto-release',
            targetType: 'Order',
            targetId: id,
            summary: `${order.code} — ${taka(result.result.cook)} to cook after ${settings.escrowAutoReleaseDays} days`,
            after: result.result,
          },
          session as never,
        );
        return result;
      });

      if (out.ok) {
        released++;
        total += out.result.cook + out.result.platform;
      } else {
        /* The code is for the operator, who reads order codes, not ids; the
           error is the ledger's own refusal, passed through unchanged so a
           `dispute-open` raised between the query and the release reads as
           exactly that on the panel. */
        failures.push({ orderId: id, code: order.code, error: out.error });
      }
    }

    return {
      considered: aged.length,
      released,
      total,
      skippedDisputed: aged.length - due.length,
      failures,
    };
  });

  /* ---------------- disputes ---------------- */

  /**
   * The open cases, and how much is held against them.
   *
   * `contested` counts only orders still on `held`: money already settled is
   * not at stake however loudly the case is still being argued.
   */
  /**
   * One dispute, its order, and every posting made against that order.
   *
   * The whole movement rather than the dispute alone: a refund and the release
   * it reverses are written together, and reading one without the other is how
   * people conclude the numbers do not add up.
   */
  app.get('/disputes/:id', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const dispute = await Dispute.findById(id)
      .lean()
      .catch(() => null);
    if (!dispute) return fail(reply as never, ERR.NO_ORDER, 404);

    const [order, entries] = await Promise.all([
      dispute.orderId
        ? Order.findById(dispute.orderId)
            .lean()
            .catch(() => null)
        : null,
      dispute.orderId
        ? LedgerEntry.find({ orderId: dispute.orderId }).sort({ at: 1 }).lean()
        : [],
    ]);

    return {
      dispute: { ...dispute, id: String(dispute._id) },
      order: order ? { ...order, id: String(order._id) } : null,
      entries: entries.map((row) => ({ ...row, id: String(row._id) })),
    };
  });

  /**
   * One payout run: who was in it, and what it posted.
   *
   * Largest first, because a run is checked by looking at the big lines.
   */
  app.get('/payouts/:id', async (request, reply) => {
    const actor = await require(request, reply as never, 'ledger.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const run = await PayoutRun.findById(id)
      .lean()
      .catch(() => null);
    if (!run) return fail(reply as never, ERR.NO_ORDER, 404);

    const [items, entries] = await Promise.all([
      PayoutItem.find({ payoutRunId: id }).sort({ amount: -1 }).lean(),
      LedgerEntry.find({ payoutRunId: id }).sort({ at: 1 }).lean(),
    ]);

    return {
      run: { ...run, id: String(run._id) },
      items: items.map((row) => ({ ...row, id: String(row._id) })),
      entries: entries.map((row) => ({ ...row, id: String(row._id) })),
    };
  });

  app.get('/disputes', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const query = z
      .object({ take: z.coerce.number().max(50).default(10) })
      .parse(request.query ?? {});

    const [open, resolved] = await Promise.all([
      Dispute.find({ status: { $in: ['open', 'investigating'] } })
        .sort({ createdAt: 1 })
        .lean(),
      Dispute.find({ status: 'resolved' })
        .sort({ resolvedAt: -1 })
        .limit(query.take)
        .lean(),
    ]);

    const all = [...open, ...resolved];
    const orders = await Order.find({ _id: { $in: all.map((d) => d.orderId).filter(isId) } })
      .select('code title amount payment status kitchenId cookName customerKey')
      .lean();
    const orderOf = new Map(orders.map((o) => [String(o._id), o]));

    const shape = (dispute: (typeof all)[number]) => {
      const order = orderOf.get(dispute.orderId);
      return {
        ...dispute,
        id: String(dispute._id),
        notes: notesOf(dispute.notes),
        order: order ? { ...order, id: String(order._id) } : null,
      };
    };

    const contested = open.reduce((sum, dispute) => {
      const order = orderOf.get(dispute.orderId);
      return order?.payment === 'held' ? sum + order.amount : sum;
    }, 0);

    return {
      open: open.map(shape),
      resolved: resolved.map(shape),
      contested,
      counts: { open: open.length, resolved: resolved.length },
    };
  });

  /**
   * Open a case against an order.
   *
   * One dispute per order — the unique index says so, and it is what stops two
   * operators opening two cases on the same money and resolving them
   * differently.
   */
  app.post('/disputes', async (request, reply) => {
    const actor = await require(request, reply as never, 'dispute.open');
    if (!actor) return;

    const body = z
      .object({ orderId: z.string().min(1), reason: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const reason = body.data.reason.trim();
    if (!reason) return fail(reply as never, ERR.NAME_REQUIRED);
    if (!isId(body.data.orderId)) return fail(reply as never, ERR.NO_ORDER, 404);

    const out = await tx(async (session) => {
      const order = await Order.findById(body.data.orderId).session(session).lean();
      if (!order) return { ok: false as const, error: ERR.NO_ORDER, status: 404 };

      const existing = await Dispute.findOne({ orderId: body.data.orderId })
        .session(session)
        .lean();
      if (existing) return { ok: false as const, error: ERR.DUPLICATE, status: 409 };

      const created = await Dispute.create(
        [
          {
            code: makeCode('DP'),
            orderId: body.data.orderId,
            status: 'open',
            openedBy: 'admin',
            reason,
            /* The reason is the first note, so the case reads as one thread
               rather than a headline with a separate history under it. */
            notes: [{ at: new Date().toISOString(), by: actor.email, text: reason }],
          },
        ],
        { session },
      ).then(
        ([row]) => row,
        (error: unknown) => {
          // Lost the race to a concurrent open. Somebody's case exists; not ours.
          if (isDuplicateKey(error)) return null;
          throw error;
        },
      );
      if (!created) return { ok: false as const, error: ERR.DUPLICATE, status: 409 };

      await audit(
        actor,
        {
          action: 'dispute.open',
          targetType: 'Dispute',
          targetId: String(created._id),
          summary: `${created.code} on ${order.code} — ${reason}`,
          after: { orderId: body.data.orderId, reason },
        },
        session as never,
      );

      return { ok: true as const, id: String(created._id), code: created.code };
    });

    if (!out.ok) return fail(reply as never, out.error, out.status);
    return { id: out.id, code: out.code };
  });

  /**
   * Add to the case file.
   *
   * A note moves an open case to `investigating` — an operator who has written
   * something has looked at it, and the board should stop showing it as
   * untouched.
   */
  app.post('/disputes/:id/note', async (request, reply) => {
    const actor = await require(request, reply as never, 'dispute.open');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z.object({ text: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const text = body.data.text.trim();
    if (!text) return fail(reply as never, ERR.NAME_REQUIRED);
    if (!isId(id)) return fail(reply as never, ERR.NO_DISPUTE, 404);

    const out = await tx(async (session) => {
      const dispute = await Dispute.findById(id).session(session).lean();
      if (!dispute) return { ok: false as const, error: ERR.NO_DISPUTE, status: 404 };
      /* A resolved case is closed evidence. Reopening is its own decision, not
         a side effect of somebody typing into the box. */
      if (dispute.status === 'resolved') {
        return { ok: false as const, error: ERR.DISPUTE_CLOSED, status: 400 };
      }

      const notes = [...notesOf(dispute.notes), { at: new Date().toISOString(), by: actor.email, text }];
      const status = dispute.status === 'open' ? 'investigating' : dispute.status;

      await Dispute.updateOne({ _id: id }, { notes, status }, { session });
      await audit(
        actor,
        {
          action: 'dispute.note',
          targetType: 'Dispute',
          targetId: id,
          summary: `${dispute.code} — ${text}`,
          before: { status: dispute.status },
          after: { status, note: text },
        },
        session as never,
      );

      return { ok: true as const, status, notes };
    });

    if (!out.ok) return fail(reply as never, out.error, out.status);
    return { status: out.status, notes: out.notes };
  });

  /**
   * Settle a case, and move the money the decision implies.
   *
   * Four outcomes, three of which post to the ledger. A split goes through
   * `splitEscrow`, which refuses unless the two halves add back to exactly
   * what is held: a leftover taka would sit in escrow attached to a closed
   * case, which is the state the escrow board exists to make impossible.
   */
  app.post('/disputes/:id/resolve', async (request, reply) => {
    const actor = await require(request, reply as never, 'dispute.resolve');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({
        resolution: z.enum(['refund', 'release', 'split', 'no-action']),
        refundAmount: z.number().min(0).default(0),
        note: z.string().min(1),
      })
      .safeParse(request.body);
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const note = body.data.note.trim();
    if (!note) return fail(reply as never, ERR.NAME_REQUIRED);
    if (!isId(id)) return fail(reply as never, ERR.NO_DISPUTE, 404);

    const out = await tx(async (session) => {
      const dispute = await Dispute.findById(id).session(session).lean();
      if (!dispute) return { ok: false as const, error: ERR.NO_DISPUTE, status: 404 };
      if (dispute.status === 'resolved') {
        return { ok: false as const, error: ERR.DISPUTE_CLOSED, status: 400 };
      }

      const order = await Order.findById(dispute.orderId).session(session).lean();
      if (!order) return { ok: false as const, error: ERR.NO_ORDER, status: 404 };

      const { resolution } = body.data;
      const refund = Math.round(body.data.refundAmount);
      let moved = 'no money moved';

      if (resolution === 'refund') {
        const result = await refundEscrow(session, dispute.orderId, {
          note: `Dispute ${dispute.code} — ${note}`,
        });
        if (!result.ok) return { ok: false as const, error: result.error, status: 400 };
        await Order.updateOne({ _id: dispute.orderId }, { status: 'cancelled' }, { session });
        moved = `${taka(result.result.refunded)} refunded`;
      } else if (resolution === 'release') {
        /* This resolution *is* the dispute deciding, so it names itself —
           otherwise the open-dispute guard would refuse it. */
        const result = await releaseEscrow(session, dispute.orderId, {
          note: `Dispute ${dispute.code} — ${note}`,
          disputeId: String(dispute._id),
        });
        if (!result.ok) return { ok: false as const, error: result.error, status: 400 };
        await Order.updateOne({ _id: dispute.orderId }, { status: 'completed' }, { session });
        moved = `${taka(result.result.cook)} released`;
      } else if (resolution === 'split') {
        /* The release side is the remainder, never its own number: two figures
           an operator types separately are two figures that can fail to add up
           to what is held. */
        const result = await splitEscrow(
          session,
          dispute.orderId,
          refund,
          order.amount - refund,
          `Dispute ${dispute.code}`,
        );
        if (!result.ok) return { ok: false as const, error: result.error, status: 400 };
        await Order.updateOne({ _id: dispute.orderId }, { status: 'completed' }, { session });
        moved = `${taka(result.result.refunded)} refunded, ${taka(result.result.released)} released`;
      }

      const notes = [...notesOf(dispute.notes), { at: new Date().toISOString(), by: actor.email, text: note }];

      await Dispute.updateOne(
        { _id: id },
        {
          status: 'resolved',
          resolution,
          resolutionNote: note,
          refundAmount: resolution === 'split' ? refund : null,
          releaseAmount: resolution === 'split' ? order.amount - refund : null,
          notes,
          resolvedAt: new Date(),
          resolvedBy: actor.email,
        },
        { session },
      );

      await audit(
        actor,
        {
          action: `dispute.${resolution}`,
          targetType: 'Dispute',
          targetId: id,
          summary: `${dispute.code} on ${order.code} — ${moved} — ${note}`,
          before: { status: dispute.status, payment: order.payment },
          after: { status: 'resolved', resolution, moved },
        },
        session as never,
      );

      return { ok: true as const, code: dispute.code, resolution, moved };
    });

    if (!out.ok) return fail(reply as never, out.error, out.status);
    return { code: out.code, resolution: out.resolution, moved: out.moved };
  });

  /* ---------------- corrections ---------------- */

  /**
   * Correct a balance with a compensating entry.
   *
   * Never an edit. If a customer was credited ৳500 that never arrived, the fix
   * is a ৳500 entry in the other direction and both rows stay in the history —
   * the ledger refuses an update at the model and at the database, so the only
   * way to be wrong here is to post the wrong second row.
   */
  app.post('/ledger/adjustment', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const body = z
      .object({
        customerKey: z.string().min(1),
        amount: z.number(),
        direction: z.enum(['credit', 'debit']),
        reason: z.string().min(1),
      })
      .safeParse(request.body);
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const reason = body.data.reason.trim();
    if (!reason) return fail(reply as never, ERR.NAME_REQUIRED);

    const amount = Math.round(body.data.amount);
    /* Direction is a field, not a sign. A negative "credit" is two ways of
       saying the same thing and they would eventually disagree. */
    if (!Number.isFinite(amount) || amount <= 0) return fail(reply as never, ERR.BAD_AMOUNT);

    const { customerKey, direction } = body.data;
    const credit = direction === 'credit';

    await tx(async (session) => {
      await post(session, {
        kind: 'adjustment',
        amount,
        from: credit ? 'external' : 'customer',
        to: credit ? 'customer' : 'external',
        fromRef: credit ? null : customerKey,
        toRef: credit ? customerKey : null,
        note: `Adjustment by ${actor.email} — ${reason}`,
      });

      await audit(
        actor,
        {
          action: 'ledger.adjustment',
          targetType: 'Account',
          targetId: customerKey,
          summary: `${direction} ${taka(amount)} — ${reason}`,
          after: { direction, amount, reason },
        },
        session as never,
      );
    });

    return { customerKey, direction, amount };
  });
}
