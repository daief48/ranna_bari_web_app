/**
 * Wallet-only payments — one-off switch for an existing database.
 *
 * Cash on delivery is retired for NEW orders. The server refuses a new `cod`
 * order outright (`ERR.CASH_RETIRED`), so nothing here is needed for safety;
 * this makes the stored state say the same thing, and builds the indexes the
 * new top-up and withdrawal rules rely on:
 *
 *   1. set the `system.cod` feature flag to off (upsert);
 *   2. build the `TopUp` indexes (one live request per provider transaction
 *      id) and the `Withdrawal` indexes (one open request per kitchen).
 *
 * No order, ledger entry or existing top-up is touched. Legacy cash orders
 * keep their `kind: 'cod'` and still open and finish. Safe to re-run.
 *
 * Reads MONGODB_URI like every script here, which in this repo's `.env` is
 * production — run it deliberately:
 *
 *   npm run migrate:wallet-only
 */
import { connect, disconnect } from '../src/config/db.js';
import { FeatureFlag, TopUp, Withdrawal } from '../src/models/index.js';

await connect();

await FeatureFlag.updateOne(
  { _id: 'system.cod' },
  { $set: { enabled: false, description: 'Cash-on-delivery ordering (retired)' } },
  { upsert: true },
);
console.log('system.cod -> off');

await TopUp.createIndexes();
await Withdrawal.createIndexes();
console.log('TopUp and Withdrawal indexes built');

await disconnect();
