/**
 * Seed the panel from the app's own bundled data.
 *
 * `chefs.json`, `menus.json` and `reviews.json` are read straight out of
 * `../User and Cook App/src/data`, so the kitchens, dishes and reviews here
 * are the exact records the mobile app ships with — same ids, same names,
 * same coordinates.
 *
 * On top of that it fabricates the half of the system the app can never
 * produce on one device: many customers, a few hundred orders across all four
 * systems, the ledger those orders imply, live requests with competing
 * offers, and a set of deliberately unhealthy rows — escrow that has aged
 * past its release window, a stuck pre-order, an orphan top-up, a broadcast
 * that reached nobody. An operator console with nothing wrong in it teaches
 * you nothing about whether it works.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';

const db = new PrismaClient();

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
  ecoBadge: string;
  isVerified: boolean;
  area: string;
  lat: number;
  lng: number;
  deliveryRadiusKm: number;
  isOpen: boolean;
};
type MenuDoc = { chefId: number; items: Dish[] };
type Dish = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  tags: string[];
};
type ReviewDoc = {
  id: number;
  chefId: number;
  name: string;
  avatar: string;
  area: string;
  date: string;
  rating: number;
  text: string;
};

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(join(APP_DATA, file), 'utf8')) as T;

/* ------------------------------------------------------------------ *
 * deterministic randomness
 * ------------------------------------------------------------------ */

/**
 * A seeded PRNG, so re-seeding produces the same database.
 *
 * A demo whose numbers move every run makes it impossible to tell a fixed bug
 * from a different random draw.
 */
let rngState = 42;
const rnd = () => {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
};
const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)];
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
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};

/* ------------------------------------------------------------------ *
 * people
 * ------------------------------------------------------------------ */

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

const customerKeyOf = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;

const ADDRESSES = [
  { label: 'Home', line: 'House 41, Road 9/A, Flat 2C', instructions: 'Ring the bell twice, the gate bell is broken.' },
  { label: 'Office', line: 'Level 6, Rangs Babylonia, Bijoy Sarani', instructions: '' },
  { label: 'Home', line: 'House 7, Road 3, Shukrabad', instructions: 'Leave with the guard if nobody answers.' },
  { label: 'Home', line: 'Apt 5B, 22 Green Road', instructions: '' },
  { label: 'Office', line: 'Suite 402, Concord Tower', instructions: 'Reception will call up.' },
];

const ZONE_NAMES = [
  'Dhanmondi', 'Mohammadpur', 'Old Dhaka', 'Mirpur', 'Uttara', 'Banani',
  'Gulshan', 'Bashundhara', 'Motijheel', 'Tejgaon', 'Khilgaon', 'Badda',
  'Rampura', 'Banasree', 'Baridhara', 'Shyamoli', 'Lalmatia', 'Farmgate',
];

