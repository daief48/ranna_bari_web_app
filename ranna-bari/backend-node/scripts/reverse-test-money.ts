/**
 * Undo the money a test moved, the only way this ledger allows.
 *
 * Entries cannot be deleted — `AppendOnlyError` says so and the Atlas role
 * refuses it underneath — so a mistake is corrected by posting the same
 * amount back the other way. That is the design, not a workaround: the pair
 * stays visible, and anybody reading the history later can see that money
 * moved and then came back rather than finding a hole where an entry was.
 *
 * Takes order codes. For each one it reads what was actually posted and
 * mirrors every entry, so it cannot reverse an amount nobody moved.
 *
 *   npx tsx scripts/reverse-test-money.ts RB-CASH01            (dry run)
 *   npx tsx scripts/reverse-test-money.ts RB-CASH01 --apply
 */
import mongoose from 'mongoose';

import { connect, disconnect } from '../src/config/db.js';
import { LedgerEntry, Order } from '../src/models/index.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const codes = args.filter((a) => !a.startsWith('--'));

if (!codes.length) {
  console.error('give at least one order code');
  process.exit(1);
}

await connect();

const orders = await Order.find({ code: { $in: codes } }).lean();
if (!orders.length) console.log('no orders matched those codes');

let posted = 0;

for (const order of orders) {
  const orderId = String(order._id);
  const entries = await LedgerEntry.find({ orderId }).sort({ at: 1 }).lean();

  console.log(`\n${order.code} — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
  if (!entries.length) continue;

  for (const e of entries) {
    /* A reversal already posted is not something to post again. The note
       carries the original's id, which makes the check exact rather than a
       guess from amounts and accounts. */
    const marker = `reversal of ${String(e._id)}`;
    const already = await LedgerEntry.findOne({ note: marker }).lean();

    const line = `  ${e.kind} ${e.amount} ${e.from}→${e.to}  ⇒  adjustment ${e.amount} ${e.to}→${e.from}`;
    if (already) {
      console.log(`${line}   [already reversed]`);
      continue;
    }
    console.log(line);
    if (!apply) continue;

    await LedgerEntry.create({
      kind: 'adjustment',
      amount: e.amount,
      // Mirrored: what was credited is debited, and each keeps its own ref so
      // the folded balances actually net.
      from: e.to,
      to: e.from,
      fromRef: e.toRef ?? null,
      toRef: e.fromRef ?? null,
      orderId,
      mealId: e.mealId ?? null,
      note: marker,
    });
    posted++;
  }
}

console.log(
  apply
    ? `\nposted ${posted} reversing entr${posted === 1 ? 'y' : 'ies'}`
    : '\ndry run — nothing written. Pass --apply to post these.',
);

await disconnect();
await mongoose.disconnect().catch(() => {});
