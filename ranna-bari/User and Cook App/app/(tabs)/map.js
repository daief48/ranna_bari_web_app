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
import { useChefs } from '../../src/data';
import { useLang } from '../../src/i18n/LanguageContext';
import { deliversTo, isOpenNow } from '../../src/lib/kitchen';
import { buildMapHtml } from '../../src/lib/mapHtml';
import { distanceKm, formatDistance } from '../../src/lib/geo';

const NEAREST_COUNT = 5;

export default function MapScreen() {
  const chefs = useChefs();
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
    () => buildMapHtml({ chefs, theme: mode, colors }),
    [mode, colors],
  );

  /* One list, so the map and the search can never disagree about which
     kitchens are on screen. */
  const visible = useMemo(
    () => (openOnly ? chefs.filter(isOpenNow) : chefs),
    [chefs, openOnly],
  );

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
    send({ type: 'setChefs', chefs: visible });
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
          return { chef: c, km, reachable: deliversTo(c, km) };
        })
        .sort((a, b) => Number(b.reachable) - Number(a.reachable) || a.km - b.km);

      if (!ranked.length) {
        setLocState('active');
        setPanel({
          kind: 'error',
          title: 'Nearest to you',
          text: 'No kitchens have a location on file yet.',
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
        points: top.map((r) => ({ lat: r.chef.lat, lng: r.chef.lng })),
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
  const runSearch = useCallback(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    const has = (value) => String(value ?? '').toLowerCase().includes(q);

    const hits = visible.filter(
      (c) =>
        typeof c.lat === 'number' &&
        typeof c.lng === 'number' &&
        (has(c.name) || has(c.specialty) || has(c.area)),
    );

    if (!hits.length) {
      send({ type: 'highlight', ids: [] });
      setPanel({
        kind: 'error',
        title: 'No match',
        text: 'Nothing found. Try a nearby landmark.',
      });
      return;
    }

    send({ type: 'highlight', ids: hits.map((c) => c.id) });

    if (hits.length === 1) {
      send({ type: 'focus', id: hits[0].id });
      setPanel(null);
      return;
    }

    send({
      type: 'fitPoints',
      points: hits.map((c) => ({ lat: c.lat, lng: c.lng })),
    });

    /* The area as the cooks themselves spell it, rather than as it was
       typed — "banani" becomes "Banani" because that is the label on every
       card the customer will see next. */
    const area = hits.find((c) => has(c.area))?.area;
    setPanel({
      kind: 'list',
      title: area ?? query.trim(),
      subtitle: t('{n} kitchens', { n: n(hits.length) }),
      /* No origin to measure from here, so the rows show the area instead of
         a distance — see the pill in the list below. */
      items: hits.map((chef) => ({ chef, km: null })),
    });
  }, [query, send, visible, t, n]);


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
          placeholder={t('Search areas or kitchens (e.g. Dhanmondi)')}
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
              {panel.items.map(({ chef, km }) => (
                <Pressable
                  key={chef.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${chef.name}, ${formatDistance(km, t, n)}`}
                  onPress={() => send({ type: 'focus', id: chef.id })}
                  onLongPress={() => router.push(`/chef/${chef.id}`)}
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
                    source={{ uri: chef.avatar }}
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
                      {chef.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {chef.specialty}
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
                      {formatDistance(km, t, n) ?? chef.area}
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
