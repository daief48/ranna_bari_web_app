import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import MapCanvas from '../../src/components/MapCanvas';
import Navbar, { NAVBAR_HEIGHT, NAVBAR_TOP } from '../../src/components/Navbar';
import Icon from '../../src/components/Icon';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useChefs, useMenus } from '../../src/data';
import { useCommerce } from '../../src/store/CommerceContext';
import { expand } from '../../src/lib/search';
import { useLang } from '../../src/i18n/LanguageContext';
import { deliversTo, isOpenNow } from '../../src/lib/kitchen';
import { buildMapHtml } from '../../src/lib/mapHtml';
import { distanceKm, formatDistance } from '../../src/lib/geo';

const NEAREST_COUNT = 5;

/**
 * How search results are grouped.
 *
 * Places before the things inside them: somebody typing a kitchen name
 * wants the kitchen, not the first of its dishes to sort alphabetically.
 */
const KIND_ORDER = { kitchen: 0, shop: 1, meal: 2, dish: 3, product: 4 };

/**
 * How each kind reads in a result row.
 *
 * The same three colours the pins use, so a row and the marker it flies to
 * are recognisably the same thing. A dish borrows its kitchen's vermilion and
 * a shelf item its shop's sage, because that is where tapping it leads.
 */
const KIND_TONE = {
  kitchen: { label: 'Kitchen', icon: 'chefHat', fg: 'primary', bg: 'primary50' },
  shop: { label: 'Shop', icon: 'box', fg: 'sage', bg: 'sage50' },
  meal: { label: 'Meal', icon: 'pot', fg: 'saffron', bg: 'saffron50' },
  dish: { label: 'Dish', icon: 'utensils', fg: 'primary', bg: 'primary50' },
  product: { label: 'Item', icon: 'box', fg: 'sage', bg: 'sage50' },
};

/** Which screen a pin belongs to. */
const hrefFor = (place) =>
  place.kind === 'shop'
    ? `/stores/${place.id}`
    : place.kind === 'meal'
      ? `/meals/${place.id}`
      : `/chef/${place.id}`;

