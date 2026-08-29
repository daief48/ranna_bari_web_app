/**
 * Give the shelf products their photographs.
 *
 *   npx tsx scripts/backfill-product-images.ts        # report only
 *   npx tsx scripts/backfill-product-images.ts --write
 *
 * `scripts/seed.ts` created every store product with no `images`, so every
 * shop page and every product page drew the lettered placeholder — the state
 * meant for a cook who has not uploaded a picture yet, showing up on all of
 * them at once and reading as a broken page. The seed now carries a photo per
 * shelf item; this brings the rows that already exist to the same state.
 *
 * A re-seed would do it too, and would also throw away every real order,
 * review, dispute and chat thread that has accumulated since. This does not.
 *
 * Two things happen here, and they are deliberately different:
 *
 *   - a product with no photograph gets one;
 *   - a product still carrying a photograph from an earlier run of this
 *     script gets the current one instead.
 *
 * The second exists because the first attempt picked stock photographs by
 * name alone, and the "mango pickle" turned out to be a bowl of sliced
 * cucumber. Superseding matches on the exact URL previously written, so a
 * cook who has uploaded their own photograph is never touched — the rule is
 * "replace what this script wrote", not "replace what this product has".
 */
import { connect, disconnect } from '../src/config/db.js';
import { Product } from '../src/models/index.js';

/**
 * The photographs, keyed by the seeded product name.
 *
 * Four come from Wikimedia Commons and two from Unsplash, and the split is
 * not arbitrary: no stock library has a photograph of nokshi pitha or nolen
 * gur sandesh, and Commons has both, taken by the people who made them. Every
 * one of these was fetched and *looked at* before being written here. Picking
 * by filename is how the cucumber got in.
 */
const PHOTOS: Record<string, string> = {
  'Aam er achar (500g)':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Mango_Pickle_Home_Made_Style.JPG/960px-Mango_Pickle_Home_Made_Style.JPG',
  'Boroi er achar (400g)':
    'https://upload.wikimedia.org/wikipedia/commons/9/91/Indian_pickles.jpg',
  'Frozen beef samosa (12)':
    'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&h=800&fit=crop',
  'Nolen gur sandesh (8)':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Nolen_Jaggery_Sandesh.jpg/960px-Nolen_Jaggery_Sandesh.jpg',
  'Garam masala (100g)':
    'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&h=800&fit=crop',
  'Nokshi pitha box (6)':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Nakshi_Pitha_%28%E0%A6%A8%E0%A6%95%E0%A6%B6%E0%A7%80_%E0%A6%AA%E0%A6%BF%E0%A6%A0%E0%A6%BE%29.jpg/960px-Nakshi_Pitha_%28%E0%A6%A8%E0%A6%95%E0%A6%B6%E0%A7%80_%E0%A6%AA%E0%A6%BF%E0%A6%A0%E0%A6%BE%29.jpg',
};

/**
 * Photographs an earlier run of this script wrote, now superseded.
 *
 * An explicit list rather than "anything from unsplash.com", so a cook who
 * happens to have used an Unsplash link keeps theirs.
 */
const SUPERSEDED = [
  'https://images.unsplash.com/photo-1589621316382-008455b857cd?w=800&h=800&fit=crop',
  'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&h=800&fit=crop',
  'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&h=800&fit=crop',
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&h=800&fit=crop',
];

const write = process.argv.includes('--write');
const EMPTY = { $or: [{ images: { $size: 0 } }, { images: { $exists: false } }] };

await connect();

/* Every URL is fetched before anything is written. A photograph that 404s is
   worse than the placeholder it replaces — the placeholder at least looks
   deliberate. */
console.log('checking every photograph loads…');
let dead = 0;
for (const [name, url] of Object.entries(PHOTOS)) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'RannaBari-seed/1.0 (product photographs)' },
  }).catch(() => null);
  const bytes = response
    ? (await response.arrayBuffer().catch(() => new ArrayBuffer(0))).byteLength
    : 0;
  const ok = !!response?.ok && bytes > 5000;
  if (!ok) dead += 1;
  console.log(`  ${ok ? 'ok  ' : 'DEAD'} ${String(bytes).padStart(7)}B  ${name}`);
}
if (dead) {
  console.log(`\n${dead} photograph(s) did not load — nothing written.`);
  await disconnect();
  process.exit(1);
}

const blank = await Product.find(EMPTY).select({ name: 1 });
const stale = await Product.find({ images: { $in: SUPERSEDED } }).select({ name: 1 });
const unknown = blank.filter((p) => !PHOTOS[p.name]);

console.log(`\n${blank.length} product(s) with no photograph`);
console.log(`  ${blank.length - unknown.length} are seeded shelf goods this can fill`);
if (unknown.length) {
  const names = [...new Set(unknown.map((p) => p.name))];
  console.log(`  ${unknown.length} are not from the seed and are left alone:`);
  for (const name of names.slice(0, 10)) console.log(`    · ${name}`);
}
console.log(`${stale.length} product(s) carry a superseded photograph`);

if (!write) {
  console.log('\nreport only — pass --write to apply');
  await disconnect();
  process.exit(0);
}

let filled = 0;
let refreshed = 0;
for (const [name, url] of Object.entries(PHOTOS)) {
  const a = await Product.updateMany({ name, ...EMPTY }, { $set: { images: [url] } });
  const b = await Product.updateMany(
    { name, images: { $in: SUPERSEDED } },
    { $set: { images: [url] } },
  );
  if (a.modifiedCount || b.modifiedCount) {
    console.log(
      `  ${String(a.modifiedCount).padStart(3)} filled  ` +
        `${String(b.modifiedCount).padStart(3)} refreshed   ${name}`,
    );
  }
  filled += a.modifiedCount;
  refreshed += b.modifiedCount;
}

console.log(`\n${filled} filled, ${refreshed} refreshed`);
await disconnect();
process.exit(0);
