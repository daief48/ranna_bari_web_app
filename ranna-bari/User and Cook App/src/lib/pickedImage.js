/**
 * Turn a picked photograph into something that survives leaving the device.
 *
 * `expo-image-picker` hands back an asset whose `uri` is a *handle*, not an
 * address. On web it is always `URL.createObjectURL(file)` — `blob:http://
 * localhost:8081/3b626fb0…` — which names an object inside the tab that
 * created it. On native it is `file:///…`, a path on that handset.
 *
 * Every picker in this app stored that string straight into the kitchen, and
 * the server stored it, and it looked like it worked: the cook who chose the
 * picture kept seeing it, because their tab still held the blob. Nobody else
 * ever could. The admin console drew a broken image, the customer's phone
 * drew nothing, and two real kitchens are in the database right now with a
 * `blob:` URL where their photograph should be.
 *
 * There is no bucket to upload to — the backend runs on Lambda with no
 * static-file plugin and no object storage, and `logic/icons.ts` already
 * settled the question the same way: "every image field holds a URL and there
 * is no bucket". So a picture becomes a `data:` URI and lives in the
 * document.
 *
 * Which makes size the whole problem, and it is a harder problem than it
 * looks. A modern phone photograph is three to six megabytes, base64 adds a
 * third again, and the whole gallery travels to the server in **one** request
 * — so five of them is not five problems, it is one body that the platform
 * refuses whole.
 *
 * This module used to resize on web only. Native took the picker's `quality`
 * and called it done, which is wrong: `quality` re-encodes, it does not
 * downscale, so a 4032×3024 frame stayed 4032×3024 and `IMAGE_ROLES.max` was
 * a number nothing on a phone ever read. Five of those came to eight or more
 * megabytes, the POST was refused above the handler, and `ensureKitchen`'s
 * retry then saved the kitchen with no gallery at all. The cook was told
 * nothing — which is how a registration that asked for five photographs ended
 * up showing two.
 *
 * So: one path for both platforms, `expo-image-manipulator`, which resizes on
 * web and native alike. And a budget, checked rather than assumed, because
 * "about a megabyte" was an estimate that was wrong by a factor of ten.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Long edge, in pixels, and JPEG quality — per role.
 *
 * A cover is a banner behind a card and an avatar is a 40px circle in a list;
 * storing either at 3000px is paying for detail nothing will ever draw. The
 * gallery keeps the most because it is the one a customer opens deliberately,
 * and the one an operator approves a kitchen on.
 */
export const IMAGE_ROLES = {
  avatar: { max: 400, quality: 0.75 },
  cover: { max: 1280, quality: 0.72 },
  gallery: { max: 1400, quality: 0.74 },
  dish: { max: 1000, quality: 0.75 },
};

/** Roughly what a data URI will cost in the document. base64 is 4 bytes per 3. */
export const approxBytes = (dataUri) =>
  typeof dataUri === 'string' ? Math.round((dataUri.length * 3) / 4) : 0;

/**
 * What a whole gallery may weigh.
 *
 * Not a Mongo limit — a document has 16MB and this is nowhere near it. It is
 * the *request* that is scarce: the kitchen is posted in one body, through a
 * serverless function whose platform caps the payload well below what Fastify
 * is configured to accept. `bodyLimit` was raised to 24MB to fix this and
 * could not, because the request never reaches Fastify to be measured.
 *
 * Three megabytes of base64 is roughly two of JPEG, which at these dimensions
 * is a dozen photographs. A cook who wants more is told, rather than having
 * the request quietly refused and the gallery quietly emptied.
 */
export const GALLERY_BUDGET_BYTES = 3 * 1024 * 1024;

/** Already an address rather than a handle: leave it exactly as it is. */
const isDurable = (uri) =>
  typeof uri === 'string' && /^(?:https?:\/\/|data:image\/)/i.test(uri);

const uriOf = (asset) => (typeof asset === 'string' ? asset : asset?.uri);

export const weighGallery = (images) =>
  (images ?? []).reduce((total, image) => total + approxBytes(image), 0);

/**
 * Downscale and re-encode, on whichever platform this is.
 *
 * The dimensions come from the picker rather than from the decoded image
 * because the web build's `resize` wants both edges — and computing them here
 * means the aspect ratio is ours to keep rather than the library's to guess.
 */
