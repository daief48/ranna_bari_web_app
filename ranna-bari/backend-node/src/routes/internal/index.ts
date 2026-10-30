import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { timingSafeEqual } from 'node:crypto';

import { supportsTransactions } from '../../config/db.js';
import { loadEnv } from '../../config/env.js';
import { sweepEscrow } from '../../logic/orders.js';
import { expireRequests, expireUnpaidAgreements } from '../../logic/requests.js';

/**
 * Liveness, and the two things about this deployment that are easy to get
 * wrong and invisible until they matter — plus the one job that needs a
 * clock nobody on a serverless deployment has.
 */

/** Constant-time equality for the service token, so a header cannot be guessed a byte at a time. */
function tokenMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function internalRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const connected = mongoose.connection.readyState === 1;
    return {
      name: 'RannaBari Backend API',
      status: 'online',
      db: connected ? 'connected' : 'disconnected',
      endpoints: {
        health: '/health',
        appApi: '/api/app/v1',
        adminApi: '/api/admin/v1',
      },
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/health', async () => {
    const connected = mongoose.connection.readyState === 1;
    return {
      ok: connected,
      db: connected ? 'connected' : 'disconnected',
      /* If this is false the deployment is a standalone mongod, and every
         money transition will fail at commit rather than at startup. Worth
         knowing from a health check rather than from a customer. */
      transactions: connected && supportsTransactions(),
      at: new Date().toISOString(),
    };
  });

  /**
   * The escrow auto-release, for a cron.
   *
   * `escrowAutoReleaseDays` promises a cook their money releases without the
   * customer after so many days, and nothing ever ran it: the panel has a
   * sweep button, and a button is not a schedule. On Netlify there is no
   * long-lived process to run a timer in, so the sweep is a route an external
   * scheduler hits — guarded by the service token the panel already holds,
   * and by nothing weaker. The logic is `sweepEscrow`'s, shared with the
   * panel's button, so the two cannot drift.
   */
  app.post('/api/internal/escrow/sweep', async (request, reply) => {
    const token = request.headers['x-service-token'];
    if (!tokenMatches(typeof token === 'string' ? token : undefined, loadEnv().BACKEND_SERVICE_TOKEN)) {
      return reply.status(401).send({ error: 'unauthenticated', message: 'Service token required.' });
    }
    return sweepEscrow();
  });

  /**
   * The request sweeps, for a cron: requests past their date expire, and
   * agreed prices nobody paid within `requestPayWindowHours` reopen. Both are
   * also run lazily when the board is read; this is the guaranteed clock.
   * Same service-token guard as the escrow sweep. Moves no money.
   */
  app.post('/api/internal/requests/sweep', async (request, reply) => {
    const token = request.headers['x-service-token'];
    if (!tokenMatches(typeof token === 'string' ? token : undefined, loadEnv().BACKEND_SERVICE_TOKEN)) {
      return reply.status(401).send({ error: 'unauthenticated', message: 'Service token required.' });
    }
    const expired = await expireRequests();
    const reopened = await expireUnpaidAgreements();
    return {
      expired: expired.ok ? expired.result.expired : 0,
      reopened: reopened.ok ? reopened.result.reopened : 0,
    };
  });
}
