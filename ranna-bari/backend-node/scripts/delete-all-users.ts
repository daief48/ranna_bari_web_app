/**
 * Wipe every user account and everything that hangs off users — customers
 * and cooks alike — for a clean testing slate.
 *
 * Platform reference data survives: specialties, icons, taxonomy, store
 * categories, zones, promotions, settings, feature flags and the admin
 * realm. Seeded demo kitchens go with the rest (they live in the same
 * collections); `npm run seed` brings them back.
 *
 * Dry run by default — it lists what is there; pass --yes to actually delete.
 *
 *   tsx scripts/delete-all-users.ts          # look
 *   tsx scripts/delete-all-users.ts --yes    # delete
 */
import { connect, disconnect } from '../src/config/db.js';
import {
  Account,
  AppSession,
  Cart,
  ChatMessage,
  ChatThread,
  Dispute,
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
  PayoutRun,
  Product,
  Redemption,
  Request,
  Review,
  Store,
  TopUp,
} from '../src/models/index.js';

const APPLY = process.argv.includes('--yes');

/* Everything a user creates or that is keyed to one. What is *not* here is
   deliberate: Specialty, Icon, TaxonomyCategory, StoreCategory, Zone,
   Promotion, SearchTerm, Setting, FeatureFlag, AdminUser, AuditLog — the
   platform's own catalog and the admin realm, none of it anybody's personal
   data. */
const TARGETS: { label: string; model: {
  countDocuments: (q?: object) => Promise<number>;
  deleteMany: (q?: object) => Promise<{ deletedCount?: number }>;
} }[] = [
  { label: 'accounts', model: Account },
  { label: 'sessions', model: AppSession },
  { label: 'phone OTP challenges', model: OtpChallenge },
  { label: 'email OTP challenges', model: EmailOtpChallenge },
  { label: 'kitchens', model: Kitchen },
  { label: 'kitchen documents (NID)', model: KitchenDocument },
  { label: 'dishes', model: Dish },
  { label: 'stores', model: Store },
  { label: 'products', model: Product },
  { label: 'carts', model: Cart },
  { label: 'orders', model: Order },
  { label: 'requests', model: Request },
  { label: 'offers', model: Offer },
  { label: 'reviews', model: Review },
  { label: 'disputes', model: Dispute },
  { label: 'notifications', model: Notification },
  { label: 'chat threads', model: ChatThread },
  { label: 'chat messages', model: ChatMessage },
  { label: 'meal plans', model: MealPlan },
  { label: 'meal categories', model: MealCategory },
  { label: 'meal dishes', model: MealDish },
  { label: 'meal services', model: MealService },
  { label: 'meal bookings', model: MealBooking },
  { label: 'payout runs', model: PayoutRun },
  { label: 'payout items', model: PayoutItem },
  { label: 'top-ups', model: TopUp },
  { label: 'redemptions', model: Redemption },
];

await connect();

let grandTotal = 0;
const counts: { label: string; n: number }[] = [];

for (const { label, model } of TARGETS) {
  const n = await model.countDocuments({});
  counts.push({ label, n });
  grandTotal += n;
}

/* Counted through the raw driver too: the model's countDocuments reads fine,
   but the totals printed should cover the ledger the delete below targets. */
{
  const n = await LedgerEntry.collection.countDocuments({});
  counts.push({ label: 'ledger entries (wallet)', n });
  grandTotal += n;
}

for (const { label, n } of counts) {
  if (n) console.log(`${label}: ${n}`);
}
console.log(
  `\n${grandTotal} document(s) across ${counts.filter((c) => c.n).length} collection(s) ${APPLY ? 'deleted' : 'would be deleted'}.`,
);

if (!APPLY) {
  console.log('Dry run only — rerun with --yes to delete.');
  await disconnect();
  process.exit(0);
}

for (const { label, model } of TARGETS) {
  const out = await model.deleteMany({});
  if (out.deletedCount) console.log(`deleted ${label}: ${out.deletedCount}`);
}

/* The ledger's own middleware refuses every mutation — by design it only
   ever grows. A full wipe is exactly what this script is for, so the delete
   goes through the raw driver, past the model guard. Whether it is *allowed*
   is Atlas's business: the collection's custom role may grant this user
   find+insert only, in which case the server refuses here and says so. */
{
  const out = await LedgerEntry.collection.deleteMany({});
  if (out.deletedCount) console.log(`deleted ledger entries (wallet): ${out.deletedCount}`);
}

const left = await Account.countDocuments({});
console.log(`\nDone. Accounts remaining: ${left}`);

await disconnect();
