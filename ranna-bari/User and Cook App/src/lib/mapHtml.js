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
export function buildMapHtml({ places, theme, colors }) {
  const points = (places ?? [])
    .filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number')
    .map((c) => ({
      id: c.id,
      /* 'kitchen' | 'shop' | 'meal' — decides the pin's colour and glyph, and
         which screen its popup opens. */
      kind: c.kind ?? 'kitchen',
      lat: c.lat,
      lng: c.lng,
      name: esc(c.name),
      /* One line under the name. What belongs there differs by kind — a
         kitchen's specialty and area, a shop's tagline, a meal's day — so it
         is composed by the caller rather than assembled from fields this
         function would have to know the meaning of. */
      sub: esc(c.sub),
      image: esc(c.image),
      /* Whether it is trading, and how far it will come. The pin is drawn
         grey when shut and rings its radius when tapped, so both have to
         travel with the point rather than being looked up again. */
      isOpen: c.isOpen !== false,
      deliveryRadiusKm:
        typeof c.deliveryRadiusKm === 'number' ? c.deliveryRadiusKm : null,
    }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
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

  /* Keep Leaflet's controls clear of the app's own overlays. The offsets are
     set by a "setChrome" message once the app has measured its bars; these
     fallbacks are what a device with no notch would want, so a document that
     never receives one is merely approximate rather than broken. */
  .leaflet-top { top: var(--top-chrome, 92px); }
  .leaflet-bottom { bottom: var(--bottom-chrome, 8px); }

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

  /*
   * The result of a search, as opposed to everything else on the map.
   *
   * A ring rather than a different fill: the pin's colour already means
   * "kitchen", and recolouring it to mean "matched" would give one symbol two
   * jobs. Everything unmatched steps back instead — dimmed rather than
   * hidden, because the point of a map is that the surroundings stay on it.
   */
  .map-marker.is-hit {
    box-shadow:
      0 0 0 4px rgba(${colors.rgbPrimary}, 0.28),
      0 12px 30px -8px rgba(${colors.rgbPrimary}, 0.5);
    z-index: 500;
  }
  .map-marker.is-dim { opacity: 0.32; }

  /*
   * What kind of place this is.
   *
   * Vermilion is a kitchen and stays the default, because that is what the
   * map was and what most pins still are. Sage is a shop — the same green the
   * cook panel uses for its shelf everywhere else in the app — and saffron is
   * a meal, which is the app's accent for something happening on a date.
   *
   * The shut and hit states are deliberately left to override these: a closed
   * shop and a closed kitchen are the same fact and should read the same way.
   */
  .map-marker.kind-shop {
    background: linear-gradient(145deg, ${colors.sage}, ${colors.sage});
    box-shadow: 0 10px 26px -8px rgba(${colors.rgbSage}, 0.42);
  }
  .map-marker.kind-meal {
    background: linear-gradient(145deg, ${colors.saffron}, ${colors.saffron});
    box-shadow: 0 10px 26px -8px rgba(${colors.rgbSaffron}, 0.42);
  }

  /*
   * A kitchen that is shut.
   *
   * Drawn, not hidden: a customer scanning their neighbourhood should see
   * that a cook exists there and is closed right now, which is a different
   * answer from "nobody cooks here". Grey rather than dimmed, because dim
   * already means "not part of this search".
   */
  .map-marker.is-shut {
    background: linear-gradient(145deg, #b9b3a6, #8c877c);
    box-shadow: 0 8px 20px -8px rgba(31, 29, 26, 0.4);
  }

  /*
   * The cluster bubble.
   *
   * One shape, sized by how much it is holding, rather than markercluster's
   * default three-tier green/yellow/orange — that palette means nothing here
   * and would collide with the status colours the rest of the app uses.
   */
  .cluster {
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: linear-gradient(145deg, ${colors.primary300}, ${colors.primary600});
    border: 3px solid ${colors.raised};
    box-shadow: 0 10px 26px -8px rgba(${colors.rgbPrimary}, 0.45);
    color: #fff;
    font-family: -apple-system, system-ui, sans-serif;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .cluster.s { width: 38px; height: 38px; font-size: 13px; }
  .cluster.m { width: 46px; height: 46px; font-size: 14.5px; }
  .cluster.l { width: 56px; height: 56px; font-size: 16px; }
  .cluster.is-hit { box-shadow: 0 0 0 4px rgba(${colors.rgbPrimary}, 0.28), 0 12px 30px -8px rgba(${colors.rgbPrimary}, 0.5); }
  .cluster.is-dim { opacity: 0.32; }
  .marker-cluster { background: transparent; }

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
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
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

  /*
   * Zoom bottom right, where a thumb is, and where every map app puts it.
   *
   * Leaflet defaults it to the top left, which on a phone is the far corner
   * from the hand holding it and directly under this app's own search bar.
   * The attribution moves to the other corner rather than stacking beneath
   * it — it is a legal notice, not a control, and it should not be the thing
   * a thumb lands on.
   */
  var map = L.map('map', { zoomControl: false, attributionControl: false })
             .setView([START.lat, START.lng], START.zoom);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.attribution({ position: 'bottomleft' }).addTo(map);

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

  /* A shelf, and a covered dish. Same 24-grid and stroke weight as the hat
     so the three read as one family. */
  var BOX = '<svg viewBox="0 0 24 24"><path d="M21 8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M2 3h20v5H2z"/><path d="M10 12h4"/></svg>';
  var POT = '<svg viewBox="0 0 24 24"><path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6Z"/><path d="M2 10h20"/><path d="M8 6c0-1 1-1.5 1-2.5"/><path d="M12 6c0-1 1-1.5 1-2.5"/><path d="M16 6c0-1 1-1.5 1-2.5"/></svg>';

  var GLYPH = { kitchen: HAT, shop: BOX, meal: POT };

  var chefIcon = L.divIcon({
    className: 'custom-map-marker',
    html: '<div class="map-marker">' + HAT + '</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22]
  });

  var markers = {};

  /**
   * Put a set of kitchens on the map, replacing whatever is there.
   *
   * The list used to be baked into this document at build time, which was
   * fine while it came from a bundled JSON — it was there on the first
   * render. It comes from the server now and arrives a moment later, so a
   * document built once was built with nothing: no pins, and a search that
   * found a kitchen and then asked to fly to a marker that did not exist.
   *
   * Re-rendering the whole document on every change would work and would
   * also throw the map back to its default view each time, so the list is
   * sent over the bridge instead and only the markers are rebuilt.
   */
  /*
   * One group, so overlapping pins collapse into a countable bubble.
   *
   * Spiderfying is off: it fans coincident markers out on a little web,
   * which is clever on a desktop and unusable under a thumb. Tapping a
   * cluster zooms to its bounds instead, the same gesture the rest of the
   * map already answers to.
   */
  var cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    /*
     * Fan out markers that share a point.
     *
     * This was off when everything on the map was a kitchen and no two of
     * them stood in the same doorway. A shop takes its cook's coordinates
     * when it has none of its own — which is the common case, because most
     * cooks sell off the shelf from the kitchen they cook in — so a kitchen
     * and its shop are now frequently the *same point*. Clustering never
     * separates those at any zoom, so without this the shop is unreachable:
     * it exists, it is in the cluster's count, and no amount of zooming will
     * ever draw it.
     */
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 46,
    iconCreateFunction: function (c) {
      var n = c.getChildCount();
      var size = n < 10 ? 's' : n < 50 ? 'm' : 'l';

      /*
       * A bubble says whether the answer is inside it.
       *
       * Without this a search can match six kitchens, zoom to them, and show
       * a plain "6" — the results are on screen and none of them look like
       * results. The count of matches is shown rather than the total, because
       * that is the number the search was asked for.
       */
      var kids = c.getAllChildMarkers();
      var found = 0;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].__rbId && hitIds[kids[i].__rbId]) found++;
      }
      var state = !hitAny ? '' : found ? ' is-hit' : ' is-dim';
      var label = hitAny && found ? found + '/' + n : String(n);

      return L.divIcon({
        html: '<div class="cluster ' + size + state + '">' + label + '</div>',
        className: 'marker-cluster',
        iconSize: null
      });
    }
  }).addTo(map);

  /** The radius ring for whichever kitchen's popup is open, if any. */
  var radiusRing = null;

  function clearRadius() {
    if (radiusRing) { map.removeLayer(radiusRing); radiusRing = null; }
  }

  /*
   * The list baked in at build time went through esc() on the way here; a
   * list that arrives over the bridge has not, and both end up in the same
   * innerHTML. Escaping at the point of use covers whichever way a kitchen
   * reached this function.
   */
  function safe(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Draw every place the map knows about.
   *
   * One list rather than three layers: they cluster together, they are
   * searched together, and a customer looking at a neighbourhood wants to see
   * what is there — not to toggle which halves of it are allowed on screen.
   */
  function setPlaces(list) {
    cluster.clearLayers();
    clearRadius();
    markers = {};

    (list || []).forEach(function (c) {
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return;

      var kind = c.kind || 'kitchen';
      var shut = c.isOpen === false;
      var icon = L.divIcon({
        className: 'custom-map-marker',
        html:
          '<div class="map-marker kind-' + kind + (shut ? ' is-shut' : '') + '">' +
            (GLYPH[kind] || HAT) +
          '</div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -22]
      });

      var m = L.marker([c.lat, c.lng], { icon: icon });
      /* The cluster bubble counts its matches, and a Leaflet marker carries
         no id of its own. */
      m.__rbId = c.id;
      markers[c.id] = m;

      var action =
        kind === 'shop' ? 'window.__openStore' :
        kind === 'meal' ? 'window.__openMeal' :
        'window.__openChef';

      var cta =
        kind === 'shop' ? 'Open the shop' :
        kind === 'meal' ? 'See this meal' :
        'View Menu &amp; Order';

      m.bindPopup(
        '<div class="pop">' +
          '<img src="' + safe(c.image || c.avatar) + '" alt="">' +
          '<h4>' + safe(c.name) + '</h4>' +
          '<p>' + safe(c.sub) +
            (shut ? ' &middot; <b>Closed now</b>' : '') + '</p>' +
          /*
           * The id is a JavaScript string inside an HTML attribute, so it is
           * quoted for both layers.
           *
           * This was JSON.stringify(c.id) dropped straight into
           * onclick="…", which worked only for as long as every id was a
           * number: stringify puts double quotes around a string, and those
           * closed the attribute early and left the button inert. Kitchen ids
           * became strings when kitchens, shops and meals were unified into
           * one list of places, so every popup button on the map stopped
           * navigating at once.
           *
           * safe() turns the quotes into &quot;, which the parser decodes
           * back to a quote when it reads the attribute — so the JavaScript
           * that eventually runs sees a properly quoted string.
           */
          '<button onclick="' + safe(action + '(' + JSON.stringify(String(c.id)) + ')') + '">' +
            cta +
          '</button>' +
        '</div>',
        { minWidth: 200 }
      );

      /*
       * How far this kitchen will actually come.
       *
       * The delivery rule is what decides whether an order is even
       * possible, and until now the customer met it at checkout. Drawing it
       * when the popup opens answers "will they deliver to me" at the moment
       * the question is being asked.
       */
      m.on('popupopen', function () {
        clearRadius();
        if (typeof c.deliveryRadiusKm !== 'number' || c.deliveryRadiusKm <= 0) return;
        radiusRing = L.circle([c.lat, c.lng], {
          radius: c.deliveryRadiusKm * 1000,
          color: ${JSON.stringify(colors.primary)},
          weight: 1.5,
          opacity: 0.55,
          fillColor: ${JSON.stringify(colors.primary)},
          fillOpacity: 0.07,
          interactive: false
        }).addTo(map);
      });
      m.on('popupclose', clearRadius);

      cluster.addLayer(m);
    });
  }

  setPlaces(POINTS);

  /**
   * Ring the kitchens a search matched, and step the rest back.
   *
   * Passing nothing clears the selection rather than dimming everything —
   * "no search running" and "a search that matched nothing" have to look
   * different, and only the first of them is a map you can still read.
   */
  /**
   * Which kitchens the current search matched. Kept, not just applied.
   *
   * A marker inside a collapsed cluster has no element in the document, so
   * painting the class once only reaches whatever happens to be visible at
   * that moment — and the rest come back unmarked as the user zooms in. The
   * set is the state; painting is how it reaches the screen, and it runs
   * again every time the cluster layer rebuilds.
   */
  var hitIds = {};
  var hitAny = false;

  function paintHighlight() {
    Object.keys(markers).forEach(function (id) {
      var el = markers[id].getElement();
      if (!el) return;
      var dot = el.querySelector('.map-marker');
      if (!dot) return;
      dot.classList.toggle('is-hit', hitAny && !!hitIds[id]);
      dot.classList.toggle('is-dim', hitAny && !hitIds[id]);
    });
  }

  function highlight(ids) {
    hitIds = {};
    (ids || []).forEach(function (id) { hitIds[id] = true; });
    hitAny = (ids || []).length > 0;

    /* Rebuild the bubbles so a cluster hiding a match says so, then paint
       whatever is now on screen. */
    if (cluster.refreshClusters) cluster.refreshClusters();
    paintHighlight();
  }

  /* Zooming, panning and cluster animations all swap marker elements in and
     out, and every one of them would otherwise drop the search's rings. */
  cluster.on('animationend', paintHighlight);
  map.on('zoomend moveend', paintHighlight);

  // The popup CTA is a real navigation in the app, so it hands the id back
  // to React Native rather than following an href.
  window.__openChef = function (id) { post({ type: 'openChef', id: id }); };
  window.__openStore = function (id) { post({ type: 'openStore', id: id }); };
  window.__openMeal = function (id) { post({ type: 'openMeal', id: id }); };

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
      if (m) {
        /*
         * Ask the cluster to reveal it, rather than flying to a coordinate
         * and hoping.
         *
         * flyTo moved the camera to the right place and then opened a
         * popup on a marker that was still inside a cluster — so nothing
         * appeared. zoomToShowLayer is the cluster plugin's own answer: it
         * zooms, and spiderfies if the marker shares its point with others,
         * and only then hands the marker back.
         */
        cluster.zoomToShowLayer(m, function () { m.openPopup(); });
      }

    } else if (msg.type === 'flyTo') {
      map.flyTo([msg.lat, msg.lng], msg.zoom || 14, { duration: 0.7 });

    } else if (msg.type === 'fitPoints') {
      /* Every kitchen the search matched, framed together. The zoom ceiling
         stops a single result from slamming to street level, which reads as
         a bug next to the same action returning six. */
      var fitPts = (msg.points || []).map(function (p) { return [p.lat, p.lng]; });
      if (fitPts.length) {
        map.fitBounds(L.latLngBounds(fitPts), { padding: [80, 80], maxZoom: msg.maxZoom || 14 });
      }

    } else if (msg.type === 'highlight') {
      highlight(msg.ids);

    } else if (msg.type === 'setPlaces') {
      setPlaces(msg.places);

    } else if (msg.type === 'setChrome') {
      /* Where the app's own overlays are, so Leaflet's controls can sit
         clear of them. The search bar's height depends on the safe-area
         inset, which this document has no way to measure — only the app
         knows, so only the app can say. */
      var root = document.documentElement.style;
      if (typeof msg.top === 'number') root.setProperty('--top-chrome', msg.top + 'px');
      if (typeof msg.bottom === 'number') root.setProperty('--bottom-chrome', msg.bottom + 'px');

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
