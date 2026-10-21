// Verify Lily's seeded data through the actual API the app uses.
// Boots the app on in-memory Mongo? No — must hit Atlas: use the live server
// if running, else call handlers directly? Simplest: sign in against
// production Netlify? No — verify via direct DB reads + app-level logic.
import { connect, disconnect } from '../src/config/db.js';
import { Account, Kitchen, Order, Review, MealService, Store, Product, Dish } from '../src/models/index.js';
import { balanceFor } from '../src/logic/ledger.js';

await connect();

const account = await Account.findOne({ customerKey: 'lily@rannabari.test' }).lean();
if (!account) {
  console.log('NO ACCOUNT');
  process.exit(1);
}
const kitchen = await Kitchen.findOne({ accountId: String(account._id) }).lean();
if (!kitchen) {
  console.log('NO KITCHEN');
  process.exit(1);
}
const kitchenId = String(kitchen._id);

const orders = await Order.find({ kitchenId }).lean();
const byDay = new Map();
const byKind = new Map();
const byStatus = new Map();
let weekRevenue = 0;
let todayPlates = 0;
for (const o of orders) {
  const day = new Date(o.createdAt).toISOString().slice(0, 10);
  byDay.set(day, (byDay.get(day) ?? 0) + 1);
  byKind.set(o.kind, (byKind.get(o.kind) ?? 0) + 1);
  byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  if (['delivered', 'completed'].includes(o.status) && !['cancelled', 'rejected'].includes(o.status)) {
    const age = Date.now() - new Date(o.createdAt).getTime();
    if (age < 7 * 86_400_000) {
      weekRevenue += (o.cookAmount ?? Math.round(o.amount * 0.85));
    }
  }
  if (o.kind === 'meal' && o.status === 'confirmed' && o.serveDate === new Date().toISOString().slice(0, 10)) {
    todayPlates += 1;
  }
}

const cookOwed = await balanceFor('cook', kitchenId);
const heldAgainst = await balanceFor('held', kitchenId);
const [reviewAgg] = await Review.aggregate([
  { $match: { kitchenId } },
  { $group: { _id: null, n: { $sum: 1 }, avg: { $avg: '$rating' } } },
]);
const store = await Store.findOne({ kitchenId }).lean();
const productCount = store ? await Product.countDocuments({ storeId: String(store._id) }) : 0;
const dishCount = await Dish.countDocuments({ kitchenId });
const service = await MealService.findOne({ kitchenId }).lean();

console.log('kitchen:', kitchen.name, '| open:', kitchen.isOpen, '| kyc:', kitchen.kycStatus);
console.log('payout:', kitchen.payoutMethod, kitchen.payoutAccount);
console.log('dishes:', dishCount, '| store:', store?.name, '| products:', productCount);
console.log('meal service active:', service?.active, '| rate:', service?.rate);
console.log('orders total:', orders.length);
console.log('by kind:', JSON.stringify([...byKind]));
console.log('by status:', JSON.stringify([...byStatus]));
console.log('orders/day:', JSON.stringify([...byDay].sort()));
console.log('week revenue (cook share):', weekRevenue);
console.log('today plates (confirmed):', todayPlates);
console.log('ledger: cook owed =', cookOwed, '| held against kitchen =', heldAgainst);
console.log('reviews:', reviewAgg?.n, 'avg', Math.round((reviewAgg?.avg ?? 0) * 10) / 10, '| kitchen rating:', kitchen.rating, 'count:', kitchen.reviewCount);

await disconnect();
