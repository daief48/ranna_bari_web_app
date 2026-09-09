/**
 * Give every cook a password, because cook sign-in now needs one.
 *
 * Cooks sign in with an email and a password; the one-time code path is the
 * customer's. Every kitchen that existed before that change belongs to an
 * account with no password at all, which is not "not set up yet" — it is
 * locked out. This closes that gap once.
 *
 * Three rules it holds to:
 *
 *   - **One password per cook, generated here.** A shared one would mean
 *     anybody who learned it could open every kitchen on the platform.
 *   - **It never overwrites.** A cook who has already set their own keeps it;
 *     re-running this is safe and changes nothing for them.
 *   - **An email first.** The email is what they sign in with, so a cook
 *     without one is given a derived address rather than a credential that
 *     has no name to go by.
 *
 * The passwords are printed once, here, and are not recoverable afterwards —
 * only their hashes are stored. Hand them to the cooks and have them change
 * theirs; `POST /account/password` is what does that.
 *
 *     npx tsx scripts/set-cook-passwords.ts          # show what it would do
 *     npx tsx scripts/set-cook-passwords.ts --write  # actually write
 */
import { randomInt } from 'node:crypto';

import { connect, disconnect } from '../src/config/db.js';
import { loadEnv } from '../src/config/env.js';
import { Account, Kitchen } from '../src/models/index.js';
import { hashPassword } from '../src/auth/app-auth.js';

/* No l/1/O/0: these are read off a screen and typed on a phone keypad. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function password(): string {
  let out = '';
  for (let i = 0; i < 12; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

const write = process.argv.includes('--write');

await connect(loadEnv().MONGODB_URI);

const kitchens = await Kitchen.find({}).select({ accountId: 1, name: 1 }).lean();
const rows: { kitchen: string; email: string; password: string; note: string }[] = [];

let skipped = 0;

for (const kitchen of kitchens) {
  if (!kitchen.accountId) continue;

  const account = await Account.findById(String(kitchen.accountId)).select('+passwordHash');
  if (!account) continue;

  if (account.passwordHash) {
    skipped += 1;
    continue;
  }

  /* Derived from the account id, so it is unique and stable, and obviously
     not a real inbox — a cook who wants their own address changes it from
     their profile. */
  const email =
    account.email ?? `cook.${String(account._id).slice(-6)}@rannabari.app`;
  const secret = password();

  rows.push({
    kitchen: kitchen.name ?? '(unnamed)',
    email,
    password: secret,
    note: account.email ? '' : 'email generated too',
  });

  if (write) {
    await Account.updateOne(
      { _id: account._id },
      { email, passwordHash: await hashPassword(secret) },
    );
  }
}

console.log('');
console.log(write ? 'WRITTEN — these are the credentials:' : 'DRY RUN — nothing written yet:');
console.log('');
console.log('  ' + 'kitchen'.padEnd(26) + 'email'.padEnd(34) + 'password');
console.log('  ' + '-'.repeat(84));
for (const r of rows) {
  console.log(
    '  ' + r.kitchen.slice(0, 25).padEnd(26) + r.email.padEnd(34) + r.password +
      (r.note ? '   (' + r.note + ')' : ''),
  );
}
console.log('');
console.log(`  ${rows.length} cook(s) given a password, ${skipped} already had one.`);
if (!write) console.log('  Re-run with --write to apply.');
console.log('');

await disconnect();
