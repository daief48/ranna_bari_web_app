import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

import { loadEnv } from './config/env.js';
import { errText } from './lib/domain.js';
import { appRoutes } from './routes/app/v1/index.js';
import { adminRoutes } from './routes/admin/v1/index.js';
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
  await app.register(appRoutes, { prefix: '/api/app/v1' });
  await app.register(adminRoutes, { prefix: '/api/admin/v1' });

  return app;
}