export default function MapScreen() {
  const chefs = useChefs();
  const menus = useMenus();
  const { meals, stores, products } = useCommerce();
  const { t, n } = useLang();
  const { colors, shadow, mode } = useTheme();
  const insets = useSafeAreaInsets();
  /* How tall the nearest-cooks sheet actually came out, so the locate button
     can sit above it instead of guessing. */
  const [sheetHeight, setSheetHeight] = useState(0);
  /* Where the search bar sits, so the overlays and the map document can
     both be placed relative to it. */
  const barTop = insets.top + NAVBAR_TOP + NAVBAR_HEIGHT + 12;
  const router = useRouter();
  const webRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [locState, setLocState] = useState('idle'); // idle | locating | active
  const [panel, setPanel] = useState(null); // null | {title, kind, ...}
  /* The basemap failed to load. Sticky rather than a panel: it is a
     condition of the whole screen, not an answer to something tapped. */
  const [tilesFailed, setTilesFailed] = useState(false);
  /* Kitchens that are shut are still drawn, in grey — this hides them. */
  const [openOnly, setOpenOnly] = useState(false);

  // Reveal the canvas even if the document never posts back, so a missing
  // bridge degrades to "map, possibly empty" rather than an endless spinner.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 6000);
    return () => clearTimeout(t);
  }, []);

  /* The document is rebuilt when the theme flips so the basemap, popups and
     marker gradient all move together. The tile URL is also swapped live via
     postMessage, so the swap is instant and the rebuild only re-skins chrome. */
  const html = useMemo(
    /* Built empty: the places arrive from the server a moment later and are
       posted in, so rebuilding the document around them would throw the
       map back to its default view every time the data refreshed. */
    () => buildMapHtml({ places: [], theme: mode, colors }),
    [mode, colors],
  );

  /**
   * Everything on the map, as one list.
   *
   * Kitchens, shops and meals each have coordinates, so each gets a pin. They
   * are kept in one array rather than three because the map clusters them
   * together, the search ranks across them, and "what is around me" is one
   * question — not three layers a customer has to think to turn on.
   */
  const places = useMemo(() => {
    const rows = [];

    for (const c of chefs) {
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') continue;
      rows.push({
        kind: 'kitchen',
        id: String(c.id),
        lat: c.lat,
        lng: c.lng,
        name: c.name,
        sub: [c.specialty, c.area].filter(Boolean).join(' · '),
        image: c.avatar,
        isOpen: isOpenNow(c),
        deliveryRadiusKm: c.deliveryRadiusKm,
        area: c.area,
      });
    }

    for (const st of stores) {
      if (typeof st.lat !== 'number' || typeof st.lng !== 'number') continue;
      rows.push({
        kind: 'shop',
        id: String(st.id),
        lat: st.lat,
        lng: st.lng,
        name: st.name,
        sub: [st.tagline, st.area].filter(Boolean).join(' · '),
        image: st.logo || st.cover,
        isOpen: st.isOpen !== false,
        deliveryRadiusKm: st.deliveryRadiusKm,
        area: st.area,
      });
    }

    for (const m of meals) {
      if (m.status !== 'published') continue;
      if (typeof m.lat !== 'number' || typeof m.lng !== 'number') continue;
      rows.push({
        kind: 'meal',
        id: String(m.id),
        lat: m.lat,
        lng: m.lng,
        name: m.title,
        sub: [m.cookName, m.serveDate].filter(Boolean).join(' · '),
        image: m.image,
        isOpen: true,
        deliveryRadiusKm: m.deliveryRadiusKm,
        area: m.area,
      });
    }

    return rows;
  }, [chefs, stores, meals]);

  /* One list, so the map and the search can never disagree about what is on
     screen. "Open now" only means anything for a kitchen or a shop — a meal
     is cooked for a date, not for right now, so the filter leaves it alone
     rather than hiding tomorrow's dinner because it is late tonight. */
  const visible = useMemo(
    () => (openOnly ? places.filter((p) => p.kind === 'meal' || p.isOpen) : places),
    [places, openOnly],
  );

  /**
   * What can be typed, and which pin each answer points at.
   *
   * Dishes and shelf items are in here without being on the map: a dish has
   * no coordinates, it has a cook, so searching one takes you to that
   * kitchen. The row still says which dish matched, so the answer is about
   * the thing that was actually asked for.
   */
  const index = useMemo(() => {
    const rows = [];
    const lower = (v) => String(v ?? '').toLowerCase();

    for (const place of visible) {
      rows.push({
        key: place.kind + ':' + place.id,
        kind: place.kind,
        label: place.name,
        detail: place.sub,
        place,
        haystack: lower(place.name + ' ' + place.sub + ' ' + (place.area ?? '')),
      });
    }

    /* A cook's menu. `useMenus` is keyed by the kitchen's own numeric id. */
    for (const doc of menus ?? []) {
      const place = visible.find(
        (x) => x.kind === 'kitchen' && String(x.id) === String(doc.chefId),
      );
      if (!place) continue;
      for (const dish of doc.items ?? []) {
        rows.push({
          key: 'dish:' + dish.id,
          kind: 'dish',
          label: dish.name,
          detail: place.name,
          place,
          haystack: lower(dish.name + ' ' + (dish.tags ?? []).join(' ')),
        });
      }
    }

    /* Things on a shelf, pointing at the shop that stocks them. */
    for (const product of products ?? []) {
      if (!product.active) continue;
      const place = visible.find(
        (x) => x.kind === 'shop' && String(x.id) === String(product.storeId),
      );
      if (!place) continue;
      rows.push({
        key: 'product:' + product.id,
        kind: 'product',
        label: product.name,
        detail: place.name,
        place,
        haystack: lower(product.name + ' ' + (product.description ?? '')),
      });
    }

    return rows;
  }, [visible, menus, products]);

  /**
   * Results, as the word is typed.
   *
   * The app's own matcher, so a Latin-typed word finds its Bengali spelling
   * and the reverse — the same `expand` Browse and the shop search use. Every
   * word has to match something, so typing more narrows rather than widens,
   * which is what somebody doing it expects.
   *
   * Kitchens and shops rank above the things inside them: "Momena" should
   * offer the kitchen before nine of its dishes.
   */
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];

    const forms = words.map((w) => expand(w));

    return index
      .filter((row) =>
        forms.every((variants) => variants.some((f) => row.haystack.includes(f))),
      )
      .sort(
        (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.label.localeCompare(b.label),
      )
      .slice(0, 24);
  }, [query, index]);

  const send = useCallback((msg) => {
    webRef.current?.post(msg);
  }, []);

  /**
   * Tell the document about the kitchens, and about the app's own chrome.
   *
   * Neither can be baked into the HTML. The kitchens arrive from the server
   * a moment after the first render, so a document built once is built with
   * an empty list — no pins, and a search that finds a kitchen and then asks
   * to fly to a marker that was never created. The chrome offsets depend on
   * the safe-area inset, which only this side can measure, and without them
   * Leaflet's zoom buttons sit underneath the search bar.
   *
   * Both are sent rather than rebuilt into the document, so neither throws
   * the map back to its default view when it changes.
   */
  useEffect(() => {
    if (!ready) return;
    send({ type: 'setPlaces', places: visible });
  }, [ready, visible, send]);

  useEffect(() => {
    if (!ready) return;
    send({
      type: 'setChrome',
      /* Nothing of the app's sits at the top any more now that zoom has moved
         down, so this only has to clear the search bar itself. */
      top: barTop + 108,
      /* Stacked up the right edge, in the order a thumb meets them: the tab
         bar, the locate pill, then zoom. Plus the sheet when it is open, so
         the buttons ride above the results rather than under them. */
      bottom: 88 + insets.bottom + 52 + (panel ? sheetHeight + 10 : 0),
    });
  }, [ready, barTop, insets.bottom, panel, sheetHeight, send]);

  const onMessage = useCallback(
    (event) => {
      let msg;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (msg.type === 'ready') {
        setReady(true);
      } else if (msg.type === 'openChef') {
        router.push(`/chef/${msg.id}`);
      } else if (msg.type === 'openStore') {
        router.push(`/stores/${msg.id}`);
      } else if (msg.type === 'openMeal') {
        router.push(`/meals/${msg.id}`);
      } else if (msg.type === 'error') {
        setPanel({ kind: 'error', title: 'Map unavailable', text: msg.message, raw: true });
      } else if (msg.type === 'tileerror') {
        /*
         * The basemap could not load.
         *
         * The document has always reported this and nothing ever listened,
         * so a failed tile fetch left pins floating on blank paper with no
         * explanation — the one failure that looks most like the app being
         * broken. Said once: tiles fail in bursts, and one notice per missing
         * square would be a flood.
         */
        setTilesFailed(true);
      }
    },
    [router],
  );

  /* ---------------- Nearest cooks ----------------
     Ask for the device location, rank every kitchen by great-circle distance
     from it, and list the closest five. */
  const requestLocation = useCallback(async () => {
    setLocState('locating');
    setPanel({ kind: 'loading', title: 'Nearest to you' });

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setLocState('idle');
        setPanel({
          kind: 'error',
          title: 'Location unavailable',
          text: 'Location permission was blocked. Allow it in your device settings, then try again.',
        });
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const me = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      send({ type: 'setMe', ...me, accuracy: pos.coords.accuracy });

      /*
       * Nearest, but reachable first.
       *
       * Straight-line distance on its own puts a kitchen 1km away that only
       * delivers 500m above one 2km away that would actually come — and the
       * customer only finds out at checkout. Every cook sets a radius and
       * `deliversTo` is the rule that reads it, so it decides the order and
       * distance breaks the tie inside each group.
       */
      const ranked = visible
        .filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number')
        .map((c) => {
          const km = distanceKm(me, { lat: c.lat, lng: c.lng });
          return { place: c, km, reachable: deliversTo(c, km) };
        })
        .sort((a, b) => Number(b.reachable) - Number(a.reachable) || a.km - b.km);

      if (!ranked.length) {
        setLocState('active');
        setPanel({
          kind: 'error',
          title: 'Nearest to you',
          text: 'Nothing on the map has a location on file yet.',
        });
        return;
      }

      const top = ranked.slice(0, NEAREST_COUNT);
      setLocState('active');
      setPanel({
        kind: 'list',
        title: 'Nearest to you',
        items: top,
      });

      send({
        type: 'fitNearest',
        me,
        points: top.map((r) => ({ lat: r.place.lat, lng: r.place.lng })),
      });
    } catch (e) {
      setLocState('idle');
      setPanel({
        kind: 'error',
        title: 'Location unavailable',
        text: 'Your location could not be determined right now.',
      });
    }
  }, [send, visible]);

  /**
   * Search shows every kitchen that matches, not the first one.
   *
   * Typing a *place* is the common case — "banani", "dhanmondi" — and there
   * are half a dozen kitchens in each. Flying to whichever one happened to
   * sort first answered a question nobody asked and hid the other five
   * without saying so.
   *
   * So the map frames all of them and rings them, and the sheet lists them.
   * A single match still behaves the way it did: there is nothing to compare
   * it against, so it goes straight to the kitchen and opens its popup.
   */
  /**
   * Show every match, not the first one.
   *
   * Typing a *place* is the common case — "banani", "dhanmondi" — and there
   * are half a dozen kitchens in each. Flying to whichever sorted first
   * answered a question nobody asked and hid the rest without saying so. So
   * the map frames them all, rings them, and the sheet lists them.
   *
   * The results are already computed for the dropdown; this only decides what
   * the map does with them. A dish and its kitchen resolve to the same pin,
   * so the ids are deduplicated before anything is framed — otherwise a
   * kitchen with four matching dishes would be counted four times.
   */
  const runSearch = useCallback(() => {
    if (!query.trim()) return;

    if (!results.length) {
      send({ type: 'highlight', ids: [] });
      setPanel({
        kind: 'error',
        title: 'No match',
        text: 'Nothing found. Try a dish, a kitchen, a shop or an area.',
      });
      return;
    }

    const seen = new Set();
    const hits = [];
    for (const row of results) {
      const key = row.place.kind + ':' + row.place.id;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(row.place);
    }

    send({ type: 'highlight', ids: hits.map((h) => h.id) });

    if (hits.length === 1) {
      send({ type: 'focus', id: hits[0].id });
      setPanel(null);
      return;
    }

    send({
      type: 'fitPoints',
      points: hits.map((h) => ({ lat: h.lat, lng: h.lng })),
    });

    /* The area as it is actually spelled on the cards the customer will see
       next, rather than as it was typed. */
    const typed = query.trim().toLowerCase();
    const area = hits.find((h) => String(h.area ?? '').toLowerCase().includes(typed))?.area;

    setPanel({
      kind: 'list',
      title: area ?? query.trim(),
      subtitle: t('{n} places', { n: n(hits.length) }),
      /* No origin to measure from here, so the rows show the area instead of
         a distance — see the pill in the list below. */
      items: hits.map((place) => ({ place, km: null })),
    });
  }, [query, results, send, t, n]);

  /** One result, chosen from the dropdown. */
  const openResult = useCallback(
    (row) => {
      setQuery('');
      setPanel(null);
      send({ type: 'highlight', ids: [row.place.id] });
      send({ type: 'focus', id: row.place.id });
    },
    [send],
  );



  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* ---- The MapTiler canvas ---- */}
      <MapCanvas
        ref={webRef}
        html={html}
        onMessage={onMessage}
        style={{ flex: 1, backgroundColor: colors.canvas }}
      />

      {!ready ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.canvas,
          }}
        >
          <ActivityIndicator color={colors.primary} />
          <Text
            style={{
              marginTop: 12,
              fontFamily: font.uiSemi,
              fontSize: 11,
              letterSpacing: 11 * tracking.label,
              textTransform: 'uppercase',
              color: colors.textMuted,
            }}
          >
            {t('Loading kitchens')}
          </Text>
        </View>
      ) : null}

      {/* ---- Search overlay ---- */}
      <View
        style={[
          {
            position: 'absolute',
            top: barTop,
            left: 10,
            right: 10,
            flexDirection: 'row',
            alignItems: 'center',
            padding: 6,
            paddingLeft: 12,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
          },
          shadow.lg,
        ]}
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          placeholder={t('Dish, kitchen, shop or area')}
          placeholderTextColor={colors.textLight}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: font.ui,
            fontSize: 16,
            color: colors.text,
            paddingVertical: 10,
            paddingRight: 10,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Search')}
          onPress={runSearch}
          style={({ pressed }) => [
            {
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
            shadow.primary,
          ]}
        >
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: 13,
              letterSpacing: 13 * 0.08,
              textTransform: 'uppercase',
              color: '#FFFFFF',
            }}
          >
            {t('Search')}
          </Text>
        </Pressable>
      </View>

      {/*
       * What matched, while the word is still being typed.
       *
       * Under the bar rather than in the sheet at the bottom: this is the
       * search's own answer and it should sit against the thing that produced
       * it. The sheet is for a result somebody has committed to.
       *
       * Every row says what kind of thing it is, because "Momena's Kitchen"
       * and "Momena's Pantry" are different places and a list of bare names
       * would make somebody tap to find out which. A dish or a shelf item
       * names the kitchen or shop it belongs to underneath, since that is
       * where tapping it will take them.
       */}
      {query.trim() && results.length ? (
        <View
          style={[
            {
              position: 'absolute',
              top: barTop + 62,
              left: 16,
              right: 16,
              maxHeight: 320,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              overflow: 'hidden',
              zIndex: 30,
            },
            shadow.lg,
          ]}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {results.map((row) => {
              const tone = KIND_TONE[row.kind];
              return (
                <Pressable
                  key={row.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.label}, ${t(tone.label)}`}
                  onPress={() => openResult(row)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 11,
                    paddingVertical: 11,
                    paddingHorizontal: 13,
                    backgroundColor: pressed ? colors.sunken : 'transparent',
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line2,
                  })}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors[tone.bg] ?? colors.sunken,
                    }}
                  >
                    <Icon name={tone.icon} size={15} color={colors[tone.fg]} />
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: type.sm + 1,
                        color: colors.text,
                      }}
                    >
                      {row.label}
                    </Text>
                    {row.detail ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {row.detail}
                      </Text>
                    ) : null}
                  </View>

                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 9,
                      letterSpacing: 0.7,
                      textTransform: 'uppercase',
                      color: colors[tone.fg],
                    }}
                  >
                    {t(tone.label)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      {/* ---- Open now, and the tile warning ----
              A row under the search bar rather than a sheet: both are facts
              about what the map is currently showing, and neither is an
              answer to something that was tapped. */}
      <View
        style={{
          position: 'absolute',
          top: barTop + 62,
          left: 10,
          right: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Open now')}
          accessibilityState={{ selected: openOnly }}
          aria-pressed={openOnly}
          onPress={() => setOpenOnly((v) => !v)}
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              paddingVertical: 8,
              paddingHorizontal: 13,
              borderRadius: radius.pill,
              backgroundColor: openOnly ? colors.primary : colors.surfaceSolid,
              borderWidth: 1,
              borderColor: openOnly ? 'transparent' : colors.line,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
            openOnly ? shadow.primary : shadow.sm,
          ]}
        >
          <Icon
            name="clock"
            size={14}
            color={openOnly ? '#FFFFFF' : colors.textMuted}
          />
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: type.xs + 1,
              color: openOnly ? '#FFFFFF' : colors.text,
            }}
          >
            {t('Open now')}
          </Text>
        </Pressable>

        {/* Sits beside the chip rather than over the map, so a map that is
            merely patchy stays usable while it says so. */}
        {tilesFailed ? (
          <View
            style={[
              {
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingVertical: 7,
                paddingHorizontal: 11,
                borderRadius: radius.pill,
                backgroundColor: colors.saffron50,
                borderWidth: 1,
                borderColor: colors.saffron100,
              },
              shadow.sm,
            ]}
          >
            <Icon name="alertCircle" size={13} color={colors.saffron} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: font.ui,
                fontSize: type.xs,
                color: colors.text,
              }}
            >
              {t('Some map tiles did not load.')}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ---- Locate button ---- */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Nearest to you')}
        disabled={locState === 'locating'}
        onPress={requestLocation}
        style={({ pressed }) => [
          {
            /*
             * Bottom right, where a map's locate control lives.
             *
             * It sat under the search bar, which is the one part of the
             * screen a thumb cannot reach and the one part the map most
             * needs left clear — a control pinned over the top centre covers
             * whatever the search just found.
             *
             * `sheetHeight` is measured rather than assumed: the nearest-cooks
             * sheet grows with its contents up to 46% of the screen, so a
             * fixed offset would either float the button in space or bury it
             * under the sheet depending on how many cooks came back.
             */
            position: 'absolute',
            right: 10,
            bottom: 88 + insets.bottom + (panel ? sheetHeight + 10 : 0),
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            paddingVertical: 10,
            paddingLeft: 14,
            paddingRight: 18,
            borderRadius: radius.pill,
            backgroundColor:
              locState === 'active' ? colors.primary : colors.surfaceSolid,
            borderWidth: 1,
            borderColor: locState === 'active' ? 'transparent' : colors.line,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
          locState === 'active' ? shadow.primary : shadow.md,
        ]}
      >
        {locState === 'locating' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Icon
            name="locate"
            size={17}
            color={locState === 'active' ? '#FFFFFF' : colors.primary}
          />
        )}
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: 13,
            color: locState === 'active' ? '#FFFFFF' : colors.text,
          }}
        >
          {locState === 'locating'
            ? 'Locating…'
            : locState === 'active'
              ? 'Near me'
              : t('Nearest to you')}
        </Text>
      </Pressable>

      {/* ---- Nearest-cooks sheet ----
              A card on desktop in the web build; on phones it becomes a
              bottom sheet floating above the app bar. */}
      {panel ? (
        <View
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
          style={[
            {
              position: 'absolute',
              left: 10,
              right: 10,
              bottom: 88 + insets.bottom,
              maxHeight: '46%',
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              overflow: 'hidden',
            },
            shadow.lg,
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.line2,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontFamily: font.uiSemi,
                fontSize: 11,
                letterSpacing: 11 * tracking.label,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {t(panel.title)}
              {/* An area search says how many it found, because the count is
                  the answer — Banani alone does not tell you whether the
                  map is showing you one kitchen or six. */}
              {panel.subtitle ? (
                <Text style={{ color: colors.primary }}> · {panel.subtitle}</Text>
              ) : null}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close nearest cooks"
              hitSlop={10}
              onPress={() => {
                setPanel(null);
                /* Drop the rings with the list. A dimmed map and no results
                   panel is a search whose answer is no longer readable. */
                send({ type: 'highlight', ids: [] });
              }}
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="x" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {panel.kind === 'list' ? (
            <ScrollView contentContainerStyle={{ padding: 8 }}>
              {panel.items.map(({ place, km }) => (
                <Pressable
                  key={place.kind + place.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${place.name}, ${formatDistance(km, t, n) ?? place.area ?? ""}`}
                  onPress={() => send({ type: 'focus', id: place.id })}
                  onLongPress={() => router.push(hrefFor(place))}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    borderRadius: radius.sm,
                    backgroundColor: pressed ? colors.primary50 : 'transparent',
                  })}
                >
                  <Image
                    source={{ uri: place.image }}
                    contentFit="cover"
                    transition={150}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.sunken,
                    }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 16,
                        letterSpacing: -0.16,
                        color: colors.text,
                      }}
                    >
                      {place.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {place.sub}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingVertical: 5,
                      paddingHorizontal: 10,
                      borderRadius: radius.pill,
                      backgroundColor: colors.primary50,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: font.uiBold,
                        fontSize: type.xs,
                        color: colors.primary,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {/* A distance when there is somewhere to measure from,
                          the area when there is not — an empty pill on every
                          row reads as a number that failed to load. */}
                      {formatDistance(km, t, n) ?? place.area}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                padding: 16,
              }}
            >
              {panel.kind === 'loading' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Icon
                  name="alertCircle"
                  size={17}
                  color={panel.kind === 'error' ? colors.primary : colors.saffron}
                />
              )}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: 13.5,
                    lineHeight: 20,
                    color: colors.textMuted,
                  }}
                >
                  {panel.kind === 'loading'
                    ? t('Searching…')
                    : panel.raw
                      ? panel.text
                      : t(panel.text)}
                </Text>

                {panel.kind === 'error' ? (
                  <Pressable onPress={requestLocation} style={{ marginTop: 8 }}>
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 13.5,
                        color: colors.primary,
                        textDecorationLine: 'underline',
                      }}
                    >
                      {t('Try again')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        </View>
      ) : null}

      <Navbar />
    </View>
  );
}
