/**
 * Multi-shop migration — let one kitchen own more than one shop.
 *
 * The store collection carried `kitchenId` under a **unique** index, which is
 * the database-level enforcement of "one shop per kitchen". Shops are separate
 * businesses now — a cake shop and an achar shop are two storefronts under one
 * cook — so the schema no longer asks for uniqueness. But a Mongoose schema
 * change cannot rewrite an index that already exists on a live collection:
 * MongoDB keeps the old `kitchenId_1` unique index until it is dropped by
 * name, and until then a second shop for the same kitchen is refused with a
 * duplicate-key error no matter what the schema says.
 *
 * This script does exactly that, and nothing else:
 *
 *   1. drop `kitchenId_1` (the unique index), if it is there;
 *   2. create the plain `{ kitchenId: 1 }` index the schema now declares.
 *
 * Safe to run more than once — both steps are conditional. No document is
 * touched: existing one-shop-per-kitchen data is already valid under the new
 * rule.
 *
 *   npm run migrate:multi-shop
 */
import { connect, disconnect } from '../src/config/db.js';
import { Store } from '../src/models/index.js';

const UNIQUE_INDEX = 'kitchenId_1';

await connect();

const indexes = await Store.collection.indexes();
const unique = indexes.find((ix) => ix.name === UNIQUE_INDEX);

if (unique) {
  await Store.collection.dropIndex(UNIQUE_INDEX);
  console.log(`dropped ${UNIQUE_INDEX}${unique.unique ? ' (was unique)' : ''}`);
} else {
  console.log(`no ${UNIQUE_INDEX} index to drop`);
}

/* The schema declares `index: true`, but autoIndex is typically off in
   production configs — create the plain index here so queries do not scan. */
await Store.collection.createIndex({ kitchenId: 1 });
console.log('ensured plain index { kitchenId: 1 }');

const perKitchen = await Store.aggregate([{ $group: { _id: '$kitchenId', n: { $sum: 1 } } }]);
const crowded = perKitchen.filter((row) => row.n > 1);
console.log(
  `kitchens with shops: ${perKitchen.length}, already owning multiple shops: ${crowded.length}`,
);

await disconnect();
