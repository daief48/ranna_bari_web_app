/**
 * Remove one customer's orders of chosen kinds, and what hangs off them.
 *
 * The account stays. What goes: the orders themselves, the meal bookings, the
 * reviews written on them (and the kitchens' ratings are recomputed), the
 * promotions they redeemed, and every notification that points at them — the
 * customer's and the cook's.
 *
 * Money is the part that needs care. The ledger is append-only, so deleting an
 * order that still has money held would leave that money stranded in escrow
 * with nothing to release it. Held money is therefore *refunded first*, as a
 * new ledger entry (held → customer, the same one a cancellation posts), and
 * only then is the order removed. Orders already paid out to a cook are not
 * reversed — that money has moved, and rewriting it is not this script's call;
 * its ledger entries stay as history.
 *
 * Dry run by default.
 *
 *   npx tsx scripts/delete-user-orders.ts ahanaf@gmail.com --kinds=meal,cod,wallet
 *   npx tsx scripts/delete-user-orders.ts ahanaf@gmail.com --kinds=meal,cod,wallet --apply
 */
import { connect, disconnect, tx } from '../src/config/db.js';
import {
  Account,
  MealBooking,
  Notification,
  Order,
  Redemption,
  Review,
} from '../src/models/index.js';
import { refundEscrow } from '../src/logic/ledger.js';
import { recomputeKitchen } from '../src/logic/reviews.js';

const APPLY = process.argv.includes('--apply');
const WHO = process.argv.slice(2).find((a) => !a.startsWith('--'));
const KINDS = (process.argv.find((a) => a.startsWith('--kinds='))?.split('=')[1] ?? '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

if (!WHO || !KINDS.length) {
  console.error('usage: delete-user-orders.ts <email|phone> --kinds=meal,cod,wallet [--apply]');
  process.exit(1);
}

await connect();

const account: any = await Account.findOne({
  $or: [{ email: new RegExp(`^${WHO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, { phone: WHO }, { customerKey: WHO.toLowerCase() }],
}).lean();
if (!account) {
  console.log(`No account for ${WHO}.`);
  await disconnect();
  process.exit(0);
}
const keys = [account.customerKey, account.email, account.phone].filter(Boolean) as string[];
console.log(`\n${account.name} · ${account.email ?? account.phone}${APPLY ? '' : '   (dry run: pass --apply)'}`);
console.log(`kinds: ${KINDS.join(', ')}\n`);

const orders: any[] = await Order.find({ customerKey: { $in: keys }, kind: { $in: KINDS } }).lean();
const ids = orders.map((o) => String(o._id));
const held = orders.filter((o) => o.payment === 'held');
const paidOut = orders.filter((o) => o.payment === 'released' || o.payment === 'cod');

const sum = (list: any[]) => list.reduce((s, o) => s + (o.amount ?? 0), 0);
console.log(`orders to remove: ${orders.length}`);
for (const k of KINDS) console.log(`   ${k}: ${orders.filter((o) => o.kind === k).length}`);
console.log(`held money to refund to the wallet: ${held.length} orders, ৳${sum(held)}`);
console.log(`already paid out / cash (kept as history): ${paidOut.length} orders, ৳${sum(paidOut)}`);
console.log(`meal bookings: ${await MealBooking.countDocuments({ customerKey: { $in: keys } })}`);
console.log(`reviews on these orders: ${await Review.countDocuments({ orderId: { $in: ids } })}`);
console.log(`notifications about them: ${await Notification.countDocuments({ orderId: { $in: ids } })}`);
console.log(`promotions redeemed on them: ${await Redemption.countDocuments({ orderId: { $in: ids } })}`);

if (!APPLY) {
  console.log('\nNothing changed.');
  await disconnect();
  process.exit(0);
}

/* 1 · give the held money back, one transaction per order so a failure on one
   cannot leave another half-refunded. */
let refunded = 0;
for (const o of held) {
  const out = await tx((session) =>
    refundEscrow(session, String(o._id), { note: `Order ${o.code} removed — hold returned` }),
  );
  if (out.ok) refunded += out.result.refunded;
  else console.log(`   · ${o.code}: refund skipped (${out.error})`);
}
console.log(`\nrefunded ৳${refunded} to the wallet`);

/* 2 · the reviews, and the ratings they fed. */
const reviews: any[] = await Review.find({ orderId: { $in: ids } }).select({ kitchenId: 1 }).lean();
const kitchens = [...new Set(reviews.map((r) => String(r.kitchenId)))];
const rv = await Review.deleteMany({ orderId: { $in: ids } });
for (const k of kitchens) await recomputeKitchen(k);

/* 3 · everything else that points at the orders, then the orders. */
const nt = await Notification.deleteMany({ orderId: { $in: ids } });
const rd = await Redemption.deleteMany({ orderId: { $in: ids } });
const bk = await MealBooking.deleteMany({ customerKey: { $in: keys } });
const od = await Order.deleteMany({ _id: { $in: ids } });

console.log(
  `deleted: ${od.deletedCount} orders, ${bk.deletedCount} bookings, ${rv.deletedCount} reviews ` +
    `(${kitchens.length} kitchen ratings recomputed), ${nt.deletedCount} notifications, ${rd.deletedCount} redemptions`,
);
await disconnect();
