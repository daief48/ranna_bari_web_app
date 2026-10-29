/**
 * Remove the cook accounts behind named kitchens, and everything that hangs
 * off them — kitchen, shops + products, dishes, meal data, orders, chat,
 * notifications, and the same accounts' customer-side rows. Dry run by
 * default; pass --yes to actually delete.
 *
 *   tsx scripts/delete-kitchens-by-name.ts "Katina Sweet Kitchen" "Lily Sweet Kitchen"
 *   tsx scripts/delete-kitchens-by-name.ts --yes "Katina Sweet Kitchen" ...
 *
 * LedgerEntry is append-only by design, so it is counted and reported but
 * never deleted — money history outlives the account that earned it.
 */
import { connect, disconnect } from '../src/config/db.js';
import {
  Account,
  AppSession,
  Cart,
  ChatMessage,
  ChatThread,
  Dish,
  EmailOtpChallenge,
  Kitchen,
  KitchenDocument,
  LedgerEntry,
  MealBooking,
  MealCategory,
  MealDish,
  MealPlan,
  MealService,
  Notification,
  Offer,
  Order,
  OtpChallenge,
  PayoutItem,
  Product,
  Redemption,
  Request,
  Review,
  Store,
  TopUp,
} from '../src/models/index.js';

const APPLY = process.argv.includes('--yes');
const NAMES = process.argv.slice(2).filter((a) => !a.startsWith('--'));

if (!NAMES.length) {
  console.error('Give at least one kitchen name.');
  process.exit(1);
}

type Target = {
  countDocuments: (q: object) => Promise<number>;
  deleteMany: (q: object) => Promise<{ deletedCount?: number }>;
};
const NONE = { _id: null };

await connect();

const kitchens = await Kitchen.find({
  name: { $in: NAMES.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
}).lean();

if (!kitchens.length) {
  console.log('No kitchens matched those names. Nothing to do.');
  await disconnect();
  process.exit(0);
}

let grandTotal = 0;

for (const kitchen of kitchens) {
  const kitchenId = String(kitchen._id);
  const accountId = kitchen.accountId ? String(kitchen.accountId) : null;
  const account = accountId ? await Account.findById(accountId).lean() : null;
  const key = account?.customerKey ?? null;

  const stores = await Store.find({ kitchenId }).select({ _id: 1 }).lean();
  const storeIds = stores.map((s) => String(s._id));
  const threads = await ChatThread.find({
    $or: [{ kitchenId }, ...(key ? [{ customerKey: key }] : [])],
  }).select({ _id: 1 }).lean();
  const threadIds = threads.map((t) => String(t._id));

  const byKitchen = { kitchenId };
  const byKey = key ? { customerKey: key } : NONE;
  const plan: { label: string; model: Target; query: object }[] = [
    { label: 'kitchen documents', model: KitchenDocument, query: byKitchen },
    { label: 'dishes', model: Dish, query: byKitchen },
    { label: 'products', model: Product, query: storeIds.length ? { storeId: { $in: storeIds } } : NONE },
    { label: 'shops', model: Store, query: byKitchen },
    { label: 'orders (as cook)', model: Order, query: byKitchen },
    { label: 'orders (as customer)', model: Order, query: byKey },
    { label: 'reviews', model: Review, query: byKitchen },
    { label: 'meal plans', model: MealPlan, query: byKitchen },
    { label: 'meal services', model: MealService, query: byKitchen },
    { label: 'meal categories', model: MealCategory, query: byKitchen },
    { label: 'meal dishes', model: MealDish, query: byKitchen },
    { label: 'meal bookings (as cook)', model: MealBooking, query: byKitchen },
    { label: 'meal bookings (as customer)', model: MealBooking, query: byKey },
    { label: 'offers', model: Offer, query: byKitchen },
    { label: 'payout items', model: PayoutItem, query: byKitchen },
    { label: 'requests', model: Request, query: byKey },
    { label: 'carts', model: Cart, query: byKey },
    { label: 'top-ups', model: TopUp, query: byKey },
    { label: 'redemptions', model: Redemption, query: byKey },
    { label: 'sessions', model: AppSession, query: accountId ? { accountId } : NONE },
    { label: 'phone OTP challenges', model: OtpChallenge, query: { phone: account?.phone ?? ' none' } },
    { label: 'email OTP challenges', model: EmailOtpChallenge, query: { email: account?.email ?? ' none' } },
    {
      label: 'notifications',
      model: Notification,
      query: { $or: [{ kitchenId }, ...(key ? [{ customerKey: key }] : [])] },
    },
    { label: 'chat messages', model: ChatMessage, query: threadIds.length ? { threadId: { $in: threadIds } } : NONE },
    { label: 'chat threads', model: ChatThread, query: threadIds.length ? { _id: { $in: threadIds } } : NONE },
    { label: 'kitchen', model: Kitchen, query: { _id: kitchenId } },
    { label: 'account', model: Account, query: accountId ? { _id: accountId } : NONE },
  ];

  console.log(`\n=== ${kitchen.name} · owner ${account?.name ?? '?'} · ${account?.email ?? account?.phone ?? '—'} ===`);
  console.log(`    kitchen ${kitchenId} · account ${accountId ?? 'none'} · ${storeIds.length} shop(s)`);

  let subtotal = 0;
  for (const { label, model, query } of plan) {
    const n = await model.countDocuments(query);
    if (n) console.log(`    ${label}: ${n}`);
    subtotal += n;
  }

  const refs = [kitchenId, ...(accountId ? [accountId] : []), ...(key ? [key] : [])];
  const ledger = await LedgerEntry.countDocuments({ $or: [{ fromRef: { $in: refs } }, { toRef: { $in: refs } }] });
  if (ledger) console.log(`    ledger entries: ${ledger} (append-only — kept)`);

  console.log(`    subtotal: ${subtotal} document(s) ${APPLY ? 'deleted' : 'would be deleted'}`);
  grandTotal += subtotal;

  if (!APPLY) continue;
  for (const { label, model, query } of plan) {
    const out = await model.deleteMany(query);
    if (out.deletedCount) console.log(`      deleted ${label}: ${out.deletedCount}`);
  }
}

console.log(`\n${APPLY ? 'Deleted' : 'Would delete'} ${grandTotal} document(s) across ${kitchens.length} kitchen(s).`);
await disconnect();
