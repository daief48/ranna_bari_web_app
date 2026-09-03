import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

import { loadEnv } from './config/env.js';
import { errText } from './lib/domain.js';
import { appRoutes } from './routes/app/v1/index.js';
import { mealRoutes } from './routes/app/v1/meals.js';
import { storeRoutes } from './routes/app/v1/stores.js';
import { requestRoutes } from './routes/app/v1/requests.js';
import { walletRoutes } from './routes/app/v1/wallet.js';
import { adminRoutes } from './routes/admin/v1/index.js';
import { operationRoutes } from './routes/admin/v1/operations.js';
import { moneyRoutes } from './routes/admin/v1/money.js';
import { internalRoutes } from './routes/internal/index.js';

/**
 * The HTTP surface.
 *
 * Two route groups with two different authentication realms, mounted under
 * two different prefixes so it is never ambiguous which one a handler is in.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();

  const app = Fastify({
    /*
     * Big enough for a kitchen gallery.
     *
     * Photographs are stored as data URIs inside the document — there is no
     * bucket on this platform, and `logic/icons.ts` settled that question
     * the same way. Five downscaled phone photographs are about a megabyte,
     * which is exactly Fastify's default, so registration was posting a body
     * the framework refused before any handler saw it. The cook was told
     * nothing and kept whichever subset a later, smaller request managed.
     *
     * Not unlimited: Mongo will refuse a document over 16MB, and accepting a
     * body that cannot possibly be stored only moves the failure somewhere
     * harder to explain.
     */
    bodyLimit: 24 * 1024 * 1024,
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
            /* A bearer token in a log line is a credential at rest in a place
               nobody is guarding. Redact before anything is written. */
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
    // Behind a proxy in production, so the client IP comes from the header
    // rather than being the load balancer for every request.
    trustProxy: env.NODE_ENV === 'production',
  });

  /**
   * CORS for the app endpoints.
   *
   * Native React Native does not enforce CORS, but this app also builds for
   * web, where the Expo dev server is on one port and this API on another.
   * `*` is correct for `/api/app` specifically: those routes authenticate
   * with a bearer token and never a cookie, so there is no ambient authority
   * for another origin to borrow. The admin routes are pinned to the panel's
   * origin, because those do carry a session.
   */
  await app.register(cors, {
    origin: (origin, done) => done(null, true),
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-service-token', 'x-actor'],
    maxAge: 86_400,
  });

  /**
   * An empty body is `{}`, not a 400.
   *
   * Fastify's own JSON parser refuses a zero-length body whenever the caller
   * announced `content-type: application/json`, and the refusal happens
   * before any handler runs — so the reply is a parser message rather than
   * one of this API's codes.
   *
   * Half the writes here are a verb with no payload: mark a dish sold out,
   * advance an order, empty the basket, withdraw an offer. A client that sets
   * the header on every request is doing something ordinary, and the honest
   * reading of "no body" for those routes is an empty object — every one of
   * them parses its body with a schema that is happy with `{}`.
   */
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, payload, done) => {
      const raw = String(payload ?? '').trim();
      if (!raw) return done(null, {});
      try {
        done(null, JSON.parse(raw));
      } catch {
        /* A malformed body is still a 400 — the caller sent something and got
           it wrong, which is not the same as sending nothing. */
        const error = new Error('bad-json') as Error & { statusCode?: number };
        error.statusCode = 400;
        done(error, undefined);
      }
    },
  );

  /* One error shape for the whole surface: a code the clients can branch on,
     and a sentence for anything that has not been taught that code yet. */
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) request.log.error({ err: error }, 'unhandled');

    /* A thrown `ERR` code is a refusal the client can branch on; anything
       with a space in it is a real exception and must not be echoed back —
       stack traces and driver messages leak schema. */
    const code = !error.message || error.message.includes(' ') ? 'server-error' : error.message;

    reply.status(status).send({
      error: code,
      message: status >= 500 ? 'Something went wrong.' : errText(code),
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: 'not-found', message: 'No such endpoint.' });
  });

  await app.register(internalRoutes);

  /* Split by domain rather than kept in one file. Six route modules under two
     prefixes; the prefix decides which authentication realm a handler is in,
     so a route cannot end up in the wrong one by being written in the wrong
     place. */
  for (const routes of [appRoutes, mealRoutes, storeRoutes, requestRoutes, walletRoutes]) {
    await app.register(routes, { prefix: '/api/app/v1' });
  }
  for (const routes of [adminRoutes, operationRoutes, moneyRoutes]) {
    await app.register(routes, { prefix: '/api/admin/v1' });
  }

  return app;
}
