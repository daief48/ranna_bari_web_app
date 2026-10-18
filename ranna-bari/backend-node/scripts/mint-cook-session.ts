/**
 * Mint an app session for the cook of the busiest kitchen in the throwaway
 * dev-local database.
 *
 * The verification harness path: `npm run dev:local` prints its in-memory
 * URI; pass it here and this writes a real AppSession row through the
 * backend's own `issueSession`, so the token verifies exactly like a
 * sign-in. Nothing is forged — the database is just disposable.
 *
 *     npx tsx scripts/mint-cook-session.ts "mongodb://127.0.0.1:53741/?replicaSet=testset" > session.json
 */
import { connect } from '../src/config/db.js';
import { resetEnv } from '../src/config/env.js';
import { Account, Kitchen, Order } from '../src/models/index.js';
import { issueSession } from '../src/auth/app-auth.js';

/* The same dev fallbacks dev-local.ts applies — same process env shape,
   same secret, so the token verifies against that running server. */
process.env.ADMIN_AUTH_SECRET ||= 'local-dev-admin-secret-not-a-real-credential';
process.env.APP_AUTH_SECRET ||= 'local-dev-app-secret-not-a-real-credential-x';
process.env.BACKEND_SERVICE_TOKEN ||= 'local-dev-service-token-not-a-real-credential';
process.env.SMS_PROVIDER = 'none';
resetEnv();

const uri = process.argv[2];
if (!uri) throw new Error('usage: tsx scripts/mint-cook-session.ts <mongodb uri>');
await connect(uri);

/* The kitchen with the most orders makes the most useful screen: every
   lane, filter and progress line has something to draw. */
const [top] = await Order.aggregate([{ $group: { _id: '$kitchenId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]);
if (!top) throw new Error('no orders in the database');

const kitchen = await Kitchen.findById(top._id).lean();
if (!kitchen?.accountId) throw new Error(`kitchen ${top._id} has no account`);

const account = await Account.findById(kitchen.accountId).lean();
if (!account) throw new Error('cook account missing');

const session = await issueSession(account, { name: 'verify-harness', platform: 'web' });

console.log(
  JSON.stringify({
    token: session.token,
    account: session.account,
    kitchenId: String(kitchen._id),
    kitchenName: kitchen.name,
    orders: top.n,
  }),
);
process.exit(0);
