import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { bearerFrom, identify } from '../../auth/app-auth.js';

import { MM_ERR, mmErrText, type MmFail, type MmResult } from './errors.js';
import * as mm from './service.js';

/**
 * Meal management, over HTTP.
 *
 * Mounted under `/api/app/v1/meal-management`, so every path in this file is a
 * leaf of one prefix and nothing this module serves can collide with an
 * existing route. The realm is the app's — the same bearer token, verified by
 * the same `identify()` — because §4.1 asks for one account, not a second
 * login. That import is the module's only tie to the rest of the backend, and
 * it is read-only.
 *
 * Two things are true of every handler here and are worth stating once rather
 * than repeating in thirty docstrings:
 *
 *   **The caller comes from the token.** No handler accepts a `customerKey`.
 *   A member id may be named in a body, but only ever as the *subject* of an
 *   action the service layer then checks the caller is allowed to take.
 *
 *   **The mess comes from `messId` and is verified.** `contextOf` resolves it
 *   through `mm.contextFor`, which refuses unless the caller is an active
 *   member. §4.17's data isolation is that one function, called first in
 *   every handler that touches mess data.
 *
 * The file is long because the specification is. It is organised in the
 * specification's own order, and each section carries the § it implements.
 */

type Replyish = { status: (n: number) => { send: (body: unknown) => unknown } };

const fail = (reply: Replyish, code: string, status = 400, detail?: Record<string, unknown>) =>
  reply.status(status).send({ error: code, message: mmErrText(code), ...(detail ? { detail } : {}) });

/** The refusals that are not a plain 400. */
const STATUS: Record<string, number> = {
  [MM_ERR.UNAUTHENTICATED]: 401,
  [MM_ERR.FORBIDDEN]: 403,
  [MM_ERR.NOT_MEMBER]: 403,
  [MM_ERR.MEMBER_INACTIVE]: 403,
  [MM_ERR.AI_FORBIDDEN]: 403,
  [MM_ERR.NO_MESS]: 404,
  [MM_ERR.NO_MEMBER]: 404,
  [MM_ERR.NO_REQUEST]: 404,
  [MM_ERR.NO_BAZAR]: 404,
  [MM_ERR.NO_EXPENSE]: 404,
  [MM_ERR.NO_DEPOSIT]: 404,
  [MM_ERR.NO_DUTY]: 404,
  [MM_ERR.NO_CORRECTION]: 404,
  [MM_ERR.NO_LEAVE]: 404,
  [MM_ERR.NO_NOTICE]: 404,
  [MM_ERR.NO_POLL]: 404,
  [MM_ERR.NO_MENU]: 404,
  [MM_ERR.NO_COOK]: 404,
  [MM_ERR.NO_SESSION]: 404,
  [MM_ERR.NO_CATEGORY]: 404,
  [MM_ERR.NO_MEAL_TYPE]: 404,
  [MM_ERR.MONTH_CLOSED]: 409,
  [MM_ERR.ALREADY_CLOSED]: 409,
  [MM_ERR.ALREADY_MEMBER]: 409,
  [MM_ERR.ALREADY_APPROVED]: 409,
  [MM_ERR.ALREADY_VOTED]: 409,
  [MM_ERR.CORRECTION_PENDING]: 409,
  [MM_ERR.CORRECTION_DECIDED]: 409,
  [MM_ERR.REQUEST_DECIDED]: 409,
  [MM_ERR.BAD_STATUS]: 409,
  [MM_ERR.LAST_ADMIN]: 409,
  [MM_ERR.PAST_CUTOFF]: 409,
  [MM_ERR.MEAL_LOCKED]: 409,
  [MM_ERR.POLL_CLOSED]: 409,
  [MM_ERR.BAD_ATTACHMENT]: 413,
};

const refuse = (reply: Replyish, out: MmFail) =>
  fail(reply, out.error, STATUS[out.error] ?? 400, out.detail);

/** Send a service result: the value on success, the mapped refusal otherwise. */
const send = <T>(reply: Replyish, out: MmResult<T>) => (out.ok ? out.result : refuse(reply, out));

