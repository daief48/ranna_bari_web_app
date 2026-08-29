import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { connect, disconnect } from '../src/config/db.js';
import { resetEnv } from '../src/config/env.js';

/**
 * A real MongoDB, in memory, as a **replica set**.
 *
 * The replica set is not incidental. Transactions need one — a standalone
 * `mongod` fails at commit — and transactions are what hold the money
 * invariants together. Testing against a standalone would mean the suite
 * passes while the thing it is meant to prove does not exist.
 *
 * One node is enough: a single-member replica set still has an oplog and
 * still supports sessions, and it starts in a couple of seconds.
 */

let replset: MongoMemoryReplSet | null = null;

export async function startTestDb(): Promise<string> {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  const uri = replset.getUri();

  process.env.MONGODB_URI = uri;
  process.env.ADMIN_AUTH_SECRET ??= 'test-admin-secret-at-least-32-characters-xx';
  process.env.APP_AUTH_SECRET ??= 'test-app-secret-at-least-32-characters-yyyy';
  process.env.BACKEND_SERVICE_TOKEN ??= 'test-service-token-at-least-32-characters';
  process.env.SMS_PROVIDER = 'none';
  process.env.NODE_ENV = 'test';
  resetEnv();

  await connect(uri);

  /* Indexes are declared on the schemas but only built on demand. The
     append-only and idempotency guarantees are *unique indexes*, so a suite
     that skips this would be testing a database without them. */
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));

  return uri;
}

export async function stopTestDb() {
  await disconnect();
  await replset?.stop();
  replset = null;
}

/** Empty every collection between tests, keeping the indexes. */
export async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
}