const TAXONOMY = [
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

const SETTINGS: Record<string, number> = {
  deliveryFee: 40,
  platformFee: 10,
  commissionCod: 0.15,
  commissionMeal: 0.15,
  commissionStore: 0.12,
  commissionRequest: 0.1,
  escrowAutoReleaseDays: 3,
  stockAlarmDays: 3,
  requestExpiryDays: 1,
  payoutMinimum: 100,
};

const FLAGS = [
  ['system.cod', 'Cash-on-delivery ordering', true],
  ['system.meals', 'Pre-booked meals', true],
  ['system.stores', 'Cook stores', true],
  ['system.requests', 'Food requests and bidding', true],
  ['system.topup', 'Wallet top-ups', true],
  ['signup.cook', 'New cook signups', true],
] as const;

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

async function main() {
  console.log('· clearing');
  // Order matters: children before parents, and the append-only triggers are
  // installed after the wipe so they do not block it.
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS ledger_no_update');
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS ledger_no_delete');
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_no_update');
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_no_delete');

  await db.payoutItem.deleteMany();
  await db.ledgerEntry.deleteMany();
  await db.payoutRun.deleteMany();
  await db.dispute.deleteMany();
  await db.order.deleteMany();
  await db.offer.deleteMany();
  await db.request.deleteMany();
  await db.product.deleteMany();
  await db.storeCategory.deleteMany();
  await db.store.deleteMany();
  await db.meal.deleteMany();
  await db.review.deleteMany();
  await db.dish.deleteMany();
  await db.kitchen.deleteMany();
  await db.account.deleteMany();
  await db.topUp.deleteMany();
  await db.notification.deleteMany();
  await db.taxonomyCategory.deleteMany();
  await db.zone.deleteMany();
  await db.setting.deleteMany();
  await db.featureFlag.deleteMany();
  await db.auditLog.deleteMany();
  await db.adminUser.deleteMany();

  /* ---------------- operators ---------------- */

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@rannabari.app';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'rannabari';

  await db.adminUser.createMany({
    data: [
      { email: adminEmail, name: 'Platform Owner', role: 'superadmin', passwordHash: hashPassword(adminPassword) },
      { email: 'ops@rannabari.app', name: 'Rumana Haque', role: 'ops', passwordHash: hashPassword(adminPassword) },
      { email: 'finance@rannabari.app', name: 'Kamrul Hasan', role: 'finance', passwordHash: hashPassword(adminPassword) },
      { email: 'support@rannabari.app', name: 'Sadia Noor', role: 'support', passwordHash: hashPassword(adminPassword) },
    ],
  });
  console.log(`· 4 operators (sign in as ${adminEmail} / ${adminPassword})`);

  /* ---------------- configuration ---------------- */

  await db.setting.createMany({
    data: Object.entries(SETTINGS).map(([key, value]) => ({ key, value: JSON.stringify(value) })),
  });
  await db.featureFlag.createMany({
    data: FLAGS.map(([key, description, enabled]) => ({ key, description, enabled })),
  });
  await db.zone.createMany({
    data: ZONE_NAMES.map((name, i) => ({ name, order: i, active: i < 15 })),
  });
  await db.taxonomyCategory.createMany({
    data: TAXONOMY.map(([key, label, emoji], i) => ({ key, label, emoji, order: i })),
  });
  console.log(`· settings, ${FLAGS.length} flags, ${ZONE_NAMES.length} zones, ${TAXONOMY.length} categories`);

  /* ---------------- customers ---------------- */

  const customers = await Promise.all(
    CUSTOMERS.map(([name, phone, area]) =>
      db.account.create({
        data: {
          customerKey: customerKeyOf(name),
          role: 'user',
          name,
          phone,
          email: customerKeyOf(name),
          area,
          addressLabel: 'Home',
          createdAt: daysAgo(between(30, 120)),
        },
      }),
    ),
  );
  console.log(`· ${customers.length} customers`);

  /* ---------------- kitchens, from the app's own data ---------------- */

  const chefs = readJson<Chef[]>('chefs.json');
  const menus = readJson<MenuDoc[]>('menus.json');
  const reviews = readJson<ReviewDoc[]>('reviews.json');

  const kitchens: { id: string; name: string; area: string; chefId: number }[] = [];
  const dishesByKitchen = new Map<string, { id: string; name: string; price: number; image: string }[]>();

  for (const chef of chefs) {
    const ownerName = chef.name;
    const account = await db.account.create({
      data: {
        customerKey: `cook.${chef.id}@rannabari.app`,
        role: 'cook',
        name: ownerName,
        phone: `+88017${String(10000000 + chef.id * 137).slice(0, 8)}`,
        email: `cook.${chef.id}@rannabari.app`,
        kitchenName: `${chef.name.split(' ')[0]}'s Kitchen`,
        specialty: chef.specialty,
        // Collected at signup and, in the app, never looked at by anyone.
        nid: `19${between(70, 99)}${between(1000000, 9999999)}`,
        area: chef.area,
        lat: chef.lat,
        lng: chef.lng,
        deliveryRadiusKm: chef.deliveryRadiusKm,
        avatar: chef.avatar,
        createdAt: daysAgo(between(20, 200)),
      },
    });

    /* The app's `isVerified` is the badge; `kycStatus` is the decision behind
       it. Seeded consistently — a verified kitchen has an approved file — and
       the three unverified ones are left pending so the KYC queue opens with
       real work in it. */
    const verified = chef.isVerified;
    const kitchen = await db.kitchen.create({
      data: {
        accountId: account.id,
        name: `${chef.name.split(' ')[0]}'s Kitchen`,
        ownerName,
        avatar: chef.avatar,
        coverImage: chef.coverImage,
        specialty: chef.specialty,
        description: chef.description,
        rating: chef.rating,
        reviewCount: chef.reviewCount,
        tags: JSON.stringify(chef.tags ?? []),
        /* Five of the twenty kitchens carry no eco badge in chefs.json. The
           column is not nullable, so the default stands in rather than
           writing a null the app would have to branch on. */
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
        createdAt: account.createdAt,
      },
    });

    kitchens.push({ id: kitchen.id, name: kitchen.name, area: kitchen.area, chefId: chef.id });

    const menu = menus.find((m) => m.chefId === chef.id);
    const made: { id: string; name: string; price: number; image: string }[] = [];
    for (const item of menu?.items ?? []) {
      const dish = await db.dish.create({
        data: {
          kitchenId: kitchen.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image: item.image,
          tags: JSON.stringify(item.tags ?? []),
          available: chance(0.85),
        },
      });
      made.push({ id: dish.id, name: dish.name, price: dish.price, image: dish.image });
    }
    dishesByKitchen.set(kitchen.id, made);
    await db.kitchen.update({
      where: { id: kitchen.id },
      data: { nextDishSeq: made.length + 1 },
    });
  }
  console.log(`· ${kitchens.length} kitchens, ${[...dishesByKitchen.values()].flat().length} dishes`);

  /* ---------------- reviews ---------------- */

  const byChefId = new Map(kitchens.map((k) => [k.chefId, k.id]));
  for (const review of reviews) {
    const kitchenId = byChefId.get(review.chefId);
    if (!kitchenId) continue;
    await db.review.create({
      data: {
        kitchenId,
        name: review.name,
        avatar: review.avatar,
        area: review.area,
        rating: review.rating,
        text: review.text,
        date: review.date,
        customerKey: customerKeyOf(review.name),
        createdAt: new Date(review.date),
      },
    });
  }
  // Two reviews that need a moderator to look at them.
  await db.review.create({
    data: {
      kitchenId: kitchens[4].id,
      name: 'Anon',
      area: 'Mirpur',
      rating: 1,
      text: 'WORST kitchen call me 01700000000 for cheaper catering, better deal!!',
      date: dayKey(daysAgo(2)),
      customerKey: 'anon@example.com',
      createdAt: daysAgo(2),
    },
  });
  await db.review.create({
    data: {
      kitchenId: kitchens[7].id,
      name: 'Rakib',
      area: 'Banani',
      rating: 1,
      text: 'Never ordered from here. Wrong kitchen, my review was for someone else.',
      date: dayKey(daysAgo(5)),
      customerKey: 'rakib@example.com',
      createdAt: daysAgo(5),
    },
  });
  console.log(`· ${reviews.length + 2} reviews (2 awaiting moderation)`);

  /* ---------------- stores and products ---------------- */

  const SHELVES = [
    ['Pickles & achar', '🫙'], ['Frozen', '🧊'], ['Sweets', '🍮'],
    ['Spice mixes', '🌶'], ['Bakery', '🍞'],
  ];
  const GOODS = [
    ['Aam er achar (500g)', 320, 'Sun-cured green mango pickle, mustard oil, no preservative.'],
    ['Boroi er achar (400g)', 280, 'Sweet-sour jujube pickle, the way it is made at home.'],
    ['Frozen beef samosa (12)', 420, 'Hand-folded, freeze them flat and fry from frozen.'],
    ['Frozen shingara (10)', 350, 'Potato and peanut filling, classic Dhaka corner-shop shape.'],
    ['Nolen gur sandesh (8)', 480, 'Date-palm jaggery, made the week the gur arrives.'],
    ['Kacha golla (500g)', 550, 'Natore style, soft-set, eaten within two days.'],
    ['Garam masala (100g)', 260, 'Whole spices, roasted and ground to order.'],
    ['Panch phoron (200g)', 180, 'Five-seed Bengali tempering blend.'],
    ['Nokshi pitha box (6)', 400, 'Patterned rice cakes, made for the winter season.'],
    ['Butter naan (6)', 220, 'Par-baked, finish in a hot pan for two minutes.'],
  ];

  let productCount = 0;
  const storeIds: { id: string; kitchenId: string; name: string }[] = [];

  for (const kitchen of kitchens.slice(0, 11)) {
    const store = await db.store.create({
      data: {
        kitchenId: kitchen.id,
        name: `${kitchen.name.replace(" Kitchen", '')} Pantry`,
        tagline: 'Made in the kitchen, sold off the shelf.',
        description: 'Jars, frozen things and sweets from the same kitchen that cooks your dinner.',
        phone: `+88018${String(20000000 + storeIds.length * 971).slice(0, 8)}`,
        area: kitchen.area,
        deliveryFee: pick([0, 40, 50, 60]),
        freeDeliveryOver: chance(0.5) ? pick([500, 800, 1000]) : null,
        isOpen: chance(0.7),
        createdAt: daysAgo(between(10, 90)),
      },
    });
    storeIds.push({ id: store.id, kitchenId: kitchen.id, name: store.name });

    const shelves = [];
    for (const [index, [name, emoji]] of SHELVES.slice(0, between(2, 5)).entries()) {
      shelves.push(
        await db.storeCategory.create({
          data: { storeId: store.id, name, emoji, order: index },
        }),
      );
    }

    for (let i = 0; i < between(3, 7); i++) {
      const [name, price, description] = GOODS[(productCount + i) % GOODS.length];
      /* A handful land at zero stock while still active — that is exactly the
         row the stock alarm exists to surface, and it has to exist to test. */
      const stock = chance(0.22) ? 0 : between(3, 60);
      await db.product.create({
        data: {
          storeId: store.id,
          categoryId: pick(shelves).id,
          name: name as string,
          description: description as string,
          images: JSON.stringify([]),
          price: price as number,
          stock,
          minQty: 1,
          maxQty: chance(0.3) ? between(3, 10) : null,
          active: chance(0.9),
          preorder: chance(0.25),
          prepTime: pick(['same day', '1–2 days', '3 days']),
          outOfStockSince: stock === 0 ? daysAgo(between(1, 12)) : null,
          createdAt: daysAgo(between(5, 80)),
        },
      });
      productCount++;
    }
  }
  console.log(`· ${storeIds.length} stores, ${productCount} products`);

  /* ---------------- meals ---------------- */

  const SLOT_CUTOFF: Record<string, number> = { breakfast: 7, lunch: 10, dinner: 17 };
  const meals: { id: string; kitchenId: string; title: string; price: number; capacity: number; image: string; serveDate: string; slot: string; handover: string }[] = [];

  for (const kitchen of kitchens) {
    const dishes = dishesByKitchen.get(kitchen.id) ?? [];
    if (!dishes.length) continue;

    for (let i = 0; i < between(1, 3); i++) {
      // A spread across yesterday, today and tomorrow so the meals board has
      // past, live and upcoming services in it at once.
      const offset = pick([-2, -1, -1, 0, 0, 1, 1, 2]);
      const serveDay = new Date(Date.now() + offset * DAY);
      const serveDate = dayKey(serveDay);
      const slot = pick(['breakfast', 'lunch', 'dinner']);
      const dish = pick(dishes);

      const [y, m, d] = serveDate.split('-').map(Number);
      const deadline = new Date(Date.UTC(y, m - 1, d, SLOT_CUTOFF[slot] - 6, 0, 0));

      /* Some meals are deliberately left `published` with the deadline behind
         them. The app has no sweeper, so in production these simply pile up —
         the meals board is where they get found and closed. */
      const past = offset < 0;
      const status = past ? pick(['closed', 'published', 'closed']) : 'published';

      const meal = await db.meal.create({
        data: {
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
          handoverNote: '',
          area: kitchen.area,
          lat: chefs.find((c) => c.id === kitchen.chefId)!.lat,
          lng: chefs.find((c) => c.id === kitchen.chefId)!.lng,
          deliveryRadiusKm: chefs.find((c) => c.id === kitchen.chefId)!.deliveryRadiusKm,
          status,
          interested: JSON.stringify(
            customers.slice(0, between(0, 6)).map((c) => c.customerKey),
          ),
          createdAt: new Date(serveDay.getTime() - between(1, 4) * DAY),
        },
      });
      meals.push({
        id: meal.id, kitchenId: kitchen.id, title: meal.title, price: meal.price,
        capacity: meal.capacity, image: meal.image, serveDate, slot, handover: meal.handover,
      });
    }
  }
  console.log(`· ${meals.length} meals`);

  /* ---------------- orders, and the ledger they imply ---------------- */

  type LedgerRow = {
    kind: string; amount: number; from: string; to: string;
    fromRef?: string | null; toRef?: string | null;
    orderId?: string | null; mealId?: string | null;
    note: string; idemKey?: string | null; at: Date;
  };
  const ledger: LedgerRow[] = [];

  /* Top-ups are posted after the orders exist, not before, because they have
     to be big enough to cover what each customer actually spent. A wallet
     that goes negative is not a demo of anything — the whole point of
     `confirmOrder` is that it refuses when the balance is short. */
  const topUps: { customerKey: string; amount: number; at: Date; reconciled: string; pspRef: string | null }[] = [];
  const spend = new Map<string, { total: number; firstAt: number }>();

  const ESCROW_STATES = ['confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'completed'];
  const orders: { id: string; kind: string; amount: number; kitchenId: string; customerKey: string; status: string; payment: string; title: string }[] = [];

  const makeOrder = async (spec: {
    kind: 'cod' | 'meal' | 'store' | 'request';
    kitchenId: string;
    mealId?: string;
    storeId?: string;
    requestId?: string;
    offerId?: string;
    title: string;
    image: string;
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
    const customer = pick(customers);
    const kitchen = kitchens.find((k) => k.id === spec.kitchenId)!;
    const address = pick(ADDRESSES);
    const handover = spec.handover ?? 'delivery';

    // Back-date each step the order has already passed, evenly across its age,
    // so a timeline is not five identical stamps.
    const rail = spec.kind === 'cod'
      ? ['placed', 'accepted', 'cooking', 'on_the_way', 'delivered']
      : (spec.preorder ? ['pending'] : []).concat(
          handover === 'pickup'
            ? ['confirmed', 'preparing', 'ready', 'delivered', 'completed']
            : ESCROW_STATES,
        );
    const reachedIndex = rail.indexOf(spec.status);
    const reached = reachedIndex >= 0 ? rail.slice(0, reachedIndex + 1) : [spec.status];
    const ageMs = Date.now() - spec.createdAt.getTime();
    const history = reached.map((status, i) => ({
      status,
      at: new Date(spec.createdAt.getTime() + (ageMs / reached.length) * i).toISOString(),
    }));

    const isCod = spec.kind === 'cod';
    const settled = spec.status === 'completed';
    const cancelled = spec.status === 'cancelled' || spec.status === 'rejected';

    const payment = isCod
      ? 'cod'
      : settled
        ? 'released'
        : cancelled
          ? 'refunded'
          : 'held';

    const commissionRate =
      spec.kind === 'meal' ? 0.15 : spec.kind === 'store' ? 0.12 : spec.kind === 'request' ? 0.1 : 0.15;
    const platformAmount = settled ? Math.round(spec.amount * commissionRate) : null;
    const cookAmount = settled ? spec.amount - (platformAmount ?? 0) : null;

    const order = await db.order.create({
      data: {
        code: code('RB'),
        kind: spec.kind,
        mealId: spec.mealId ?? null,
        storeId: spec.storeId ?? null,
        requestId: spec.requestId ?? null,
        offerId: spec.offerId ?? null,
        kitchenId: spec.kitchenId,
        cookName: kitchen.name,
        title: spec.title,
        image: spec.image,
        customerKey: customer.customerKey,
        customerName: customer.name,
        phone: customer.phone ?? '',
        address: JSON.stringify({ ...address, area: `${customer.area}, Dhaka` }),
        handover,
        serveDate: spec.serveDate ?? null,
        slot: spec.slot ?? null,
        lines: JSON.stringify(spec.lines ?? []),
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
        history: JSON.stringify(history),
        deliveredAt: spec.deliveredAt ?? null,
        completedAt: settled ? spec.deliveredAt ?? spec.createdAt : null,
        createdAt: spec.createdAt,
      },
    });

    orders.push({
      id: order.id, kind: spec.kind, amount: spec.amount, kitchenId: spec.kitchenId,
      customerKey: customer.customerKey, status: spec.status, payment, title: spec.title,
    });

    /* COD never touches escrow — the rider takes cash. Everything else holds
       on confirmation, and releases or refunds only at the end. */
    if (!isCod) {
      const seen = spend.get(customer.customerKey);
      spend.set(customer.customerKey, {
        total: (seen?.total ?? 0) + spec.amount,
        firstAt: Math.min(seen?.firstAt ?? Infinity, spec.createdAt.getTime()),
      });

      ledger.push({
        kind: 'hold', amount: spec.amount, from: 'customer', to: 'held',
        fromRef: customer.customerKey, orderId: order.id, mealId: spec.mealId ?? null,
        note: `Held for ${spec.title}`, idemKey: `hold:${order.id}`, at: spec.createdAt,
      });

      if (settled) {
        const at = spec.deliveredAt ?? spec.createdAt;
        ledger.push({
          kind: 'release', amount: cookAmount!, from: 'held', to: 'cook',
          toRef: spec.kitchenId, orderId: order.id,
          note: `Released for ${spec.title}`, idemKey: `release:${order.id}`, at,
        });
        if (platformAmount! > 0) {
          ledger.push({
            kind: 'commission', amount: platformAmount!, from: 'held', to: 'platform',
            orderId: order.id, note: `Commission on ${spec.title}`,
            idemKey: `commission:${order.id}`, at,
          });
        }
      } else if (cancelled) {
        ledger.push({
          kind: 'refund', amount: spec.amount, from: 'held', to: 'customer',
          toRef: customer.customerKey, orderId: order.id,
          note: `Refund for ${spec.title}`, idemKey: `refund:${order.id}`,
          at: new Date(spec.createdAt.getTime() + 3600_000),
        });
      }
    }

    return order;
  };

  // COD orders — the legacy rail.
  for (let i = 0; i < 40; i++) {
    const kitchen = pick(kitchens);
    const dishes = dishesByKitchen.get(kitchen.id) ?? [];
    if (!dishes.length) continue;
    const line = pick(dishes);
    const qty = between(1, 3);
    const subtotal = line.price * qty;
    const createdAt = daysAgo(between(0, 25));
    const status = pick(['placed', 'accepted', 'cooking', 'on_the_way', 'delivered', 'delivered', 'delivered', 'cancelled', 'rejected']);
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

  // Meal orders — escrow.
  for (const meal of meals) {
    const sold = between(0, Math.min(meal.capacity, 9));
    for (let i = 0; i < sold; i++) {
      const createdAt = daysAgo(between(0, 6));
      const status = pick([...ESCROW_STATES, 'completed', 'completed', 'delivered', 'cancelled']);
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

  // Store orders, including pre-orders that are still waiting on a cook.
  const allProducts = await db.product.findMany({ where: { active: true } });
  for (let i = 0; i < 45; i++) {
    const product = pick(allProducts);
    const store = storeIds.find((s) => s.id === product.storeId);
    if (!store) continue;
    const qty = between(1, 3);
    const subtotal = product.price * qty;
    const fee = pick([0, 40, 50]);
    const createdAt = daysAgo(between(0, 20));
    const preorder = product.preorder && chance(0.6);
    const status = preorder
      ? pick(['pending', 'pending', 'confirmed', 'preparing', 'completed', 'rejected'])
      : pick([...ESCROW_STATES, 'completed', 'completed', 'delivered', 'cancelled']);

    await makeOrder({
      kind: 'store',
      kitchenId: store.kitchenId,
      storeId: store.id,
      title: product.name,
      image: '',
      subtotal,
      deliveryFee: fee,
      amount: subtotal + fee,
      lines: [{ id: product.id, name: product.name, price: product.price, qty, lineTotal: subtotal }],
      status,
      preorder,
      createdAt,
      deliveredAt: ['delivered', 'completed'].includes(status)
        ? new Date(createdAt.getTime() + between(4, 40) * 3600_000)
        : null,
    });
  }

  console.log(`· ${orders.length} orders`);

  /* ---------------- requests, offers, negotiation ---------------- */

  const WANTS = [
    ['Two-pound chocolate truffle cake', 'Birthday on Friday evening. Dark chocolate, not too sweet, "Happy Birthday Ammu" on top.', 2400, 'cake'],
    ['Iftar platter for 20 people', 'Office iftar. Piyaju, beguni, chola, jilapi, dates and lemon sharbat.', 6000, 'iftar'],
    ['Homemade nokshi pitha, 3 dozen', 'For a family gathering. The patterned kind, not the plain ones.', 1800, 'pitha'],
    ['Sugar-free sandesh for a diabetic', 'My father cannot have sugar. Nolen gur is fine if it is unsweetened otherwise.', 900, 'sweet'],
    ['Beef tehari for 15, office lunch', 'Needs to arrive by 1pm sharp on Thursday, packed individually.', 4500, 'biryani'],
    ['Aam er achar, 2kg, no oil floating', 'The way my grandmother made it. Ready within two weeks is fine.', 1200, 'achar'],
    ['Eid gift boxes, 10 sets', 'Sweets and dry snacks, wrapped. Something presentable for colleagues.', 5000, 'gift'],
    ['Shorshe ilish for six', 'Proper hilsa, mustard paste, not a curry with fish in it.', 3200, 'seafood'],
  ] as const;

  const NOTES = [
    'I can do this. I make it every week.',
    'Happy to cook it — I would need a day of notice.',
    'This is my speciality. Free delivery if you are within 3km.',
    'Can do, but I would use a slightly different cut.',
    'Yes. I can deliver by the time you need it.',
  ];

  let offerCount = 0;
  for (const [index, [title, description, budget, category]] of WANTS.entries()) {
    const customer = pick(customers);
    const broadcast = index !== 3;
    /* One request is deliberately targeted at a single kitchen, and one
       broadcast reaches nobody at all — every eligible kitchen was shut or out
       of range. That empty `eligible` array is a coverage bug, and the
       requests board is where it becomes visible. */
    const deadReach = index === 6;
    const eligible = deadReach
      ? []
      : broadcast
        ? kitchens.filter(() => chance(0.4)).map((k) => k.id)
        : [kitchens[index % kitchens.length].id];

    const createdAt = daysAgo(between(0, 8));
    const request = await db.request.create({
      data: {
        code: code('RQ'),
        customerKey: customer.customerKey,
        title,
        description,
        quantity: 1,
        budget,
        target: broadcast ? 'all' : kitchens[index % kitchens.length].id,
        eligible: JSON.stringify(eligible),
        wantedFor: dayKey(new Date(Date.now() + between(1, 6) * DAY)),
        category,
        area: customer.area,
        status: 'open',
        createdAt,
      },
    });

    // Cooks answer. Some only show interest; most name a price.
    const responders = eligible.slice(0, between(0, Math.min(5, eligible.length)));
    const madeOffers: { id: string; kitchenId: string; price: number | null }[] = [];

    for (const kitchenId of responders) {
      const kitchen = kitchens.find((k) => k.id === kitchenId)!;
      const priced = chance(0.8);
      const price = priced ? Math.round(budget * (0.75 + rnd() * 0.5)) : null;
      const at = new Date(createdAt.getTime() + between(10, 600) * 60_000);

      const offer = await db.offer.create({
        data: {
          requestId: request.id,
          kitchenId,
          cookName: kitchen.name,
          status: priced ? 'priced' : 'interested',
          price,
          note: pick(NOTES),
          prepTime: pick(['same day', '1 day', '2 days']),
          history: JSON.stringify(price ? [{ by: 'cook', amount: price, at: at.toISOString() }] : []),
          createdAt: at,
        },
      });
      madeOffers.push({ id: offer.id, kitchenId, price });
      offerCount++;
    }

    /* Advance a couple of requests through selection and haggling, so the
       negotiation view has a real back-and-forth to render rather than a
       single price. Every number either side names is appended — nothing is
       ever overwritten. */
    const priced = madeOffers.filter((o) => o.price != null);
    if (priced.length && index % 3 === 0) {
      const chosen = priced[0];
      const first = chosen.price!;
      const counter = Math.round(first * 0.88);
      const settledPrice = Math.round((first + counter) / 2);
      const t0 = new Date(createdAt.getTime() + 2 * 3600_000);

      const agreed = index % 6 === 0;
      const history = [
        { by: 'cook', amount: first, at: new Date(t0.getTime() - 3600_000).toISOString() },
        { by: 'customer', amount: counter, at: t0.toISOString() },
        ...(agreed ? [{ by: 'cook', amount: settledPrice, at: new Date(t0.getTime() + 1800_000).toISOString() }] : []),
      ];

      await db.offer.update({
        where: { id: chosen.id },
        data: {
          status: agreed ? 'agreed' : 'negotiating',
          agreedPrice: agreed ? settledPrice : null,
          history: JSON.stringify(history),
        },
      });
      await db.offer.updateMany({
        where: { requestId: request.id, id: { not: chosen.id } },
        data: { status: 'not-selected' },
      });
      await db.request.update({
        where: { id: request.id },
        data: {
          status: agreed ? 'agreed' : 'selected',
          selectedOfferId: chosen.id,
        },
      });

      // One agreed request goes all the way through to a paid order.
      if (agreed && index === 0) {
        const kitchen = kitchens.find((k) => k.id === chosen.kitchenId)!;
        const order = await makeOrder({
          kind: 'request',
          kitchenId: kitchen.id,
          requestId: request.id,
          offerId: chosen.id,
          title,
          image: '',
          subtotal: settledPrice,
          amount: settledPrice,
          status: 'preparing',
          createdAt: new Date(t0.getTime() + 7200_000),
        });
        await db.request.update({
          where: { id: request.id },
          data: { status: 'ordered', orderId: order.id },
        });
      }
    }
  }
  console.log(`· ${WANTS.length} requests, ${offerCount} offers`);

  /* ---------------- top-ups, sized to what was spent ---------------- */

  /**
   * Money in from outside.
   *
   * `from: 'external'` matches the app exactly — the outside world is not one
   * of the folded accounts, so a top-up reads as money arriving rather than
   * as a transfer that nets to nothing.
   *
   * Each customer is topped up in round numbers that cover their holds plus a
   * float, dated before their first order. A few are left without a PSP
   * reference: in the app that is *every* top-up, since `topUp(amount,
   * 'bKash')` credits the wallet with no payment behind it. Those are the
   * orphans the reconciliation view exists to catch.
   */
  for (const customer of customers) {
    const spent = spend.get(customer.customerKey);
    const needed = (spent?.total ?? 0) + between(200, 1500);
    const firstAt = spent?.firstAt ?? Date.now() - 30 * DAY;

    let remaining = needed;
    let round = 0;
    while (remaining > 0) {
      // Round up to the nearest 500 — nobody tops up ৳1,347.
      const amount = Math.min(
        Math.max(500, Math.ceil(remaining / 500) * 500),
        pick([1000, 2000, 3000, 5000]),
      );
      const at = new Date(firstAt - (round + 1) * between(1, 3) * DAY);
      const orphan = chance(0.15);

      topUps.push({
        customerKey: customer.customerKey,
        amount,
        at,
        reconciled: orphan ? 'orphan' : 'matched',
        pspRef: orphan ? null : `BKS${between(100000, 999999)}`,
      });
      ledger.push({
        kind: 'topup', amount, from: 'external', to: 'customer',
        toRef: customer.customerKey, note: 'Wallet top-up via bKash', at,
      });

      remaining -= amount;
      round++;
      if (round > 20) break; // belt and braces against a pathological draw
    }
  }

  /* ---------------- write the ledger ---------------- */

  ledger.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const row of ledger) {
    await db.ledgerEntry.create({
      data: {
        kind: row.kind,
        amount: row.amount,
        from: row.from,
        to: row.to,
        fromRef: row.fromRef ?? null,
        toRef: row.toRef ?? null,
        orderId: row.orderId ?? null,
        mealId: row.mealId ?? null,
        note: row.note,
        idemKey: row.idemKey ?? null,
        at: row.at,
      },
    });
  }

  for (const t of topUps) {
    await db.topUp.create({
      data: {
        customerKey: t.customerKey,
        amount: t.amount,
        method: 'bKash',
        reconciled: t.reconciled,
        pspRef: t.pspRef,
        pspAmount: t.reconciled === 'matched' ? t.amount : null,
        at: t.at,
      },
    });
  }
  console.log(`· ${ledger.length} ledger entries, ${topUps.length} top-ups`);

  /* ---------------- a dispute, and an aged escrow ---------------- */

  /* Push a few delivered orders back in time so they are already past the
     3-day auto-release window. Held money that nobody is chasing is the worst
     state in the system, and the ageing board only proves it works if there is
     something aged in it. */
  const delivered = await db.order.findMany({
    where: { status: 'delivered', payment: 'held' },
    take: 6,
  });
  for (const [i, order] of delivered.entries()) {
    await db.order.update({
      where: { id: order.id },
      data: { deliveredAt: daysAgo(2 + i * 2) },
    });
  }

  const disputable = await db.order.findFirst({
    where: { payment: 'held', status: { in: ['delivering', 'delivered'] } },
  });
  if (disputable) {
    await db.dispute.create({
      data: {
        code: code('DP'),
        orderId: disputable.id,
        status: 'investigating',
        openedBy: 'customer',
        reason: 'Two of the four boxes arrived cold and one was the wrong dish.',
        notes: JSON.stringify([
          { at: daysAgo(1).toISOString(), by: 'support@rannabari.app', text: 'Customer sent photos. The wrong dish is confirmed.' },
          { at: daysAgo(0).toISOString(), by: 'ops@rannabari.app', text: 'Cook says the rider took the wrong bag. Suggest a partial refund.' },
        ]),
        createdAt: daysAgo(1),
      },
    });
  }

  /* ---------------- notifications ---------------- */

  const NOTES_SEED = [
    ['customer', 'order-completed', 'Payment released', '৳{amount} has gone to the kitchen.'],
    ['cook', 'order-confirmed', 'New confirmed order', '{customer} confirmed {title}.'],
    ['customer', 'confirm-receipt', 'Did your food arrive?', 'Confirm you received {title} to complete the order.'],
    ['cook', 'request-new', 'New food request', '{customer} is looking for {title}. Name your price.'],
    ['customer', 'offer-selected', 'Your cook was chosen', 'You picked {cook}. Agree a price to go ahead.'],
    ['cook', 'preorder-new', 'New pre-order request', '{customer} wants {title}. Accept or decline.'],
  ] as const;

  for (const [audience, kind, title, body] of NOTES_SEED) {
    for (let i = 0; i < between(2, 6); i++) {
      await db.notification.create({
        data: {
          key: `${audience}:${kind}:${code('N')}`,
          audience,
          kind,
          title,
          body,
          read: chance(0.5),
          at: daysAgo(between(0, 10)),
        },
      });
    }
  }

  /* ---------------- restore the append-only guards ---------------- */

  await db.$executeRawUnsafe(
    `CREATE TRIGGER ledger_no_update BEFORE UPDATE ON "LedgerEntry" BEGIN SELECT RAISE(ABORT, 'ledger-append-only: post a reversing entry instead of updating one'); END`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER ledger_no_delete BEFORE DELETE ON "LedgerEntry" BEGIN SELECT RAISE(ABORT, 'ledger-append-only: post a reversing entry instead of deleting one'); END`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER audit_no_update BEFORE UPDATE ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'audit-append-only: an audit row cannot be updated'); END`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER audit_no_delete BEFORE DELETE ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'audit-append-only: an audit row cannot be deleted'); END`,
  );

  console.log('\n  Seed complete.');
  console.log(`  Sign in at http://localhost:3100/login`);
  console.log(`  ${adminEmail} / ${adminPassword}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
