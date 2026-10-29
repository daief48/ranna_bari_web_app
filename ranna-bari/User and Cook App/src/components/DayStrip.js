import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';
import { dateLabel, dayParts, monthLabel, todayKey } from '../features/meal-plan/format';

const CELL = 56;
const GAP = 8;
const STEP = CELL + GAP;

/** 'YYYY-MM-DD' shifted by whole days — in UTC, so a daylight-saving jump can never skip or repeat one. */
const shift = (date, days) => {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

/**
 * A row of days you can swipe.
 *
 * The board used to show exactly the week the server answered with, in a fixed
 * row of seven boxes that did not scroll — so yesterday's plates, or next
 * Tuesday's, were out of reach, and the only way to another week was to wait
 * for it to be today. This is a window onto sixty days instead: two weeks back
 * (what was cooked, for a customer who says it never came) and six weeks
 * ahead (what is booked), scrolled by thumb, trackpad or the arrows.
 *
 * A day's plate count is shown where it is known — the server tells the board
 * about the coming week, and the selected day is counted from what is on
 * screen — and a dot where it is not, rather than a zero that would claim "no
 * plates" for a day nobody has asked about.
 *
 * It scrolls itself to keep the chosen day in view, so moving to "next cooking
 * day" from elsewhere on the screen never leaves the selection off the edge.
 *
 * @param {object} props
 * @param {string} props.value   Selected date, 'YYYY-MM-DD'.
 * @param {(date: string) => void} props.onChange
 * @param {Record<string, number>} [props.counts]  Plates per known date.
 * @param {number} [props.before]  Days shown before today.
 * @param {number} [props.after]   Days shown after today.
 */
export default function DayStrip({ value, onChange, counts = {}, before = 14, after = 45 }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const ref = useRef(null);
  const width = useRef(0);
  const offset = useRef(0);

  const today = todayKey();
  const days = useMemo(() => {
    const out = [];
    for (let i = -before; i <= after; i += 1) out.push(shift(today, i));
    /* A selected day outside the window (a booking far ahead) is added, so the
       selection is never invisible. */
    if (value && !out.includes(value)) out.push(value);
    return out.sort();
  }, [today, before, after, value]);

  const indexOf = (date) => Math.max(0, days.indexOf(date));

  /* Bring a day to the middle of the strip. */
  const center = (date, animated = true) => {
    const x = indexOf(date) * STEP - Math.max(0, (width.current - CELL) / 2);
    ref.current?.scrollTo({ x: Math.max(0, x), animated });
  };

  useEffect(() => {
    center(value, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, days.length]);

  /* A week at a time, for a mouse that has no swipe. */
  const page = (dir) => {
    Haptics.selectionAsync().catch(() => {});
    ref.current?.scrollTo({ x: Math.max(0, offset.current + dir * STEP * 5), animated: true });
  };

  const small = ({ pressed }) => ({
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: pressed ? colors.sage50 : colors.sunken,
  });

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.displayBold, fontSize: 15, letterSpacing: -0.2, color: colors.text }}
          >
            {monthLabel(value.slice(0, 7))}
          </Text>
        </View>
        {value !== today ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Today')}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(today);
            }}
            style={({ pressed }) => ({
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              backgroundColor: pressed ? colors.saffron100 : colors.saffron50,
              borderWidth: 1,
              borderColor: colors.saffron100,
            })}
          >
            <Text style={{ fontFamily: font.uiBold, fontSize: 11.5, color: colors.saffron }}>
              {t('Today')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('Earlier days')} onPress={() => page(-1)} style={small}>
          <Icon name="chevronRight" size={14} color={colors.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Later days')} onPress={() => page(1)} style={small}>
          <Icon name="chevronRight" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => {
          width.current = e.nativeEvent.layout.width;
          center(value, false);
        }}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={32}
        snapToInterval={STEP}
        decelerationRate="fast"
        contentContainerStyle={{ gap: GAP, paddingVertical: 2, paddingRight: 4 }}
      >
        {days.map((date) => {
          const on = date === value;
          const isToday = date === today;
          const parts = dayParts(date);
          const count = counts[date];
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                count != null
                  ? t('{date}, {n} plates', { date: dateLabel(date), n: n(count) })
                  : dateLabel(date)
              }
              onPress={() => {
                if (!on) Haptics.selectionAsync().catch(() => {});
                onChange(date);
              }}
              style={({ pressed }) => ({
                width: CELL,
                alignItems: 'center',
                paddingVertical: 9,
                borderRadius: 18,
                borderWidth: on ? 1.5 : 1,
                borderColor: on ? colors.sage : isToday ? colors.saffron : colors.line,
                backgroundColor: on ? colors.sage50 : colors.sunken,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: 10.5,
                  color: parts.weekend ? colors.primary : colors.textMuted,
                }}
              >
                {parts.weekday}
              </Text>
              <Text
                style={{
                  fontFamily: font.displayExtra,
                  fontSize: 19,
                  lineHeight: 23,
                  marginTop: 1,
                  color: on ? colors.sage : colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {n(Number(parts.day))}
              </Text>
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 10.5,
                  marginTop: 2,
                  color: count ? colors.primary : colors.textLight,
                }}
              >
                {count ? n(count) : '·'}
              </Text>
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  marginTop: 3,
                  backgroundColor: isToday ? colors.saffron : 'transparent',
                }}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
