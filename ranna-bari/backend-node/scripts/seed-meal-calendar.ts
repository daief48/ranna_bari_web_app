/**
 * Fill the platform's meal calendar — every date of a month, for each category,
 * cooked to the price the category charges.
 *
 * Business (৳250), Student (৳80) and Regular (৳60) are not one menu in three
 * portion sizes: a business tray is a pulao and a roast, a student plate is rice
 * and dal that stretches a stipend, a regular plate is what a home cooks on an
 * ordinary day. Each category gets its own rotation, a different dish on
 * neighbouring days, and a proper Friday — Bangladesh's one day off, which is
 * when biryani goes on the table.
 *
 * It writes through `savePlan`, the same function the admin panel uses, so a
 * calendar seeded here obeys every rule one typed there would. It also fills the
 * category's dish library, so the panel's pickers have the names the calendar
 * uses.
 *
 * Safe to run twice. A calendar that already has dishes in it is left alone
 * (an operator may have edited it); an empty or draft-only one is filled.
 * Dry run by default.
 *
 *   npx tsx scripts/seed-meal-calendar.ts                       # look, October 2026
 *   npx tsx scripts/seed-meal-calendar.ts --apply               # write it
 *   npx tsx scripts/seed-meal-calendar.ts --month=2026-11 --apply
 *   npx tsx scripts/seed-meal-calendar.ts --apply --force       # overwrite filled calendars
 */
import { connect, disconnect } from '../src/config/db.js';
import { MealCategory, MealDish, MealPlan } from '../src/models/index.js';
import { monthDays, savePlan } from '../src/logic/mealplan.js';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const MONTH = process.argv.find((a) => a.startsWith('--month='))?.split('=')[1] ?? '2026-10';

type Menu = { breakfast: string[]; lunch: string[]; dinner: string[]; friday: string[] };

/* Lists of ten are deliberate: a stride that is coprime with ten (3, 7, 9)
   visits every dish before repeating one, so no dish lands two days running. */
const MENUS: Record<string, Menu> = {
  business: {
    breakfast: [
      'পরোটা + ডিম অমলেট', 'লুচি + আলুর দম', 'নান + ডাল', 'ভুনা খিচুড়ি + ডিম',
      'রুটি + সবজি + হালুয়া', 'পুরি + হালুয়া', 'স্যান্ডউইচ + ফ্রুট জুস',
      'পরোটা + মাংস ভুনা', 'দই-চিড়া + ফল', 'ডিম টোস্ট + চা',
    ],
    lunch: [
      'গরুর মাংস ভুনা + পোলাও', 'ইলিশ ভাপা + ভাত', 'চিকেন রোস্ট + পোলাও',
      'চিংড়ি মালাইকারি + ভাত', 'খাসির রেজালা + পোলাও', 'রুই কালিয়া + ভাত',
      'কোরমা + নান', 'বিফ কালা ভুনা + পরোটা', 'দেশি মুরগি ভুনা + ভাত',
      'মোরগ পোলাও + সালাদ',
    ],
    dinner: [
      'ভাত + ডাল + মাছ ভাজা', 'চিকেন কারি + রুটি', 'ভাত + ডিম ভুনা + ডাল',
      'শুক্তো + ভাত + মাছ', 'পাবদা মাছের ঝোল + ভাত', 'ফ্রায়েড রাইস + চিকেন',
      'মাটন কারি + রুটি', 'ভাত + বেগুন ভর্তা + মাছ', 'চিকেন খিচুড়ি',
      'ভাত + লাউ চিংড়ি + ডাল',
    ],
    friday: [
      'কাচ্চি বিরিয়ানি + বোরহানি + জর্দা',
      'মোরগ পোলাও + রোস্ট + পায়েস',
      'তেহারি + বোরহানি + ফিরনি',
    ],
  },
  student: {
    breakfast: [
      'পরোটা + ডিম', 'রুটি + ডাল', 'খিচুড়ি', 'পুরি + সবজি', 'ভাত + ডিম ভাজি',
      'রুটি + সবজি', 'সেমাই', 'রুটি + কলা', 'পরোটা + সবজি', 'মুড়ি + ডিম',
    ],
    lunch: [
      'ভাত + ডাল + সয়া কারি', 'ভাত + মুরগির ঝোল', 'পাস্তা', 'ভাত + ডিম কারি',
      'খিচুড়ি + ডিম', 'ভাত + শাক ভাজি + ডাল', 'ভাত + আলু ভর্তা + ডাল',
      'ভাত + ছোট মাছ + ডাল', 'ভাত + ডিম ভুনা', 'ভাত + সবজি কারি + ডাল',
    ],
    dinner: [
      'খিচুড়ি + ডিম', 'ভাত + আলু ভাজি + ডাল', 'ভাত + সবজি কারি', 'পাস্তা',
      'ভাত + ডিম ভুনা', 'কুমড়া ভাজি + ভাত', 'ভাত + ডাল + ডিম',
      'রুটি + ডাল + সবজি', 'ভাত + বেগুন ভর্তা + ডাল', 'ভাত + মুরগির ঝোল',
    ],
    friday: ['তেহারি', 'খিচুড়ি + ডিম ভুনা', 'ভাত + মুরগির কারি + ডাল'],
  },
  regular: {
    breakfast: [
      'রুটি + ডাল', 'ভাত + ভর্তা', 'পরোটা + সবজি', 'রুটি + ডিম', 'খিচুড়ি',
      'রুটি + কলা', 'পায়েস', 'মুড়ি + গুড়', 'পরোটা + ডিম', 'রুটি + সবজি',
    ],
    lunch: [
      'ভাত + ডাল + মাছ', 'ভাত + মুরগির কারি', 'ভাত + ডিম কারি', 'খিচুড়ি + আচার',
      'ভাত + শুকনো মাছ', 'ভাত + গরুর মাংস', 'ভাত + ডাল + ভর্তা', 'ভাত + মাছের ঝোল',
      'ভাত + লাউ ঘন্ট', 'ভাত + পটল + ডাল',
    ],
    dinner: [
      'ভাত + সবজি', 'খিচুড়ি', 'ভাত + পটল + ডাল', 'ভাত + লাউ + ডাল',
      'ভাত + ডাল + ভর্তা', 'ভাত + সবজি + ডিম', 'ভাত + মাছের ঝোল',
      'রুটি + ডাল + সবজি', 'ভাত + বেগুন ভাজি + ডাল', 'ভাত + ডিম ভুনা',
    ],
    friday: ['ভাত + গরুর মাংস + ডাল', 'খিচুড়ি + ডিম ভুনা', 'ভাত + মুরগির রোস্ট'],
  },
};

