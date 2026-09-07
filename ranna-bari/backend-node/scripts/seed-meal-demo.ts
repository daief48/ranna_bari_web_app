/**
 * One cook, one customer, and a month to book — enough to walk the whole
 * meal system end to end.
 *
 * Not part of `seed.ts`. That one builds the marketplace; this builds a single
 * traceable scenario on top of whatever is already there, so it can be run
 * against a live database without rewriting anything that is in it. Every
 * document it creates is either upserted by a natural key or skipped when it
 * already exists, so running it twice is the same as running it once.
 *
 * **It writes to whatever MONGODB_URI points at.** Dry by default for exactly
 * that reason: it prints what it would create and exits. Pass `--apply`.
 *
 * The numbers are the specification's own worked example — Business Meal at
 * the platform's ৳250, the cook charging ৳300, three to seven meals a month —
 * so what appears on screen can be checked against the document rather than
 * against a guess.
 *
 *   npx tsx scripts/seed-meal-demo.ts            (dry run)
 *   npx tsx scripts/seed-meal-demo.ts --apply
 *
 * To remove it afterwards:
 *
 *   npx tsx scripts/delete-account.ts +8801900000001 +8801900000002 --cook --apply
 */
import { connect, disconnect } from '../src/config/db.js';
import {
  Account,
  Kitchen,
  LedgerEntry,
  MealDish,
  MealPlan,
  MealService,
} from '../src/models/index.js';
import { monthDays, seedMealCategories } from '../src/logic/mealplan.js';

const apply = process.argv.includes('--apply');

const COOK_PHONE = '+8801900000001';
const CUSTOMER_PHONE = '+8801900000002';
const CATEGORY = 'business';
const COOK_RATE = 300;
const WALLET = 5000;

