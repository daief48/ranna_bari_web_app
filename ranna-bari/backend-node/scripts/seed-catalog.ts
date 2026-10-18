/**
 * Restore the browseable catalogue — kitchens, dishes, stores, products —
 * without any of the people or money `seed.ts` also fabricates.
 *
 * Exists because a full wipe of user data took these down with it (they live
 * in the same collections), and rerunning `seed.ts` would have brought the
 * customers, orders and ledger straight back with them.
 *
 * The kitchens come back with `accountId: null`, like the migrated legacy
 * kitchens: customers can browse and order from them, but no cook account
 * stands behind them, so chat has nobody to answer. `npm run seed` remains
 * the way to the fully-populated demo database.
 *
 * Skips any kitchen whose `legacyId` already exists, so it is safe to run
 * twice. Orphaned store categories — shelves whose store died in the wipe —
 * are cleared first so they cannot resurface beside the new ones.
 *
 *   tsx scripts/seed-catalog.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { connect, disconnect } from '../src/config/db.js';
import {
  Dish,
  Kitchen,
  Product,
  Store,
  StoreCategory,
} from '../src/models/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
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
type MenuDoc = { chefId: number; items: { name: string; description: string; price: number; image: string; tags: string[] }[] };

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as T;

/* The same fixed-seed PRNG as `seed.ts`, so the stores this makes have the
   same shape — which shops are open, which shelves exist — as a full seed. */
let rngState = 42;
const rnd = () => {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
};
const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

await connect();

/* Shelves pointing at stores the wipe deleted would sit beside the fresh
   ones — an orphan is invisible in the app but it is still a lie in the
   database. */
const storeIds = new Set((await Store.find({}).select({ _id: 1 }).lean()).map((s) => String(s._id)));
const orphanShelves = await StoreCategory.deleteMany({ storeId: { $nin: [...storeIds] } });
if (orphanShelves.deletedCount) console.log(`· ${orphanShelves.deletedCount} orphaned store categories removed`);

const chefs = readJson<Chef[]>('chefs.json');
const menus = readJson<MenuDoc[]>('menus.json');

const existing = new Set(
  (await Kitchen.find({ legacyId: { $type: 'number' } }).select({ legacyId: 1 }).lean()).map(
    (k) => k.legacyId,
  ),
);

let dishCount = 0;
const kitchens: { id: string; name: string; area: string }[] = [];

for (const chef of chefs) {
  if (existing.has(chef.id)) {
    console.log(`· kitchen ${chef.id} (${chef.name}) already exists — skipped`);
    continue;
  }

  /* `accountId` stays null: no cook account is fabricated here. Verification
     mirrors the full seed — the badge and the KYC decision behind it. */
  const verified = chef.isVerified;
  const kitchen = await Kitchen.create({
    accountId: null,
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
  kitchens.push({ id: String(kitchen._id), name: kitchen.name, area: kitchen.area });

  const menu = menus.find((m) => m.chefId === chef.id);
  let made = 0;
  for (const item of menu?.items ?? []) {
    await Dish.create({
      kitchenId: String(kitchen._id),
      name: item.name,
      description: item.description,
      price: item.price,
      image: item.image,
      tags: item.tags ?? [],
      available: chance(0.85),
    });
    made++;
  }
  dishCount += made;
  await Kitchen.updateOne({ _id: kitchen._id }, { nextDishSeq: made + 1 });
}
console.log(`· ${kitchens.length} kitchens, ${dishCount} dishes`);

/* ---- stores and products, the same shelves the full seed builds ---- */

const SHELVES = [['Pickles & achar', '🫙'], ['Frozen', '🧊'], ['Sweets', '🍮'], ['Spice mixes', '🌶']];

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
let storeCount = 0;

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
  storeCount++;

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

  /* Rotated so neighbouring shops do not all carry the same first product. */
  const offset = storeCount % GOODS.length;
  const shelf = Array.from({ length: GOODS.length }, (_, k) => GOODS[(offset + k) % GOODS.length]!);
  const listing = shelf.slice(0, between(4, GOODS.length));

  for (const [name, price, description, photo] of listing) {
    const stock = chance(0.22) ? 0 : between(3, 60);
    await Product.create({
      storeId: String(store._id),
      categoryId: String(pick(shelves)._id),
      name,
      description,
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
console.log(`· ${storeCount} stores, ${productCount} products`);

await disconnect();
