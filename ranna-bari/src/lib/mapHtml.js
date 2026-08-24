/**
 * The MapTiler basemap, rendered inside a WebView.
 *
 * This is a direct port of map.html: Leaflet 1.9.4 over MapTiler raster
 * tiles, the same two styles, the same 512px tile / zoomOffset -1 pairing,
 * the same chef-hat divIcon and popup markup.
 *
 * Why a WebView rather than a native map SDK: this renders the exact MapTiler
 * `streets-v2` styling the web build uses, on both platforms, and it runs in
 * Expo Go without a custom development build. The chrome around it (search,
 * locate button, nearest-cooks sheet) is native React Native, so only the
 * canvas itself lives in here.
 */

/**
 * MapTiler client key. This is a browser key -- it ships in the page by
 * design and is meant to be protected by an origin allowlist, not by
 * secrecy. Lock it to your app in the MapTiler dashboard.
 */
export const MAPTILER_KEY = 'SxjK1zJHWJ8lvm7cplMH';

export const TILE_STYLE = { light: 'streets-v2', dark: 'streets-v2-dark' };

/** Dhaka, matching the web build's initial view. */
export const DEFAULT_CENTER = { lat: 23.8103, lng: 90.4125, zoom: 12 };

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * @param {object} opts
 * @param {Array}  opts.chefs   records with lat/lng/name/specialty/avatar
 * @param {'light'|'dark'} opts.theme
 * @param {object} opts.colors  resolved palette, so popups match the app
 */
