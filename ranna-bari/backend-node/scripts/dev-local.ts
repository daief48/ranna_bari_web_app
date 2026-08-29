/**
 * Run the whole backend against a throwaway MongoDB, with no Atlas.
 *
 * The real `npm run dev` needs `MONGODB_URI` pointing at a cluster. Until that
 * password is filled in, this boots an in-memory **replica set** — a replica
 * set specifically, because transactions need one and every money path in
 * this service is a transaction. A standalone `mongod` would start, serve
 * reads, and then fail at the first commit.
 *
 * It seeds on boot, so the API answers with the full demo database rather
 * than an empty one. Everything vanishes when the process exits; that is the
 * point.
 *
 *     npm run dev:local
 *
 * The data directory is kept between runs where the OS allows it, so a
 * restart is fast, but nothing here is durable and nothing here should be
 * pointed at by anything that matters.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { connect, disconnect, supportsTransactions } from '../src/config/db.js';
import { loadEnv, resetEnv } from '../src/config/env.js';

const replset = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});

const uri = replset.getUri();
process.env.MONGODB_URI = uri;

/* Dev secrets, only if the .env has not supplied real ones. Long enough to
   pass validation and obviously not a credential. */
process.env.ADMIN_AUTH_SECRET ||= 'local-dev-admin-secret-not-a-real-credential';
process.env.APP_AUTH_SECRET ||= 'local-dev-app-secret-not-a-real-credential-x';
process.env.BACKEND_SERVICE_TOKEN ||= 'local-dev-service-token-not-a-real-credential';
process.env.SMS_PROVIDER = 'none';
resetEnv();

console.log(`\n  in-memory replica set: ${uri}`);

await connect(uri);
if (!supportsTransactions()) {
  throw new Error('The in-memory server is not a replica set — transactions would fail.');
}

console.log('  seeding…\n');
const { seed } = await import('./seed.js');
await seed();

/* The seed disconnects when it is done, so reconnect before the server comes
   up on the same URI. */
await connect(uri);

const { buildApp } = await import('../src/app.js');
const env = loadEnv();
const app = await buildApp();
await app.listen({ port: env.PORT, host: '0.0.0.0' });

/* The socket half of server.ts, duplicated rather than imported: server.ts is
   an entry point that connects and listens on its own, and importing it here
   would start a second server on the same port. */
const { WebSocketServer } = await import('ws');
const { parse } = await import('node:url');
const { randomUUID } = await import('node:crypto');
const { identify } = await import('../src/auth/app-auth.js');
const { readSession } = await import('../src/auth/admin-auth.js');
const hub = await import('../src/realtime/hub.js');

const wss = new WebSocketServer({ noServer: true });

app.server.on('upgrade', async (request, socket, head) => {
  const { pathname, query } = parse(request.url ?? '', true);
  if (pathname !== '/ws') return;

  const token =
    (typeof request.headers.authorization === 'string' &&
    request.headers.authorization.toLowerCase().startsWith('bearer ')
      ? request.headers.authorization.slice(7).trim()
      : undefined) ?? (typeof query.token === 'string' ? query.token : undefined);

  const account = token ? await identify(token) : null;
  const operator = !account && token ? await readSession(token) : null;

  const identity = account
    ? account.role === 'cook' && account.kitchenId
      ? {
          side: 'cook' as const,
          kitchenId: account.kitchenId,
          customerKey: account.customerKey,
          name: account.kitchenName || account.name || 'Kitchen',
        }
      : {
          side: 'customer' as const,
          customerKey: account.customerKey,
          name: account.name || 'Customer',
        }
    : operator
      ? { side: 'admin' as const, email: operator.email, name: operator.name }
      : null;

  if (!identity) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    const id = randomUUID();
    hub.register(id, ws, identity);
    ws.on('close', () => hub.unregister(id));
    ws.on('error', () => hub.unregister(id));
  });
});

console.log(
  `\n  RannaBari backend (local, in-memory) on http://localhost:${env.PORT}` +
    `\n  chat socket on ws://localhost:${env.PORT}/ws` +
    `\n  admin sign-in: admin@rannabari.app / rannabari` +
    `\n\n  Nothing here is durable. Ctrl-C and it is gone.\n`,
);

const shutdown = async () => {
  wss.close();
  await app.close();
  await disconnect();
  await replset.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
