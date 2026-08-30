/**
 * Ask the image host for the size actually being drawn.
 *
 * Every photograph in this app is remote and most of them are stored at the
 * size the *biggest* use needs: a shop's cover is a 1200×400 Unsplash URL,
 * which is right for the hero on the shop page and roughly nine times too
 * much data for the 110px-tall card in the directory. Twelve shops in a list
 * is twelve full-size covers over a mobile connection, for something rendered
 * at a ninth of the area.
 *
 * That matters more here than it would elsewhere. This is an app for phones
 * in Dhaka on metered data, and the fix costs nothing: both hosts in use
 * resize on demand from the URL, so asking for less is a query-string change
 * rather than a pipeline.
 *
 * Anything else — a `file://` from the image picker, a data URI, a host with
 * no resizing — comes back untouched. A helper that mangled a URL it did not
 * understand would trade a slow image for a broken one.
 */

/**
 * Phones are 2x or 3x. Requesting 3x everywhere would undo most of the
 * saving for the sake of the sharpest devices; 2x is the honest middle, and
 * these are photographs, where a little softness is invisible in a way it
 * would not be on text or a diagram.
 */
const DENSITY = 2;

/** Beyond this the saving stops mattering and the risk of a soft hero starts. */
const MAX = 1600;

const round = (n) => Math.min(MAX, Math.max(1, Math.ceil(n * DENSITY)));

export function sized(uri, width, height) {
  if (typeof uri !== 'string' || !uri) return uri;
  if (!width) return uri;

  /* Unsplash: `w`, `h` and `fit` are theirs, and `q`/`auto` are what turn a
     PNG-sized JPEG into a WebP where the browser or device supports one. */
  if (uri.includes('images.unsplash.com')) {
    try {
      const url = new URL(uri);
      url.searchParams.set('w', String(round(width)));
      if (height) url.searchParams.set('h', String(round(height)));
      url.searchParams.set('fit', 'crop');
      url.searchParams.set('q', '70');
      url.searchParams.set('auto', 'format');
      return url.toString();
    } catch {
      return uri;
    }
  }

  /* Wikimedia thumbnails carry their width in the filename — `.../thumb/a/ab/
     Name.jpg/960px-Name.jpg` — so the number is what to rewrite. Only the
     `/thumb/` form can be resized; a direct upload URL is the original and
     has no other size to ask for. */
  if (uri.includes('upload.wikimedia.org') && uri.includes('/thumb/')) {
    return uri.replace(/\/(\d+)px-/, () => `/${round(width)}px-`);
  }

  return uri;
}

/**
 * `sized`, as an expo-image source, with the caching a list wants.
 *
 * `memory-disk` rather than the default: a directory is scrolled down and
 * then back up, and the disk cache still costs a decode on the way back.
 * Holding the decoded bitmap is the difference between a list that snaps and
 * one that flickers grey on every return.
 */
export const photo = (uri, width, height) => ({
  uri: sized(uri, width, height),
});
