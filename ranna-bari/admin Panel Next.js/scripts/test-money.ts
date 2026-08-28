/**
 * The money invariants, exercised against the real database.
 *
 * Not a unit test suite — it runs the actual transitions from
 * `lib/logic/ledger.ts` inside real transactions and then asks the books
 * whether they still add up. The four rules it checks are the four the app's
 * own ledger header claims, plus the commission split that the app has no
 * account for:
 *
 *   1. exactly-once settlement, asserted twice (order state + idempotency key)
 *   2. the split always adds back to what was held — no orphan taka
 *   3. the append-only guard actually fires
 *   4. every account still reconciles to zero drift afterwards
 *
 * Run with `npm run test:money`. It leaves its entries behind on purpose:
 * an append-only ledger has no undo, which is the point.
 */
import { db } from '../lib/db';
import {
  balances,
  reconcile,
  releaseEscrow,
  refundEscrow,
  splitEscrow,
  cookBalances,
} from '../lib/logic/ledger';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const taka = (n: number) => `৳${n.toLocaleString('en-US')}`;

async function main() {
  console.log('\nMoney invariants\n');

  const before = await reconcile();
  const driftBefore = Object.values(before.drift).reduce((s, v) => s + Math.abs(v), 0);
  check('books start balanced', driftBefore === 0, `drift ${taka(driftBefore)}`);

  /* ---- 1. release, then release again ---- */

  const toRelease = await db.order.findFirst({
    where: { payment: 'held', status: 'delivered' },
  });

  if (!toRelease) {
    console.log('  skip release — no held order to work with');
  } else {
    const balBefore = await balances();

    const first = await db.$transaction((tx) => releaseEscrow(tx, toRelease.id));
    check('release succeeds', first.ok);

    if (first.ok) {
      const { cook, platform } = first.result;
      check(
        'cook + platform equals the held amount',
        cook + platform === toRelease.amount,
        `${cook} + ${platform} != ${toRelease.amount}`,
      );

      const balAfter = await balances();
      check(
        'escrow fell by exactly the order amount',
        balBefore.held - balAfter.held === toRelease.amount,
        `${balBefore.held} → ${balAfter.held}`,
      );
      check('cook credited', balAfter.cook - balBefore.cook === cook);
      check('platform credited', balAfter.platform - balBefore.platform === platform);
    }

    // The double-click. Same order, immediately again.
    const second = await db.$transaction((tx) => releaseEscrow(tx, toRelease.id));
    check(
      'a second release is refused',
      !second.ok,
      second.ok ? 'it paid twice' : undefined,
    );
  }

  /* ---- 2. refund ---- */

  const toRefund = await db.order.findFirst({
    where: { payment: 'held', status: { in: ['confirmed', 'preparing'] } },
  });

  if (!toRefund) {
    console.log('  skip refund — no held order to work with');
  } else {
    const balBefore = await balances();
    const out = await db.$transaction((tx) => refundEscrow(tx, toRefund.id));
    check('refund succeeds', out.ok);

    if (out.ok) {
      const balAfter = await balances();
      check(
        'the customer got back exactly what was held',
        balAfter.customer - balBefore.customer === toRefund.amount,
      );
      check('escrow fell by the same', balBefore.held - balAfter.held === toRefund.amount);
    }

    const again = await db.$transaction((tx) => refundEscrow(tx, toRefund.id));
    check('a second refund is refused', !again.ok);
  }

  /* ---- 3. split ---- */

  const toSplit = await db.order.findFirst({
    where: { payment: 'held', status: { in: ['confirmed', 'preparing', 'ready'] } },
  });

  if (!toSplit) {
    console.log('  skip split — no held order to work with');
  } else {
    // A split that does not account for the whole amount must be refused.
    const short = await db.$transaction((tx) =>
      splitEscrow(tx, toSplit.id, 10, 10, 'deliberately short'),
    );
    check(
      'a split that leaves money behind is refused',
      !short.ok,
      short.ok ? 'it orphaned taka in escrow' : undefined,
    );

    const half = Math.round(toSplit.amount / 2);
    const balBefore = await balances();
    const out = await db.$transaction((tx) =>
      splitEscrow(tx, toSplit.id, half, toSplit.amount - half, 'test split'),
    );
    check('an exact split succeeds', out.ok);

    if (out.ok) {
      const balAfter = await balances();
      check(
        'escrow fell by the whole held amount',
        balBefore.held - balAfter.held === toSplit.amount,
        `${balBefore.held - balAfter.held} != ${toSplit.amount}`,
      );
      check(
        'nothing was created or destroyed',
        out.result.refunded + out.result.released === toSplit.amount,
      );
    }
  }

  /* ---- 4. the append-only guard ---- */

  /* Raw SQL on purpose. Going through Prisma would also fail — but on a
     foreign key, which proves nothing about the guard. The point is that a
     statement bypassing every application-side check still cannot rewrite
     history, so the assertion is on the trigger's own message. */
  const entry = await db.ledgerEntry.findFirst();
  if (entry) {
    const attempt = async (sql: string) => {
      try {
        await db.$executeRawUnsafe(sql);
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    const onUpdate = await attempt(
      `UPDATE "LedgerEntry" SET amount = 999999 WHERE id = '${entry.id}'`,
    );
    const onDelete = await attempt(`DELETE FROM "LedgerEntry" WHERE id = '${entry.id}'`);

    check('raw UPDATE on the ledger is refused by the database', onUpdate.includes('append-only'));
    check('raw DELETE on the ledger is refused by the database', onDelete.includes('append-only'));

    const still = await db.ledgerEntry.findUnique({ where: { id: entry.id } });
    check('the entry is untouched', still?.amount === entry.amount);
  }

  /* ---- 5. still balanced ---- */

  const after = await reconcile();
  const driftAfter = Object.values(after.drift).reduce((s, v) => s + Math.abs(v), 0);
  check('books still balanced after every movement', driftAfter === 0, `drift ${taka(driftAfter)}`);

  const owed = await cookBalances();
  check(
    'no cook is owed a negative amount',
    owed.every((row) => row.amount > 0),
  );

  console.log(`\n  balances: ${JSON.stringify(after.balances)}`);
  console.log(`  ${passed} passed, ${failed} failed\n`);

  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