/** The Dhaka month, which is the one both apps open on. */
function currentMonth(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * A week of meals, repeated across the month.
 *
 * A real calendar is a rotation, and a demo that wrote thirty different
 * dinners would look less like the thing it is demonstrating, not more.
 */
const WEEK = [
  { breakfast: 'ডাল + রুটি', lunch: 'বিরিয়ানি', dinner: 'মাছের তরকারি' },
  { breakfast: 'খিচুড়ি', lunch: 'মুরগির ঝোল', dinner: 'লাল শাক + ভাত' },
  { breakfast: 'পরোটা + ডিম', lunch: 'গরুর মাংস', dinner: 'সবজি + ডাল' },
  { breakfast: 'রুটি + সবজি', lunch: 'ইলিশ ভাপা', dinner: 'ডিম কারি' },
  { breakfast: 'ভুনা খিচুড়ি', lunch: 'চিকেন রোস্ট', dinner: 'শুক্তো + ভাত' },
  { breakfast: 'নান + ডাল', lunch: 'কাচ্চি বিরিয়ানি', dinner: 'মাছ ভাজা' },
  { breakfast: 'পায়েস', lunch: 'খাসির মাংস', dinner: 'ভর্তা + ভাত' },
];

/** The dishes the calendars are filled from, offered to every cook. */
const DISHES = [
  ...new Set(WEEK.flatMap((day) => [day.breakfast, day.lunch, day.dinner])),
];

const say = (line: string) => console.log(`${apply ? '·' : '  would'} ${line}`);

async function main() {
  await connect();

  const month = currentMonth();
  console.log(`\nMeal system demo — ${month}\n`);

  /* ---- the platform's side ---- */

  await seedMealCategories();

  /* The dish library, platform scope. Upserted per name so a second run adds
     nothing and a name typed by hand in the panel is never overwritten. */
  let dishesAdded = 0;
  for (const name of DISHES) {
    const type = WEEK.some((d) => d.breakfast === name)
      ? 'breakfast'
      : WEEK.some((d) => d.lunch === name)
        ? 'lunch'
        : 'dinner';

    const exists = await MealDish.findOne({ scope: 'system', categoryKey: CATEGORY, name }).lean();
    if (exists) continue;
    dishesAdded += 1;
    if (apply) {
      await MealDish.create({ scope: 'system', kitchenId: '', categoryKey: CATEGORY, name, type });
    }
  }
  say(`add ${dishesAdded} platform dishes`);

  /* The system calendar for the month, published so a cook can cook from it
     and a customer can book against it without the cook doing anything. */
  const days = monthDays(month).map((date, i) => ({ date, ...WEEK[i % WEEK.length] }));
  const existingPlan = await MealPlan.findOne({
    scope: 'system',
    kitchenId: '',
    categoryKey: CATEGORY,
    month,
  }).lean();

  if (existingPlan) {
    say(`leave the existing system calendar for ${month} alone (${existingPlan.status})`);
  } else {
    say(`publish a system calendar for ${month} — ${days.length} days`);
    if (apply) {
      await MealPlan.create({
        scope: 'system',
        kitchenId: '',
        categoryKey: CATEGORY,
        month,
        days,
        status: 'published',
        updatedBy: 'seed-meal-demo',
      });
    }
  }

  /* ---- the cook ---- */

  let cook = await Account.findOne({ phone: COOK_PHONE }).lean();
  if (cook) {
    say(`reuse the cook account ${COOK_PHONE}`);
  } else {
    say(`create a cook account ${COOK_PHONE} — Nasrin's Kitchen`);
    if (apply) {
      cook = (await Account.create({
        customerKey: COOK_PHONE,
        role: 'cook',
        name: 'Nasrin Akter',
        phone: COOK_PHONE,
        email: 'nasrin.demo@rannabari.test',
        area: 'Dhanmondi',
        phoneVerifiedAt: new Date(),
      })) as never;
    }
  }

  let kitchen = cook ? await Kitchen.findOne({ accountId: String(cook._id) }).lean() : null;
  if (kitchen) {
    say(`reuse the kitchen "${kitchen.name}"`);
  } else if (apply && cook) {
    /* `kycStatus: 'approved'` on purpose: the trading gate reads exactly this
       field, and a demo cook stuck in the KYC queue cannot switch a service
       on — which is the first thing there is to try. */
    kitchen = (await Kitchen.create({
      accountId: String(cook._id),
      name: "Nasrin's Kitchen",
      ownerName: 'Nasrin Akter',
      specialty: 'Home-style Bengali',
      description: 'A month of home cooking, three meals a day.',
      area: 'Dhanmondi',
      lat: 23.7461,
      lng: 90.376,
      deliveryRadiusKm: 5,
      isOpen: true,
      isVerified: true,
      kycStatus: 'approved',
      kycDecidedAt: new Date(),
      kycDecidedBy: 'seed-meal-demo',
    })) as never;
    say('create the kitchen, KYC approved so it can trade');
  } else {
    say('create the kitchen, KYC approved so it can trade');
  }

  if (kitchen) {
    const kitchenId = String(kitchen._id);
    const service = await MealService.findOne({ kitchenId }).lean();
    if (service) {
      say(`reuse the meal service (৳${service.rate ?? 'category rate'})`);
    } else {
      say(`start a meal service — ${CATEGORY}, ৳${COOK_RATE} a meal, 3 to 7 meals, live`);
      if (apply) {
        await MealService.create({
          kitchenId,
          categoryKey: CATEGORY,
          /* Their own rate rather than the category's, so the panel has one
             cook of each kind to show. */
          rate: COOK_RATE,
          minMeals: 3,
          maxMeals: 7,
          active: true,
          cookName: 'Nasrin Akter',
        });
      }
    }
  }

  /* ---- the customer ---- */

  let customer = await Account.findOne({ phone: CUSTOMER_PHONE }).lean();
  if (customer) {
    say(`reuse the customer account ${CUSTOMER_PHONE}`);
    /* Backfilled rather than left alone: an account seeded before the booking
       screen started requiring an address cannot book anything, and the point
       of this script is an account that can. */
    if (!customer.addressDetail) {
      say('give it a delivery address — it had none');
      if (apply) {
        await Account.updateOne(
          { _id: customer._id },
          {
            $set: {
              addressLabel: 'Home',
              addressDetail: 'House 42, Road 9/A, Dhanmondi',
              area: 'Dhanmondi',
              lat: 23.7461,
              lng: 90.376,
            },
          },
        );
      }
    }
  } else {
    say(`create a customer account ${CUSTOMER_PHONE} — Tanvir Rahman`);
    if (apply) {
      customer = (await Account.create({
        customerKey: CUSTOMER_PHONE,
        role: 'user',
        name: 'Tanvir Rahman',
        phone: CUSTOMER_PHONE,
        email: null,
        area: 'Dhanmondi',
        addressLabel: 'Home',
        /* A real street line, because a month of meals cannot be booked
           without one — the booking screen refuses rather than sending a
           cook thirty plates and no address. */
        addressDetail: 'House 42, Road 9/A, Dhanmondi',
        lat: 23.7461,
        lng: 90.376,
        phoneVerifiedAt: new Date(),
      })) as never;
    }
  }

  /*
   * Wallet money, as a ledger entry rather than a balance field.
   *
   * There is no balance column anywhere — a wallet is the fold of the ledger,
   * which is why `from: 'external'` matters: it reads as money arriving from
   * outside rather than a transfer that nets to nothing. Written once and
   * never topped up again, so a second run does not quietly double it.
   */
  const funded = await LedgerEntry.findOne({
    toRef: CUSTOMER_PHONE,
    kind: 'topup',
    note: 'Meal system demo float',
  }).lean();

  if (funded) {
    say('leave the demo wallet float alone — already posted');
  } else {
    say(`credit the customer's wallet with ৳${WALLET}`);
    if (apply) {
      await LedgerEntry.create({
        kind: 'topup',
        amount: WALLET,
        from: 'external',
        to: 'customer',
        toRef: CUSTOMER_PHONE,
        note: 'Meal system demo float',
        at: new Date(),
      });
    }
  }

  console.log(
    apply
      ? `\nDone. Sign in on the app with ${COOK_PHONE} (cook) or ${CUSTOMER_PHONE} (customer).` +
          '\nThe OTP comes back in the request-otp response as `devCode` while no SMS provider is set.'
      : '\nDry run — nothing written. Re-run with --apply.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
