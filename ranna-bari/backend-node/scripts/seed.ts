/**
 * Seed, from the app's own bundled data.
 *
 * `chefs.json`, `menus.json` and `reviews.json` are read straight out of
 * `../User and Cook App/src/data`, so the kitchens, dishes and reviews here
 * are the exact records the mobile app ships with — same ids (as `legacyId`),
 * same names, same coordinates.
 *
 * On top of that it fabricates the half no single device can produce: many
 * customers, orders across the systems, and the ledger those orders imply.
 * And it seeds things that are *wrong* on purpose, because an operator
 * console with nothing broken in it teaches you nothing.
 *
 * Deterministic: a fixed-seed PRNG, so re-seeding gives the same database and
 * a bug can be told apart from a different random draw.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';

import { connect, disconnect, tx } from '../src/config/db.js';
import {
  Account,
  AdminUser,
  ChatMessage,
  ChatThread,
  Dish,
  Dispute,
  FeatureFlag,
  Kitchen,
  LedgerEntry,
  Meal,
  MealInterest,
  Notification,
  Offer,
  Order,
  PayoutItem,
  PayoutRun,
  Product,
  Request,
  Review,
  Setting,
  Store,
  StoreCategory,
  TaxonomyCategory,
  TopUp,
  Zone,
  AuditLog,
  AppSession,
  OtpChallenge,
  Cart,
} from '../src/models/index.js';

import { post } from '../src/logic/ledger.js';
import { DEFAULT_FLAGS, DEFAULT_SETTINGS } from '../src/logic/settings.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/*
 * The seed owns its source data now.
 *
 * These three files used to be read out of the app bundle, because the app
 * shipped its kitchen directory as JSON and the seed wanted the same records.
 * The app is 100% live-backend now — it has no bundled data at all — so
 * reading from it broke the seed outright.
 *
 * They live here instead, recovered from the commit that removed them. Seed
 * fixtures belong to the seed: the app must not carry a second copy of the
 * catalogue, and the seed must not depend on a directory whose whole purpose
 * was to stop existing.
 */
const FIXTURES = join(HERE, 'fixtures');

type Chef = {
  id: number;
  name: string;
  avatar: string;
  coverImage: string;
  specialty: string;
  description: string;
  rating: number;
  reviewCount: number;
  tags: string[];
  ecoBadge?: string;
  isVerified: boolean;
  area: string;
  lat: number;
  lng: number;
  deliveryRadiusKm: number;
  isOpen: boolean;
};
type MenuDoc = { chefId: number; items: DishRow[] };
type DishRow = { id: string; name: string; description: string; price: number; image: string; tags: string[] };
type ReviewDoc = { id: number; chefId: number; name: string; avatar: string; area: string; date: string; rating: number; text: string };

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as T;

/* ---- deterministic randomness ---- */

let rngState = 42;
const rnd = () => {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
};
const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const code = (prefix: string) => {
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  return `${prefix}-${out}`;
};

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};

/**
 * Forty customers rather than a dozen.
 *
 * The number is not cosmetic. A dashboard that means anything needs enough
 * rows that filters narrow, pagination pages, and a per-cook GMV column has a
 * distribution rather than four values. Twelve customers produce a database
 * where every screen fits above the fold and nothing is ever tested.
 */
const CUSTOMERS: readonly (readonly [string, string, string])[] = [
  ['Tanvir Ahmed', '+8801711223344', 'Dhanmondi'],
  ['Nusrat Jahan', '+8801812334455', 'Tejgaon'],
  ['Imran Hossain', '+8801913445566', 'Dhanmondi'],
  ['Farhana Rahman', '+8801614556677', 'Mohammadpur'],
  ['Sabbir Khan', '+8801515667788', 'Mirpur'],
  ['Ayesha Siddika', '+8801716778899', 'Uttara'],
  ['Rafiq Islam', '+8801817889900', 'Banani'],
  ['Mahmuda Akter', '+8801918990011', 'Gulshan'],
  ['Shakil Ahmed', '+8801619001122', 'Bashundhara'],
  ['Tasnim Chowdhury', '+8801510112233', 'Motijheel'],
  ['Jubair Islam', '+8801711334455', 'Old Dhaka'],
  ['Nadia Sultana', '+8801812445566', 'Dhanmondi'],
  ['Arif Mahmud', '+8801713556677', 'Khilgaon'],
  ['Sumaiya Haque', '+8801814667788', 'Badda'],
  ['Rezaul Karim', '+8801915778899', 'Rampura'],
  ['Ishrat Jahan', '+8801616889900', 'Banasree'],
  ['Mizanur Rahman', '+8801517990011', 'Baridhara'],
  ['Sharmin Akhter', '+8801718001122', 'Shyamoli'],
  ['Habibur Rahman', '+8801819112233', 'Lalmatia'],
  ['Rumana Begum', '+8801910223344', 'Farmgate'],
  ['Kamrul Hasan', '+8801611334455', 'Dhanmondi'],
  ['Sadia Noor', '+8801512445566', 'Uttara'],
  ['Naimul Islam', '+8801719556677', 'Mirpur'],
  ['Fahmida Yasmin', '+8801820667788', 'Gulshan'],
  ['Sohel Rana', '+8801916778899', 'Mohammadpur'],
  ['Tahmina Sultana', '+8801617889900', 'Banani'],
  ['Anisur Rahman', '+8801518990011', 'Motijheel'],
  ['Jannatul Ferdous', '+8801720001122', 'Old Dhaka'],
  ['Masud Parvez', '+8801821112233', 'Bashundhara'],
  ['Rehana Parvin', '+8801917223344', 'Tejgaon'],
  ['Golam Kibria', '+8801618334455', 'Khilgaon'],
  ['Shirin Akter', '+8801519445566', 'Badda'],
  ['Tanjil Hossain', '+8801721556677', 'Rampura'],
  ['Nusaiba Rahman', '+8801822667788', 'Banasree'],
  ['Faisal Ahmed', '+8801918778899', 'Baridhara'],
  ['Marium Khatun', '+8801619889900', 'Shyamoli'],
  ['Ashraful Alam', '+8801520990011', 'Lalmatia'],
  ['Sabina Yasmin', '+8801722001122', 'Farmgate'],
  ['Jahangir Alam', '+8801823112233', 'Dhanmondi'],
  ['Rokeya Begum', '+8801919223344', 'Uttara'],
] as const;

