import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import { Body } from '../../../src/components/Typography';
import { type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Empty,
  Field,
  GroupLabel,
  Loading,
  MiniButton,
  Panel,
  Row,
  StatTile,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import {
  dayLabel,
  mealText,
  monthRange,
  shiftDay,
  todayKey,
} from '../../../src/features/meal-management/format';

/**
 * Meals across any stretch of days. §4.2's date-range summary.
 *
 * Separate from the calendar because it answers a different question: that one
 * fills a month, this one totals a period that need not be a month at all —
 * a week, a stay, the days somebody was actually in the building.
 *
 * The presets exist because almost every real use is one of four ranges, and
 * making somebody type two dates to see last week is a form standing where an
 * answer should be.
 */
export default function MealHistory() {
  const { t, n, lang } = useLang();
  const run = useMealAction();

  const { mealTypes, getMealHistory, month } = useMealManagement();

  const today = todayKey();
  const [from, setFrom] = useState(shiftDay(today, -6));
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('week');

  const fetch = useCallback(
    async (start, end) => {
      setLoading(true);
      const out = await getMealHistory({ from: start, to: end });
      setData(out.ok ? out.result : null);
      setLoading(false);
      if (!out.ok) run(() => Promise.resolve(out));
    },
    [getMealHistory, run],
  );

  useEffect(() => {
    fetch(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (start, end, key) => {
    setFrom(start);
    setTo(end);
    setPreset(key);
    fetch(start, end);
  };

  const counts = data?.counts ?? { weighted: 0, total: 0, byType: {}, days: 0 };
  const days = data?.days ?? [];

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/meals" />

        <SectionHeader
          lead={t('MEAL')}
          accent={t('HISTORY')}
          subtitle={t('Any stretch of days, totalled.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18, gap: 12 }}>
          <ChipRow>
            <Chip
              label={t('Last 7 days')}
              active={preset === 'week'}
              onPress={() => apply(shiftDay(today, -6), today, 'week')}
            />
            <Chip
              label={t('Last 30 days')}
              active={preset === 'month'}
              onPress={() => apply(shiftDay(today, -29), today, 'month')}
            />
            <Chip
              label={t('This month')}
              active={preset === 'accounting'}
              onPress={() => {
                const range = monthRange(month);
                apply(range.from, range.to, 'accounting');
              }}
            />
            <Chip
              label={t('Custom')}
              active={preset === 'custom'}
              onPress={() => setPreset('custom')}
            />
          </ChipRow>

          {preset === 'custom' ? (
            <Panel style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label={t('From')} value={from} onChangeText={setFrom} style={{ flex: 1 }} />
                <Field label={t('To')} value={to} onChangeText={setTo} style={{ flex: 1 }} />
              </View>
              <MiniButton label={t('Show these days')} onPress={() => fetch(from, to)} />
            </Panel>
          ) : null}
        </View>

        {loading ? (
          <Loading />
        ) : !data ? (
          <View style={{ marginTop: 18 }}>
            <Empty icon="calendar" title={t('That range could not be loaded')} />
          </View>
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
                />
                <StatTile
                  value={n(counts.days ?? 0)}
                  label={t('Days with a meal')}
                  hint={t('out of {n}', {
                    n: n(Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1)),
                  })}
                />
              </TileGrid>
            </View>

            <View style={{ marginTop: 20, gap: 10, marginBottom: 8 }}>
              <GroupLabel
                text={t('{from} to {to}', { from: dayLabel(from, lang), to: dayLabel(to, lang) })}
              />

              <Panel style={{ gap: 0 }}>
                {days.length ? (
                  days.map((row) => (
                    <Row
                      key={row.date}
                      label={dayLabel(row.date, lang)}
                      value={
                        mealTypes
                          .filter((type_) => row.values?.[type_.key])
                          .map((type_) => `${t(type_.label)} ${mealText(row.values[type_.key])}`)
                          .join(' · ') || '—'
                      }
                      tone={row.weighted > 0 ? 'good' : undefined}
                    />
                  ))
                ) : (
                  <Body muted style={{ paddingVertical: 12 }}>
                    {t('No meals recorded in this range.')}
                  </Body>
                )}
              </Panel>

              <Body muted style={{ fontSize: type.xs }}>
                {t('Only days with an entry appear. A day with nothing recorded was not billed.')}
              </Body>
            </View>
          </>
        )}
      </Container>
    </MessScreen>
  );
}