/** Which field a malformed body tripped on, so the app can point at it. */
const badBody = (reply: Replyish, error: z.ZodError) => {
  const field = String(error.issues[0]?.path?.[0] ?? '');
  const code =
    field === 'amount' || field === 'guest' || field === 'salary' || field === 'rating'
      ? MM_ERR.BAD_AMOUNT
      : field === 'date' || field === 'month' || field === 'from' || field === 'to'
        ? MM_ERR.BAD_DATE
        : MM_ERR.BAD_REQUEST;
  return fail(reply, code, 400, { field });
};

/* ------------------------------------------------------------------ *
 * shared schemas
 * ------------------------------------------------------------------ */

const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const DAY = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
const ID = z.string().min(1).max(64);
const MEALS = z.record(z.string(), z.number());

const monthQuery = z.object({ month: MONTH.optional(), messId: ID.optional() });

/** A receipt is a data URI; the cap keeps a photograph from becoming a document. */
const RECEIPT = z.string().max(3_000_000).optional();

export async function mealManagementRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------- *
   * resolving the caller
   * ---------------------------------------------------------------- */

  /** The signed-in account, or null after sending a 401. */
  const callerOf = async (request: FastifyRequest, reply: Replyish) => {
    const account = await identify(bearerFrom(request.headers.authorization));
    if (!account) {
      fail(reply, MM_ERR.UNAUTHENTICATED, 401);
      return null;
    }
    return { customerKey: account.customerKey, name: account.name };
  };

  /**
   * The caller *and* the mess they named, or null after sending the refusal.
   *
   * The mess id may ride on the query, the body or a header — a GET has no
   * body and the app's own switcher would otherwise have to append it to
   * thirty URLs by hand. Wherever it comes from, it is verified identically.
   */
  const contextOf = async (request: FastifyRequest, reply: Replyish) => {
    const caller = await callerOf(request, reply);
    if (!caller) return null;

    const fromQuery = (request.query as { messId?: string } | undefined)?.messId;
    const fromBody = (request.body as { messId?: string } | undefined)?.messId;
    const fromHeader = request.headers['x-mm-mess'];
    const messId =
      fromQuery ?? fromBody ?? (typeof fromHeader === 'string' ? fromHeader : undefined) ?? null;

    const out = await mm.contextFor(caller, messId);
    if (!out.ok) {
      refuse(reply, out);
      return null;
    }
    return out.result;
  };

  /* ================================================================ *
   * §4.1 — mess, membership, roles, settings
   * ================================================================ */

  /** Where the app starts: which messes this account can open. */
  app.get('/meal-management/messes', async (request, reply) => {
    const caller = await callerOf(request, reply as never);
    if (!caller) return;
    return send(reply as never, await mm.myMesses(caller));
  });

  app.post('/meal-management/messes', async (request, reply) => {
    const caller = await callerOf(request, reply as never);
    if (!caller) return;

    const body = z
      .object({ name: z.string().min(1).max(80), area: z.string().max(120).optional(), currency: z.string().max(8).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.createMess(caller, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send(out.result);
  });

  app.post('/meal-management/messes/join', async (request, reply) => {
    const caller = await callerOf(request, reply as never);
    if (!caller) return;

    const body = z.object({ code: z.string().min(3).max(24) }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.joinByCode(caller, body.data.code));
  });

  app.post('/meal-management/messes/join/cancel', async (request, reply) => {
    const caller = await callerOf(request, reply as never);
    if (!caller) return;

    const body = z.object({ messId: ID }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.cancelJoinRequest(caller, body.data.messId));
  });

  app.get('/meal-management/members', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.listMembers(ctx));
  });

  app.get('/meal-management/members/history', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.memberHistory(ctx));
  });

  app.post('/meal-management/members/ghost', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ name: z.string().min(1).max(80), phone: z.string().max(24).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.addGhostMember(ctx, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/members/:id', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        name: z.string().max(80).optional(),
        phone: z.string().max(24).optional(),
        role: z.enum(['admin', 'coadmin', 'member']).optional(),
        status: z.enum(['pending', 'active', 'inactive', 'suspended', 'left']).optional(),
        note: z.string().max(240).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.updateMember(ctx, request.params.id, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/members/:id/transfer', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.transferOwnership(ctx, request.params.id));
  });

  app.post('/meal-management/leave-mess', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.leaveMess(ctx));
  });

  app.get('/meal-management/invites', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.listInvites(ctx));
  });

  app.post('/meal-management/invites', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ expiresInDays: z.number().int().min(1).max(365).optional(), maxUses: z.number().int().min(0).max(500).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.createInvite(ctx, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/invites/:id/revoke', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.revokeInvite(ctx, request.params.id));
  });

  app.get('/meal-management/join-requests', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.listJoinRequests(ctx));
  });

  app.post<{ Params: { id: string } }>('/meal-management/join-requests/:id/decide', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ approve: z.boolean() }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.decideJoinRequest(ctx, request.params.id, body.data.approve));
  });

  app.get('/meal-management/settings', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.getSettings(ctx));
  });

  app.post('/meal-management/settings', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        area: z.string().max(120).optional(),
        settings: z
          .object({
            monthStartDay: z.number().int().min(1).max(28).optional(),
            allowedMealValues: z.array(z.number().positive().max(10)).max(12).optional(),
            maxGuestPerMeal: z.number().int().min(0).max(50).optional(),
            rounding: z.enum(['none', 'nearest', 'up', 'down', 'whole']).optional(),
            roundingDigits: z.number().int().min(0).max(4).optional(),
            allExpensesInMealRate: z.boolean().optional(),
            requireBazarApproval: z.boolean().optional(),
            requireExpenseApproval: z.boolean().optional(),
            requireDepositApproval: z.boolean().optional(),
            requireJoinApproval: z.boolean().optional(),
            coAdminCanEditOthersMeal: z.boolean().optional(),
            membersSeeFullReports: z.boolean().optional(),
            carryForwardBalances: z.boolean().optional(),
            currency: z.string().max(8).optional(),
            timezone: z.string().max(64).optional(),
          })
          .optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.saveSettings(ctx, body.data));
  });

  app.post('/meal-management/settings/meal-types', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        key: z.string().min(1).max(24),
        label: z.string().max(40).optional(),
        order: z.number().int().min(0).max(20).optional(),
        defaultValue: z.number().positive().max(10).optional(),
        cutoff: z.string().max(5).optional(),
        cutoffDayOffset: z.number().int().min(-2).max(0).optional(),
        countsInRate: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.saveMealType(ctx, body.data));
  });

  app.post<{ Params: { key: string } }>('/meal-management/settings/meal-types/:key/remove', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.removeMealType(ctx, request.params.key));
  });

  app.post('/meal-management/settings/archive', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.archiveMess(ctx));
  });

  app.post('/meal-management/profile', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        name: z.string().max(80).optional(),
        phone: z.string().max(24).optional(),
        mealDefaults: MEALS.optional(),
        preferences: z
          .object({
            likes: z.array(z.string().max(60)).max(50).optional(),
            avoid: z.array(z.string().max(60)).max(50).optional(),
            note: z.string().max(500).optional(),
          })
          .optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.saveMyProfile(ctx, body.data));
  });

  /* ================================================================ *
   * §4.2 — meals
   * ================================================================ */

  app.get('/meal-management/meals', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.extend({ memberId: ID.optional() }).safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const month = q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx));
    return send(reply as never, await mm.listMeals(ctx, month, q.data.memberId));
  });

  app.get('/meal-management/meals/today', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.todayMeals(ctx));
  });

  app.get('/meal-management/meals/day', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z.object({ date: DAY, messId: ID.optional() }).safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.dayMeals(ctx, q.data.date));
  });

  app.get('/meal-management/meals/history', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z
      .object({ from: DAY, to: DAY, memberId: ID.optional(), messId: ID.optional() })
      .safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.mealHistory(ctx, q.data));
  });

  app.post('/meal-management/meals', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ date: DAY, memberId: ID.optional(), values: MEALS.optional(), guests: MEALS.optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.setMeal(ctx, body.data));
  });

  app.post('/meal-management/meals/bulk', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ from: DAY, to: DAY, memberId: ID.optional(), values: MEALS.optional(), guests: MEALS.optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.bulkMeals(ctx, body.data));
  });

  app.get('/meal-management/meals/requests', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z
      .object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).optional(), messId: ID.optional() })
      .safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listCorrections(ctx, q.data.status ?? 'pending'));
  });

  app.post('/meal-management/meals/requests', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        date: DAY,
        memberId: ID.optional(),
        values: MEALS.optional(),
        guests: MEALS.optional(),
        reason: z.string().max(500).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.requestCorrection(ctx, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send(out.result);
  });

  app.post<{ Params: { id: string } }>('/meal-management/meals/requests/:id/decide', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ approve: z.boolean(), note: z.string().max(500).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(
      reply as never,
      await mm.decideCorrection(ctx, request.params.id, body.data.approve, body.data.note),
    );
  });

  app.get('/meal-management/leaves', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z.object({ memberId: ID.optional(), messId: ID.optional() }).safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listLeaves(ctx, q.data.memberId));
  });

  app.post('/meal-management/leaves', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ from: DAY, to: DAY, memberId: ID.optional(), note: z.string().max(240).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.addLeave(ctx, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send(out.result);
  });

  app.post<{ Params: { id: string } }>('/meal-management/leaves/:id/cancel', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.cancelLeave(ctx, request.params.id));
  });

  /* ================================================================ *
   * §4.3 — bazar
   * ================================================================ */

  /* The static duty and summary paths are declared before `/bazar/:id`; the
     router prefers a literal segment over a parameter, so this is belt and
     braces rather than a requirement. */

  app.get('/meal-management/bazar/duty', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z.object({ from: DAY.optional(), to: DAY.optional(), messId: ID.optional() }).safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listDuties(ctx, q.data));
  });

  app.post('/meal-management/bazar/duty', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ date: DAY, memberId: ID, note: z.string().max(240).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.assignDuty(ctx, body.data));
  });

  app.post('/meal-management/bazar/duty/rotate', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ from: DAY, to: DAY, memberIds: z.array(ID).max(50).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.rotateDuty(ctx, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/bazar/duty/:id', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        status: z.enum(['assigned', 'done', 'skipped', 'swapped']).optional(),
        memberId: ID.optional(),
        note: z.string().max(240).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.updateDuty(ctx, request.params.id, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/bazar/duty/:id/remove', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.removeDuty(ctx, request.params.id));
  });

  app.get('/meal-management/bazar/summary', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.bazarSummary(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
  });

  app.get('/meal-management/bazar/suggestions', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.bazarSuggestions(ctx));
  });

  app.get('/meal-management/bazar', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery
      .extend({ status: z.string().max(20).optional(), memberId: ID.optional() })
      .safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listBazars(ctx, q.data));
  });

  const bazarItems = z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        qty: z.number().min(0).max(100_000).optional(),
        unit: z.string().max(20).optional(),
        unitPrice: z.number().min(0).max(1_000_000).optional(),
      }),
    )
    .max(200);

  app.post('/meal-management/bazar', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        date: DAY,
        buyerId: ID.optional(),
        payerId: ID.optional(),
        note: z.string().max(500).optional(),
        receipt: RECEIPT,
        items: bazarItems.optional(),
        submit: z.boolean().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.createBazar(ctx, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send(out.result);
  });

  app.get<{ Params: { id: string } }>('/meal-management/bazar/:id', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.getBazar(ctx, request.params.id));
  });

  app.post<{ Params: { id: string } }>('/meal-management/bazar/:id', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        date: DAY.optional(),
        payerId: ID.optional(),
        note: z.string().max(500).optional(),
        receipt: RECEIPT,
        items: bazarItems.optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.updateBazar(ctx, request.params.id, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/bazar/:id/submit', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.submitBazar(ctx, request.params.id));
  });

  app.post<{ Params: { id: string } }>('/meal-management/bazar/:id/decide', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ approve: z.boolean(), note: z.string().max(500).optional() }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.decideBazar(ctx, request.params.id, body.data.approve, body.data.note));
  });

  app.post<{ Params: { id: string } }>('/meal-management/bazar/:id/remove', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.removeBazar(ctx, request.params.id));
  });

  /* ================================================================ *
   * §4.4, §4.5 — expenses, deposits
   * ================================================================ */

  app.get('/meal-management/categories', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.listCategories(ctx));
  });

  app.post('/meal-management/categories', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        key: z.string().min(1).max(24),
        label: z.string().max(40).optional(),
        foodCost: z.boolean().optional(),
        defaultAllocation: z.enum(['meal', 'equal', 'custom', 'selected', 'individual']).optional(),
        order: z.number().int().min(0).max(99).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.saveCategory(ctx, body.data));
  });

  app.post<{ Params: { key: string } }>('/meal-management/categories/:key/remove', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.removeCategory(ctx, request.params.key));
  });

  app.get('/meal-management/expenses', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery
      .extend({ status: z.string().max(20).optional(), categoryKey: z.string().max(24).optional() })
      .safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listExpenses(ctx, q.data));
  });

  const allocationFields = {
    allocationMode: z.enum(['meal', 'equal', 'custom', 'selected', 'individual']).optional(),
    memberIds: z.array(ID).max(100).optional(),
    shares: z.record(z.string(), z.number()).optional(),
  };

  app.post('/meal-management/expenses', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        date: DAY,
        amount: z.number().positive().max(10_000_000),
        categoryKey: z.string().min(1).max(24),
        payerId: ID.optional(),
        note: z.string().max(500).optional(),
        receipt: RECEIPT,
        submit: z.boolean().optional(),
        ...allocationFields,
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.createExpense(ctx, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send(out.result);
  });

  app.get<{ Params: { id: string } }>('/meal-management/expenses/:id', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.getExpense(ctx, request.params.id));
  });

  app.post<{ Params: { id: string } }>('/meal-management/expenses/:id', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        date: DAY.optional(),
        amount: z.number().positive().max(10_000_000).optional(),
        categoryKey: z.string().max(24).optional(),
        payerId: ID.optional(),
        note: z.string().max(500).optional(),
        receipt: RECEIPT,
        ...allocationFields,
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.updateExpense(ctx, request.params.id, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/expenses/:id/submit', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.submitExpense(ctx, request.params.id));
  });

  app.post<{ Params: { id: string } }>('/meal-management/expenses/:id/decide', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ approve: z.boolean(), note: z.string().max(500).optional() }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.decideExpense(ctx, request.params.id, body.data.approve, body.data.note));
  });

  app.post<{ Params: { id: string } }>('/meal-management/expenses/:id/remove', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.removeExpense(ctx, request.params.id));
  });

  app.get('/meal-management/deposits', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery
      .extend({ memberId: ID.optional(), status: z.string().max(20).optional() })
      .safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listDeposits(ctx, q.data));
  });

  app.post('/meal-management/deposits', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        date: DAY,
        amount: z.number().positive().max(10_000_000),
        memberId: ID.optional(),
        method: z.enum(['cash', 'bkash', 'nagad', 'bank', 'other']).optional(),
        reference: z.string().max(80).optional(),
        note: z.string().max(500).optional(),
        receipt: RECEIPT,
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.addDeposit(ctx, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send(out.result);
  });

  app.post<{ Params: { id: string } }>('/meal-management/deposits/:id/decide', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ approve: z.boolean(), note: z.string().max(500).optional() }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.decideDeposit(ctx, request.params.id, body.data.approve, body.data.note));
  });

  app.post<{ Params: { id: string } }>('/meal-management/deposits/:id/remove', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.removeDeposit(ctx, request.params.id));
  });

  app.get('/meal-management/balance', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.balanceOverview(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
  });

  /* ================================================================ *
   * §4.6, §4.8 — the month
   * ================================================================ */

  app.get('/meal-management/months', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.listMonths(ctx));
  });

  app.get('/meal-management/summary', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.monthlySummary(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
  });

  app.get('/meal-management/month/review', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.closingReview(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
  });

  app.post('/meal-management/month/open', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ month: MONTH }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.openMonth(ctx, body.data.month));
  });

  app.post('/meal-management/month/close', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ month: MONTH }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.closeMonth(ctx, body.data.month));
  });

  app.post('/meal-management/month/archive', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ month: MONTH }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.archiveMonth(ctx, body.data.month));
  });

  app.get('/meal-management/month/adjustments', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listAdjustments(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
  });

  app.post('/meal-management/month/adjustments', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        month: MONTH,
        memberId: ID,
        amount: z.number().refine((n) => n !== 0, 'must not be zero'),
        reason: z.string().min(1).max(500),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.postAdjustment(ctx, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send(out.result);
  });

  /* ================================================================ *
   * §4.9 — reports
   * ================================================================ */

  /** Every report takes a month and nothing else, so they share one reader. */
  const monthlyReport = (
    path: string,
    run: (ctx: mm.MessContext, month: string) => Promise<MmResult<unknown>>,
  ) => {
    app.get(`/meal-management/reports/${path}`, async (request, reply) => {
      const ctx = await contextOf(request, reply as never);
      if (!ctx) return;

      const q = monthQuery.safeParse(request.query ?? {});
      if (!q.success) return badBody(reply as never, q.error);

      return send(reply as never, await run(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
    });
  };

  monthlyReport('meals', mm.mealReport);
  monthlyReport('expenses', mm.expenseReport);
  monthlyReport('bazar', mm.bazarReport);
  monthlyReport('deposits', mm.depositReport);
  monthlyReport('bills', mm.memberBills);
  monthlyReport('rate', mm.rateReport);
  monthlyReport('settlement', mm.settlementReport);
  monthlyReport('mess', mm.messStatement);

  app.get('/meal-management/reports/statement', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.extend({ memberId: ID.optional() }).safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(
      reply as never,
      await mm.memberStatement(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx)), q.data.memberId),
    );
  });

  app.get('/meal-management/reports/activity', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z
      .object({
        from: DAY.optional(),
        to: DAY.optional(),
        action: z.string().max(40).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        messId: ID.optional(),
      })
      .safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.activityReport(ctx, q.data));
  });

  app.get('/meal-management/reports/export', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.extend({ kind: z.string().min(1).max(24) }).safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(
      reply as never,
      await mm.exportCsv(ctx, q.data.kind, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))),
    );
  });

  app.get('/meal-management/reports/print', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.reportHtml(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
  });

  /* ================================================================ *
   * §4.10 – §4.14 — notifications, board, menu, cook
   * ================================================================ */

  app.get('/meal-management/notifications', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).optional(), messId: ID.optional() }).safeParse(
      request.query ?? {},
    );
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listNotifications(ctx, q.data.limit));
  });

  app.post('/meal-management/notifications/read', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ ids: z.array(ID).max(200).optional() }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.readNotifications(ctx, body.data.ids));
  });

  app.get('/meal-management/notices', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.listNotices(ctx));
  });

  app.post('/meal-management/notices', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        id: ID.optional(),
        title: z.string().min(1).max(140),
        body: z.string().max(4000).optional(),
        pinned: z.boolean().optional(),
        important: z.boolean().optional(),
        expiresAt: DAY.nullable().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.saveNotice(ctx, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/notices/:id/read', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.readNotice(ctx, request.params.id));
  });

  app.post<{ Params: { id: string } }>('/meal-management/notices/:id/remove', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.removeNotice(ctx, request.params.id));
  });

  app.get('/meal-management/polls', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.listPolls(ctx));
  });

  app.post('/meal-management/polls', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        question: z.string().min(1).max(280),
        options: z.array(z.string().min(1).max(120)).min(2).max(12),
        multi: z.boolean().optional(),
        endAt: DAY.nullable().optional(),
        resultVisibility: z.enum(['live', 'final']).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.createPoll(ctx, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/polls/:id/vote', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ optionIds: z.array(z.string().max(8)).min(1).max(12) }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.vote(ctx, request.params.id, body.data.optionIds));
  });

  app.post<{ Params: { id: string } }>('/meal-management/polls/:id/close', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.closePoll(ctx, request.params.id));
  });

  app.post<{ Params: { id: string } }>('/meal-management/polls/:id/remove', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.removePoll(ctx, request.params.id));
  });

  app.get('/meal-management/menu/suggestions', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.listSuggestions(ctx));
  });

  app.post('/meal-management/menu/suggestions', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ text: z.string().min(1).max(200), mealType: z.string().max(24).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.addSuggestion(ctx, body.data.text, body.data.mealType));
  });

  app.post<{ Params: { id: string } }>('/meal-management/menu/suggestions/:id/back', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.backSuggestion(ctx, request.params.id));
  });

  app.get('/meal-management/menu', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z
      .object({ from: DAY.optional(), days: z.coerce.number().int().min(1).max(31).optional(), messId: ID.optional() })
      .safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listMenu(ctx, q.data));
  });

  app.post('/meal-management/menu', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        date: DAY,
        mealType: z.string().min(1).max(24),
        items: z.array(z.string().max(120)).max(40),
        special: z.boolean().optional(),
        note: z.string().max(500).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.saveMenu(ctx, body.data));
  });

  app.post<{ Params: { id: string } }>('/meal-management/menu/:id/rate', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.rateMenu(ctx, request.params.id, body.data.rating, body.data.comment));
  });

  app.post<{ Params: { id: string } }>('/meal-management/menu/:id/remove', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.removeMenu(ctx, request.params.id));
  });

  app.get('/meal-management/cooks', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.listCooks(ctx));
  });

  app.post('/meal-management/cooks', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        id: ID.optional(),
        name: z.string().min(1).max(80),
        phone: z.string().max(24).optional(),
        salary: z.number().min(0).max(1_000_000).optional(),
        schedule: z.string().max(200).optional(),
        joinedAt: DAY.optional(),
        active: z.boolean().optional(),
        note: z.string().max(500).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.saveCook(ctx, body.data));
  });

  app.post('/meal-management/cooks/attendance', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        cookId: ID,
        date: DAY,
        status: z.enum(['present', 'absent', 'leave', 'replaced']).optional(),
        mealsCooked: z.number().int().min(0).max(2000).optional(),
        replacementName: z.string().max(80).optional(),
        note: z.string().max(500).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.recordCookDay(ctx, body.data));
  });

  app.post('/meal-management/cooks/pay', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        cookId: ID,
        date: DAY,
        amount: z.number().positive().max(1_000_000),
        method: z.enum(['cash', 'bkash', 'nagad', 'bank', 'other']).optional(),
        note: z.string().max(500).optional(),
        categoryKey: z.string().max(24).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.payCook(ctx, body.data));
  });

  app.get<{ Params: { id: string } }>('/meal-management/cooks/:id', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(
      reply as never,
      await mm.cookMonth(ctx, request.params.id, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))),
    );
  });

  /* ================================================================ *
   * §4.7, §4.15, §4.16 — dashboard, assistant, analytics
   * ================================================================ */

  app.get('/meal-management/dashboard', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.dashboard(ctx, q.data.month));
  });

  app.get('/meal-management/analytics', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.analytics(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
  });

  app.get('/meal-management/insights/expenses', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.expenseInsights(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
  });

  app.get('/meal-management/insights/prediction', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z.object({ date: DAY.optional(), messId: ID.optional() }).safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.mealPrediction(ctx, q.data.date));
  });

  app.get('/meal-management/insights/waste', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.wasteEstimate(ctx, q.data.month ?? mm.monthFor(ctx, mm.todayIn(ctx))));
  });

  app.get('/meal-management/assistant', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.assistantHistory(ctx));
  });

  app.post('/meal-management/assistant', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ text: z.string().min(1).max(500) }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.assistantAsk(ctx, body.data.text));
  });

  app.post('/meal-management/assistant/confirm', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z.object({ proposalId: ID }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    return send(reply as never, await mm.assistantConfirm(ctx, body.data.proposalId));
  });

  /* ================================================================ *
   * the mess room
   * ================================================================ */

  app.get('/meal-management/messages', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const q = z
      .object({
        before: z.string().max(40).optional(),
        limit: z.coerce.number().int().min(1).max(40).optional(),
        messId: ID.optional(),
      })
      .safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    return send(reply as never, await mm.listMessages(ctx, q.data));
  });

  app.post('/meal-management/messages', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;

    const body = z
      .object({
        body: z.string().min(1).max(2000),
        /* The device's own id, so a retry posts once. */
        clientId: z.string().min(6).max(64),
        replyToId: ID.optional(),
        about: z
          .object({
            kind: z.enum(['bazar', 'expense', 'deposit', 'month', 'meal']),
            id: z.string().min(1).max(64),
            label: z.string().max(120).optional(),
          })
          .optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.sendMessage(ctx, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send(out.result);
  });

  app.post('/meal-management/messages/read', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.readMessages(ctx));
  });

  app.post<{ Params: { id: string } }>('/meal-management/messages/:id/hide', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.hideMessage(ctx, request.params.id));
  });

  /* ================================================================ *
   * attachments
   * ================================================================ */

  app.get<{ Params: { id: string } }>('/meal-management/attachments/:id', async (request, reply) => {
    const ctx = await contextOf(request, reply as never);
    if (!ctx) return;
    return send(reply as never, await mm.readAttachment(ctx, request.params.id));
  });
}
