/**
 * Empty an account of everything it has made, and keep the account.
 *
 * For a cook: the kitchen, its documents, dishes, shops and products, meal
 * plans/services/dishes, offers, reviews and every order the kitchen took. For
 * a customer: orders, meal bookings, requests, cart, top-ups, redemptions,
 * reviews they wrote, chat. For both: notifications and disputes on those
 * orders. The Account row itself, its sessions, profile and saved addresses
 * stay, so the person can sign in and start again.
 *
 * Money is the part that needs care. LedgerEntry is append-only, so an order
 * deleted while its money is still held would strand that money in escrow with
 * nothing left to release it. Held money is therefore *refunded first* as a
 * new ledger entry (held → customer), and only then is the order removed.
 * Money that was already paid out stays where it is, and the ledger — the
 * history of every taka that moved — is counted but never touched, which means
 * a wallet balance survives this: it is the ledger's sum, not a field.
 *
 * Dry run by default; --yes applies.
 *
 *   npx tsx scripts/reset-account-data.ts "Lily Sweet Kitchen" 1924529986
 *   npx tsx scripts/reset-account-data.ts --yes "Lily Sweet Kitchen" 1924529986
 *
 * An argument is a kitchen name, a phone number (matched as a tail, so +880…
 * and 0… find the same row) or an email.
 */
import { connect, disconnect, tx } from '../src/config/db.js';
import {
  Account,
  Cart,
  ChatMessage,
  ChatThread,
  Dish,
  Dispute,
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
  PayoutItem,
  Product,
  Redemption,
  Request,
  Review,
  Store,
  TopUp,
} from '../src/models/index.js';
import { refundEscrow } from '../src/logic/ledger.js';
import { recomputeKitchen } from '../src/logic/reviews.js';

const APPLY = process.argv.includes('--yes');
const WHO = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!WHO.length) {
  console.error('Give a kitchen name, phone number or email.');
  process.exit(1);
}

type Target = {
  countDocuments: (q: object) => Promise<number>;
  deleteMany: (q: object) => Promise<{ deletedCount?: number }>;
};
const NONE = { _id: null };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

await connect();

/* Resolve every argument to an account, once each. */
const accounts = new Map<string, any>();
for (const w of WHO) {
  const found: any[] = [];
  const kitchens: any[] = await Kitchen.find({ name: new RegExp(`^${esc(w)}$`, 'i') }).lean();
  for (const k of kitchens) {
    const a = k.accountId ? await Account.findById(k.accountId).lean() : null;
    if (a) found.push(a);
  }
  if (!found.length) {
    const byContact: any[] = await Account.find({
      $or: [
        { email: new RegExp(`^${esc(w)}$`, 'i') },
        { phone: new RegExp(`${esc(w.replace(/^\+?880/, '').replace(/^0/, ''))}$`) },
        { customerKey: new RegExp(`${esc(w.replace(/^\+?880/, '').replace(/^0/, ''))}$`) },
      ],
    }).lean();
    found.push(...byContact);
  }
  if (!found.length) console.log(`No account for "${w}".`);
  for (const a of found) accounts.set(String(a._id), a);
}

let grand = 0;

