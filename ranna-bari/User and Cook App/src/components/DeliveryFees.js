import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import FloatLabelInput from './FloatLabelInput';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';
import { DIVISION_NAMES, divisionFromText } from '../lib/bd-areas';
import { digitsOnly } from '../lib/format';
import { reverseGeocode } from '../lib/mapHtml';

/**
 * The shop's two delivery prices: inside its own division, and everywhere else.
 *
 * "Inside" used to mean Dhaka, always — a Chattogram shop was told to price
 * "inside Dhaka" and had no way to say its own town. The division now comes
 * from where the shop actually is: the pin on the map when one has been
 * placed, else the kitchen's pin read back through the same geocoder. Typed
 * nowhere, so it cannot drift from the map; a cook whose pin reads as the
 * wrong division (or none) can still tap one.
 *
 * Two prices and nothing else — no flat fee beside them, no free-over
 * threshold. A flat fee next to two specific ones was the thing cooks could
 * not read: which of the three wins? Neither of the two ever falls back to it
 * now, because both are always filled.
 *
 * @param {object} props
 * @param {string} props.home        The shop's division ('' until known).
 * @param {(d: string) => void} props.onHome
 * @param {string} props.inside      Fee inside it, as typed.
 * @param {(v: string) => void} props.onInside
 * @param {string} props.outside     Fee everywhere else, as typed.
 * @param {(v: string) => void} props.onOutside
 * @param {string} [props.address]   The pin's address text, when one was placed.
 * @param {number} [props.lat]       The pin the shop falls back to…
 * @param {number} [props.lng]       …when it has none of its own.
 */
export default function DeliveryFees({
  home,
  onHome,
  inside,
  onInside,
  outside,
  onOutside,
  address,
  lat,
  lng,
}) {
  const { colors } = useTheme();
  const { t } = useLang();
  const [choosing, setChoosing] = useState(false);

  /* A pin the cook just placed is the freshest word on where the shop is, so
     it decides — even over a division they chose by hand before moving it. */
  useEffect(() => {
    if (!address) return;
    const found = divisionFromText(address);
    if (found) onHome(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  /* No pin of its own: read the kitchen's, once, and only to fill a blank —
     never over a division the shop already has. */
  useEffect(() => {
    if (home || address || !(Number.isFinite(lat) && Number.isFinite(lng)) || (!lat && !lng)) {
      return undefined;
    }
    let off = false;
    reverseGeocode(lat, lng).then((text) => {
      const found = divisionFromText(text);
      if (!off && found) onHome(found);
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const place = home ? t(home) : t('your division');
  const open = choosing || !home;

  /* Bengali numerals folded first: a cook typing ৳৪০ on a Bengali keyboard
     was handed an empty field. */
  const clean = (fn) => (v) => fn(digitsOnly(v));

  return (
    <View style={{ marginBottom: 6 }}>
      {/* ---- where "inside" is ---- */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: 20,
            color: colors.textMuted,
          }}
        >
          {home
            ? t('Your shop is in {place}.', { place })
            : t('Pick the division your shop is in.')}
        </Text>
        {home ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setChoosing((v) => !v)}
            hitSlop={8}
          >
            <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.primary }}>
              {choosing ? t('Done') : t('Change')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {DIVISION_NAMES.map((name) => {
            const on = home === name;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onHome(name);
                  setChoosing(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: radius.pill,
                  backgroundColor: on ? colors.sage : colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: on ? colors.sage : colors.line,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontFamily: on ? font.uiBold : font.uiSemi,
                    fontSize: 12,
                    color: on ? '#FFFFFF' : colors.textMuted,
                  }}
                >
                  {t(name)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* ---- the two prices, full width so neither label is cut short ---- */}
      <View style={{ marginTop: 14 }}>
        <FloatLabelInput
          label={t('Delivery fee inside {place} (৳)', { place })}
          value={inside}
          onChangeText={clean(onInside)}
          keyboardType="number-pad"
          placeholder="0"
        />
        <FloatLabelInput
          label={t('Delivery fee outside {place} (৳)', { place })}
          value={outside}
          onChangeText={clean(onOutside)}
          keyboardType="number-pad"
          placeholder="0"
        />
      </View>
    </View>
  );
}
