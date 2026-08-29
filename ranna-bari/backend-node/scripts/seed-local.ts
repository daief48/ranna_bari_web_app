/**
 * Run the seed against a throwaway in-memory replica set.
 *
 * For proving the seed works without touching Atlas — the data goes away with
 * the process. `npm run seed` is the real one and needs MONGODB_URI.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const replset = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});

process.env.MONGODB_URI = replset.getUri();
process.env.ADMIN_AUTH_SECRET ??= 'local-admin-secret-at-least-32-characters-x';
process.env.APP_AUTH_SECRET ??= 'local-app-secret-at-least-32-characters-yy';
process.env.BACKEND_SERVICE_TOKEN ??= 'local-service-token-at-least-32-characters';

console.log(`(in-memory replica set at ${replset.getUri()})\n`);

const { seed } = await import('./seed.js');
await seed();

await replset.stop();
process.exit(0);
