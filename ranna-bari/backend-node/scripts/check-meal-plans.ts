/** The platform's meal calendars, per category and month. */
import { connect, disconnect } from '../src/config/db.js';
import { MealPlan, MealDish } from '../src/models/index.js';

await connect();

const plans = await MealPlan.find({ scope: 'system' })
  .select('categoryKey month status days')
  .sort({ categoryKey: 1, month: 1 })
  .lean();

for (const p of plans) {
  const filled = p.days.filter((d) => d.breakfast || d.lunch || d.dinner).length;
  console.log(`${p.categoryKey.padEnd(9)} ${p.month}  ${p.status.padEnd(10)} ${p.days.length} days, ${filled} filled`);
}

const dishes = await MealDish.aggregate([
  { $match: { scope: 'system' } },
  { $group: { _id: '$categoryKey', count: { $sum: 1 } } },
]);
console.log('\nsystem dish libraries:', dishes.map((d) => `${d._id}: ${d.count}`).join(' · '));

await disconnect();
