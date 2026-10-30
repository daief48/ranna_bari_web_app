import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { bearerFrom, identify } from '../../../auth/app-auth.js';
import { ERR, errText } from '../../../lib/domain.js';
import {
  cancelWithdrawal,
  requestWithdrawal,
  withdrawalsFor,
} from '../../../logic/withdrawals.js';

/**
 * A cook's withdrawals.
 *
 * Cook-only, and the kitchen comes from the token — there is no `kitchenId`
 * field in any schema below, so no path through this file can name somebody
 * else's. The destination is not accepted either: it is copied from the
 * kitchen's own record at request time, which is what stops a request body
 * from redirecting money to a number the cook never saved.
 */

const fail = (reply: FastifyReply, code: string, status = 400, detail?: unknown) =>
  reply
    .status(status)
    .send({ error: code, message: errText(code), ...(detail ? { detail } : {}) });

async function cookOf(request: FastifyRequest, reply: FastifyReply) {
  const caller = await identify(bearerFrom(request.headers.authorization));
  if (!caller) {
    fail(reply, 'unauthenticated', 401);
    return null;
  }
  if (!caller.kitchenId) {
    fail(reply, ERR.NO_KITCHEN, 403);
    return null;
  }
  return { ...caller, kitchenId: caller.kitchenId };
}

export async function withdrawalRoutes(app: FastifyInstance) {
  /** The list, and the figures the screen needs: balance, reserved, available. */
  app.get('/kitchens/mine/withdrawals', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;
    return withdrawalsFor(cook.kitchenId);
  });

  app.post('/kitchens/mine/withdrawals', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    /* Finite and a whole number: Infinity and 12.5 both survive `Math.round`
       in a looser parse, and only one check stands before the ledger. */
    const body = z
      .object({ amount: z.number().finite().positive() })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.BAD_AMOUNT);

    const out = await requestWithdrawal(cook.kitchenId, body.data.amount);
    if (!out.ok) return fail(reply, out.error, 400, out.detail);
    return out.result;
  });

  app.post('/kitchens/mine/withdrawals/:id/cancel', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const { id } = request.params as { id: string };
    const out = await cancelWithdrawal(cook.kitchenId, id);
    if (!out.ok) return fail(reply, out.error, out.error === ERR.NO_WITHDRAWAL ? 404 : 400);
    return out.result;
  });
}