async function encode(uri, width, height, spec) {
  const context = ImageManipulator.manipulate(uri);

  /* Only when there is something to gain. Enlarging a small photograph to
     hit `max` would cost bytes and add no detail, and a picker that returned
     no dimensions is a reason to skip the resize, not to invent one. */
  const longest = Math.max(width || 0, height || 0);
  if (longest > spec.max) {
    const scale = spec.max / longest;
    context.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    });
  }

  const rendered = await context.renderAsync();
  const out = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: spec.quality,
    base64: true,
  });

  /* Web strips the prefix and native never had one, so both need it back. */
  return out?.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}

/**
 * One photograph, at one size, or null.
 *
 * Null rather than a throw: a single unreadable photograph out of five should
 * cost that photograph, not the cook's whole registration. What it must never
 * do is cost it *silently* — every caller here counts the nulls and says so.
 */
async function convert(asset, spec) {
  const uri = uriOf(asset);
  if (!uri) return null;

  try {
    return await encode(uri, asset?.width ?? 0, asset?.height ?? 0, spec);
  } catch {
    /* The manipulator could not read it. On native the picker has already
       handed back re-encoded bytes, and an oversized photograph is a better
       outcome than a lost one — the budget below is what keeps it honest. */
    return asset?.base64 ? `data:image/jpeg;base64,${asset.base64}` : null;
  }
}

/**
 * A picture the rest of the platform can load, or null.
 *
 * A stored picture is returned untouched. A cook re-saving a form that holds
 * a photograph chosen weeks ago must not have it re-encoded on every save —
 * JPEG is lossy, and round-tripping it a dozen times is visible.
 */
export async function toStorableImage(asset, role = 'gallery') {
  const existing = uriOf(asset);
  if (isDurable(existing)) return existing;
  return convert(asset, IMAGE_ROLES[role] ?? IMAGE_ROLES.gallery);
}

/*
 * Successive attempts at the same set, each smaller than the last.
 *
 * A first pass at full spec is what almost every gallery needs. The rungs
 * below exist for the cook who picked twelve, and they shrink the *whole*
 * set rather than dropping the tail, because a smaller twelfth photograph is
 * a better answer than no twelfth photograph.
 */
const LADDER = [
  { scale: 1, drop: 0 },
  { scale: 0.72, drop: 0.06 },
  { scale: 0.55, drop: 0.12 },
];

/**
 * The same, for a whole selection — keeping the ones that worked and saying
 * how many did not.
 *
 * Sequential rather than `Promise.all`: decoding six full-size photographs at
 * once is how a mid-range phone runs out of memory, and the wait is a
 * progress note either way.
 */
export async function toStorableImages(assets, role = 'gallery') {
  const list = Array.isArray(assets) ? assets : [];
  const base = IMAGE_ROLES[role] ?? IMAGE_ROLES.gallery;

  let images = [];
  let failed = 0;

  for (const rung of LADDER) {
    const spec = {
      max: Math.round(base.max * rung.scale),
      quality: Math.max(0.4, base.quality - rung.drop),
    };

    images = [];
    failed = 0;

    for (const asset of list) {
      const existing = uriOf(asset);
      const stored = isDurable(existing) ? existing : await convert(asset, spec);
      if (stored) images.push(stored);
      else failed += 1;
    }

    if (weighGallery(images) <= GALLERY_BUDGET_BYTES) break;
  }

  return { images, failed };
}

/**
 * Trim a gallery to what one request can carry.
 *
 * Run over the *combined* set — what the field already held plus what was
 * just picked — because that is what gets posted, and a budget applied to
 * each batch separately is no budget at all.
 *
 * The tail goes rather than the head: the first photograph is the cover, the
 * order is the cook's, and dropping from the end is the only choice that does
 * not silently re-pick their banner for them.
 */
export function fitGallery(images) {
  const list = (images ?? []).filter(Boolean);

  let used = 0;
  const kept = [];
  for (const image of list) {
    const size = approxBytes(image);
    if (kept.length && used + size > GALLERY_BUDGET_BYTES) break;
    kept.push(image);
    used += size;
  }

  return { images: kept, dropped: list.length - kept.length };
}
