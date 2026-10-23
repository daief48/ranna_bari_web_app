/**
 * Who is actually on the customer's Meals tab, one command.
 *
 * A "why does the customer see meals I never created" report starts here:
 * every `MealService.find({ active: true })` joined with its kitchen's KYC
 * state and the plan that would decorate its card. The interesting columns:
 *
 *   kyc        pending/rejected means the customer list no longer shows it
 *              (the read side is gated) — if such a service is still active,
 *              it is a leftover worth deactivating.
 *   plan       cook   = the kitchen published its own month;
 *                system = the card shows the platform default menu;
 *                -      = no plan at all (the card shows a price and nothing else).
 *
 * Usage: `npx tsx scripts/check-meal-services.ts`
 */
import { connect, disconnect } from '../src/config/db.js';
import { Kitchen, MealPlan, MealService } from '../src/models/index.js';
import { monthOf } from '../src/logic/mealplan.js';

await connect();

const month = monthOf();
const services = await MealService.find({ active: true })
  .sort({ kitchenId: 1 })
  .lean();

if (!services.length) {
  console.log('no active meal services');
  await disconnect();
  process.exit(0);
}

const kitchens = await Kitchen.find({
  _id: { $in: services.map((s) => s.kitchenId) },
})
  .select('name kycStatus suspended')
  .lean();
const byKitchen = new Map(kitchens.map((k) => [String(k._id), k]));

for (const s of services) {
  const kitchen = byKitchen.get(String(s.kitchenId));
  const own = await MealPlan.findOne({
    scope: 'cook',
    kitchenId: String(s.kitchenId),
    categoryKey: s.categoryKey,
    month,
    status: 'published',
  })
    .select('_id')
    .lean();
  const plan = own ? 'cook' : '-';

  console.log(
    [
      String(kitchen?.name ?? s.kitchenId).padEnd(28),
      `kyc=${(kitchen?.kycStatus ?? '?').padEnd(8)}`,
      kitchen?.suspended ? 'SUSPENDED' : '          ',
      `cat=${String(s.categoryKey).padEnd(9)}`,
      `rate=${String(s.rate ?? '-')}`.padEnd(9),
      `active=${s.active ? 'yes' : 'no '}`,
      `plan=${plan}`,
    ].join('  '),
  );
}

const system = await MealPlan.countDocuments({ scope: 'system', status: 'published', month });
console.log(`\nmonth: ${month} · published system plans: ${system}`);
console.log('note: pending/rejected kitchens with an active service are hidden from customers by the read gate — deactivate or approve them.');

await disconnect();
