import mongoose, { type ClientSession } from 'mongoose';

import { loadEnv } from './env.js';

/**
 * The connection, and the transaction helper everything that moves money runs
 * inside.
 */

let connecting: Promise<typeof mongoose> | null = null;

export async function connect(uri?: string): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  const target = uri ?? loadEnv().MONGODB_URI;

  mongoose.set('strictQuery', true);
  /* Fail fast rather than buffering. A query that queues for thirty seconds
     against a database that is not there reports as a slow endpoint; one that
     rejects immediately reports as what it is. */
  mongoose.set('bufferCommands', false);

  connecting = mongoose.connect(target, {
    serverSelectionTimeoutMS: 10_000,
    // Every write is acknowledged by a majority. Anything less means a
    // confirmed payment can disappear in a failover.
    writeConcern: { w: 'majority' },
    retryWrites: true,
  });

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function disconnect() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

/** True when this deployment can actually run a transaction. */
export function supportsTransactions(): boolean {
  // Transactions need a replica set or a sharded cluster. Atlas is always a
  // replica set; a bare local `mongod` is not, and would fail at commit.
  const topology = (mongoose.connection.db as unknown as { topology?: { s?: { description?: { type?: string } } } })
    ?.topology;
  const type = topology?.s?.description?.type;
  return type !== 'Single';
}

/**
 * Run a unit of work atomically.
 *
 * Confirming a store order debits a wallet, decrements stock, creates orders
 * and files a notification. There must be no instant where some of that
 * happened — that is the whole reason the app kept its commerce in one
 * AsyncStorage document, and a transaction is how the same guarantee is
 * expressed here.
 *
 * **Every query inside must be passed the session.** One that forgets runs
 * outside the transaction, commits on its own, and is not rolled back with
 * the rest — silently. It is the most common Mongoose transaction bug and it
 * raises no error, so the models are written to take a session everywhere and
 * the tests assert on the rollback.
 */
export async function tx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let out: T;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out!;
  } finally {
    await session.endSession();
  }
}

/** MongoDB's duplicate-key error. A retry, not a failure — decide per caller. */
export const isDuplicateKey = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  (error as { code?: number }).code === 11000;
