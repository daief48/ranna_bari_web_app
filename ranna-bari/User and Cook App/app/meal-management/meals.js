import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import { Body, Heading } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Divider,
  ErrorState,
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
  monthOf,
  rateText,
  todayKey,
} from '../../src/features/meal-management/format';

/**
 * My meals — every day of a month, and what was taken.
 *
 * This screen writes the rows the whole module's accounting rests on, so it is
 * deliberately plain: a day, three sittings, one tap each. The month total at
 * the top is the figure that will be billed, and it is the sum of what is
 * visible below it rather than anything derived.
 *
 * A closed month renders the same way with every control disabled, so the
 * history stays readable after settlement instead of disappearing.
 */
export default function MyMeals() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { month, meals, loadMeals, setMeal, changeMonth } = useMealManagement();
  const [filter, setFilter] = useState('all');
  const [bulkOpen, setBulkOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadMeals(month);
    }, [loadMeals, month]),
  );

  const today = todayKey();
  const closed = !!meals?.closed;

  const days = useMemo(() => {
    const all = meals?.days ?? [];
    if (filter === 'taken') return all.filter((d) => d.total > 0);
    if (filter === 'upcoming') return all.filter((d) => d.date >= today);
    return all;
  }, [meals, filter, today]);

  const counts = meals?.counts ?? { breakfast: 0, lunch: 0, dinner: 0, total: 0 };

  const toggle = (date, slot, value) => run(() => setMeal(date, { [slot]: !value }));

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('MY')}
          accent={t('MEALS')}
          subtitle={t('What you actually took, day by day.')}
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
              <StatTile value={n(counts.breakfast)} label={t('Breakfast')} />
              <StatTile value={n(counts.lunch)} label={t('Lunch')} />
              <StatTile value={n(counts.dinner)} label={t('Dinner')} />
              <StatTile value={n(counts.total)} label={t('Total')} tone="good" />
            </View>

            {closed ? (
              <Panel tone="warn" style={{ marginTop: 14 }}>
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.saffron }}>
                  {t('This month is settled')}
                </Text>
                <Body muted style={{ marginTop: 4 }}>
                  {t('Its meals are frozen, so the final rate cannot move.')}
                </Body>
              </Panel>
            ) : null}

            <View style={{ marginTop: 18 }}>
              <ChipRow>
                <Chip label={t('All days')} active={filter === 'all'} onPress={() => setFilter('all')} />
                <Chip
                  label={t('Days I ate')}
                  active={filter === 'taken'}
                  onPress={() => setFilter('taken')}
                />
                <Chip
                  label={t('Still to come')}
                  active={filter === 'upcoming'}
                  onPress={() => setFilter('upcoming')}
                />
              </ChipRow>
            </View>

            {!closed ? (
              <Button
                variant="glass"
                label={t('Away for a few days?')}
                icon="calendar"
                block
                style={{ marginTop: 14 }}
                onPress={() => setBulkOpen(true)}
              />
            ) : null}

            <GroupLabel text={t('Every day')} style={{ marginTop: 26 }} />

            <View style={{ gap: 12, marginTop: 12, marginBottom: 12 }}>
              {days.map((d, i) => (
                <Reveal key={d.date} delay={(i % 5) + 1}>
                  <Panel tone={d.date === today ? 'good' : undefined}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Heading size={15.5}>
                        {dayLabel(d.date, lang)}
                        {d.date === today ? ` · ${t('Today')}` : ''}
                      </Heading>
                      <Text
                        style={{
                          fontFamily: font.displayBold,
                          fontSize: 15,
                          color: d.total ? colors.sage : colors.textLight,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {t('{n} meals', { n: n(d.total) })}
                      </Text>
                    </View>

                    <View style={{ gap: 8, marginTop: 12 }}>
                      {SLOTS.map((s) => (
                        <SlotToggle
                          key={s.key}
                          label={t(s.label)}
                          taken={d[s.key]}
                          disabled={closed}
                          onToggle={() => toggle(d.date, s.key, d[s.key])}
                        />
                      ))}
                    </View>

                    {d.guest ? (
                      <>
                        <Divider />
                        <Row label={t('Guest meals')} value={n(d.guest)} />
                      </>
                    ) : null}
                  </Panel>
                </Reveal>
              ))}
            </View>
          </>
        )}
      </Container>

      <BulkSheet
        open={bulkOpen}
        month={month}
        onClose={() => setBulkOpen(false)}
      />
    </Screen>
  );
}

/**
 * Turning a run of days off at once.
 *
 * The specification's case is somebody going home for a week: pick the two
 * ends and which sittings, and every day between them changes in one write.
 */
function BulkSheet({ open, month, onClose }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const run = useMealAction();
  const { setMealsBulk, meals } = useMealManagement();

  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [slots, setSlots] = useState(['breakfast', 'lunch', 'dinner']);
  const [busy, setBusy] = useState(false);

  const days = meals?.days ?? [];

  const toggleSlot = (key) =>
    setSlots((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));

  const valid = from && to && from <= to && slots.length > 0;

  const apply = async (value) => {
    if (!valid) return;
    setBusy(true);
    const out = await run(() => setMealsBulk({ from, to, slots, value }));
    setBusy(false);
    if (out?.ok !== false) {
      setFrom(null);
      setTo(null);
      onClose();
    }
  };

  const pick = (date) => {
    if (!from || (from && to)) {
      setFrom(date);
      setTo(null);
      return;
    }
    if (date < from) {
      setTo(from);
      setFrom(date);
      return;
    }
    setTo(date);
  };

  const inRange = (date) => (from && to ? date >= from && date <= to : date === from);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.canvas,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: 20,
            maxHeight: '80%',
          }}
        >
          <Heading size={18}>{t('Change a run of days')}</Heading>
          <Body muted style={{ marginTop: 4 }}>
            {from && !to
              ? t('Now pick the last day.')
              : from && to
                ? t('{a} to {b}', { a: from.slice(8), b: to.slice(8) })
                : t('Pick the first day.')}
          </Body>

          <View style={{ marginTop: 14 }}>
            <ChipRow>
              {SLOTS.map((s) => (
                <Chip
                  key={s.key}
                  label={t(s.label)}
                  active={slots.includes(s.key)}
                  tone="sage"
                  onPress={() => toggleSlot(s.key)}
                />
              ))}
            </ChipRow>
          </View>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 16,
            }}
          >
            {days.map((d) => {
              const active = inRange(d.date);
              return (
                <Pressable
                  key={d.date}
                  accessibilityRole="button"
                  accessibilityLabel={d.date}
                  accessibilityState={{ selected: active }}
                  onPress={() => pick(d.date)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? colors.primary : colors.sunken,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.line,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.sm,
                      color: active ? '#fff' : colors.text,
                    }}
                  >
                    {n(Number(d.date.slice(8)))}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Button
              variant="glass"
              label={t('Turn off')}
              block
              disabled={!valid || busy}
              onPress={() => apply(false)}
              style={{ flex: 1 }}
            />
            <Button
              label={t('Turn on')}
              block
              disabled={!valid || busy}
              onPress={() => apply(true)}
              style={{ flex: 1 }}
            />
          </View>

          <Button
            variant="ghost"
            label={t('Cancel')}
            block
            style={{ marginTop: 8 }}
            onPress={onClose}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