export function buildMapHtml({ chefs, theme, colors }) {
  const points = chefs
    .filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number')
    .map((c) => ({
      id: c.id,
      lat: c.lat,
      lng: c.lng,
      name: esc(c.name),
      specialty: esc(c.specialty),
      avatar: esc(c.avatar),
      area: esc(c.area),
    }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>
  html, body { height: 100%; margin: 0; background: ${colors.canvas}; }
  #map { position: absolute; inset: 0; }

  /* Leaflet chrome, themed to the app rather than left at its defaults.
     Dark mode swaps to MapTiler's real dark basemap instead of inverting the
     light one -- invert() turned parks pink and made every label glow. */
  .leaflet-control-zoom a {
    background: ${colors.surfaceSolid};
    color: ${colors.text};
    border-color: ${colors.line};
  }
  .leaflet-control-attribution {
    background: ${colors.surfaceSolid};
    color: ${colors.textMuted};
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 10px;
  }
  .leaflet-control-attribution a { color: ${colors.primary}; }

  /* Keep the zoom control clear of the native search overlay above it. */
  .leaflet-top { top: 92px; }
  .leaflet-bottom { bottom: 8px; }

  /* ---------- Kitchen marker ---------- */
  .map-marker {
    width: 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(145deg, ${colors.primary300}, ${colors.primary600});
    border: 3px solid ${colors.raised};
    box-shadow: 0 10px 26px -8px rgba(${colors.rgbPrimary}, 0.42);
    display: flex; align-items: center; justify-content: center;
    color: #fff;
  }
  .map-marker svg { width: 20px; height: 20px; stroke: currentColor; fill: none;
    stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }

  /* ---------- "You are here" ---------- */
  .me-marker {
    width: 20px; height: 20px; border-radius: 50%;
    background: ${colors.geo};
    border: 3px solid #fff;
    box-shadow: 0 0 0 2px rgba(47, 125, 246, 0.35), 0 3px 10px rgba(0, 0, 0, 0.35);
  }
  .me-marker::after {
    content: ''; position: absolute; inset: -9px;
    border-radius: 50%; border: 2px solid rgba(47, 125, 246, 0.5);
    animation: mePulse 2.2s ease-out infinite;
  }
  @keyframes mePulse {
    0%   { transform: scale(0.55); opacity: 0.9; }
    100% { transform: scale(1.5);  opacity: 0; }
  }

  /* ---------- Popups inherit the card language ---------- */
  .leaflet-popup-content-wrapper {
    background: ${colors.surfaceSolid};
    color: ${colors.text};
    border-radius: 22px;
    border: 1px solid ${colors.line};
    box-shadow: 0 28px 56px -16px rgba(0,0,0,0.35);
  }
  .leaflet-popup-tip { background: ${colors.surfaceSolid}; }
  .leaflet-popup-content { margin: 14px 16px; }
  .leaflet-popup-close-button { color: ${colors.textMuted} !important; }

  .pop { text-align: center; font-family: -apple-system, system-ui, sans-serif; }
  .pop img {
    width: 54px; height: 54px; border-radius: 50%; object-fit: cover;
    margin-bottom: 8px; border: 2px solid ${colors.raised};
  }
  .pop h4 {
    margin: 0 0 4px; font-size: 18px; font-weight: 700;
    letter-spacing: -0.02em; color: ${colors.text};
  }
  .pop p { margin: 0 0 14px; font-size: 12px; color: ${colors.textMuted}; }
  .pop button {
    background: ${colors.primary}; color: #fff; border: 0; cursor: pointer;
    padding: 11px 22px; font-size: 12.5px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase;
    border-radius: 999px;
    box-shadow: 0 10px 26px -8px rgba(${colors.rgbPrimary}, 0.42);
  }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function () {
  var KEY = ${JSON.stringify(MAPTILER_KEY)};
  var STYLES = ${JSON.stringify(TILE_STYLE)};
  var POINTS = ${JSON.stringify(points)};
  var START  = ${JSON.stringify(DEFAULT_CENTER)};
  var theme  = ${JSON.stringify(theme)};

  function post(payload) {
    var body = JSON.stringify(payload);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(body);
    else if (window.parent !== window) window.parent.postMessage(body, '*');
  }

  function tileUrl(style) {
    return 'https://api.maptiler.com/maps/' + style + '/{z}/{x}/{y}.png?key=' + KEY;
  }

  if (typeof L === 'undefined') {
    post({ type: 'error', message: 'Map library failed to load. Check your connection.' });
    return;
  }

  var map = L.map('map', { zoomControl: true, attributionControl: true })
             .setView([START.lat, START.lng], START.zoom);

  // MapTiler serves 512px tiles, so Leaflet needs the zoom offset or every
  // label renders at half scale.
  var tiles = L.tileLayer(tileUrl(STYLES[theme] || STYLES.light), {
    tileSize: 512,
    zoomOffset: -1,
    minZoom: 1,
    maxZoom: 20,
    crossOrigin: true,
    attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap contributors</a>'
  }).addTo(map);

  tiles.on('tileerror', function () {
    post({ type: 'tileerror' });
  });

  var HAT = '<svg viewBox="0 0 24 24"><path d="M6.4 17.2h11.2"/><path d="M17.6 20.4H6.4v-3.9c0-.6-.4-1.1-.9-1.4a4.4 4.4 0 0 1 2.3-8.3 5.2 5.2 0 0 1 9.4 0 4.4 4.4 0 0 1 2.3 8.3c-.5.3-.9.8-.9 1.4Z"/></svg>';

  var chefIcon = L.divIcon({
    className: 'custom-map-marker',
    html: '<div class="map-marker">' + HAT + '</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22]
  });

  var markers = {};
  POINTS.forEach(function (c) {
    var m = L.marker([c.lat, c.lng], { icon: chefIcon }).addTo(map);
    markers[c.id] = m;
    m.bindPopup(
      '<div class="pop">' +
        '<img src="' + c.avatar + '" alt="">' +
        '<h4>' + c.name + '</h4>' +
        '<p>' + c.specialty + ' &middot; ' + c.area + '</p>' +
        '<button onclick="window.__openChef(' + JSON.stringify(c.id) + ')">View Menu &amp; Order</button>' +
      '</div>',
      { minWidth: 200 }
    );
  });

  // The popup CTA is a real navigation in the app, so it hands the id back
  // to React Native rather than following an href.
  window.__openChef = function (id) { post({ type: 'openChef', id: id }); };

  var meMarker = null, meCircle = null;

  function dropMe(lat, lng, accuracy) {
    if (meMarker) map.removeLayer(meMarker);
    if (meCircle) map.removeLayer(meCircle);

    meMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'me-marker-wrap',
        html: '<div class="me-marker"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      }),
      zIndexOffset: 1000,
      keyboard: false
    }).addTo(map).bindPopup('You are here');

    // Only draw the accuracy ring when the fix is genuinely vague; a 20m ring
    // is just noise under the marker.
    if (accuracy && accuracy > 60) {
      meCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: ${JSON.stringify(colors.geo)}, weight: 1,
        fillColor: ${JSON.stringify(colors.geo)}, fillOpacity: 0.1
      }).addTo(map);
    }
  }

  /* ---------- Commands from React Native ---------- */
  function handle(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'setTheme') {
      theme = msg.theme;
      tiles.setUrl(tileUrl(STYLES[theme] || STYLES.light));

    } else if (msg.type === 'setMe') {
      dropMe(msg.lat, msg.lng, msg.accuracy);

    } else if (msg.type === 'fitNearest') {
      // Frame the visitor plus the closest kitchens.
      var pts = [[msg.me.lat, msg.me.lng]].concat(
        (msg.points || []).map(function (p) { return [p.lat, p.lng]; })
      );
      if (pts.length) {
        map.fitBounds(L.latLngBounds(pts), { padding: [70, 140], maxZoom: 15 });
      }

    } else if (msg.type === 'focus') {
      var m = markers[msg.id];
      if (m) { map.flyTo(m.getLatLng(), 15, { duration: 0.6 }); m.openPopup(); }

    } else if (msg.type === 'flyTo') {
      map.flyTo([msg.lat, msg.lng], msg.zoom || 14, { duration: 0.7 });

    } else if (msg.type === 'closePopups') {
      map.closePopup();
    }
  }

  // iOS delivers these on window, Android on document.
  window.addEventListener('message', function (e) {
    try { handle(JSON.parse(e.data)); } catch (err) {}
  });
  document.addEventListener('message', function (e) {
    try { handle(JSON.parse(e.data)); } catch (err) {}
  });

  map.whenReady(function () { post({ type: 'ready' }); });
}());
</script>
</body>
</html>`;
}

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

export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * The signup location picker (auth.html step 3).
 *
 * The pin is fixed dead centre and the map slides under it -- far less
 * fiddly on a phone than a marker you have to grab exactly. The document
 * only reports its centre; the address lookup and the readout are native.
 */
export function buildPickerHtml({ theme, colors, center = DEFAULT_CENTER }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>
  html, body { height: 100%; margin: 0; background: ${colors.sunken}; overflow: hidden; }
  #map { position: absolute; inset: 0; z-index: 1; }
  .leaflet-control-attribution { font-size: 9px; background: ${colors.surfaceSolid}; color: ${colors.textMuted}; }
  .leaflet-control-attribution a { color: ${colors.primary}; }

  .pin { position: absolute; left: 50%; top: 50%; z-index: 600;
         pointer-events: none; transform: translate(-50%, -50%); }
  .pin-head {
    width: 44px; height: 44px; border-radius: 50%;
    display: grid; place-items: center; color: #fff;
    background: linear-gradient(145deg, ${colors.primary300}, ${colors.primary600});
    border: 3px solid ${colors.raised};
    box-shadow: 0 10px 26px -8px rgba(${colors.rgbPrimary}, 0.42);
    transform: translateY(-24px);
    transition: transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1);
  }
  .pin-head svg { width: 21px; height: 21px; stroke: currentColor; fill: none;
    stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
  .pin-foot {
    position: absolute; left: 50%; bottom: -3px;
    width: 16px; height: 5px; border-radius: 50%;
    background: rgba(${colors.rgbInk}, 0.32);
    transform: translateX(-50%);
    transition: transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.28s ease;
  }
  body.moving .pin-head { transform: translateY(-36px) scale(1.04); }
  body.moving .pin-foot { transform: translateX(-50%) scale(0.6); opacity: 0.55; }
</style>
</head>
<body>
<div id="map"></div>
<div class="pin">
  <div class="pin-head">
    <svg viewBox="0 0 24 24"><path d="M20 10.2c0 5.7-8 11.8-8 11.8s-8-6.1-8-11.8a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.8"/></svg>
  </div>
  <div class="pin-foot"></div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function () {
  var KEY = ${JSON.stringify(MAPTILER_KEY)};
  var STYLES = ${JSON.stringify(TILE_STYLE)};
  var START = ${JSON.stringify(center)};
  var theme = ${JSON.stringify(theme)};

  function post(p) {
    var body = JSON.stringify(p);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(body);
    else if (window.parent !== window) window.parent.postMessage(body, '*');
  }
  function tileUrl(s) {
    return 'https://api.maptiler.com/maps/' + s + '/{z}/{x}/{y}.png?key=' + KEY;
  }

  if (typeof L === 'undefined') { post({ type: 'error' }); return; }

  var map = L.map('map', { zoomControl: false, attributionControl: true })
             .setView([START.lat, START.lng], 15);

  var tiles = L.tileLayer(tileUrl(STYLES[theme] || STYLES.light), {
    tileSize: 512, zoomOffset: -1, minZoom: 3, maxZoom: 20, crossOrigin: true,
    attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OSM</a>'
  }).addTo(map);

  map.on('movestart', function () { document.body.classList.add('moving'); });
  map.on('moveend', function () {
    document.body.classList.remove('moving');
    var c = map.getCenter();
    post({ type: 'centre', lat: c.lat, lng: c.lng });
  });

  function handle(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'setTheme') {
      tiles.setUrl(tileUrl(STYLES[msg.theme] || STYLES.light));
    } else if (msg.type === 'flyTo') {
      map.flyTo([msg.lat, msg.lng], msg.zoom || 16, { duration: 0.9 });
    } else if (msg.type === 'invalidate') {
      map.invalidateSize();
    }
  }
  window.addEventListener('message', function (e) { try { handle(JSON.parse(e.data)); } catch (x) {} });
  document.addEventListener('message', function (e) { try { handle(JSON.parse(e.data)); } catch (x) {} });

  map.whenReady(function () {
    setTimeout(function () { map.invalidateSize(); }, 60);
    var c = map.getCenter();
    post({ type: 'ready', lat: c.lat, lng: c.lng });
  });
}());
</script>
</body>
</html>`;
}

