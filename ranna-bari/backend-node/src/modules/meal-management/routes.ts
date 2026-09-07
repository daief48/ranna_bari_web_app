import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { bearerFrom, identify } from '../../auth/app-auth.js';

import { MM_ERR, mmErrText, type MmFail } from './errors.js';
import * as mm from './service.js';

/**
 * Meal management, over HTTP.
 *
 * Mounted under `/api/app/v1/meal-management`, so every path in this file is a
 * leaf of one prefix and nothing this module serves can collide with an
 * existing route. The realm is the app's — the same bearer token, verified by
 * the same `identify()` — because the specification asks for one account, not
 * a second login. That import is the module's only tie to the rest of the
 * backend, and it is read-only.
 *
 * The caller is taken from the token on every single route. No handler here
 * accepts a `customerKey`, which is what makes "a user sees only their own
 * meals" structural rather than a check somebody could forget to write.
 */

type Replyish = { status: (n: number) => { send: (body: unknown) => unknown } };

const fail = (reply: Replyish, code: string, status = 400, detail?: Record<string, unknown>) =>
  reply
    .status(status)
    .send({ error: code, message: mmErrText(code), ...(detail ? { detail } : {}) });

/** The few refusals that are not a plain 400. */
const STATUS: Record<string, number> = {
  [MM_ERR.UNAUTHENTICATED]: 401,
  [MM_ERR.NO_MESS]: 404,
  [MM_ERR.NOT_MEMBER]: 403,
  [MM_ERR.NO_PLAN]: 404,
  [MM_ERR.NO_RECIPE]: 404,
  [MM_ERR.NO_EXPENSE]: 404,
  [MM_ERR.NO_ITEM]: 404,
  [MM_ERR.MONTH_CLOSED]: 409,
  [MM_ERR.ALREADY_CLOSED]: 409,
};

const refuse = (reply: Replyish, out: MmFail) =>
  fail(reply, out.error, STATUS[out.error] ?? 400, out.detail);

/** Which field a malformed body tripped on, so the app can point at it. */
const badBody = (reply: Replyish, error: z.ZodError) => {
  const field = String(error.issues[0]?.path?.[0] ?? '');
  const code =
    field === 'amount' || field === 'targetRate' || field === 'guest'
      ? MM_ERR.BAD_AMOUNT
      : field === 'date' || field === 'month' || field === 'from' || field === 'to'
        ? MM_ERR.BAD_DATE
        : MM_ERR.BAD_REQUEST;
  return fail(reply, code, 400, { field });
};

/* ------------------------------------------------------------------ *
 * schemas
 * ------------------------------------------------------------------ */

const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const DAY = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
const SLOT = z.enum(['breakfast', 'lunch', 'dinner']);

const mealBody = z.object({
  date: DAY,
  breakfast: z.boolean().optional(),
  lunch: z.boolean().optional(),
  dinner: z.boolean().optional(),
  guest: z.number().int().min(0).max(20).optional(),
});

const bulkBody = z.object({
  from: DAY,
  to: DAY,
  slots: z.array(SLOT).min(1),
  value: z.boolean(),
});

const profileBody = z.object({
  breakfast: z.boolean().optional(),
  lunch: z.boolean().optional(),
  dinner: z.boolean().optional(),
  targetRate: z.number().positive().nullable().optional(),
  avoid: z.array(z.string()).optional(),
  likes: z.array(z.object({ food: z.string(), level: z.enum(['high', 'medium', 'low']) })).optional(),
  proteins: z.array(z.object({ food: z.string(), perWeek: z.number().int().min(0).max(7) })).optional(),
  breakfastPerWeek: z.number().int().min(0).max(7).optional(),
  avoidRepeat: z.boolean().optional(),
});

const expenseBody = z.object({
  date: DAY,
  amount: z.number().positive(),
  category: z.string().min(1),
  vendor: z.string().max(120).optional(),
  method: z.string().max(30).optional(),
  note: z.string().max(500).optional(),
  /* A receipt is a data URI; the cap keeps a photograph from becoming a
     document nobody can read back. */
  receipt: z.string().max(2_000_000).optional(),
});

const monthQuery = z.object({ month: MONTH.optional() });

/* ------------------------------------------------------------------ *
 * routes
 * ------------------------------------------------------------------ */

