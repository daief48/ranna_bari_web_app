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
 * Which makes size the whole problem. A modern phone photograph is three to
 * six megabytes, base64 adds a third again, and a handful of those would put
 * a single kitchen document near Mongo's 16MB ceiling. So nothing is stored
 * at the size it was picked:
 *
 *   web     the picker ignores `quality` — it reads the file as-is — so the
 *           downscale happens here, on a canvas. No dependency, and it is the
 *           only place a resize can happen on web at all.
 *   native  `quality` genuinely re-encodes, and `base64: true` returns the
 *           result, so the picker does the work and this just wraps it.
 */
import { Platform } from 'react-native';

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
 * A picture the rest of the platform can load, or null.
 *
 * Null rather than a throw: a single unreadable photograph out of five should
 * cost that photograph, not the cook's whole registration.
 */
export async function toStorableImage(asset, role = 'gallery') {
  const spec = IMAGE_ROLES[role] ?? IMAGE_ROLES.gallery;

  /* Already durable. A cook re-saving a form that holds a picture chosen
     weeks ago must not have it re-encoded on every save — JPEG is lossy, and
     round-tripping it a dozen times is visible. */
  const existing = typeof asset === 'string' ? asset : asset?.uri;
  if (typeof existing === 'string' && /^(?:https?:\/\/|data:image\/)/i.test(existing)) {
    return existing;
  }

  if (Platform.OS === 'web') return resizeOnWeb(existing, spec);

  /* Native: the picker already re-encoded at `quality`, so `base64` is the
     compressed bytes and there is nothing left to do but label them. */
  if (asset?.base64) return `data:image/jpeg;base64,${asset.base64}`;

  /* No base64 came back — a caller that forgot to ask for it. Returning the
     file:// URI would put the old bug back silently, so this refuses. */
  return null;
}

/**
 * Draw it smaller, then read it back as JPEG.
 *
 * `URL.createObjectURL` is exactly what the picker already did, so the blob
 * is still alive in this tab and the image loads; the point is that what
 * leaves this function is pixels, not a reference to them.
 */
function resizeOnWeb(uri, spec) {
  if (!uri) return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new window.Image();

    /* A blob URL is same-origin, so this is not needed for the fetch — it is
       needed so the canvas is not tainted and `toDataURL` can read it back.
       Without it a picture picked from some sources throws a SecurityError. */
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const scale = Math.min(1, spec.max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);

        /* A white ground under it: a transparent PNG flattened onto JPEG's
           implicit black would come out with a black background, which on a
           photograph of a kitchen reads as a ruined picture. */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        resolve(canvas.toDataURL('image/jpeg', spec.quality));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = uri;
  });
}

/**
 * The same, for a whole selection, keeping the ones that worked.
 *
 * Sequential rather than `Promise.all`: decoding six full-size photographs
 * onto canvases at once is how a mid-range phone browser runs out of memory,
 * and the wait is a progress spinner either way.
 */
export async function toStorableImages(assets, role = 'gallery') {
  const out = [];
  for (const asset of assets ?? []) {
    const stored = await toStorableImage(asset, role);
    if (stored) out.push(stored);
  }
  return out;
}