/** MapTiler geocoding, the same endpoints js/auth.js uses. */
const geocodeUrl = (path) =>
  `https://api.maptiler.com/geocoding/${path}.json?key=${MAPTILER_KEY}`;

/** Coordinates -> a human address. A failure is not fatal: the pin is still
    perfectly valid without a street name. */
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(geocodeUrl(`${lng},${lat}`));
    if (!res.ok) throw new Error('geocode failed');
    const data = await res.json();
    const hit = data.features?.[0];
    return hit ? hit.place_name || hit.text : '';
  } catch {
    return '';
  }
}

/** Free-text place search, biased to Bangladesh and centred on Dhaka. */
export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const res = await fetch(
      `${geocodeUrl(encodeURIComponent(q))}&country=bd&proximity=${DEFAULT_CENTER.lng},${DEFAULT_CENTER.lat}`,
    );
    if (!res.ok) throw new Error('search failed');
    const data = await res.json();
    return (data.features ?? []).slice(0, 6).map((f) => ({
      id: f.id ?? f.place_name,
      name: f.text || f.place_name,
      detail: (f.place_name || '').replace(`${f.text}, `, ''),
      lat: f.center?.[1],
      lng: f.center?.[0],
    }));
  } catch {
    return null; // null means "search is unavailable", not "no results"
  }
}
