/**
 * An order's pictures, served as pictures rather than carried as text.
 *
 * An order stores the photograph of what was bought as a data URI, copied at
 * the moment of ordering so the receipt still has it after the dish is gone.
 * Every order list then shipped those strings: ~105 KB per order, twice over
 * (`image` and `lines[0].image`), which made a cook's board of twenty orders a
 * 3.3 MB reply that took seven to ten seconds — past the app's own patience.
 * The board stood empty, every refresh-after-a-write died, and the cook read
 * all of it as "my taps do nothing".
 *
 * The list now carries a URL per picture and the picture is fetched on its
 * own, once, and cached for good (an order's picture never changes). The
 * stored document is untouched; only what goes over the wire differs.
 *
 * The path is relative to the API root on purpose: the server does not know
 * its public host (Netlify, a laptop, a phone on the same Wi-Fi), the client
 * already does.
 */

const INLINE = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]*)$/i;

/**
 * Inline, by its prefix alone.
 *
 * The lists never see the whole string any more — `SLIM_PICTURES` below has
 * the database replace it with `'data:'` before it leaves — so "is this
 * inline" has to be answerable from the first five characters.
 */
export const isInlineImage = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:');

/**
 * Drop the pictures *inside the database*, not after.
 *
 * Shaping the reply without the pictures was not enough: Mongoose still
 * pulled every 100 KB string across the wire from Atlas before it was thrown
 * away, and that transfer — not the one to the phone — was the seven to
 * thirteen seconds. This `$set` stage runs on the server, so the query hands
 * back `'data:'` (five bytes, enough to know a picture exists and build its
 * URL) in place of the picture, and leaves a picture that is already a URL
 * exactly as it is. Append it to any list pipeline that feeds `shapeOrder`.
 */
const asMarker = (field: string) => ({
  $cond: [
    { $regexMatch: { input: { $ifNull: [field, ''] }, regex: /^data:/ } },
    'data:',
    { $ifNull: [field, ''] },
  ],
});
export const SLIM_PICTURES = {
  $set: {
    image: asMarker('$image'),
    lines: {
      $map: {
        input: { $ifNull: ['$lines', []] },
        as: 'line',
        in: { $mergeObjects: ['$$line', { image: asMarker('$$line.image') }] },
      },
    },
  },
};

/** What a list sends for one picture: a URL for an inline one, else as stored. */
export function orderImageRef(orderId: string, key: 'cover' | number, stored: unknown): string {
  if (isInlineImage(stored)) return `/api/app/v1/orders/${orderId}/image/${key}`;
  return typeof stored === 'string' ? stored : '';
}

/** `image` and `lines` of an order as a list should carry them. */
export function shapeOrderImages(row: { _id: unknown; image?: unknown; lines?: unknown }) {
  const id = String(row._id);
  const lines = Array.isArray(row.lines) ? (row.lines as Record<string, unknown>[]) : [];
  return {
    image: orderImageRef(id, 'cover', row.image),
    lines: lines.map((line, i) => ({ ...line, image: orderImageRef(id, i, line?.image) })),
  };
}

/** The bytes behind an inline picture, for serving it. */
export function decodeInlineImage(stored: unknown): { mime: string; bytes: Buffer } | null {
  if (!isInlineImage(stored)) return null;
  const match = INLINE.exec(stored);
  if (!match) return null;
  return { mime: match[1], bytes: Buffer.from(match[2], 'base64') };
}
