import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import Icon from './Icon';
import MapCanvas from './MapCanvas';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, tracking, type } from '../theme/tokens';
import {
  DEFAULT_CENTER,
  buildPickerHtml,
  reverseGeocode,
  searchPlaces,
} from '../lib/mapHtml';

/**
 * `.loc-picker` — search bar, map with a centre pin, and an address readout.
 *
 * The map slides under a pin fixed dead centre rather than offering a marker
 * you have to grab exactly; on a phone that is far less fiddly. Every centre
 * change is debounced before it hits MapTiler's reverse geocoder so a single
 * drag does not fire a dozen lookups.
 *
 * @param {object} props
 * @param {(v: {lat:number, lng:number, address:string}) => void} props.onChange
 */
export default function LocationPicker({ onChange, height = 250, center }) {
  const { colors, shadow, mode } = useTheme();
  const { t } = useLang();
  const webRef = useRef(null);
  const reverseTimer = useRef(null);
  const searchTimer = useRef(null);
  const lastCentre = useRef(null);

  const [centre, setCentre] = useState(null);
  const [address, setAddress] = useState('');
  const [pending, setPending] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = closed
  const [searching, setSearching] = useState(false);
  const [locState, setLocState] = useState('idle');

  // Frozen on first render: rebuilding the document mid-edit would reload
  // the map and throw away wherever the pin had been dragged to.
  const [start] = useState(() => ({ ...DEFAULT_CENTER, ...(center ?? {}) }));
  const html = useMemo(
    () => buildPickerHtml({ theme: mode, colors, center: start }),
    [mode, colors, start],
  );

  const send = useCallback((msg) => {
    webRef.current?.post(msg);
  }, []);

  // Clear the debounce timers if the step unmounts mid-drag.
  useEffect(
    () => () => {
      clearTimeout(reverseTimer.current);
      clearTimeout(searchTimer.current);
    },
    [],
  );

  const commit = useCallback(
    (lat, lng) => {
      lastCentre.current = { lat, lng };
      setCentre({ lat, lng });
      setPending(true);

      clearTimeout(reverseTimer.current);
      reverseTimer.current = setTimeout(async () => {
        const found = await reverseGeocode(lat, lng);

        // A newer drag may have landed while the lookup was in flight.
        if (
          lastCentre.current?.lat !== lat ||
          lastCentre.current?.lng !== lng
        ) {
          return;
        }

        const label = found || '';
        setAddress(label);
        setPending(false);
        onChange?.({ lat, lng, address: found });
      }, 420);
    },
    [onChange],
  );

  const onMessage = useCallback(
    (event) => {
      let msg;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'centre' || msg.type === 'ready') {
        commit(msg.lat, msg.lng);
      }
    },
    [commit],
  );

  const runSearch = useCallback(async (text) => {
    const q = text.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    setResults([]);
    const found = await searchPlaces(q);
    setSearching(false);
    setResults(found); // null signals "search unavailable"
  }, []);

  const onQueryChange = (text) => {
    setQuery(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(text), 350);
  };

  const useMyLocation = useCallback(async () => {
    setLocState('locating');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocState('idle');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      send({
        type: 'flyTo',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        zoom: 16,
      });
      setLocState('active');
    } catch {
      setLocState('idle');
    }
  }, [send]);

  return (
    <View>
      <View
        style={[
          {
            borderRadius: radius.md,
            overflow: 'hidden',
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
          },
          shadow.sm,
        ]}
      >
        {/* ---- Search ---- */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingLeft: 12,
            paddingRight: 8,
            backgroundColor: colors.sunken,
            borderBottomWidth: 1,
            borderBottomColor: colors.line2,
          }}
        >
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            onSubmitEditing={() => {
              clearTimeout(searchTimer.current);
              runSearch(query);
            }}
            returnKeyType="search"
            placeholder="Search an area, e.g. Dhanmondi 27"
            placeholderTextColor={colors.textLight}
            autoCorrect={false}
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: font.ui,
              fontSize: 16,
              color: colors.text,
              paddingVertical: 6,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Find')}
            onPress={() => {
              clearTimeout(searchTimer.current);
              runSearch(query);
            }}
            style={({ pressed }) => ({
              paddingVertical: 9,
              paddingHorizontal: 13,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: 11,
                letterSpacing: 0.66,
                textTransform: 'uppercase',
                color: '#FFFFFF',
              }}
            >
              {t('Find')}
            </Text>
          </Pressable>
        </View>

        {/* ---- Map ---- */}
        <View style={{ height, backgroundColor: colors.sunken }}>
          <MapCanvas
            ref={webRef}
            html={html}
            onMessage={onMessage}
            scrollEnabled={false}
            style={{ flex: 1, backgroundColor: colors.sunken }}
          />

          {/* bottom: 24, not 12 -- Leaflet's attribution strip owns the
              bottom ~17px of the frame. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
            disabled={locState === 'locating'}
            onPress={useMyLocation}
            style={[
              {
                position: 'absolute',
                right: 12,
                bottom: 24,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 10,
                paddingLeft: 13,
                paddingRight: 16,
                borderRadius: radius.pill,
                backgroundColor:
                  locState === 'active' ? colors.primary : colors.surfaceSolid,
                borderWidth: 1,
                borderColor: locState === 'active' ? 'transparent' : colors.line,
              },
              locState === 'active' ? shadow.primary : shadow.md,
            ]}
          >
            {locState === 'locating' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon
                name="locate"
                size={16}
                color={locState === 'active' ? '#FFFFFF' : colors.primary}
              />
            )}
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: 12.5,
                color: locState === 'active' ? '#FFFFFF' : colors.text,
              }}
            >
              {locState === 'locating' ? t('Searching…') : t('Use my location')}
            </Text>
          </Pressable>
        </View>

        {/* ---- Readout ---- */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderTopWidth: 1,
            borderTopColor: colors.line2,
          }}
          accessibilityLiveRegion="polite"
        >
          <Icon name="navigation" size={18} color={colors.primary} />

          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Bengali place names are long: two lines rather than an
                ellipsis that cuts after about four characters. */}
            <Text
              numberOfLines={2}
              style={{
                fontFamily: font.uiSemi,
                fontSize: 14.5,
                color: colors.text,
              }}
            >
              {address || 'Move the map to drop your pin'}
            </Text>
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.xs,
                color: colors.textLight,
                fontVariant: ['tabular-nums'],
              }}
            >
              {centre
                ? `${centre.lat.toFixed(5)}, ${centre.lng.toFixed(5)}`
                : '—'}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 5,
              paddingHorizontal: 9,
              borderRadius: radius.pill,
              backgroundColor: pending ? colors.saffron50 : colors.sage50,
            }}
          >
            <Icon
              name={pending ? 'clock' : 'shieldCheck'}
              size={13}
              color={pending ? colors.saffron : colors.sage}
            />
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 10,
                letterSpacing: 10 * tracking.label,
                textTransform: 'uppercase',
                color: pending ? colors.saffron : colors.sage,
              }}
            >
              {pending ? t('Searching…') : t('Pinned')}
            </Text>
          </View>
        </View>
      </View>

      {/* ---- Search results ---- */}
      {results !== null || searching ? (
        <View
          style={[
            {
              marginTop: 8,
              padding: 6,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              maxHeight: 200,
            },
            shadow.md,
          ]}
        >
          {searching ? (
            <Text style={msgStyle(colors)}>{t('Searching…')}</Text>
          ) : results === null ? (
            <Text style={msgStyle(colors)}>
              Search is unavailable right now — drag the map instead.
            </Text>
          ) : results.length === 0 ? (
            <Text style={msgStyle(colors)}>
              Nothing found. Try a nearby landmark.
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {results.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setQuery(r.name);
                    setResults(null);
                    if (typeof r.lat === 'number') {
                      send({ type: 'flyTo', lat: r.lat, lng: r.lng, zoom: 16 });
                    }
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 10,
                    borderRadius: radius.xs,
                    backgroundColor: pressed ? colors.primary50 : 'transparent',
                  })}
                >
                  <Icon name="pin" size={15} color={colors.primary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: type.sm,
                        color: colors.text,
                      }}
                    >
                      {r.name}
                    </Text>
                    {r.detail ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {r.detail}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

const msgStyle = (colors) => ({
  padding: 12,
  fontFamily: font.ui,
  fontSize: 13,
  lineHeight: 20,
  color: colors.textMuted,
});
