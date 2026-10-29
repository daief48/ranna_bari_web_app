/**
 * Remove customers by phone number, and every customer-side row keyed to them
 * — account, sessions, OTPs, orders, meal bookings, requests, cart, top-ups,
 * redemptions, notifications, chat. Dry run by default; --yes deletes.
 *
 *   tsx scripts/delete-customers-by-phone.ts 1755500111 1934539934 1922529983
 *   tsx scripts/delete-customers-by-phone.ts --yes 1755500111 ...
 *
 * Numbers match as a tail so +880…/0… forms find the same row. A customer who
 * also owns a kitchen is skipped and reported — use delete-kitchens-by-name.
 * LedgerEntry is append-only: counted, never deleted.
 */
import { connect, disconnect } from '../src/config/db.js';
import {
  Account,
  AppSession,
  Cart,
  ChatMessage,
  ChatThread,
  EmailOtpChallenge,
  Kitchen,
  LedgerEntry,
  MealBooking,
  Notification,
  Order,
  OtpChallenge,
  Redemption,
  Request,
  TopUp,
} from '../src/models/index.js';

const APPLY = process.argv.includes('--yes');
const NEEDLES = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!NEEDLES.length) {
  console.error('Give at least one phone number.');
  process.exit(1);
}

type Target = {
  countDocuments: (q: object) => Promise<number>;
  deleteMany: (q: object) => Promise<{ deletedCount?: number }>;
};
const NONE = { _id: null };

await connect();

const tails = NEEDLES.map((n) => new RegExp(`${n}$`));
const accounts = await Account.find({ $or: [{ phone: { $in: tails } }, { customerKey: { $in: tails } }] }).lean();
const strayKeys = await Order.distinct('customerKey', { customerKey: { $in: tails } });

console.log(`Matched ${accounts.length} account(s); ${strayKeys.length} order key(s).`);

const people = [
  ...accounts.map((a) => ({
    name: a.name as string,
    phone: a.phone as string | undefined,
    email: a.email as string | undefined,
    key: a.customerKey as string | undefined,
    accountId: String(a._id),
  })),
  ...strayKeys
    .filter((k: string) => !accounts.some((a) => a.customerKey === k))
    .map((k: string) => ({ name: '(no account)', phone: k, email: undefined, key: k, accountId: null as string | null })),
];

let grandTotal = 0;
for (const p of people) {
  const kitchen = p.accountId ? await Kitchen.findOne({ accountId: p.accountId }).lean() : null;
  console.log(`\n=== ${p.name} · ${p.phone ?? '—'} · ${p.email ?? '—'} ===`);
  if (kitchen) {
    console.log(`    owns kitchen "${kitchen.name}" — skipped (use delete-kitchens-by-name)`);
    continue;
  }
  const key = p.key ?? ' none';
  const threads = await ChatThread.find({ customerKey: key }).select({ _id: 1 }).lean();
  const threadIds = threads.map((t) => String(t._id));
  const byKey = { customerKey: key };
  const plan: { label: string; model: Target; query: object }[] = [
    { label: 'orders', model: Order, query: byKey },
    { label: 'meal bookings', model: MealBooking, query: byKey },
    { label: 'requests', model: Request, query: byKey },
    { label: 'carts', model: Cart, query: byKey },
    { label: 'top-ups', model: TopUp, query: byKey },
    { label: 'redemptions', model: Redemption, query: byKey },
    { label: 'notifications', model: Notification, query: byKey },
    { label: 'chat messages', model: ChatMessage, query: threadIds.length ? { threadId: { $in: threadIds } } : NONE },
    { label: 'chat threads', model: ChatThread, query: threadIds.length ? { _id: { $in: threadIds } } : NONE },
    { label: 'sessions', model: AppSession, query: p.accountId ? { accountId: p.accountId } : NONE },
    { label: 'phone OTP challenges', model: OtpChallenge, query: { phone: p.phone ?? ' none' } },
    { label: 'email OTP challenges', model: EmailOtpChallenge, query: { email: p.email ?? ' none' } },
    { label: 'account', model: Account, query: p.accountId ? { _id: p.accountId } : NONE },
  ];

  let subtotal = 0;
  for (const { label, model, query } of plan) {
    const n = await model.countDocuments(query);
    if (n) console.log(`    ${label}: ${n}`);
    subtotal += n;
  }
  const refs = [key, ...(p.accountId ? [p.accountId] : [])];
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

console.log(`\n${APPLY ? 'Deleted' : 'Would delete'} ${grandTotal} document(s) across ${people.length} customer(s).`);
await disconnect();
