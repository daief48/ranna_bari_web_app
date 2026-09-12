/**
 * Mirror already-submitted document galleries into their kitchen rows.
 *
 * Kitchens that handed in documents before the mirror existed have their
 * photographs stranded in the document collection — the kitchen row, which
 * every card reads, holds an empty cover and no photos. This rebuilds the
 * same URLs `saveKitchenDocuments` writes today.
 *
 *   tsx scripts/mirror-kitchen-gallery.ts [kitchenId]
 */
import { connect, disconnect } from '../src/config/db.js';
import { Kitchen, KitchenDocument } from '../src/models/index.js';
import { publicBaseUrl } from '../src/config/env.js';

await connect();

const only = process.argv[2];
const kitchens = await Kitchen.find(only ? { _id: only } : {})
  .select('_id coverImage photos')
  .lean();

let fixed = 0;

for (const kitchen of kitchens) {
  const rows = await KitchenDocument.find({ kitchenId: String(kitchen._id) })
    .select('kind seq')
    .lean();

  const gallery = rows
    .filter((r) => r.kind === 'kitchen-photo')
    .sort((a, b) => a.seq - b.seq);
  const portrait = rows.find((r) => r.kind === 'profile-pic');

  if (!gallery.length) continue;

  const base = publicBaseUrl();
  const urlOf = (row: { _id: unknown }) =>
    `${base}/api/app/v1/kitchens/${String(kitchen._id)}/photos/${String(row._id)}`;

  const patch: Record<string, unknown> = {
    photos: gallery.map(urlOf),
    coverImage: urlOf(gallery[0]),
  };
  if (portrait) patch.avatar = urlOf(portrait);

  await Kitchen.updateOne({ _id: kitchen._id }, patch);
  fixed++;
  console.log(
    `kitchen ${String(kitchen._id)} (${kitchen.coverImage ? 'had cover' : 'no cover'}): ${gallery.length} photos → cover + gallery${portrait ? ' + avatar' : ''}`,
  );
}

console.log(`\nMirrored ${fixed} kitchen(s).`);
await disconnect();
