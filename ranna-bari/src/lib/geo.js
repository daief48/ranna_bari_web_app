/**
 * Distance maths, kept out of `mapHtml.js`.
 *
 * These two are wanted by screens that have nothing to do with the map --
 * browse ranks food by how far away it is -- and importing them from
 * `mapHtml` dragged the whole Leaflet document, several hundred lines of
 * template literal, into those bundles along with them.
 */

/** Haversine great-circle distance in kilometres. */
export function distanceKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * "600 m" up close, "2.4 km" in the neighbourhood, "14 km" beyond it — the
 * precision drops as the number stops mattering.
 *
 * The translator and numeral formatter are passed in rather than imported:
 * the unit follows the number in Bengali too, but the digits and the word
 * both change, and this module has no business reaching into React context.
 */
export function formatDistance(km, t = (s) => s, n = (v) => String(v)) {
  if (km == null || Number.isNaN(km)) return null;
  /* Below a block or so the number stops being useful and starts being
     suspicious -- a pin that happens to match yours renders as "0 m", which
     reads as a bug rather than as "very close". */
  if (km < 0.05) return t('Nearby');
  if (km < 1) return t('{n} m', { n: n(Math.round(km * 1000)) });
  if (km < 10) return t('{n} km', { n: n(km.toFixed(1)) });
  return t('{n} km', { n: n(Math.round(km)) });
}
