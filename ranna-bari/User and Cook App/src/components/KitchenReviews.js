/**
 * What customers say about a cook — the reviews, in public.
 *
 * The card only ever showed "4.2 (9)". That says how many and how high, not
 * why, and the moment a customer most wants the why is on the dish or the
 * product they are about to pay for. So this block sits at the bottom of the
 * dish page, the product page and the chef page. Reviews are the *kitchen's*
 * (that is what an order review rates), so all three pages read the same
 * endpoint with the same kitchen id; nothing here is per product.
 *
 * Loading is honest: while the first page is in flight it shows a quiet
 * placeholder, never "No reviews yet" — telling a cook with forty reviews that
 * they have none because the network blinked would be a lie. A failed first
 * load shows a retry instead of the empty state for the same reason.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import Icon from './Icon';
import { Body, Heading } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';
import { call } from '../lib/server';

const FIRST_PAGE = 5;

function Stars({ value, size = 13 }) {
  const { colors } = useTheme();
  const rounded = Math.round(value);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon
          key={i}
          name="star"
          size={size}
          color={i <= rounded ? colors.saffron : colors.line}
          fill={i <= rounded ? colors.saffron : 'none'}
          strokeWidth={2}
        />
      ))}
    </View>
  );
}

/* "12 Oct 2026" — a review's age matters less than its date, and the date
   needs no clock arithmetic that could be wrong across time zones. */
function dayOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function KitchenReviews({ kitchenId, cookName }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [more, setMore] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadFirst = useCallback(async () => {
    if (!kitchenId) return;
    setState('loading');
    const out = await call(`/kitchens/${encodeURIComponent(kitchenId)}/reviews?take=${FIRST_PAGE}`);
    if (!alive.current) return;
    if (!out.ok) {
      setState('error');
      return;
    }
    setRows(out.result.reviews ?? []);
    setSummary(out.result.summary ?? null);
    setCursor(out.result.cursor ?? null);
    setState('ready');
  }, [kitchenId]);

  useEffect(() => {
    setRows([]);
    setSummary(null);
    setCursor(null);
    loadFirst();
  }, [loadFirst]);

  const showMore = async () => {
    if (!cursor || more) return;
    setMore(true);
    const out = await call(
      `/kitchens/${encodeURIComponent(kitchenId)}/reviews?take=${FIRST_PAGE}&before=${encodeURIComponent(cursor)}`,
    );
    if (!alive.current) return;
    setMore(false);
    if (!out.ok) return;
    setRows((prev) => {
      /* De-duplicate by id: a review posted between two pages shifts nothing
         with a timestamp cursor, but a repeated tap must never double a row. */
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...(out.result.reviews ?? []).filter((r) => !seen.has(r.id))];
    });
    setCursor(out.result.cursor ?? null);
  };

  if (!kitchenId) return null;

  const count = summary?.reviewCount ?? 0;

  return (
    <View style={{ marginTop: 28, gap: 14 }} testID="kitchen-reviews">
      <Heading size={20}>
        {cookName
          ? t('What customers say about {cook}', { cook: cookName })
          : t('What customers say')}
      </Heading>

      {state === 'loading' ? (
        <Body muted size={14}>
          {t('Loading reviews…')}
        </Body>
      ) : state === 'error' ? (
        <View style={{ gap: 10, alignItems: 'flex-start' }}>
          <Body muted size={14}>
            {t('Could not load reviews.')}
          </Body>
          <Pressable accessibilityRole="button" onPress={loadFirst}>
            <Text style={{ fontFamily: font.uiBold, fontSize: 14, color: colors.primary }}>
              {t('Try again')}
            </Text>
          </Pressable>
        </View>
      ) : count === 0 ? (
        <Body muted size={14}>
          {t('No reviews yet')}
        </Body>
      ) : (
        <>
          {/* ---- Summary: the average, and how the stars are spread ---- */}
          <View
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 18,
                padding: 16,
                borderRadius: radius.lg,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
              },
              shadow.xs,
            ]}
          >
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text style={{ fontFamily: font.display, fontSize: 38, color: colors.text }}>
                {n(summary.rating)}
              </Text>
              <Stars value={summary.rating} />
              <Text style={{ fontFamily: font.ui, fontSize: 12, color: colors.textMuted }}>
                {count === 1 ? t('1 review') : t('{n} reviews', { n: n(count) })}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              {[5, 4, 3, 2, 1].map((star) => {
                const c = summary.histogram?.[String(star)] ?? 0;
                return (
                  <View key={star} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      style={{
                        width: 10,
                        fontFamily: font.uiSemi,
                        fontSize: 12,
                        color: colors.textMuted,
                      }}
                    >
                      {n(star)}
                    </Text>
                    <View
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: colors.sunken,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${count ? (c / count) * 100 : 0}%`,
                          height: 6,
                          backgroundColor: colors.saffron,
                        }}
                      />
                    </View>
                    <Text
                      style={{
                        width: 22,
                        textAlign: 'right',
                        fontFamily: font.ui,
                        fontSize: 12,
                        color: colors.textMuted,
                      }}
                    >
                      {n(c)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ---- The reviews themselves ---- */}
          <View style={{ gap: 10 }}>
            {rows.map((r) => (
              <View
                key={r.id}
                style={[
                  {
                    padding: 14,
                    gap: 8,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.xs,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {r.avatar ? (
                    <Image
                      source={{ uri: r.avatar }}
                      contentFit="cover"
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sunken }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.sunken,
                      }}
                    >
                      <Text style={{ fontFamily: font.uiBold, fontSize: 14, color: colors.textMuted }}>
                        {(r.name || '?').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: font.uiSemi, fontSize: 14, color: colors.text }}
                    >
                      {r.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: font.ui, fontSize: 12, color: colors.textMuted }}
                    >
                      {[r.area, dayOf(r.createdAt)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Stars value={r.rating} size={12} />
                </View>
                {r.text ? (
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.sm + 1,
                      lineHeight: (type.sm + 1) * 1.45,
                      color: colors.text,
                    }}
                  >
                    {r.text}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          {cursor ? (
            <Pressable
              accessibilityRole="button"
              onPress={showMore}
              disabled={more}
              style={({ pressed }) => ({
                alignSelf: 'center',
                paddingVertical: 10,
                paddingHorizontal: 18,
                borderRadius: radius.pill ?? 999,
                borderWidth: 1,
                borderColor: colors.line,
                opacity: pressed || more ? 0.6 : 1,
              })}
            >
              <Text style={{ fontFamily: font.uiBold, fontSize: 14, color: colors.primary }}>
                {more ? t('Loading…') : t('Show more')}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}
