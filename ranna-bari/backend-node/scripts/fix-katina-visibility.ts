/**
 * Repair the "Katina menu not visible to ahanaf@gmail.com" test setup.
 *
 * Two defects, both data:
 *
 * 1. The customer's selected address is in Gopalgonj (~108 km from every
 *    kitchen in the DB). Browse measures from the account's selected address
 *    and hides kitchens outside the kitchen's own delivery radius, so every
 *    kitchen — Katina included — was filtered out. The kitchen's pin is the
 *    cook's chosen Dhaka location, so the customer address is the side that
 *    moves: the selected address is rewritten to Dhanmondi, inside Katina's
 *    12 km radius, mirroring exactly the fields `saveAddresses` keeps in step.
 *
 * 2. The cook-registration document flow mirrored gallery URLs into the
 *    kitchen row using `publicBaseUrl()` — on the dev machine that was
 *    http://localhost:4000, and those absolute URLs were persisted. Every
 *    device except this PC now gets broken images. Rewritten to the deployed
 *    host, whose photo route serves the same bytes from KitchenDocument.
 *
 * Prints before/after for everything it touches. Idempotent: rerunning is a
 * no-op once the values are already correct.
 */
import { connect, disconnect } from '../src/config/db.js';
import { Account, Kitchen } from '../src/models/index.js';

const DEPLOYED = 'https://ranna-bari-backend.netlify.app';
const LOCAL = 'http://localhost:4000';

/* Ahanaf's original values, logged here so they can be restored. */
const OLD_ADDRESS = {
  area: 'Apple Road',
  detail: 'House 12, Flat 3, Gopalgonj',
  lat: 22.996211178738342,
  lng: 89.82785414632436,
};
const NEW_ADDRESS = {
  area: 'Dhanmondi',
  detail: 'House 12, Flat 3, Road 5, Dhanmondi, Dhaka',
  lat: 23.7461,
  lng: 90.3742,
};

await connect();

/* ---- 1. the customer's delivery origin ---- */
const customerKey = '+8801934539934';
const account = await Account.findOne({ customerKey }).lean();
if (!account) throw new Error(`account ${customerKey} not found`);

console.log('before: account flat =', { area: account.area, lat: account.lat, lng: account.lng });
const addresses = account.addresses ?? [];
const at = addresses.findIndex((a) => a.selected);
const idx = at >= 0 ? at : 0;
console.log('before: selected address =', addresses[idx]);

if (addresses[idx] && addresses[idx].lat !== NEW_ADDRESS.lat) {
  addresses[idx] = {
    ...addresses[idx],
    area: NEW_ADDRESS.area,
    detail: NEW_ADDRESS.detail,
    lat: NEW_ADDRESS.lat,
    lng: NEW_ADDRESS.lng,
  };
  await Account.updateOne(
    { customerKey },
    {
      $set: {
        addresses,
        area: NEW_ADDRESS.area,
        addressDetail: NEW_ADDRESS.detail,
        lat: NEW_ADDRESS.lat,
        lng: NEW_ADDRESS.lng,
      },
    },
  );
  console.log('after: selected address moved to', NEW_ADDRESS);
} else {
  console.log('address already in range; no change');
}

/* ---- 2. the persisted localhost photo URLs ---- */
const kitchens = await Kitchen.find({
  $or: [{ avatar: new RegExp(`^${LOCAL}`) }, { photos: new RegExp(`^${LOCAL}`) }],
});
console.log(`\nkitchens with ${LOCAL} photo urls: ${kitchens.length}`);
for (const k of kitchens) {
  const fix = (s) => (typeof s === 'string' && s.startsWith(LOCAL) ? DEPLOYED + s.slice(LOCAL.length) : s);
  const photos = (k.photos ?? []).map(fix);
  await Kitchen.updateOne(
    { _id: k._id },
    { $set: { ...(k.avatar ? { avatar: fix(k.avatar) } : {}), photos } },
  );
  console.log(`fixed: ${k.name} (avatar + ${photos.length} gallery urls)`);
}

/* ---- verify ---- */
const after = await Account.findOne({ customerKey }).select({ area: 1, lat: 1, lng: 1 }).lean();
const katina = await Kitchen.findOne({ name: /katina/i }).select({ lat: 1, lng: 1, deliveryRadiusKm: 1 }).lean();
const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const km =
  2 *
  R *
  Math.asin(
    Math.sqrt(
      Math.sin(toRad(katina.lat - after.lat) / 2) ** 2 +
        Math.cos(toRad(after.lat)) * Math.cos(toRad(katina.lat)) * Math.sin(toRad(katina.lng - after.lng) / 2) ** 2,
    ),
  );
console.log(`\nverify: ${after.area} -> Katina = ${km.toFixed(1)} km, radius ${katina.deliveryRadiusKm} km -> ${km <= katina.deliveryRadiusKm ? 'IN RANGE, kitchen visible' : 'STILL HIDDEN'}`);
console.log('old address kept in this file header for restore:', OLD_ADDRESS);

await disconnect();
