/**
 * Point each meal at the kitchen that actually cooks it.
 *
 *   npx tsx scripts/backfill-meal-geo.ts            # report only
 *   npx tsx scripts/backfill-meal-geo.ts --write
 *
 * `scripts/seed.ts` wrote `lat: 23.75, lng: 90.38, deliveryRadiusKm: 5` on
 * every meal it created, regardless of whose kitchen it came from. So every
 * meal in the database claimed to be cooked at one address in Dhanmondi.
 *
 * The meals board filters on `distance from you <= that meal's radius`, so
 * the effect was that a customer in Banani measured exactly 7.5km to all
 * thirty-three orderable meals — including the ones cooked in Banani — and
 * was told no cook was planning anything near them. The server was returning
 * every one of those meals; the app was throwing all of them away.
 *
 * The seed no longer does this. This repairs the rows it already wrote,
 * rather than re-seeding and discarding every real order, review and thread.
 *
 * Only meals still carrying the hard-coded triple are touched. A meal a cook
 * published through the app has always taken its kitchen's real location and
 * is left exactly as it is.
 */
import { connect, disconnect } from '../src/config/db.js';
import { Meal, Kitchen } from '../src/models/index.js';

/** What the seed used to write. Matching all three avoids touching a meal
    that happens to be cooked near that point with that radius by chance. */
const STAMPED = { lat: 23.75, lng: 90.38, deliveryRadiusKm: 5 };

const write = process.argv.includes('--write');

await connect();

const stamped = await Meal.find(STAMPED).lean();
console.log(`${stamped.length} meal(s) carry the seed's hard-coded location`);

if (!stamped.length) {
  console.log('nothing to repair');
  await disconnect();
  process.exit(0);
}

/* One read for every kitchen involved, not one per meal. */
const kitchenIds = [...new Set(stamped.map((m) => String(m.kitchenId)))];
const kitchens = await Kitchen.find({ _id: { $in: kitchenIds } })
  .select({ name: 1, area: 1, lat: 1, lng: 1, deliveryRadiusKm: 1 })
  .lean();
const byId = new Map(kitchens.map((k) => [String(k._id), k]));

const plan: { id: string; title: string; area: string; lat: number; lng: number; radius: number }[] = [];
const orphaned: string[] = [];

for (const meal of stamped) {
  const kitchen = byId.get(String(meal.kitchenId));
  if (
    !kitchen ||
    typeof kitchen.lat !== 'number' ||
    typeof kitchen.lng !== 'number' ||
    typeof kitchen.deliveryRadiusKm !== 'number'
  ) {
    orphaned.push(String(meal.title));
    continue;
  }
  plan.push({
    id: String(meal._id),
    title: String(meal.title),
    area: String(kitchen.area),
    lat: kitchen.lat,
    lng: kitchen.lng,
    radius: kitchen.deliveryRadiusKm,
  });
}

console.log(`  ${plan.length} can be pointed at their kitchen`);
if (orphaned.length) {
  console.log(`  ${orphaned.length} have no kitchen with coordinates and are left alone`);
}

/* What the spread becomes — the point of the repair is that it stops being
   one place. */
const spots = new Set(plan.map((p) => `${p.lat},${p.lng}`));
console.log(`\nfrom 1 location to ${spots.size} distinct locations`);
const areas = new Map<string, number>();
for (const p of plan) areas.set(p.area, (areas.get(p.area) ?? 0) + 1);
console.log(
  '  ' +
    [...areas.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([a, n]) => `${a}:${n}`)
      .join('  '),
);

if (!write) {
  console.log('\nreport only — pass --write to apply');
  await disconnect();
  process.exit(0);
}

let done = 0;
for (const p of plan) {
  await Meal.updateOne(
    { _id: p.id },
    { $set: { lat: p.lat, lng: p.lng, deliveryRadiusKm: p.radius } },
  );
  done += 1;
}

console.log(`\n${done} meal(s) repaired`);
await disconnect();
process.exit(0);
