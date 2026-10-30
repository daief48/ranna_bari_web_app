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

/*
 * The suite's secrets, set at import and set outright — never `??=`.
 *
 * `env.ts` loads a developer's `.env` the moment it is imported, and a suite
 * reads `process.env.BACKEND_SERVICE_TOKEN` while its `describe` blocks are
 * being collected, before any `beforeAll` runs. Assigned here, at module
 * scope, the test values are in place for both: the headers a test builds
 * at collection and the environment `buildApp()` validates later agree. A
 * placeholder secret left in `.env` (the example's `change-me-…`) is also
 * refused by production-mode cases, and the refusal surfaced as a 401 on an
 * unrelated test when the suite let the file's value stand.
 */
const TEST_SECRETS = {
  ADMIN_AUTH_SECRET: 'test-admin-secret-at-least-32-characters-xx',
  APP_AUTH_SECRET: 'test-app-secret-at-least-32-characters-yyyy',
  BACKEND_SERVICE_TOKEN: 'test-service-token-at-least-32-characters',
} as const;
Object.assign(process.env, TEST_SECRETS);

export async function startTestDb(): Promise<string> {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  const uri = replset.getUri();

  process.env.MONGODB_URI = uri;
  /* Again, in case something between import and here put the file's back. */
  Object.assign(process.env, TEST_SECRETS);
  process.env.SMS_PROVIDER = 'none';
  /* A developer's .env may carry live SMTP credentials; a suite must never
     mail anybody. Cleared so `mailIsLive()` is false and the email-code path
     hands codes back in the response — the offline branch the phone path has
     always used. */
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
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
