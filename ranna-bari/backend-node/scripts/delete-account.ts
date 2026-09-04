/**
 * Delete an account and everything hanging off it.
 *
 * There is no such endpoint in the panel, and there should not be a one-off
 * `deleteMany` typed into a shell against production either — the links are
 * spread across eighteen collections and two of them refuse deletion outright.
 *
 * Runs as a **dry run by default**: it prints what it would remove and exits.
 * Pass `--apply` to actually remove it.
 *
 *   npx tsx scripts/delete-account.ts someone@example.com
 *   npx tsx scripts/delete-account.ts someone@example.com --apply
 *
 * What it will NOT delete, by design:
 *
 *   - `ledgerEntries` and `auditLogs`. Both are append-only, enforced by
 *     schema middleware *and* by an Atlas role that grants the application
 *     user find/insert only. Money that moved and operator actions that
 *     happened are not erasable; a reversing entry is the mechanism.
 *
 * Cook-side data (kitchen, dishes, meals, store, products, offers) is only
 * touched when `--cook` is passed, because deleting a kitchen takes its whole
 * menu and every customer's order history with it.
 */
import mongoose from 'mongoose';

import { connect, disconnect } from '../src/config/db.js';
import {
  Account,
  AppSession,
  Cart,
  ChatMessage,
  ChatThread,
  Dish,
  Dispute,
  Kitchen,
  Meal,
  MealInterest,
  Notification,
  Offer,
  Order,
  OtpChallenge,
  Product,
  Redemption,
  Request,
  Review,
  SearchTerm,
  Store,
  StoreCategory,
  TopUp,
} from '../src/models/index.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const withCook = args.includes('--cook');
const targets = args.filter((a) => !a.startsWith('--'));

if (targets.length === 0) {
  console.error('usage: tsx scripts/delete-account.ts <email|phone|customerKey> [...] [--apply] [--cook]');
  process.exit(1);
}

/* Case-insensitive exact match on a literal, without letting a '.' in an
   address behave as a wildcard. */
const exact = (value: string) =>
  new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

async function main() {
  await connect();

  const accounts = await Account.find({
    $or: targets.flatMap((t) => [
      { email: exact(t) },
      { customerKey: exact(t) },
      { phone: exact(t) },
    ]),
  }).lean();

  if (accounts.length === 0) {
    console.log(`No account matches ${targets.join(', ')}.`);
    return;
  }

  console.log(`\nMatched ${accounts.length} account(s):`);
  for (const a of accounts) {
    console.log(
      `  _id=${String(a._id)}  key=${a.customerKey}  role=${a.role}  ` +
        `name=${JSON.stringify(a.name)}  phone=${a.phone}  email=${a.email}`,
    );
  }

  const ids = accounts.map((a) => String(a._id));
  const keys = [...new Set(accounts.map((a) => a.customerKey))];
  const phones = [...new Set(accounts.map((a) => a.phone).filter(Boolean))] as string[];

  const kitchens = await Kitchen.find({ accountId: { $in: ids } }).lean();
  const kitchenIds = kitchens.map((k) => String(k._id));
  if (kitchens.length) {
    console.log(`\nOwns ${kitchens.length} kitchen(s): ${kitchens.map((k) => k.name).join(', ')}`);
    if (!withCook) console.log('  (cook-side data left alone — pass --cook to include it)');
  }

  /* Orders first: disputes and chat threads are addressed by order id. */
  const orderFilter: mongoose.FilterQuery<unknown> =
    withCook && kitchenIds.length
      ? { $or: [{ customerKey: { $in: keys } }, { kitchenId: { $in: kitchenIds } }] }
      : { customerKey: { $in: keys } };

  const orders = await Order.find(orderFilter, { _id: 1, code: 1, status: 1, payment: 1 }).lean();
  const orderIds = orders.map((o) => String(o._id));

  const threadFilter: mongoose.FilterQuery<unknown> =
    withCook && kitchenIds.length
      ? { $or: [{ customerKey: { $in: keys } }, { kitchenId: { $in: kitchenIds } }] }
      : { customerKey: { $in: keys } };
  const threads = await ChatThread.find(threadFilter, { _id: 1 }).lean();
  const threadIds = threads.map((t) => String(t._id));

  type Step = { label: string; run: (dry: boolean) => Promise<number> };

  const counted =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (label: string, model: any, filter: mongoose.FilterQuery<unknown>): Step => ({
      label,
      run: async (dry) =>
        dry
          ? model.countDocuments(filter)
          : (await model.deleteMany(filter)).deletedCount ?? 0,
    });

  const steps: Step[] = [
    counted('chatMessages', ChatMessage, { threadId: { $in: threadIds } }),
    counted('chatThreads', ChatThread, { _id: { $in: threadIds } }),
    counted('disputes', Dispute, { orderId: { $in: orderIds } }),
    counted('reviews', Review, { $or: [{ customerKey: { $in: keys } }, { orderId: { $in: orderIds } }] }),
    counted('orders', Order, { _id: { $in: orderIds } }),
    counted('redemptions', Redemption, { customerKey: { $in: keys } }),
    counted('requests', Request, { customerKey: { $in: keys } }),
    counted('mealInterests', MealInterest, { customerKey: { $in: keys } }),
    counted('carts', Cart, { customerKey: { $in: keys } }),
    counted('topUps', TopUp, { customerKey: { $in: keys } }),
    counted('notifications', Notification, { customerKey: { $in: keys } }),
    counted('searchTerms', SearchTerm, { customerKey: { $in: keys } }),
    counted('appSessions', AppSession, { accountId: { $in: ids } }),
    counted('otpChallenges', OtpChallenge, { phone: { $in: phones } }),
  ];

  if (withCook && kitchenIds.length) {
    const stores = await Store.find({ kitchenId: { $in: kitchenIds } }, { _id: 1 }).lean();
    const storeIds = stores.map((s) => String(s._id));
    steps.push(
      counted('products', Product, { storeId: { $in: storeIds } }),
      counted('storeCategories', StoreCategory, { storeId: { $in: storeIds } }),
      counted('stores', Store, { _id: { $in: storeIds } }),
      counted('offers', Offer, { kitchenId: { $in: kitchenIds } }),
      counted('meals', Meal, { kitchenId: { $in: kitchenIds } }),
      counted('dishes', Dish, { kitchenId: { $in: kitchenIds } }),
      counted('kitchenNotifications', Notification, { kitchenId: { $in: kitchenIds } }),
      counted('kitchens', Kitchen, { _id: { $in: kitchenIds } }),
    );
  }

  steps.push(counted('accounts', Account, { _id: { $in: ids } }));

  console.log(apply ? '\nDeleting:' : '\nWould delete (dry run):');
  let total = 0;
  for (const step of steps) {
    const n = await step.run(!apply);
    total += n;
    if (n > 0 || apply) console.log(`  ${step.label.padEnd(22)} ${n}`);
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${total}`);

  if (orders.length) {
    const stuck = orders.filter((o) => o.payment === 'held');
    console.log(
      `\nOrders: ${orders.length}` +
        (stuck.length ? `  — ${stuck.length} still holding escrow: ${stuck.map((o) => o.code).join(', ')}` : ''),
    );
  }

  console.log(
    '\nKept: ledgerEntries and auditLogs (append-only — enforced by the Atlas role, not just here).',
  );
  if (!apply) console.log('Dry run. Re-run with --apply to delete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
