import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';

import { supportsTransactions } from '../../config/db.js';

/**
 * Liveness, and the two things about this deployment that are easy to get
 * wrong and invisible until they matter.
 */
export async function internalRoutes(app: FastifyInstance) {
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
}