/** The day of the week of a 'YYYY-MM-DD', as the calendar means it (Dhaka date). */
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay(); // 5 = Friday

function plan(menu: Menu, dates: string[]) {
  let fridays = 0;
  let lastDinner = '';
  return dates.map((date, i) => {
    const friday = weekday(date) === 5;
    const lunch = friday
      ? /* A Friday is the table's one big day — its lunch comes from its own
           shortlist, rotating through it Friday by Friday. */
        menu.friday[fridays++ % menu.friday.length]
      : menu.lunch[(i * 7) % menu.lunch.length];

    /* The same plate for lunch and dinner is a typo on a menu, and the cheaper
       tiers share dishes between the two lists — so dinner steps along until it
       is something else. */
    let at = (i * 9 + 2) % menu.dinner.length;
    for (
      let tries = 0;
      (menu.dinner[at] === lunch || menu.dinner[at] === lastDinner) && tries < menu.dinner.length;
      tries += 1
    ) {
      at = (at + 1) % menu.dinner.length;
    }
    lastDinner = menu.dinner[at];

    return {
      date,
      breakfast: menu.breakfast[(i * 3) % menu.breakfast.length],
      lunch,
      dinner: menu.dinner[at],
    };
  });
}

await connect();

const dates = monthDays(MONTH);
if (!dates.length) {
  console.error(`"${MONTH}" is not a month (expected YYYY-MM).`);
  process.exit(1);
}

console.log(`\nMeal calendar — ${MONTH}, ${dates.length} days${APPLY ? '' : '   (dry run: pass --apply to write)'}\n`);

const cats = await MealCategory.find({ retired: false }).sort({ order: 1 }).lean();
for (const key of Object.keys(MENUS)) {
  const cat = cats.find((c) => c.key === key);
  if (!cat) {
    console.log(`· ${key}: no such category — skipped`);
    continue;
  }

  const days = plan(MENUS[key], dates);

  /* The dish library: one row per (name, slot), so the panel's pickers offer
     exactly what the calendar serves. */
  const wanted = new Set<string>();
  for (const d of days) {
    wanted.add(`breakfast|${d.breakfast}`);
    wanted.add(`lunch|${d.lunch}`);
    wanted.add(`dinner|${d.dinner}`);
  }
  let added = 0;
  for (const entry of wanted) {
    const [type, name] = entry.split('|');
    const have = await MealDish.exists({ scope: 'system', categoryKey: key, name, type });
    if (have) continue;
    added += 1;
    if (APPLY) await MealDish.create({ scope: 'system', kitchenId: '', categoryKey: key, name, type });
  }

  const existing = await MealPlan.findOne({
    scope: 'system', kitchenId: '', categoryKey: key, month: MONTH,
  }).lean();
  const filled = (existing?.days ?? []).filter((d) => d.breakfast || d.lunch || d.dinner).length;

  const label = `${cat.label} · ৳${cat.rate} a meal`;
  if (filled && !FORCE) {
    console.log(`· ${label}: ${filled} days already written — left alone (--force to replace)`);
    continue;
  }
  console.log(`· ${label}: ${filled ? 'replace' : 'write'} ${days.length} days, +${added} dishes in the library`);

  if (APPLY) {
    const out = await savePlan({
      scope: 'system', categoryKey: key, month: MONTH, days, publish: true, updatedBy: 'seed-meal-calendar',
    });
    if (!out.ok) console.log(`  ✗ refused: ${out.error}`);
  }
}

console.log(APPLY ? '\nDone.' : '\nNothing written.');
await disconnect();
