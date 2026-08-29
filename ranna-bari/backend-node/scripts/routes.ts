/**
 * Print the route table.
 *
 * Registering eight route modules under two prefixes is exactly the kind of
 * thing that silently half-works — a module that throws on registration, or
 * one whose prefix is wrong, looks identical to one that was never imported.
 * This is the cheapest way to see what the server actually serves.
 *
 * `npm run routes` — needs a database only because the app builds its plugins.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { connect, disconnect } from '../src/config/db.js';
import { resetEnv } from '../src/config/env.js';
import { buildApp } from '../src/app.js';

const replset = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});

process.env.MONGODB_URI = replset.getUri();
process.env.ADMIN_AUTH_SECRET ??= 'routes-admin-secret-at-least-32-characters';
process.env.APP_AUTH_SECRET ??= 'routes-app-secret-at-least-32-characters-x';
process.env.BACKEND_SERVICE_TOKEN ??= 'routes-service-token-at-least-32-characters';
process.env.NODE_ENV = 'test';
resetEnv();

await connect();
const app = await buildApp();
await app.ready();

/* `commonPrefix: false` gives one line per path rather than Fastify's radix
   tree, which shares prefixes and is unreadable as an API listing. */
const printed = app.printRoutes({ commonPrefix: false });
console.log(printed);

const count = printed.split('\n').filter((line) => line.includes('(')).length;
console.log(`\n  ${count} routes registered\n`);

await app.close();
await disconnect();
await replset.stop();
process.exit(0);
