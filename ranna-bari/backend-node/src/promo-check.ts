/**
 * Temporary: does a discounted order leave the books balanced?
 *
 * This is the check that matters. The ledger reconciles to zero drift today,
 * and a promotion adds a party to a transaction that previously had one payer.
 * If the funding posting and the reconcile formula disagree by a single taka,
 * the books stop balancing and every figure in the money console becomes
 * suspect.
 *
 * So: drift before, a real discounted order, drift after, a refund, drift
 * again — and the database put back the way it was found.
 */
import { connect, disconnect, tx } from './config/db.js';
import { post, reconcile, refundEscrow, balances } from './logic/ledger.js';
import { quotePromotion, redeem, savePromotion } from './logic/promotions.js';
import { LedgerEntry, Order, Promotion, Redemption } from './models/index.js';

let failed = 0;
const check = (what: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + what.padEnd(46) + JSON.stringify(got));
};

const driftNow = async () => {
  const r = await reconcile();
  return Object.values(r.drift).reduce((n: number, v) => n + Math.abs(v as number), 0);
};

async function main() {
  await connect();

  const CODE = 'ZZPROMOCHECK';
  const ORDER_ID = 'promo-check-order';

  /* Clean slate, in case a previous run died halfway. */
  await Promise.all([
    Promotion.deleteMany({ code: CODE }),
    Redemption.deleteMany({ code: CODE }),
    Order.deleteMany({ code: ORDER_ID }),
    LedgerEntry.collection.deleteMany({ orderId: ORDER_ID }),
  ]);

  console.log('drift before: ' + (await driftNow()) + '\n');

  /* A 20% code, capped, on a 1000 taka order. */
  const made = await savePromotion({ code: CODE, kind: 'percent', value: 20, perCustomer: 1 });
  check('a promotion can be created', made.ok, true);

  const customerKey = 'promo-check-customer';
  const GROSS = 1000;

  const quote = await quotePromotion({ code: CODE, customerKey, amount: GROSS });
  check('it quotes 20% of 1000', quote.ok && quote.result.discount, 200);
  check('the customer pays the rest', quote.ok && quote.result.paid, 800);

  if (!quote.ok) {
    await disconnect();
    process.exit(1);
  }

  /* The order, exactly as recordOrder would write it. */
  const order = await Order.create({
    code: ORDER_ID,
    kind: 'wallet',
    kitchenId: 'promo-check-kitchen',
    customerKey,
    title: 'Promo check',
    subtotal: GROSS,
    amount: GROSS,
    discount: quote.result.discount,
    promoCode: CODE,
    paid: quote.result.paid,
    payment: 'held',
    status: 'confirmed',
  });
  const orderId = String(order._id);

  /* Both halves of the payment, as checkout posts them. */
  await tx(async (session) => {
    await post(session, {
      kind: 'hold',
      amount: quote.result.paid,
      from: 'customer',
      to: 'held',
      fromRef: customerKey,
      orderId,
      idemKey: `hold:${orderId}`,
    });
    await post(session, {
      kind: 'promo',
      amount: quote.result.discount,
      from: 'platform',
      to: 'held',
      orderId,
      idemKey: `promo:${orderId}`,
    });
    await redeem(session, { quote: quote.result, customerKey, orderId });
  });

  const heldForOrder = (
    await LedgerEntry.aggregate<{ _id: null; n: number }>([
      { $match: { orderId, to: 'held' } },
      { $group: { _id: null, n: { $sum: '$amount' } } },
    ])
  )[0]?.n;
  check('escrow holds the full gross', heldForOrder, GROSS);
  check('drift after a discounted order', await driftNow(), 0);

  /* Redeeming twice for the same order must not count twice. */
  await tx(async (session) => redeem(session, { quote: quote.result, customerKey, orderId }));
  check('a retried redemption counts once', await Redemption.countDocuments({ code: CODE }), 1);

  /* And the code cannot be used again by the same customer. */
  const again = await quotePromotion({ code: CODE, customerKey, amount: GROSS });
  check('the code is spent for this customer', !again.ok, true);

  /* Refund: the customer gets what they paid, the platform takes its funding back. */
  const before = await balances();
  await tx(async (session) => refundEscrow(session, orderId, { note: 'promo check' }));
  const after = await balances();

  check('the customer is returned what they paid', after.customer - before.customer, 800);
  check('the platform takes its 200 back', after.platform - before.platform, 200);
  check('escrow is emptied of this order', after.held - before.held, -GROSS);
  check('drift after the refund', await driftNow(), 0);

  /* Put everything back. */
  await Promise.all([
    Promotion.deleteMany({ code: CODE }),
    Redemption.deleteMany({ code: CODE }),
    Order.deleteMany({ _id: orderId }),
    LedgerEntry.collection.deleteMany({ orderId }),
  ]);
  console.log('\n  cleaned up — drift now ' + (await driftNow()));
  console.log('  ' + (failed ? failed + ' FAILED' : 'the books balance through a promotion'));

  await disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
