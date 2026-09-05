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
 *   npx tsx scripts/delete-account.ts a@x.com b@y.com c@z.com --cook --apply
 *   npx tsx scripts/delete-account.ts --all --cook
 *   npx tsx scripts/delete-account.ts --all --cook --apply --yes-delete-every-account
 *
 * As many addresses as you like, and a phone or a customerKey works in place
 * of any of them. `--all` means every account instead, and carries a second
 * flag of its own — a typo on one address costs one person, and a typo on
 * that one costs the marketplace.
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
/**
 * Every account on the platform, rather than the ones named.
 *
 * Kept behind its own flag *and* a second confirmation, because it is the one
 * mode where a typo cannot be walked back: `--apply` on a wrong email loses
 * one person, `--all --apply` loses the marketplace.
 */
const everyone = args.includes('--all');
const confirmed = args.includes('--yes-delete-every-account');
const targets = args.filter((a) => !a.startsWith('--'));

const USAGE = `usage:
  tsx scripts/delete-account.ts <email|phone|customerKey> [...] [--cook] [--apply]
  tsx scripts/delete-account.ts --all [--cook] [--apply --yes-delete-every-account]

  --cook   also remove the kitchen, shop, menu and meals of a cook
  --apply  actually delete (without it, every run is a dry run)
  --all    target every account instead of the ones named

Operator logins (AdminUser) are never touched — deleting those locks you out
of the admin panel, and they are not app accounts.`;

if (!everyone && targets.length === 0) {
  console.error(USAGE);
  process.exit(1);
}

if (everyone && targets.length) {
  console.error('--all takes no emails: it already means every account.\n');
  console.error(USAGE);
  process.exit(1);
}

if (everyone && apply && !confirmed) {
  console.error(
    'Refusing to wipe every account without --yes-delete-every-account.\n' +
      'Run it without --apply first and read the counts.',
  );
  process.exit(1);
}

/* Case-insensitive exact match on a literal, without letting a '.' in an
   address behave as a wildcard. */
const exact = (value: string) =>
  new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

async function main() {
  await connect();

  const accounts = await Account.find(
    everyone
      ? {}
      : {
          $or: targets.flatMap((t) => [
            { email: exact(t) },
            { customerKey: exact(t) },
            { phone: exact(t) },
          ]),
        },
  ).lean();

  if (accounts.length === 0) {
    console.log(everyone ? 'There are no accounts.' : `No account matches ${targets.join(', ')}.`);
    return;
  }

  console.log(`\nMatched ${accounts.length} account(s):`);
  /* A whole-platform run would print a thousand lines nobody reads, so it
     prints a shape instead — and enough of a sample to catch "wrong
     database" before the counts scroll past. */
  if (everyone) {
    const byRole = accounts.reduce<Record<string, number>>((seen, a) => {
      const role = String(a.role ?? 'user');
      seen[role] = (seen[role] ?? 0) + 1;
      return seen;
    }, {});
    console.log(`  ${Object.entries(byRole).map(([r, n]) => `${n} ${r}`).join(', ')}`);
    for (const a of accounts.slice(0, 5)) {
      console.log(`  e.g. ${a.customerKey}  ${a.role}  ${a.email ?? ''}`);
    }
    if (accounts.length > 5) console.log(`  …and ${accounts.length - 5} more`);
  } else {
    for (const a of accounts) {
      console.log(
        `  _id=${String(a._id)}  key=${a.customerKey}  role=${a.role}  ` +
          `name=${JSON.stringify(a.name)}  phone=${a.phone}  email=${a.email}`,
      );
    }
  }

  const ids = accounts.map((a) => String(a._id));
  const keys = [...new Set(accounts.map((a) => a.customerKey))];
  const phones = [...new Set(accounts.map((a) => a.phone).filter(Boolean))] as string[];

  const kitchens = await Kitchen.find({ accountId: { $in: ids } }).lean();
  const kitchenIds = kitchens.map((k) => String(k._id));
  if (kitchens.length) {
    const names = kitchens.slice(0, 6).map((k) => k.name).join(', ');
    console.log(
      `\nOwns ${kitchens.length} kitchen(s): ${names}` +
        (kitchens.length > 6 ? `, …and ${kitchens.length - 6} more` : ''),
    );
    if (!withCook) {
      console.log('  (cook-side data left alone — pass --cook to include it)');
      /* On a whole-platform wipe that leaves every kitchen behind with its
         owner gone, which is a worse state than either keeping or clearing
         them: they still list, and nobody can answer an order. */
      if (everyone) console.log('  WARNING: --all without --cook orphans every one of them.');
    }
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
    console.log(`\nOrders: ${orders.length}`);
    if (stuck.length) {
      /* Listed, but not all of them. A hundred codes on one line is a wall
         nobody reads, and the number is the part that should stop you. */
      const shown = stuck.slice(0, 12).map((o) => o.code).join(', ');
      console.log(
        `  ${stuck.length} still holding escrow: ${shown}` +
          (stuck.length > 12 ? `, …and ${stuck.length - 12} more` : ''),
      );
      console.log(
        '  Deleting these does not release the money — the ledger entry stays and the hold' +
          '\n  becomes unattributable. Settle or refund them first if they are real.',
      );
    }
  }

  console.log(
    '\nKept: ledgerEntries and auditLogs (append-only — enforced by the Atlas role, not just here)' +
      ', and adminUsers (your panel logins).',
  );
  if (!apply) {
    console.log(
      everyone
        ? 'Dry run. Re-run with --apply --yes-delete-every-account to delete.'
        : 'Dry run. Re-run with --apply to delete.',
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
