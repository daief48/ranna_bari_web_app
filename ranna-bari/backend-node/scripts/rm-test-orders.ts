/**
 * Remove orders created by a test run, and everything they dragged in.
 *
 * Named by code, never by a pattern that could sweep up a real one. It
 * refuses outright if any ledger entry hangs off them that does not net to
 * zero — those cannot be deleted (the ledger is append-only) and leaving the
 * books carrying money for an order nobody can look up is worse than leaving
 * the order.
 *
 * A review does more than sit in a collection: it moves the kitchen's rating.
 * So the kitchens involved are recomputed afterwards from what is left.
 *
 *   npx tsx scripts/rm-test-orders.ts RB-REV01 RB-REV02        (dry run)
 *   npx tsx scripts/rm-test-orders.ts RB-REV01 --apply
 */
import { connect, disconnect } from '../src/config/db.js';
import { Kitchen, LedgerEntry, Notification, Order, Review } from '../src/models/index.js';
import { recomputeKitchen } from '../src/logic/reviews.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const codes = args.filter((a) => !a.startsWith('--'));

if (!codes.length) {
  console.error('give at least one order code');
  process.exit(1);
}

await connect();

const orders = await Order.find({ code: { $in: codes } }).lean();
const ids = orders.map((o) => String(o._id));
console.log('matched:', orders.map((o) => `${o.code}/${o.status}`).join(', ') || '(none)');

if (!orders.length) {
  await disconnect();
  process.exit(0);
}

const rows = await LedgerEntry.find({ orderId: { $in: ids } }).lean();
const net = new Map<string, number>();
for (const r of rows) {
  net.set(r.from, (net.get(r.from) ?? 0) - r.amount);
  net.set(r.to, (net.get(r.to) ?? 0) + r.amount);
}
console.log('ledger rows:', rows.length, '| net:', JSON.stringify(Object.fromEntries(net)));

const unbalanced = [...net.entries()].filter(([, v]) => v !== 0);
if (unbalanced.length) {
  console.log('REFUSING — reverse these first:', unbalanced);
  await disconnect();
  process.exit(1);
}

const reviews = await Review.find({ orderId: { $in: ids } }).lean();
const kitchens = [...new Set(reviews.map((r) => String(r.kitchenId)))];
console.log('reviews:', reviews.length, '| kitchens to recompute:', kitchens.length);

if (!apply) {
  console.log('\ndry run — nothing deleted. Pass --apply.');
  await disconnect();
  process.exit(0);
}

const rv = await Review.deleteMany({ orderId: { $in: ids } });
const nt = await Notification.deleteMany({ orderId: { $in: ids } });
const od = await Order.deleteMany({ code: { $in: codes } });
console.log('deleted — reviews:', rv.deletedCount, 'notifications:', nt.deletedCount, 'orders:', od.deletedCount);

for (const id of kitchens) {
  await recomputeKitchen(id);
  const k = await Kitchen.findById(id).select({ name: 1, rating: 1, reviewCount: 1 }).lean();
  console.log(`recomputed ${k?.name}: rating ${k?.rating} over ${k?.reviewCount} review(s)`);
}

console.log('left behind:', await Order.countDocuments({ code: { $in: codes } }), 'orders');
await disconnect();
