import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { bearerFrom, identify, type AppIdentity } from '../../../auth/app-auth.js';
import { taxonomyOf } from '../../../logic/taxonomy.js';
import {
  clearNotifications,
  markRead,
  topUp,
  walletFor,
  type Audience,
} from '../../../logic/wallet.js';
import { ERR, errText } from '../../../lib/domain.js';
import { SearchTerm } from '../../../models/index.js';

/**
 * The wallet, the shared category list, and the two notification writes.
 *
 * All three lived inside the app: the balance was folded over an array in
 * `LedgerContext`, the categories were a `const CHIPS = [...]` in the browse
 * screen, and "mark read" was a `setState`. Moving them behind HTTP is what
 * makes a balance survive a reinstall and a category exist for search.
 *
 * The one rule this file exists to hold: **the wallet's owner comes from the
 * token.** A `customerKey` is a phone number or an email — the app derives it
 * as `(email || phone).toLowerCase()` — so it is guessable by anybody who has
 * ever been given a business card. Reading it from a body or a query string
 * would make both the balance and the top-up an endpoint for whichever key
 * the caller felt like typing. There is no field named `customerKey` in any
 * schema below, so there is no path through this file that can take one.
 */

const fail = (
  reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  code: string,
  status = 400,
) => reply.status(status).send({ error: code, message: errText(code) });

const callerOf = (request: FastifyRequest) =>
  identify(bearerFrom(request.headers.authorization));

/**
 * Which inbox belongs to this token.
 *
 * A cook's notifications are addressed to the kitchen and a customer's to the
 * customer key, so the pair has to be chosen together — asking for the `cook`
 * audience with a customer key matches nothing and reports success, which
 * reads to the app as an inbox that will not clear.
 */
const inboxOf = (caller: AppIdentity): { audience: Audience; ref: string } =>
  caller.kitchenId
    ? { audience: 'cook', ref: caller.kitchenId }
    : { audience: 'customer', ref: caller.customerKey };

/* Parsed only so a body that is not an object is refused before it reaches
   the logic. Every field these two writes could take — whose inbox, which
   audience — is the token's to decide, so nothing is read out of it. */
const NO_BODY = z.object({});

export async function walletRoutes(app: FastifyInstance) {
  /* ---------------- wallet ---------------- */

  /**
   * The caller's balance and what made it.
   *
   * Balance and entries land in one response because the app's wallet screen
   * shows them on one screen: fetching them separately gives a total that
   * disagrees with the rows under it for as long as the second request takes.
   */
  app.get('/wallet', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const query = z
      .object({ take: z.coerce.number().int().positive().max(100).optional() })
      .safeParse(request.query ?? {});
    if (!query.success) return fail(reply, ERR.BAD_AMOUNT);

    return walletFor(caller.customerKey, query.data.take, caller.kitchenId);
  });

  /**
   * Money in from outside.
   *
   * There is still no payment gateway behind this — `topUp` writes the TopUp
   * row `reconciled: 'orphan'` for exactly that reason, so finance sees every
   * one of these as unmatched until a statement line says otherwise. This
   * route deliberately adds no claim the logic does not make: it takes an
   * amount, not a payment reference, and it cannot mark anything settled.
   */
  app.post('/wallet/topup', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = z
      .object({
        // Finite and positive here as well as in `topUp`, because Infinity
        // and -0 both survive `Math.round` and only one of the two checks is
        // in front of the ledger write.
        amount: z.number().finite().positive(),
        method: z.string().trim().max(40).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.BAD_AMOUNT);

    const out = await topUp(caller.customerKey, body.data.amount, body.data.method);
    if (!out.ok) return fail(reply, out.error);
    return out.result;
  });

  /* ---------------- what people looked for ---------------- */

  /**
   * Record a search.
   *
   * Fire-and-forget from the app's side, and deliberately unauthenticated:
   * the most valuable search in this collection is the one somebody made
   * before they had an account, gave up on, and left. Requiring a token would
   * filter the record down to people who already stayed.
   *
   * What comes back is `{ ok: true }` and nothing else. The app has already
   * drawn its results; this is bookkeeping, and a response the client waits
   * on would make every search slower to serve a report nobody is reading
   * right now.
   */
  app.post('/search-terms', async (request, reply) => {
    const body = z
      .object({
        term: z.string().trim().min(2).max(80),
        results: z.coerce.number().int().min(0).max(10_000).default(0),
        area: z.string().trim().max(60).nullish(),
      })
      .safeParse(request.body ?? {});
    /* A malformed record is dropped rather than refused. Nothing the customer
       can see depends on it, and a 400 here would put an error in front of
       somebody whose search worked perfectly. */
    if (!body.success) return { ok: true };

    const caller = await callerOf(request);

    await SearchTerm.create({
      term: body.data.term,
      /* The same normalisation the app's matcher uses — lower-cased,
         punctuation out, Bengali left alone — so "Biryani!" and "biryani"
         are one row in the report rather than two. */
      normalised: body.data.term
        .toLowerCase()
        .replace(/[^\wঀ-৿]+/g, ' ')
        .trim(),
      results: body.data.results,
      area: body.data.area || null,
      customerKey: caller?.customerKey ?? null,
    }).catch(() => null);

    return { ok: true };
  });

  /* ---------------- taxonomy ---------------- */

  /**
   * The platform's category vocabulary.
   *
   * Unauthenticated for the same reason `/config` is: it is the list the
   * browse screen draws before anybody has signed in, and gating it would
   * mean the app cannot render its first screen without a session.
   *
   * Retired categories are absent and there is no query string that brings
   * them back — a retired row exists so the dishes already tagged with its
   * key keep meaning something, not so the app can offer it again. The shape
   * matches `/config`'s `taxonomy` field so both callers read one list.
   */
  app.get('/taxonomy', async (_request, reply) => {
    const categories = await taxonomyOf();

    reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    return {
      taxonomy: categories.map((c) => ({
        id: c.id,
        key: c.key,
        label: c.label,
        emoji: c.emoji,
        order: c.order,
      })),
    };
  });

  /* ---------------- notifications ---------------- */

  /**
   * Clear the badge.
   *
   * Per-row read state is what the app wanted and what it cannot have yet: a
   * broadcast is one document every reader sees, so `markRead` leaves it
   * alone rather than marking it read for everybody on behalf of whoever
   * opened their inbox first. `marked` is therefore the count that actually
   * changed, not the size of the inbox.
   */
  app.post('/notifications/read', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    if (!NO_BODY.safeParse(request.body ?? {}).success) {
      return fail(reply, ERR.NAME_REQUIRED);
    }

    const inbox = inboxOf(caller);
    const out = await markRead(inbox.audience, inbox.ref);
    if (!out.ok) return fail(reply, out.error);

    return { ok: true, ...out.result };
  });

  /** Empty the inbox. Deletes, so it stops at the rows this token owns. */
  app.post('/notifications/clear', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    if (!NO_BODY.safeParse(request.body ?? {}).success) {
      return fail(reply, ERR.NAME_REQUIRED);
    }

    const inbox = inboxOf(caller);
    const out = await clearNotifications(inbox.audience, inbox.ref);
    if (!out.ok) return fail(reply, out.error);

    return { ok: true, ...out.result };
  });
}
