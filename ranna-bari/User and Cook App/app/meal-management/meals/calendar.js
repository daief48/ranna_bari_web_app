import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Divider,
  GroupLabel,
  Loading,
  MealToggle,
  MonthPicker,
  Panel,
  Row,
  Sheet,
  StatTile,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import {
  WEEKDAYS,
  dayLabel,
  dayNumber,
  mealText,
  todayKey,
  weekdayOf,
} from '../../../src/features/meal-management/format';

/**
 * The month, as a grid. §4.2's monthly meal calendar.
 *
 * Every day in the accounting month is drawn whether or not it has an entry,
 * because the calendar is a form as much as a record — the empty days are
 * exactly the ones somebody has come here to fill in.
 *
 * A day is a tap, and the tap opens the sittings rather than toggling
 * something. Twenty-eight squares each with three states is not a thing to get
 * right with one gesture.
 */
export default function MealCalendar() {
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { month, changeMonth, mealTypes, setMeal, load } = useMealManagement();
  const { data, loading } = useSlice('meals');

  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('all');

  useFocusEffect(
    useCallback(() => {
      load.meals({ force: true });
    }, [load]),
  );

  const today = todayKey();
  const closed = !!data?.closed;

  /* The grid has to start on the right weekday, so the first row is padded
     with blanks — an accounting month can start on any day of the week. */
  const cells = useMemo(() => {
    const days = data?.days ?? [];
    if (!days.length) return [];
    const pad = weekdayOf(days[0].date);
    return [...Array.from({ length: pad }, () => null), ...days];
  }, [data]);

  const shown = useMemo(() => {
    const days = data?.days ?? [];
    if (filter === 'taken') return days.filter((day) => day.total > 0);
    if (filter === 'missed') return days.filter((day) => day.total === 0 && day.date <= today);
    if (filter === 'upcoming') return days.filter((day) => day.date > today);
    return days;
  }, [data, filter, today]);

  const counts = data?.counts ?? { weighted: 0, total: 0, byType: {}, guests: 0 };
  const day = open ? data?.days?.find((row) => row.date === open) : null;

  const write = async (patch) => {
    await run(() => setMeal(open, patch));
  };

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/meals" />

        <SectionHeader
          lead={t('MEAL')}
          accent={t('CALENDAR')}
          subtitle={t('Every day of the month, and what you took.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <MonthPicker month={month} onChange={changeMonth} closed={closed} />
        </View>

        {loading && !data ? (
          <Loading />
        ) : !data ? (
          <Panel style={{ marginTop: 18 }}>
            <Body muted>{t('This month could not be loaded.')}</Body>
          </Panel>
        ) : (
          <>
            <View style={{ marginTop: 18 }}>
              <TileGrid>
                {mealTypes.map((type_) => (
                  <StatTile
                    key={type_.key}
                    value={n(mealText(counts.byType?.[type_.key] ?? 0))}
                    label={t(type_.label)}
                  />
                ))}
                <StatTile
                  value={n(mealText(counts.weighted))}
                  label={t('Billable total')}
                  tone="good"
                  hint={counts.guests ? t('{n} guest', { n: n(mealText(counts.guests)) }) : undefined}
                />
              </TileGrid>
            </View>

            {/* ---- the grid ---- */}
            <Panel style={{ marginTop: 18, gap: 8 }}>
              <View style={{ flexDirection: 'row' }}>
                {WEEKDAYS.map((weekday) => (
                  <Text
                    key={weekday}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontFamily: font.uiSemi,
                      fontSize: type.xs - 1,
                      color: colors.textMuted,
                    }}
                  >
                    {t(weekday)}
                  </Text>
                ))}
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {cells.map((cell, index) =>
                  cell ? (
                    <DayCell
                      key={cell.date}
                      day={cell}
                      today={today}
                      onPress={() => setOpen(cell.date)}
                    />
                  ) : (
                    // eslint-disable-next-line react/no-array-index-key
                    <View key={`pad-${index}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />
                  ),
                )}
              </View>

              <Divider />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Legend colour={colors.sage} label={t('Meals taken')} />
                <Legend colour={colors.line} label={t('Nothing recorded')} />
                <Legend colour={colors.saffron} label={t('On leave')} />
              </View>
            </Panel>

            {/* ---- the same month as a list, filtered ---- */}
            <View style={{ marginTop: 22, gap: 10 }}>
              <GroupLabel text={t('Day by day')} />

              <ChipRow>
                <Chip label={t('All days')} active={filter === 'all'} onPress={() => setFilter('all')} />
                <Chip label={t('Taken')} active={filter === 'taken'} onPress={() => setFilter('taken')} />
                <Chip label={t('Nothing')} active={filter === 'missed'} onPress={() => setFilter('missed')} />
                <Chip label={t('Upcoming')} active={filter === 'upcoming'} onPress={() => setFilter('upcoming')} />
              </ChipRow>

              <Panel style={{ gap: 0 }}>
                {shown.length ? (
                  shown.map((row) => (
                    <Row
                      key={row.date}
                      label={dayLabel(row.date, lang)}
                      value={
                        row.total > 0
                          ? mealTypes
                              .filter((type_) => row.values?.[type_.key])
                              .map((type_) => t(type_.label).slice(0, 1))
                              .join(' · ') || mealText(row.total)
                          : row.onLeave
                            ? t('Away')
                            : '—'
                      }
                      tone={row.total > 0 ? 'good' : row.onLeave ? 'warn' : undefined}
                      onPress={() => setOpen(row.date)}
                    />
                  ))
                ) : (
                  <Body muted style={{ paddingVertical: 12 }}>
                    {t('Nothing here.')}
                  </Body>
                )}
              </Panel>
            </View>
          </>
        )}
      </Container>

      {/* ---- one day, opened ---- */}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? dayLabel(open, lang) : ''}>
        {day ? (
          <>
            {closed ? (
              <Panel tone="warn" style={{ gap: 4 }}>
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.saffron }}>
                  {t('This month is settled')}
                </Text>
                <Body muted style={{ fontSize: type.xs }}>
                  {t('Its meals are frozen.')}
                </Body>
              </Panel>
            ) : null}

            {day.onLeave ? (
              <Panel tone="warn" style={{ gap: 4 }}>
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.saffron }}>
                  {t('You are marked away on this day')}
                </Text>
              </Panel>
            ) : null}

            {mealTypes.map((type_) => (
              <MealToggle
                key={type_.key}
                label={t(type_.label)}
                value={day.values?.[type_.key] ?? 0}
                guests={day.guests?.[type_.key] ?? 0}
                allowedValues={data?.allowedValues ?? [1]}
                locked={closed || (day.locked ?? []).includes(type_.key)}
                onSet={(value) => write({ values: { [type_.key]: value } })}
                onGuests={(value) => write({ guests: { [type_.key]: value } })}
              />
            ))}

            <Row label={t('Billable that day')} value={n(mealText(day.weighted))} strong />
          </>
        ) : null}
      </Sheet>
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * one square
 * ------------------------------------------------------------------ */

function DayCell({ day, today, onPress }) {
  const { colors } = useTheme();
  const taken = day.total > 0;
  const isToday = day.date === today;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${day.date}, ${taken ? day.total : 0}`}
      onPress={onPress}
      style={({ pressed }) => ({
        width: `${100 / 7}%`,
        aspectRatio: 1,
        padding: 3,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          flex: 1,
          borderRadius: radius.xs,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          backgroundColor: taken ? `${colors.sage}22` : day.onLeave ? `${colors.saffron}1A` : colors.sunken,
          borderWidth: isToday ? 1.5 : 1,
          borderColor: isToday ? colors.saffron : taken ? `${colors.sage}55` : 'transparent',
        }}
      >
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: type.xs,
            color: colors.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {dayNumber(day.date)}
        </Text>
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: type.xs - 2,
            color: taken ? colors.sage : colors.textMuted,
            fontVariant: ['tabular-nums'],
          }}
        >
          {taken ? mealText(day.total) : '·'}
        </Text>
      </View>
    </Pressable>
  );
}

function Legend({ colour, label }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colour }} />
      <Text style={{ fontFamily: font.ui, fontSize: type.xs - 1, color: colors.textMuted }}>
        {label}
      </Text>
    </View>
  );
}