const ZONE_NAMES = [
  'Dhanmondi', 'Mohammadpur', 'Old Dhaka', 'Mirpur', 'Uttara', 'Banani',
  'Gulshan', 'Bashundhara', 'Motijheel', 'Tejgaon', 'Khilgaon', 'Badda',
  'Rampura', 'Banasree', 'Baridhara', 'Shyamoli', 'Lalmatia', 'Farmgate',
];

const TAXONOMY: [string, string, string][] = [
  ['breakfast', 'Morning', '🌅'], ['lunch', 'Lunch', '🍚'], ['dinner', 'Evening', '🌙'],
  ['biryani', 'Biryani', '🍛'], ['heritage', 'Heritage', '🔥'], ['comfort', 'Comfort', '🍲'],
  ['street', 'Street food', '🌶'], ['seafood', 'Seafood', '🐟'], ['grill', 'Grill', '🍢'],
  ['snacks', 'Snacks', '🥟'], ['sweet', 'Sweet', '🍮'], ['bakery', 'Bakery', '🍞'],
  ['healthy', 'Healthy', '🥗'], ['spicy', 'Spicy', '🌶'], ['meat', 'Meat', '🍖'],
  ['sylheti', 'Sylheti', '🍛'], ['asian', 'Asian', '🍜'], ['fusion', 'Fusion', '🍤'],
  ['office', 'Office lunch', '💼'], ['iftar', 'Iftar', '🌙'], ['budget', 'Budget', '💰'],
  ['cake', 'Cake', '🎂'], ['pitha', 'Pitha', '🥮'], ['achar', 'Achar', '🫙'],
  ['gift', 'Gift boxes', '🎁'],
];

const ADDRESSES = [
  { label: 'Home', line: 'House 41, Road 9/A, Flat 2C', instructions: 'Ring twice, the gate bell is broken.' },
  { label: 'Office', line: 'Level 6, Rangs Babylonia, Bijoy Sarani', instructions: '' },
  { label: 'Home', line: 'House 7, Road 3, Shukrabad', instructions: 'Leave with the guard.' },
  { label: 'Home', line: 'Apt 5B, 22 Green Road', instructions: '' },
];