export async function mealManagementRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Resolve the caller and their mess, or send the refusal and return null.
   *
   * Every handler starts with this. It also creates the personal mess on a
   * first visit, so there is no separate "set up" call the client has to know
   * to make.
   */
  const contextOf = async (request: FastifyRequest, reply: Replyish) => {
    const caller = await identify(bearerFrom(request.headers.authorization));
    if (!caller) {
      fail(reply, MM_ERR.UNAUTHENTICATED, 401);
      return null;
    }
    const ctx = await mm.ensureMess({ customerKey: caller.customerKey, name: caller.name });
    return { caller: { customerKey: caller.customerKey, name: caller.name }, ctx };
  };

  /* ---------------------------------------------------------------- *
   * dashboard and reference data
   * ---------------------------------------------------------------- */

  app.get('/meal-management/dashboard', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const out = await mm.dashboard(c.ctx, c.caller, q.data.month);
    if (!out.ok) return refuse(reply as never, out);
    return out.result;
  });

  app.get('/meal-management/months', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;
    const out = await mm.listMonths(c.ctx);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.get('/meal-management/foods', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;
    const out = await mm.listFoods();
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.get('/meal-management/recipes', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;
    const q = z.object({ slot: SLOT.optional() }).safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);
    const out = await mm.listRecipes(q.data.slot);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.get('/meal-management/categories', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;
    return { categories: mm.EXPENSE_CATEGORIES, applicable: c.ctx.applicableCategories };
  });

  /* ---------------------------------------------------------------- *
   * meals — the accounting entries
   * ---------------------------------------------------------------- */

  app.get('/meal-management/meals', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const month = q.data.month ?? new Date().toISOString().slice(0, 7);
    const out = await mm.listMeals(c.ctx, c.caller, month);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.post('/meal-management/meals', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const body = mealBody.safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const { date, ...patch } = body.data;
    const out = await mm.setMeal(c.ctx, c.caller, date, patch);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.post('/meal-management/meals/bulk', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const body = bulkBody.safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.bulkMeals(c.ctx, c.caller, body.data);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  /* ---------------------------------------------------------------- *
   * schedule and preferences — one document, two screens
   * ---------------------------------------------------------------- */

  app.get('/meal-management/profile', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;
    return mm.getProfile(c.ctx, c.caller);
  });

  app.post('/meal-management/profile', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const body = profileBody.safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.saveProfile(c.ctx, c.caller, body.data);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  /* ---------------------------------------------------------------- *
   * money
   * ---------------------------------------------------------------- */

  app.get('/meal-management/expenses', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const month = q.data.month ?? new Date().toISOString().slice(0, 7);
    const out = await mm.listExpenses(c.ctx, month);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.post('/meal-management/expenses', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const body = expenseBody.safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.addExpense(c.ctx, c.caller, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send(out.result);
  });

  app.post<{ Params: { id: string } }>('/meal-management/expenses/:id/remove', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;
    const out = await mm.removeExpense(c.ctx, c.caller, request.params.id);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.post('/meal-management/settings/categories', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const body = z.object({ categories: z.array(z.string()) }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.saveCategories(c.ctx, c.caller, body.data.categories);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  /* ---------------------------------------------------------------- *
   * the month
   * ---------------------------------------------------------------- */

  app.get('/meal-management/monthly-summary', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const month = q.data.month ?? new Date().toISOString().slice(0, 7);
    const out = await mm.monthlySummary(c.ctx, c.caller, month);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  /** The rate, with the arithmetic that produced it shown. */
  app.get('/meal-management/rate', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const month = q.data.month ?? new Date().toISOString().slice(0, 7);
    const out = await mm.monthlySummary(c.ctx, c.caller, month);
    if (!out.ok) return refuse(reply as never, out);

    const r = out.result as Record<string, unknown>;
    return {
      month,
      closed: r.closed,
      applicableCost: r.applicableCost,
      totalCost: r.totalCost,
      totalMeals: r.totalMeals,
      rate: r.rate,
      categories: r.categories,
      mine: r.mine,
      formula: 'Meal rate = applicable monthly cost ÷ total monthly meals',
    };
  });

  app.post('/meal-management/month/close', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const body = z.object({ month: MONTH }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.closeMonth(c.ctx, c.caller, body.data.month);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  /* ---------------------------------------------------------------- *
   * the smart layer
   * ---------------------------------------------------------------- */

  app.get('/meal-management/smart-plan', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const month = q.data.month ?? new Date().toISOString().slice(0, 7);
    const out = await mm.getPlan(c.ctx, c.caller, month);
    if (!out.ok) return refuse(reply as never, out);
    return { month, plan: out.result };
  });

  app.post('/meal-management/smart-plan/generate', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const body = z
      .object({ month: MONTH, targetRate: z.number().positive().optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.generatePlan(c.ctx, c.caller, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return reply.status(201).send({ plan: out.result });
  });

  app.get('/meal-management/smart-plan/alternatives', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const q = z
      .object({ month: MONTH, index: z.coerce.number().int().min(0) })
      .safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const out = await mm.planAlternatives(c.ctx, c.caller, q.data);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.post('/meal-management/smart-plan/replace', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const body = z
      .object({ month: MONTH, index: z.number().int().min(0), recipeKey: z.string().min(1) })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.replacePlanItem(c.ctx, c.caller, body.data);
    if (!out.ok) return refuse(reply as never, out);
    return { plan: out.result };
  });

  app.post('/meal-management/smart-plan/reject', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const body = z
      .object({ month: MONTH, from: z.string().min(1), to: z.string().min(1) })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply as never, body.error);

    const out = await mm.rejectSuggestion(c.ctx, c.caller, body.data);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.get('/meal-management/recommendations', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const month = q.data.month ?? new Date().toISOString().slice(0, 7);
    const out = await mm.recommendations(c.ctx, c.caller, month);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.get('/meal-management/forecast', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;
    const out = await mm.forecast(c.ctx, c.caller);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.get('/meal-management/insights', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;

    const q = monthQuery.safeParse(request.query ?? {});
    if (!q.success) return badBody(reply as never, q.error);

    const month = q.data.month ?? new Date().toISOString().slice(0, 7);
    const out = await mm.insights(c.ctx, c.caller, month);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  /* ---------------------------------------------------------------- *
   * the module's own inbox
   * ---------------------------------------------------------------- */

  app.get('/meal-management/notices', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;
    const out = await mm.listNotices(c.caller);
    return out.ok ? out.result : refuse(reply as never, out);
  });

  app.post('/meal-management/notices/read', async (request, reply) => {
    const c = await contextOf(request, reply as never);
    if (!c) return;
    const out = await mm.readNotices(c.caller);
    return out.ok ? out.result : refuse(reply as never, out);
  });
}
