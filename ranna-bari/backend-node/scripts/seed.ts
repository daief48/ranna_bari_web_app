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
const APP_DATA = join(HERE, '..', '..', 'User and Cook App', 'src', 'data');

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
  JSON.parse(readFileSync(join(APP_DATA, file), 'utf8')) as T;

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

const CUSTOMERS = [
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

  const kitchens: { id: string; legacyId: number; name: string; area: string }[] = [];
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
  const GOODS: [string, number, string][] = [
    ['Aam er achar (500g)', 320, 'Sun-cured green mango pickle, mustard oil, no preservative.'],
    ['Boroi er achar (400g)', 280, 'Sweet-sour jujube pickle, the way it is made at home.'],
    ['Frozen beef samosa (12)', 420, 'Hand-folded, freeze them flat and fry from frozen.'],
    ['Nolen gur sandesh (8)', 480, 'Date-palm jaggery, made the week the gur arrives.'],
    ['Garam masala (100g)', 260, 'Whole spices, roasted and ground to order.'],
    ['Nokshi pitha box (6)', 400, 'Patterned rice cakes, made for the winter season.'],
  ];

  let productCount = 0;
  const stores: { id: string; kitchenId: string }[] = [];

  for (const kitchen of kitchens.slice(0, 11)) {
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

    for (let i = 0; i < between(3, 6); i++) {
      const [name, price, description] = GOODS[(productCount + i) % GOODS.length]!;
      /* A handful land at zero stock while still active — exactly the row the
         stock alarm exists to surface, and it has to exist to test. */
      const stock = chance(0.22) ? 0 : between(3, 60);
      await Product.create({
        storeId: String(store._id),
        categoryId: String(pick(shelves)._id),
        name,
        description,
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
        lat: 23.75,
        lng: 90.38,
        deliveryRadiusKm: 5,
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
  for (let i = 0; i < 40; i++) {
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
    for (let i = 0; i < between(0, 5); i++) {
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
  for (let i = 0; i < 40; i++) {
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
