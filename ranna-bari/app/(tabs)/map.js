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
import { buildMapHtml } from '../../src/lib/mapHtml';
import { distanceKm, formatDistance } from '../../src/lib/geo';

const NEAREST_COUNT = 5;

export default function MapScreen() {
  const chefs = useChefs();
  const { t, n } = useLang();
  const { colors, shadow, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [locState, setLocState] = useState('idle'); // idle | locating | active
  const [panel, setPanel] = useState(null); // null | {title, kind, ...}

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

  const send = useCallback((msg) => {
    webRef.current?.post(msg);
  }, []);

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

      const ranked = chefs
        .filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number')
        .map((c) => ({ chef: c, km: distanceKm(me, { lat: c.lat, lng: c.lng }) }))
        .sort((a, b) => a.km - b.km);

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
  }, [send, chefs]);

  /** Search jumps to the first kitchen whose name, specialty or area matches. */
  const runSearch = useCallback(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    const hit = chefs.find(
      (c) =>
        typeof c.lat === 'number' &&
        (c.name.toLowerCase().includes(q) ||
          c.specialty.toLowerCase().includes(q) ||
          c.area.toLowerCase().includes(q)),
    );

    if (hit) {
      send({ type: 'focus', id: hit.id });
      setPanel(null);
    } else {
      setPanel({
        kind: 'error',
        title: 'No match',
        text: 'Nothing found. Try a nearby landmark.',
      });
    }
  }, [query, send, chefs]);

  const barTop = insets.top + NAVBAR_TOP + NAVBAR_HEIGHT + 12;

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

      {/* ---- Locate button ---- */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Nearest to you')}
        disabled={locState === 'locating'}
        onPress={requestLocation}
        style={({ pressed }) => [
          {
            position: 'absolute',
            top: barTop + 62,
            alignSelf: 'center',
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
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close nearest cooks"
              hitSlop={10}
              onPress={() => setPanel(null)}
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
                      {formatDistance(km, t, n)}
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
