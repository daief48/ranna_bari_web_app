import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Reveal from '../../src/components/Reveal';
import { Body, Heading } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
  Row,
  SlotToggle,
  StatTile,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import {
  SLOTS,
  dayLabel,
  dayNumber,
  firstWeekday,
  todayKey,
} from '../../src/features/meal-management/format';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The month at a glance.
 *
 * A grid of squares, each shaded by how many of that day's sittings were
 * taken — which turns a month of entries into a pattern a person can read
 * without counting anything. Tapping a day opens it below the grid, so the
 * calendar stays a calendar and the editing happens somewhere with room for
 * labels.
 */
export default function MealCalendar() {
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { month, meals, loadMeals, setMeal, changeMonth } = useMealManagement();
  const [selected, setSelected] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadMeals(month);
    }, [loadMeals, month]),
  );

  const today = todayKey();
  const closed = !!meals?.closed;
  const days = meals?.days ?? [];
  const counts = meals?.counts ?? { total: 0, breakfast: 0, lunch: 0, dinner: 0 };

  const chosen = useMemo(
    () => days.find((d) => d.date === selected) ?? null,
    [days, selected],
  );

  /* Blank squares before the first, so the 1st lands on its real weekday. */
  const lead = useMemo(() => Array.from({ length: firstWeekday(month) }), [month]);

  const shade = (total) => {
    if (!total) return colors.sunken;
    if (total === 1) return `${colors.sage}33`;
    if (total === 2) return `${colors.sage}77`;
    return colors.sage;
  };

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('MEAL')}
          accent={t('CALENDAR')}
          subtitle={t('A month of meals, at a glance.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

        {!meals ? (
          <Loading />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <StatTile value={n(counts.total)} label={t('Meals this month')} tone="good" />
              <StatTile
                value={n(days.filter((d) => d.total > 0).length)}
                label={t('Days you ate')}
              />
            </View>

            <Reveal delay={1}>
              <Panel style={{ marginTop: 18 }}>
                {/* Weekday header. */}
                <View style={{ flexDirection: 'row' }}>
                  {WEEKDAYS.map((w, i) => (
                    <Text
                      key={i}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        fontFamily: font.uiBold,
                        fontSize: 11,
                        color: colors.textLight,
                        marginBottom: 8,
                      }}
                    >
                      {w}
                    </Text>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {lead.map((_, i) => (
                    <View key={`lead-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />
                  ))}

                  {days.map((d) => {
                    const isToday = d.date === today;
                    const isSelected = d.date === selected;
                    return (
                      <View key={d.date} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('{d}, {n} meals', {
                            d: dayLabel(d.date, lang),
                            n: n(d.total),
                          })}
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => setSelected(isSelected ? null : d.date)}
                          style={{
                            flex: 1,
                            borderRadius: radius.sm,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: shade(d.total),
                            borderWidth: isSelected ? 2 : isToday ? 1.5 : 0,
                            borderColor: isSelected ? colors.primary : colors.text,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: font.uiSemi,
                              fontSize: 12.5,
                              color: d.total >= 3 ? '#fff' : colors.text,
                            }}
                          >
                            {n(dayNumber(d.date))}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>

                {/* What the shading means. */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  {[0, 1, 2, 3].map((k) => (
                    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 4,
                          backgroundColor: shade(k),
                        }}
                      />
                      <Text style={{ fontFamily: font.ui, fontSize: 11, color: colors.textMuted }}>
                        {n(k)}
                      </Text>
                    </View>
                  ))}
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: 11,
                      color: colors.textLight,
                      marginLeft: 4,
                    }}
                  >
                    {t('meals a day')}
                  </Text>
                </View>
              </Panel>
            </Reveal>

            {chosen ? (
              <Reveal delay={2}>
                <GroupLabel text={dayLabel(chosen.date, lang)} style={{ marginTop: 26 }} />
                <Panel style={{ marginTop: 12, gap: 8, marginBottom: 16 }}>
                  {SLOTS.map((s) => (
                    <SlotToggle
                      key={s.key}
                      label={t(s.label)}
                      taken={chosen[s.key]}
                      disabled={closed}
                      onToggle={() => run(() => setMeal(chosen.date, { [s.key]: !chosen[s.key] }))}
                    />
                  ))}
                  <Row
                    label={t('Total')}
                    value={t('{n} meals', { n: n(chosen.total) })}
                    strong
                  />
                </Panel>
              </Reveal>
            ) : (
              <Body muted style={{ marginTop: 16, marginBottom: 16, textAlign: 'center' }}>
                {t('Tap a day to see or change it.')}
              </Body>
            )}
          </>
        )}
      </Container>
    </Screen>
  );
}