export async function seed() {
  await connect();
  console.log('· clearing');

  /* An array of differently-typed models is a union TypeScript cannot call
     uniformly, so the loop asks for the one method it needs. */
  const wipe: { deleteMany: (filter: object) => Promise<unknown> }[] = [
    PayoutItem, PayoutRun, Dispute, ChatMessage, ChatThread, Order, Offer, Request,
    Product, StoreCategory, Store, MealInterest, Meal, Review, Dish, Kitchen,
    Account, TopUp, Notification, TaxonomyCategory, Zone, Setting, FeatureFlag,
    AdminUser, AppSession, OtpChallenge, Cart,
  ] as never;

  for (const model of wipe) await model.deleteMany({});
  /* The ledger and the audit log refuse deletes through the model — that is
     the point of them. A seed legitimately starts from nothing, so it goes
     around the guard at the driver level rather than weakening it. */
  await LedgerEntry.collection.deleteMany({});
  await AuditLog.collection.deleteMany({});

  /* ---- operators ---- */

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@rannabari.app';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'rannabari';

  await AdminUser.create([
    { email: adminEmail, name: 'Platform Owner', role: 'superadmin', passwordHash: hashPassword(adminPassword) },
    { email: 'ops@rannabari.app', name: 'Rumana Haque', role: 'ops', passwordHash: hashPassword(adminPassword) },
    { email: 'finance@rannabari.app', name: 'Kamrul Hasan', role: 'finance', passwordHash: hashPassword(adminPassword) },
    { email: 'support@rannabari.app', name: 'Sadia Noor', role: 'support', passwordHash: hashPassword(adminPassword) },
  ]);
  console.log(`· 4 operators (${adminEmail} / ${adminPassword})`);

  /* ---- configuration ---- */

  await Setting.create(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ _id: key, value })),
  );
  await FeatureFlag.create(
    DEFAULT_FLAGS.map((f) => ({ _id: f.key, enabled: f.enabled, description: f.description })),
  );
  await Zone.create(ZONE_NAMES.map((name, i) => ({ name, order: i, active: i < 15 })));
  await TaxonomyCategory.create(
    TAXONOMY.map(([key, label, emoji], i) => ({ key, label, emoji, order: i })),
  );
  console.log(`· settings, ${DEFAULT_FLAGS.length} flags, ${ZONE_NAMES.length} zones, ${TAXONOMY.length} categories`);

  /* ---- customers ---- */

  const customers = await Account.create(
    CUSTOMERS.map(([name, phone, area]) => ({
      customerKey: phone,
      role: 'user',
      name,
      phone,
      email: null,
      area,
      addressLabel: 'Home',
      phoneVerifiedAt: daysAgo(between(5, 60)),
    })),
  );
  console.log(`· ${customers.length} customers`);

  /* ---- kitchens, from the app's own data ---- */

  const chefs = readJson<Chef[]>('chefs.json');
  const menus = readJson<MenuDoc[]>('menus.json');
  const reviews = readJson<ReviewDoc[]>('reviews.json');

  /* Carries the kitchen's location and reach, because the meals below need
     both and reading them back out of Mongo per meal would be a query for
     something this loop already has in hand. */
  const kitchens: {
    id: string;
    legacyId: number;
    name: string;
    area: string;
    lat: number;
    lng: number;
    deliveryRadiusKm: number;
  }[] = [];
  const dishesByKitchen = new Map<string, { id: string; name: string; price: number; image: string }[]>();

  for (const chef of chefs) {
    const account = await Account.create({
      customerKey: `cook.${chef.id}@rannabari.app`,
      role: 'cook',
      name: chef.name,
      phone: `+88017${String(10000000 + chef.id * 137).slice(0, 8)}`,
      email: `cook.${chef.id}@rannabari.app`,
      kitchenName: `${chef.name.split(' ')[0]}'s Kitchen`,
      specialty: chef.specialty,
      /* Collected at signup and, in the app, never looked at by anybody. */
      nid: `19${between(70, 99)}${between(1000000, 9999999)}`,
      area: chef.area,
      lat: chef.lat,
      lng: chef.lng,
      deliveryRadiusKm: chef.deliveryRadiusKm,
      avatar: chef.avatar,
      phoneVerifiedAt: daysAgo(between(20, 200)),
    });

    /* `isVerified` is the badge; `kycStatus` is the decision behind it. The
       three unverified ones stay pending so the KYC queue opens with real
       work in it. */
    const verified = chef.isVerified;
    const kitchen = await Kitchen.create({
      accountId: String(account._id),
      legacyId: chef.id,
      name: `${chef.name.split(' ')[0]}'s Kitchen`,
      ownerName: chef.name,
      avatar: chef.avatar,
      coverImage: chef.coverImage,
      specialty: chef.specialty,
      description: chef.description,
      rating: chef.rating,
      reviewCount: chef.reviewCount,
      tags: chef.tags ?? [],
      /* Five of the twenty carry no eco badge in chefs.json. */
      ecoBadge: chef.ecoBadge ?? 'Eco-Packaging',
      isVerified: verified,
      area: chef.area,
      lat: chef.lat,
      lng: chef.lng,
      deliveryRadiusKm: chef.deliveryRadiusKm,
      isOpen: chef.isOpen,
      kycStatus: verified ? 'approved' : 'pending',
      kycDecidedAt: verified ? daysAgo(between(10, 150)) : null,
      kycDecidedBy: verified ? 'ops@rannabari.app' : null,
    });

    kitchens.push({
      id: String(kitchen._id),
      legacyId: chef.id,
      name: kitchen.name,
      area: kitchen.area,
      lat: chef.lat,
      lng: chef.lng,
      deliveryRadiusKm: chef.deliveryRadiusKm,
    });

    const menu = menus.find((m) => m.chefId === chef.id);
    const made = [];
    for (const item of menu?.items ?? []) {
      const dish = await Dish.create({
        kitchenId: String(kitchen._id),
        name: item.name,
        description: item.description,
        price: item.price,
        image: item.image,
        tags: item.tags ?? [],
        available: chance(0.85),
      });
      made.push({ id: String(dish._id), name: dish.name, price: dish.price, image: dish.image });
    }
    dishesByKitchen.set(String(kitchen._id), made);
    await Kitchen.updateOne({ _id: kitchen._id }, { nextDishSeq: made.length + 1 });
  }
  console.log(`· ${kitchens.length} kitchens, ${[...dishesByKitchen.values()].flat().length} dishes`);

  /* ---- reviews ---- */

  const byLegacy = new Map(kitchens.map((k) => [k.legacyId, k.id]));
  for (const review of reviews) {
    const kitchenId = byLegacy.get(review.chefId);
    if (!kitchenId) continue;
    await Review.create({
      kitchenId,
      name: review.name,
      avatar: review.avatar,
      area: review.area,
      rating: review.rating,
      text: review.text,
      date: review.date,
      customerKey: `${review.name.toLowerCase().replace(/\W+/g, '.')}@example.com`,
    });
  }
  // Two that need a moderator to look at them.
  await Review.create([
    {
      kitchenId: kitchens[4]!.id,
      name: 'Anon',
      area: 'Mirpur',
      rating: 1,
      text: 'WORST kitchen call me 01700000000 for cheaper catering, better deal!!',
      date: dayKey(daysAgo(2)),
    },
    {
      kitchenId: kitchens[7]!.id,
      name: 'Rakib',
      area: 'Banani',
      rating: 1,
      text: 'Never ordered from here. Wrong kitchen, my review was for someone else.',
      date: dayKey(daysAgo(5)),
    },
  ]);
  console.log(`· ${reviews.length + 2} reviews (2 awaiting moderation)`);

  /* ---- stores and products ---- */

  const SHELVES = [['Pickles & achar', '🫙'], ['Frozen', '🧊'], ['Sweets', '🍮'], ['Spice mixes', '🌶']];
  /*
   * Name, price, description, photograph.
   *
   * The photograph is the fourth column rather than something added later,
   * because a shop of unphotographed jars is not a shop anybody browses. The
   * screens have always drawn a lettered placeholder for a product with no
   * picture — that is the right thing for a cook who has not uploaded one
   * yet, and the wrong thing for every product in the seed at once, which
   * reads as a broken page rather than as an empty one.
   *
   * Same source and same crop as the dish photographs in `menus.json`, so a
   * shelf and a menu sit next to each other without one looking borrowed.
   */
  const GOODS: [string, number, string, string][] = [
    ['Aam er achar (500g)', 320, 'Sun-cured green mango pickle, mustard oil, no preservative.',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Mango_Pickle_Home_Made_Style.JPG/960px-Mango_Pickle_Home_Made_Style.JPG'],
    ['Boroi er achar (400g)', 280, 'Sweet-sour jujube pickle, the way it is made at home.',
      'https://upload.wikimedia.org/wikipedia/commons/9/91/Indian_pickles.jpg'],
    ['Frozen beef samosa (12)', 420, 'Hand-folded, freeze them flat and fry from frozen.',
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&h=800&fit=crop'],
    ['Nolen gur sandesh (8)', 480, 'Date-palm jaggery, made the week the gur arrives.',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Nolen_Jaggery_Sandesh.jpg/960px-Nolen_Jaggery_Sandesh.jpg'],
    ['Garam masala (100g)', 260, 'Whole spices, roasted and ground to order.',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&h=800&fit=crop'],
    ['Nokshi pitha box (6)', 400, 'Patterned rice cakes, made for the winter season.',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Nakshi_Pitha_%28%E0%A6%A8%E0%A6%95%E0%A6%B6%E0%A7%80_%E0%A6%AA%E0%A6%BF%E0%A6%A0%E0%A6%BE%29.jpg/960px-Nakshi_Pitha_%28%E0%A6%A8%E0%A6%95%E0%A6%B6%E0%A7%80_%E0%A6%AA%E0%A6%BF%E0%A6%A0%E0%A6%BE%29.jpg'],
  ];

  let productCount = 0;
  const stores: { id: string; kitchenId: string }[] = [];

  for (const kitchen of kitchens.slice(0, 16)) {
    const store = await Store.create({
      kitchenId: kitchen.id,
      name: `${kitchen.name.replace(' Kitchen', '')} Pantry`,
      tagline: 'Made in the kitchen, sold off the shelf.',
      area: kitchen.area,
      deliveryFee: pick([0, 40, 50, 60]),
      freeDeliveryOver: chance(0.5) ? pick([500, 800, 1000]) : null,
      isOpen: chance(0.7),
    });
    stores.push({ id: String(store._id), kitchenId: kitchen.id });

    const shelves = [];
    for (const [index, shelf] of SHELVES.slice(0, between(2, 4)).entries()) {
      shelves.push(
        await StoreCategory.create({
          storeId: String(store._id),
          name: shelf[0]!,
          emoji: shelf[1]!,
          order: index,
        }),
      );
    }

    /* One shelf, one of each. The index used to be `productCount + i` while
       both were incrementing, so it strode through GOODS two at a time and
       came back round every third product — a shop listing "Garam masala"
       twice, which reads as a broken page rather than as seed data. Rotating
       a distinct slice keeps the shops different from each other without any
       shop repeating itself. */
    const offset = stores.length % GOODS.length;
    const shelf = Array.from({ length: GOODS.length }, (_, k) => GOODS[(offset + k) % GOODS.length]!);
    const listing = shelf.slice(0, between(4, GOODS.length));

    for (const [name, price, description, photo] of listing) {
      /* A handful land at zero stock while still active — exactly the row the
         stock alarm exists to surface, and it has to exist to test. */
      const stock = chance(0.22) ? 0 : between(3, 60);
      await Product.create({
        storeId: String(store._id),
        categoryId: String(pick(shelves)._id),
        name,
        description,
        /* An array, because a product may carry several and the screens page
           through them. One is what a real cook uploads to begin with. */
        images: [photo],
        price,
        stock,
        active: chance(0.9),
        preorder: chance(0.25),
        prepTime: pick(['same day', '1–2 days', '3 days']),
        outOfStockSince: stock === 0 ? daysAgo(between(1, 12)) : null,
      });
      productCount++;
    }
  }
  console.log(`· ${stores.length} stores, ${productCount} products`);

  /* ---- meals ---- */

  const SLOT_CUTOFF: Record<string, number> = { breakfast: 7, lunch: 10, dinner: 17 };
  const meals: { id: string; kitchenId: string; title: string; price: number; image: string; serveDate: string; slot: string; handover: string }[] = [];

  for (const kitchen of kitchens) {
    const dishes = dishesByKitchen.get(kitchen.id) ?? [];
    if (!dishes.length) continue;

    for (let i = 0; i < between(1, 3); i++) {
      const offset = pick([-2, -1, -1, 0, 0, 1, 1, 2]);
      const serveDay = new Date(Date.now() + offset * DAY);
      const serveDate = dayKey(serveDay);
      const slot = pick(['breakfast', 'lunch', 'dinner']);
      const dish = pick(dishes);

      const [y, m, d] = serveDate.split('-').map(Number);
      // Dhaka is UTC+6 with no DST, so a fixed offset is correct here.
      const deadline = new Date(Date.UTC(y!, m! - 1, d!, SLOT_CUTOFF[slot]! - 6, 0, 0));

      /* Some are deliberately left `published` with the deadline behind them.
         The app has no sweeper, so in production these pile up — the meals
         board is where they get found and closed. */
      const past = offset < 0;
      const meal = await Meal.create({
        code: code('ML'),
        kitchenId: kitchen.id,
        cookName: kitchen.name,
        title: dish.name,
        description: 'Cooked to order for this service, packed the moment it is ready.',
        image: dish.image,
        price: dish.price,
        capacity: between(6, 30),
        serveDate,
        slot,
        deadline,
        handover: chance(0.25) ? 'pickup' : 'delivery',
        area: kitchen.area,
        /*
         * The kitchen's own location and reach, not a fixed point.
         *
         * These were hard-coded to one spot in Dhanmondi with a 5km radius,
         * which meant every meal in the database claimed to be cooked in the
         * same building. The board filters on `distance <= deliveryRadiusKm`,
         * so the effect was not subtle: a customer in Banani measured 7.5km
         * to *every* meal — including the ones cooked in Banani — and the
         * board told them no cook was planning anything near them, while the
         * server was returning thirty-three meals it thought were fine.
         *
         * The meal carries its own copy rather than reading through to the
         * kitchen because a meal is a promise made on a day: a cook who later
         * moves, or narrows how far they will travel, must not silently
         * change the terms of a plate somebody already booked.
         */
        lat: kitchen.lat,
        lng: kitchen.lng,
        deliveryRadiusKm: kitchen.deliveryRadiusKm,
        status: past ? pick(['closed', 'published', 'closed']) : 'published',
      });

      for (const customer of customers.slice(0, between(0, 6))) {
        await MealInterest.create({
          mealId: String(meal._id),
          customerKey: customer.customerKey,
        }).catch(() => {});
      }

      meals.push({
        id: String(meal._id), kitchenId: kitchen.id, title: meal.title, price: meal.price,
        image: meal.image, serveDate, slot, handover: meal.handover,
      });
    }
  }
  console.log(`· ${meals.length} meals`);

  /* ---- orders, and the ledger they imply ---- */

  const ESCROW = ['confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'completed'];
  const spend = new Map<string, { total: number; firstAt: number }>();
  let orderCount = 0;

  const makeOrder = async (spec: {
    kind: 'cod' | 'meal' | 'store';
    kitchenId: string;
    mealId?: string;
    storeId?: string;
    title: string;
    image?: string;
    amount: number;
    subtotal: number;
    deliveryFee?: number;
    platformFee?: number;
    lines?: unknown[];
    status: string;
    handover?: string;
    preorder?: boolean;
    serveDate?: string;
    slot?: string;
    createdAt: Date;
    deliveredAt?: Date | null;
  }) => {
    const customer = pick(customers as never as { customerKey: string; name: string; phone: string; area: string }[]);
    const kitchen = kitchens.find((k) => k.id === spec.kitchenId)!;
    const address = pick(ADDRESSES);
    const handover = spec.handover ?? 'delivery';

    const rail =
      spec.kind === 'cod'
        ? ['placed', 'accepted', 'cooking', 'on_the_way', 'delivered']
        : (spec.preorder ? ['pending'] : []).concat(
            handover === 'pickup'
              ? ['confirmed', 'preparing', 'ready', 'delivered', 'completed']
              : ESCROW,
          );
    const reachedIndex = rail.indexOf(spec.status);
    const reached = reachedIndex >= 0 ? rail.slice(0, reachedIndex + 1) : [spec.status];
    const age = Date.now() - spec.createdAt.getTime();
    const history = reached.map((status, i) => ({
      status,
      at: new Date(spec.createdAt.getTime() + (age / reached.length) * i).toISOString(),
    }));

    const isCod = spec.kind === 'cod';
    const settled = spec.status === 'completed';
    const cancelled = spec.status === 'cancelled' || spec.status === 'rejected';
    const payment = isCod ? 'cod' : settled ? 'released' : cancelled ? 'refunded' : 'held';

    const rate =
      spec.kind === 'meal' ? 0.15 : spec.kind === 'store' ? 0.12 : 0.15;
    const platformAmount = settled ? Math.round(spec.amount * rate) : null;
    const cookAmount = settled ? spec.amount - platformAmount! : null;

    const order = await Order.create({
      code: code('RB'),
      kind: spec.kind,
      mealId: spec.mealId ?? null,
      storeId: spec.storeId ?? null,
      kitchenId: spec.kitchenId,
      cookName: kitchen.name,
      title: spec.title,
      image: spec.image ?? '',
      customerKey: customer.customerKey,
      customerName: customer.name,
      phone: customer.phone,
      address: { ...address, area: `${customer.area}, Dhaka` },
      handover,
      serveDate: spec.serveDate ?? null,
      slot: spec.slot ?? null,
      lines: spec.lines ?? [],
      subtotal: spec.subtotal,
      deliveryFee: spec.deliveryFee ?? 0,
      platformFee: spec.platformFee ?? 0,
      price: spec.amount,
      amount: spec.amount,
      preorder: spec.preorder ?? false,
      status: spec.status,
      payment,
      cookAmount,
      platformAmount,
      history,
      deliveredAt: spec.deliveredAt ?? null,
      completedAt: settled ? (spec.deliveredAt ?? spec.createdAt) : null,
      createdAt: spec.createdAt,
    });
    orderCount++;

    if (!isCod) {
      const seen = spend.get(customer.customerKey);
      spend.set(customer.customerKey, {
        total: (seen?.total ?? 0) + spec.amount,
        firstAt: Math.min(seen?.firstAt ?? Infinity, spec.createdAt.getTime()),
      });

      await tx(async (session) => {
        await post(session, {
          kind: 'hold',
          amount: spec.amount,
          from: 'customer',
          to: 'held',
          fromRef: customer.customerKey,
          orderId: String(order._id),
          idemKey: `hold:${String(order._id)}`,
          note: `Held for ${spec.title}`,
        });

        if (settled) {
          await post(session, {
            kind: 'release',
            amount: cookAmount!,
            from: 'held',
            to: 'cook',
            toRef: spec.kitchenId,
            orderId: String(order._id),
            idemKey: `release:${String(order._id)}`,
            note: `Released for ${spec.title}`,
          });
          if (platformAmount! > 0) {
            await post(session, {
              kind: 'commission',
              amount: platformAmount!,
              from: 'held',
              to: 'platform',
              orderId: String(order._id),
              idemKey: `commission:${String(order._id)}`,
              note: `Commission on ${spec.title}`,
            });
          }
        } else if (cancelled) {
          await post(session, {
            kind: 'refund',
            amount: spec.amount,
            from: 'held',
            to: 'customer',
            toRef: customer.customerKey,
            orderId: String(order._id),
            idemKey: `refund:${String(order._id)}`,
            note: `Refund for ${spec.title}`,
          });
        }
      });
    }

    return order;
  };

  // COD — the legacy rail.
  for (let i = 0; i < 130; i++) {
    const kitchen = pick(kitchens);
    const dishes = dishesByKitchen.get(kitchen.id) ?? [];
    if (!dishes.length) continue;
    const line = pick(dishes);
    const qty = between(1, 3);
    const subtotal = line.price * qty;
    const createdAt = daysAgo(between(0, 25));
    const status = pick(['placed', 'accepted', 'cooking', 'on_the_way', 'delivered', 'delivered', 'cancelled', 'rejected']);
    await makeOrder({
      kind: 'cod',
      kitchenId: kitchen.id,
      title: line.name,
      image: line.image,
      subtotal,
      deliveryFee: 40,
      platformFee: 10,
      amount: subtotal + 50,
      lines: [{ id: line.id, name: line.name, price: line.price, qty, image: line.image }],
      status,
      createdAt,
      deliveredAt: status === 'delivered' ? new Date(createdAt.getTime() + 3600_000) : null,
    });
  }

  // Meals — escrow.
  for (const meal of meals) {
    for (let i = 0; i < between(0, 9); i++) {
      const createdAt = daysAgo(between(0, 6));
      const status = pick([...ESCROW, 'completed', 'completed', 'delivered', 'cancelled']);
      await makeOrder({
        kind: 'meal',
        kitchenId: meal.kitchenId,
        mealId: meal.id,
        title: meal.title,
        image: meal.image,
        subtotal: meal.price,
        amount: meal.price,
        status,
        handover: meal.handover,
        serveDate: meal.serveDate,
        slot: meal.slot,
        createdAt,
        deliveredAt: ['delivered', 'completed'].includes(status)
          ? new Date(createdAt.getTime() + between(2, 20) * 3600_000)
          : null,
      });
    }
  }

  // Store orders, including pre-orders still waiting on a cook.
  const allProducts = await Product.find({ active: true }).lean();
  for (let i = 0; i < 130; i++) {
    const product = pick(allProducts);
    const store = stores.find((s) => s.id === product.storeId);
    if (!store) continue;
    const qty = between(1, 3);
    const subtotal = product.price * qty;
    const fee = pick([0, 40, 50]);
    const createdAt = daysAgo(between(0, 20));
    const preorder = product.preorder && chance(0.6);
    const status = preorder
      ? pick(['pending', 'pending', 'confirmed', 'completed'])
      : pick([...ESCROW, 'completed', 'completed', 'delivered', 'cancelled']);

    await makeOrder({
      kind: 'store',
      kitchenId: store.kitchenId,
      storeId: store.id,
      title: product.name,
      subtotal,
      deliveryFee: fee,
      amount: subtotal + fee,
      lines: [{ id: String(product._id), name: product.name, price: product.price, qty, lineTotal: subtotal }],
      status,
      preorder,
      createdAt,
      deliveredAt: ['delivered', 'completed'].includes(status)
        ? new Date(createdAt.getTime() + between(4, 40) * 3600_000)
        : null,
    });
  }
  console.log(`· ${orderCount} orders`);

  /* ---- top-ups, sized to cover what was spent ---- */

  let topUpCount = 0;
  for (const customer of customers) {
    const spent = spend.get(customer.customerKey);
    let remaining = (spent?.total ?? 0) + between(200, 1500);
    const firstAt = spent?.firstAt ?? Date.now() - 30 * DAY;
    let round = 0;

    while (remaining > 0 && round < 20) {
      const amount = Math.min(
        Math.max(500, Math.ceil(remaining / 500) * 500),
        pick([1000, 2000, 3000, 5000]),
      );
      const at = new Date(firstAt - (round + 1) * between(1, 3) * DAY);
      /* A few have no PSP reference behind them. In the app that is *every*
         top-up — `topUp(amount, 'bKash')` credits the wallet with nothing
         behind it. These are the orphans reconciliation exists to catch. */
      const orphan = chance(0.15);

      await tx((session) =>
        post(session, {
          kind: 'topup',
          amount,
          // `external` is not a folded account, which is what makes this read
          // as money arriving rather than a transfer that nets to nothing.
          from: 'external',
          to: 'customer',
          toRef: customer.customerKey,
          note: 'Wallet top-up via bKash',
        }),
      );

      await TopUp.create({
        customerKey: customer.customerKey,
        amount,
        method: 'bKash',
        reconciled: orphan ? 'orphan' : 'matched',
        pspRef: orphan ? null : `BKS${between(100000, 999999)}`,
        pspAmount: orphan ? null : amount,
        at,
      });

      topUpCount++;
      remaining -= amount;
      round++;
    }
  }
  console.log(`· ${await LedgerEntry.countDocuments()} ledger entries, ${topUpCount} top-ups`);

  /* ---- food requests, offers, and real negotiations ---- */

  const WANTS: readonly (readonly [string, string, number, string])[] = [
    ['Two-pound chocolate truffle cake', 'Birthday on Friday evening. Dark chocolate, not too sweet, "Happy Birthday Ammu" on top.', 2400, 'cake'],
    ['Iftar platter for 20 people', 'Office iftar. Piyaju, beguni, chola, jilapi, dates and lemon sharbat.', 6000, 'iftar'],
    ['Homemade nokshi pitha, 3 dozen', 'For a family gathering. The patterned kind, not the plain ones.', 1800, 'pitha'],
    ['Sugar-free sandesh for a diabetic', 'My father cannot have sugar. Nolen gur is fine if it is unsweetened otherwise.', 900, 'sweet'],
    ['Beef tehari for 15, office lunch', 'Needs to arrive by 1pm sharp on Thursday, packed individually.', 4500, 'biryani'],
    ['Aam er achar, 2kg, no oil floating', 'The way my grandmother made it. Ready within two weeks is fine.', 1200, 'achar'],
    ['Eid gift boxes, 10 sets', 'Sweets and dry snacks, wrapped. Something presentable for colleagues.', 5000, 'gift'],
    ['Shorshe ilish for six', 'Proper hilsa, mustard paste, not a curry with fish in it.', 3200, 'seafood'],
    ['Mezban beef for 30, Chittagong style', 'Family reunion. It has to be the real thing, not a Dhaka approximation.', 9000, 'meat'],
    ['Diabetic-friendly lunch, daily for a month', 'My mother, low carb, low oil. Delivered by noon each weekday.', 12000, 'healthy'],
    ['Kacchi biryani for 50, wedding', 'Gaye holud lunch. Basmati, mutton, proper alu, borhani on the side.', 22000, 'biryani'],
    ['Bhapa pitha and chitoi, winter box', 'Twenty of each, with kheer and gur separately.', 1600, 'pitha'],
  ];

  const OFFER_NOTES = [
    'I can do this. I make it every week.',
    'Happy to cook it — I would need a day of notice.',
    'This is my speciality. Free delivery if you are within 3km.',
    'Can do, but I would use a slightly different cut.',
    'Yes. I can deliver by the time you need it.',
    'I have done this exact order before. Photos if you want them.',
  ];

  let offerCount = 0;
  let negotiationCount = 0;

  for (const [index, [title, description, budget, category]] of WANTS.entries()) {
    const customer = pick(customers as never as { customerKey: string; area: string }[]);
    const broadcast = index % 5 !== 3;

    /* One broadcast is deliberately left reaching nobody — every eligible
       kitchen was shut or out of range. That empty `eligible` array is a
       coverage bug, and the requests board is where it becomes visible. */
    const deadReach = index === 6;
    const eligible = deadReach
      ? []
      : broadcast
        ? kitchens.filter(() => chance(0.4)).map((k) => k.id)
        : [kitchens[index % kitchens.length]!.id];

    const createdAt = daysAgo(between(0, 10));
    const request = await Request.create({
      code: code('RQ'),
      customerKey: customer.customerKey,
      title,
      description,
      quantity: 1,
      budget,
      target: broadcast ? 'all' : kitchens[index % kitchens.length]!.id,
      eligible,
      wantedFor: dayKey(new Date(Date.now() + between(1, 8) * DAY)),
      category,
      area: customer.area,
      status: 'open',
      createdAt,
    });

    const responders = eligible.slice(0, between(0, Math.min(5, eligible.length)));
    const made: { id: string; kitchenId: string; price: number | null }[] = [];

    for (const kitchenId of responders) {
      const kitchen = kitchens.find((k) => k.id === kitchenId)!;
      const priced = chance(0.8);
      const price = priced ? Math.round(budget * (0.75 + rnd() * 0.5)) : null;
      const at = new Date(createdAt.getTime() + between(10, 600) * 60_000);

      const offer = await Offer.create({
        requestId: String(request._id),
        kitchenId,
        cookName: kitchen.name,
        status: priced ? 'priced' : 'interested',
        price,
        note: pick(OFFER_NOTES),
        prepTime: pick(['same day', '1 day', '2 days']),
        /* Every price either side names is appended with who said it. Nothing
           is ever overwritten — whose turn it is falls out of this, so it
           cannot disagree with it. */
        history: price ? [{ by: 'cook', amount: price, at: at.toISOString() }] : [],
        createdAt: at,
      });
      made.push({ id: String(offer._id), kitchenId, price });
      offerCount++;
    }

    /* Push some through selection and haggling, so the negotiation view has a
       real back-and-forth to render rather than a single price. */
    const priced = made.filter((o) => o.price != null);
    if (priced.length && index % 3 === 0) {
      const chosen = priced[0]!;
      const first = chosen.price!;
      const counter = Math.round(first * 0.88);
      const settled = Math.round((first + counter) / 2);
      const t0 = new Date(createdAt.getTime() + 2 * 3600_000);

      const agreed = index % 6 === 0;
      const history = [
        { by: 'cook', amount: first, at: new Date(t0.getTime() - 3600_000).toISOString() },
        { by: 'customer', amount: counter, at: t0.toISOString() },
        ...(agreed
          ? [{ by: 'cook', amount: settled, at: new Date(t0.getTime() + 1800_000).toISOString() }]
          : []),
      ];

      await Offer.updateOne(
        { _id: chosen.id },
        {
          status: agreed ? 'agreed' : 'negotiating',
          agreedPrice: agreed ? settled : null,
          history,
        },
      );
      await Offer.updateMany(
        { requestId: String(request._id), _id: { $ne: chosen.id } },
        { status: 'not-selected' },
      );
      await Request.updateOne(
        { _id: request._id },
        { status: agreed ? 'agreed' : 'selected', selectedOfferId: chosen.id },
      );
      negotiationCount++;

      // One agreed request goes all the way through to a paid order.
      if (agreed && index === 0) {
        const order = await makeOrder({
          kind: 'meal',
          kitchenId: chosen.kitchenId,
          title,
          subtotal: settled,
          amount: settled,
          status: 'preparing',
          createdAt: new Date(t0.getTime() + 7200_000),
        });
        await Order.updateOne({ _id: order._id }, { kind: 'request', requestId: String(request._id) });
        await Request.updateOne(
          { _id: request._id },
          { status: 'ordered', orderId: String(order._id) },
        );
      }
    }
  }
  console.log(`· ${WANTS.length} requests, ${offerCount} offers, ${negotiationCount} negotiations`);

  /* ---- chat ---- */

  const SUPPORT_OPENERS = [
    ['Where is my order?', ['My order said delivered an hour ago but nothing arrived.', 'I waited outside for twenty minutes.']],
    ['Wrong item delivered', ['I ordered mutton bhuna and got beef curry.', 'The packing slip says mutton.']],
    ['Refund not received', ['You cancelled my order on Tuesday and the money is still not in my wallet.']],
    ['Cannot mark my kitchen open', ['The toggle flips back to closed every time. Android, latest build.']],
    ['Payout question', ['I was paid 4,200 but my earnings page said 4,850. Where did the rest go?']],
  ] as const;

  const SUPPORT_REPLIES = [
    'Looking into it now — give me two minutes.',
    'I can see the rider marked it delivered at the gate. Refunding you now.',
    'Thank you for the photos, that is clearly the wrong dish. Sorted.',
    'That is the platform commission — the breakdown is on your earnings page.',
  ];

  let threadCount = 0;
  let messageCount = 0;

  for (const [index, [subject, lines]] of SUPPORT_OPENERS.entries()) {
    const customer = pick(customers as never as { customerKey: string; name: string }[]);
    const openedAt = daysAgo(between(0, 6));

    const thread = await ChatThread.create({
      code: code('CH'),
      kind: 'support',
      customerKey: customer.customerKey,
      kitchenId: null,
      openedBy: 'customer',
      subject,
      status: index === 4 ? 'closed' : 'open',
      closedAt: index === 4 ? daysAgo(1) : null,
      closedBy: index === 4 ? 'support@rannabari.app' : null,
      lastMessageAt: openedAt,
      createdAt: openedAt,
    });
    threadCount++;

    const messages: { senderType: string; senderRef: string | null; senderName: string; body: string; at: Date }[] = [];
    for (const [i, line] of lines.entries()) {
      messages.push({
        senderType: 'customer',
        senderRef: customer.customerKey,
        senderName: customer.name,
        body: line,
        at: new Date(openedAt.getTime() + i * 60_000),
      });
    }
    // The desk answers all but one, so the inbox opens with work in it.
    if (index !== 2) {
      messages.push({
        senderType: 'admin',
        senderRef: 'support@rannabari.app',
        senderName: 'Sadia Noor',
        body: pick(SUPPORT_REPLIES),
        at: new Date(openedAt.getTime() + 15 * 60_000),
      });
    }

    for (const [i, m] of messages.entries()) {
      await ChatMessage.create({
        threadId: String(thread._id),
        senderType: m.senderType,
        senderRef: m.senderRef,
        senderName: m.senderName,
        body: m.body,
        clientId: `seed:${String(thread._id)}:${i}`,
        sentAt: m.at,
        readByCustomerAt: m.senderType === 'customer' ? m.at : null,
        readByAdminAt: m.senderType === 'admin' ? m.at : null,
      });
      messageCount++;
    }

    const last = messages[messages.length - 1]!;
    await ChatThread.updateOne(
      { _id: thread._id },
      {
        lastMessageAt: last.at,
        lastMessageBody: last.body.slice(0, 140),
        lastMessageFrom: last.senderType,
        unreadAdmin: last.senderType === 'customer' ? 1 : 0,
        unreadCustomer: last.senderType === 'admin' ? 1 : 0,
      },
    );
  }

  /* A few order threads, so the desk sees cook↔customer conversations too. */
  const chatty = await Order.find({ status: { $in: ['preparing', 'delivering', 'delivered'] } }).limit(6);
  for (const order of chatty) {
    const thread = await ChatThread.create({
      code: code('CH'),
      kind: 'order',
      orderId: String(order._id),
      customerKey: order.customerKey,
      kitchenId: order.kitchenId,
      openedBy: 'customer',
      subject: `${order.code} · ${order.title}`,
      lastMessageAt: order.createdAt,
      createdAt: order.createdAt,
    });
    threadCount++;

    const exchange = [
      ['customer', order.customerKey, order.customerName, 'Could you make it less spicy please?'],
      ['cook', order.kitchenId, order.cookName, 'No problem, mild it is. Going on now.'],
    ] as const;

    for (const [i, [side, ref, name, body]] of exchange.entries()) {
      const at = new Date(order.createdAt.getTime() + (i + 1) * 300_000);
      await ChatMessage.create({
        threadId: String(thread._id),
        senderType: side,
        senderRef: ref,
        senderName: name,
        body,
        clientId: `seed:${String(thread._id)}:${i}`,
        sentAt: at,
      });
      messageCount++;
      await ChatThread.updateOne(
        { _id: thread._id },
        { lastMessageAt: at, lastMessageBody: body, lastMessageFrom: side },
      );
    }
  }
  console.log(`· ${threadCount} chat threads, ${messageCount} messages`);

  /* ---- one paid payout run, so the ledger has money leaving ---- */

  const { cookBalances } = await import('../src/logic/ledger.js');
  const owed = (await cookBalances()).filter((row) => row.amount >= DEFAULT_SETTINGS.payoutMinimum);

  /* Half of what is owed, so the payouts page still has work in it. A seed
     that pays everybody leaves an empty screen. */
  const paying = owed.slice(0, Math.ceil(owed.length / 2));

  if (paying.length) {
    const kitchenNames = new Map(kitchens.map((k) => [k.id, k.name]));
    const total = paying.reduce((sum, row) => sum + row.amount, 0);

    const run = await PayoutRun.create({
      code: code('PR'),
      status: 'paid',
      method: 'bKash',
      total,
      cookCount: paying.length,
      createdBy: 'finance@rannabari.app',
      paidAt: daysAgo(2),
      paidBy: 'finance@rannabari.app',
    });

    for (const row of paying) {
      await PayoutItem.create({
        payoutRunId: String(run._id),
        kitchenId: row.kitchenId,
        kitchenName: kitchenNames.get(row.kitchenId) ?? row.kitchenId,
        amount: row.amount,
      });
      /* `cook` → `external`: the money has left the platform. reconcile()
         accounts for this as `expected.cook = releases - payouts`. */
      await tx((session) =>
        post(session, {
          kind: 'payout',
          amount: row.amount,
          from: 'cook',
          to: 'external',
          fromRef: row.kitchenId,
          payoutRunId: String(run._id),
          idemKey: `payout:${String(run._id)}:${row.kitchenId}`,
          note: `Payout ${run.code} via bKash`,
        }),
      );
    }
    console.log(`· 1 payout run — ${paying.length} cooks, ${total} taka`);
  }

  /* ---- notifications ---- */

  const NOTICES: readonly (readonly ['customer' | 'cook', string, string, string])[] = [
    ['customer', 'order-completed', 'Payment released', 'Your payment has gone to the kitchen.'],
    ['customer', 'confirm-receipt', 'Did your food arrive?', 'Confirm you received it to complete the order.'],
    ['customer', 'meal-published', 'New meal near you', 'Shorshe Ilish from Fatema B. — 520 taka.'],
    ['customer', 'refund', 'Refunded', 'The money is back in your wallet.'],
    ['cook', 'order-confirmed', 'New confirmed order', 'A customer confirmed a meal. Prepare 2.'],
    ['cook', 'request-new', 'New food request', 'Somebody is looking for a birthday cake. Name your price.'],
    ['cook', 'preorder-new', 'New pre-order request', 'Accept or decline within a day.'],
    ['cook', 'payment-released', 'You have been paid', 'Your earnings have been sent via bKash.'],
  ];

  let noticeCount = 0;
  for (const [audience, kind, title, body] of NOTICES) {
    for (let i = 0; i < between(2, 5); i++) {
      await Notification.create({
        key: `${audience}:${kind}:${code('N')}`,
        audience,
        kind,
        title,
        body,
        read: chance(0.5),
        at: daysAgo(between(0, 10)),
      });
      noticeCount++;
    }
  }
  console.log(`· ${noticeCount} notifications`);

  /* ---- deliberately unhealthy rows ---- */

  /* Push some delivered orders back past the release window. Held money that
     nobody is chasing is the worst state in the system, and the ageing board
     only proves it works if there is something aged in it. */
  const delivered = await Order.find({ status: 'delivered', payment: 'held' }).limit(6);
  for (const [i, order] of delivered.entries()) {
    await Order.updateOne({ _id: order._id }, { deliveredAt: daysAgo(2 + i * 2) });
  }

  const disputable = await Order.findOne({
    payment: 'held',
    status: { $in: ['delivering', 'delivered'] },
  });
  if (disputable) {
    await Dispute.create({
      code: code('DP'),
      orderId: String(disputable._id),
      status: 'investigating',
      openedBy: 'customer',
      reason: 'Two of the four boxes arrived cold and one was the wrong dish.',
      notes: [
        { at: daysAgo(1).toISOString(), by: 'support@rannabari.app', text: 'Customer sent photos. The wrong dish is confirmed.' },
        { at: daysAgo(0).toISOString(), by: 'ops@rannabari.app', text: 'Cook says the rider took the wrong bag. Suggest a partial refund.' },
      ],
    });
  }

  const books = await (await import('../src/logic/ledger.js')).reconcile();
  const drift = Object.values(books.drift).reduce((s, v) => s + Math.abs(v), 0);

  console.log('\n  Seed complete.');
  console.log(`  balances: ${JSON.stringify(books.balances)}`);
  console.log(`  drift: ${drift === 0 ? 'none — the books balance' : drift}`);
  console.log(`  sign in: ${adminEmail} / ${adminPassword}\n`);

  await disconnect();
}

/* Only self-run when this file is the entry point. When it is imported — by
   `seed-local.ts`, or by a test — the caller awaits `seed()` instead. Running
   on import means the importer cannot await it, and a runner that tears down
   its database on a timer then kills the seed halfway through. */
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  seed().catch(async (error) => {
    console.error(error);
    await disconnect();
    process.exit(1);
  });
}