for (const account of accounts.values()) {
  const accountId = String(account._id);
  const keys = [account.customerKey, account.email, account.phone].filter(Boolean) as string[];
  const kitchens: any[] = await Kitchen.find({ accountId }).select({ _id: 1, name: 1 }).lean();
  const kitchenIds = kitchens.map((k) => String(k._id));
  const stores: any[] = kitchenIds.length ? await Store.find({ kitchenId: { $in: kitchenIds } }).select({ _id: 1 }).lean() : [];
  const storeIds = stores.map((s) => String(s._id));

  const byKitchen = kitchenIds.length ? { kitchenId: { $in: kitchenIds } } : NONE;
  const byKey = { customerKey: { $in: keys } };

  const orders: any[] = await Order.find({ $or: [byKey, ...(kitchenIds.length ? [byKitchen] : [])] }).lean();
  const orderIds = orders.map((o) => String(o._id));
  const held = orders.filter((o) => o.payment === 'held');
  const heldSum = held.reduce((s, o) => s + (o.amount ?? 0), 0);
  const byOrder = orderIds.length ? { orderId: { $in: orderIds } } : NONE;

  const threads: any[] = await ChatThread.find({
    $or: [byKey, ...(kitchenIds.length ? [byKitchen] : [])],
  }).select({ _id: 1 }).lean();
  const threadIds = threads.map((t) => String(t._id));

  const plan: { label: string; model: Target; query: object }[] = [
    { label: 'disputes on these orders', model: Dispute, query: byOrder },
    { label: 'reviews (on the kitchen, or written by the customer)', model: Review, query: { $or: [byKey, ...(kitchenIds.length ? [byKitchen] : [])] } },
    { label: 'notifications', model: Notification, query: { $or: [byKey, byOrder, ...(kitchenIds.length ? [byKitchen] : [])] } },
    { label: 'redemptions', model: Redemption, query: { $or: [byKey, byOrder] } },
    { label: 'meal bookings', model: MealBooking, query: { $or: [byKey, ...(kitchenIds.length ? [byKitchen] : [])] } },
    { label: 'orders', model: Order, query: { _id: { $in: orderIds } } },
    { label: 'requests', model: Request, query: byKey },
    { label: 'offers', model: Offer, query: byKitchen },
    { label: 'carts', model: Cart, query: byKey },
    { label: 'top-ups', model: TopUp, query: byKey },
    { label: 'payout items', model: PayoutItem, query: byKitchen },
    { label: 'chat messages', model: ChatMessage, query: threadIds.length ? { threadId: { $in: threadIds } } : NONE },
    { label: 'chat threads', model: ChatThread, query: threadIds.length ? { _id: { $in: threadIds } } : NONE },
    { label: 'products', model: Product, query: storeIds.length ? { storeId: { $in: storeIds } } : NONE },
    { label: 'shops', model: Store, query: byKitchen },
    { label: 'dishes', model: Dish, query: byKitchen },
    { label: 'meal plans', model: MealPlan, query: byKitchen },
    { label: 'meal services', model: MealService, query: byKitchen },
    { label: 'meal categories', model: MealCategory, query: byKitchen },
    { label: 'meal dishes', model: MealDish, query: byKitchen },
    { label: 'kitchen documents', model: KitchenDocument, query: byKitchen },
    { label: 'kitchen', model: Kitchen, query: kitchenIds.length ? { _id: { $in: kitchenIds } } : NONE },
  ];

  console.log(`\n=== ${account.name} · ${account.email ?? account.phone} · ${account.role} · account ${accountId} (kept) ===`);
  console.log(`    kitchens: ${kitchens.map((k) => k.name).join(', ') || 'none'} · ${storeIds.length} shop(s)`);
  console.log(`    orders: ${orders.length} — held money to refund first: ${held.length} order(s), ৳${heldSum}`);

  let subtotal = 0;
  for (const { label, model, query } of plan) {
    const n = await model.countDocuments(query);
    if (n) console.log(`    ${label}: ${n}`);
    subtotal += n;
  }
  const refs = [accountId, ...kitchenIds, ...keys];
  const ledger = await LedgerEntry.countDocuments({ $or: [{ fromRef: { $in: refs } }, { toRef: { $in: refs } }] });
  if (ledger) console.log(`    ledger entries: ${ledger} (append-only — kept)`);
  console.log(`    subtotal: ${subtotal} document(s) ${APPLY ? 'deleted' : 'would be deleted'}`);
  grand += subtotal;

  if (!APPLY) continue;

  /* 1 · give held money back, one transaction per order. A refusal is
     reported and the order is left in place: deleting it would strand money. */
  const stuck = new Set<string>();
  let refunded = 0;
  for (const o of held) {
    const out = await tx((session) =>
      refundEscrow(session, String(o._id), { note: `Order ${o.code} removed — hold returned` }),
    );
    if (out.ok) refunded += out.result.refunded;
    else {
      stuck.add(String(o._id));
      console.log(`      · ${o.code}: refund refused (${out.error}) — order kept`);
    }
  }
  if (held.length) console.log(`      refunded ৳${refunded} of ৳${heldSum} held`);

  /* 2 · ratings of other kitchens this customer reviewed. */
  const writtenOn: any[] = await Review.find({ ...byKey, kitchenId: { $nin: kitchenIds } }).select({ kitchenId: 1 }).lean();
  const otherKitchens = [...new Set(writtenOn.map((r) => String(r.kitchenId)))];

  for (const { label, model, query } of plan) {
    const q = label === 'orders' && stuck.size ? { _id: { $in: orderIds.filter((id) => !stuck.has(id)) } } : query;
    const out = await model.deleteMany(q);
    if (out.deletedCount) console.log(`      deleted ${label}: ${out.deletedCount}`);
  }
  for (const k of otherKitchens) await recomputeKitchen(k);
}

console.log(`\n${APPLY ? 'Deleted' : 'Would delete'} ${grand} document(s). Accounts, sessions, profiles and the ledger were not touched.${APPLY ? '' : '  (dry run: pass --yes)'}`);
await disconnect();
