import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Divider,
  GroupLabel,
  Loading,
  Meter,
  MonthPicker,
  Panel,
  Row,
  StatTile,
  TileGrid,
} from '../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../src/features/meal-management/store';
import {
  mealText,
  monthLabel,
  rateText,
  takaText,
} from '../../src/features/meal-management/format';

/**
 * Analytics. §4.16.
 *
 * Twelve figures, all of them derived from records that already exist. Nothing
 * here is an accounting statement — it says what the pattern has been, which
 * is a different question from what the month cost.
 *
 * Every trend is drawn against its own peak rather than a fixed scale, because
 * a mess spending ৳3,000 a month and one spending ৳80,000 want the same shape
 * out of the same component.
 */
export default function Analytics() {
  const { t, n, lang } = useLang();
  const { colors } = useTheme();

  const { month, changeMonth, load, getExpenseInsights } = useMealManagement();
  const { data, loading } = useSlice('analytics');

  const [insights, setInsights] = useState(null);

  useFocusEffect(
    useCallback(() => {
      load.analytics({ force: true });
    }, [load]),
  );

  useEffect(() => {
    getExpenseInsights(month).then((out) => setInsights(out.ok ? out.result : null));
  }, [getExpenseInsights, month]);

  const monthly = data?.monthly ?? [];
  const daily = data?.daily ?? [];
  const consumption = data?.consumption ?? [];
  const comparison = data?.comparison;
  const waste = data?.waste;

  const peakRate = Math.max(1, ...monthly.map((row) => row.mealRate || 0));
  const peakCost = Math.max(1, ...monthly.map((row) => row.totalCost || 0));
  const peakDaily = Math.max(1, ...daily.map((row) => row.meals || 0));
  const peakMeals = Math.max(1, ...consumption.map((row) => row.meals || 0));

  const delta = (value) =>
    value === null || value === undefined ? null : (
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.xs,
          color: value > 0 ? colors.primary : colors.sage,
        }}
      >
        {value > 0 ? '▲' : '▼'} {n(Math.abs(value))}%
      </Text>
    );

  return (
    <Screen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('THE')}
          accent={t('ANALYTICS')}
          subtitle={t('What the pattern has been, and where it is going.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

        {loading && !data ? (
          <Loading />
        ) : !data ? null : (
          <>
            {/* ---- month against month ---- */}
            {comparison ? (
              <View style={{ marginTop: 18 }}>
                <TileGrid>
                  <StatTile
                    value={`৳${n(rateText(monthly.find((m) => m.month === month)?.mealRate ?? 0))}`}
                    label={t('Meal rate')}
                    hint={
                      comparison.mealRate !== null
                        ? t('{n}% on last month', { n: n(comparison.mealRate) })
                        : undefined
                    }
                    tone={comparison.mealRate > 0 ? 'bad' : comparison.mealRate < 0 ? 'good' : undefined}
                  />
                  <StatTile
                    value={n(mealText(monthly.find((m) => m.month === month)?.totalMeals ?? 0))}
                    label={t('Total meals')}
                    hint={
                      comparison.totalMeals !== null
                        ? t('{n}% on last month', { n: n(comparison.totalMeals) })
                        : undefined
                    }
                  />
                  <StatTile
                    value={`৳${n(takaText(monthly.find((m) => m.month === month)?.totalCost ?? 0))}`}
                    label={t('Total cost')}
                    hint={
                      comparison.totalCost !== null
                        ? t('{n}% on last month', { n: n(comparison.totalCost) })
                        : undefined
                    }
                  />
                  <StatTile
                    value={n(mealText(data.averagePerMember))}
                    label={t('Average per member')}
                  />
                </TileGrid>
              </View>
            ) : null}

            {/* ---- §4.15's expense analysis ---- */}
            {insights?.insights?.length ? (
              <Panel style={{ marginTop: 16, gap: 8 }}>
                <GroupLabel text={t('What changed')} />
                {insights.insights.map((line, index) => (
                  <View
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        marginTop: 7,
                        backgroundColor: colors.saffron,
                      }}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: font.ui,
                        fontSize: type.sm,
                        lineHeight: type.sm * 1.5,
                        color: colors.text,
                      }}
                    >
                      {line}
                    </Text>
                  </View>
                ))}
                <Body muted style={{ fontSize: type.xs }}>
                  {t('Compared against {month}. Changes under ten per cent are left out.', {
                    month: monthLabel(insights.previousMonth, lang),
                  })}
                </Body>
              </Panel>
            ) : null}

            {/* ---- trends ---- */}
            {monthly.length > 1 ? (
              <Panel style={{ marginTop: 16, gap: 12 }}>
                <GroupLabel text={t('Meal rate trend')} right={delta(comparison?.mealRate)} />
                {monthly.map((row) => (
                  <View key={row.month} style={{ gap: 5 }}>
                    <Row
                      label={monthLabel(row.month, lang)}
                      value={`৳${n(rateText(row.mealRate))}`}
                      strong={row.month === month}
                    />
                    <Meter value={row.mealRate} max={peakRate} tone={row.month === month ? 'good' : 'warn'} />
                  </View>
                ))}
              </Panel>
            ) : null}

            {monthly.length > 1 ? (
              <Panel style={{ marginTop: 16, gap: 12 }}>
                <GroupLabel text={t('Spending trend')} right={delta(comparison?.totalCost)} />
                {monthly.map((row) => (
                  <View key={row.month} style={{ gap: 5 }}>
                    <Row
                      label={monthLabel(row.month, lang)}
                      value={`৳${n(takaText(row.totalCost))}`}
                      strong={row.month === month}
                    />
                    <Meter value={row.totalCost} max={peakCost} tone={row.month === month ? 'good' : 'warn'} />
                  </View>
                ))}
              </Panel>
            ) : null}

            {/* ---- daily meal trend ---- */}
            {daily.length ? (
              <Panel style={{ marginTop: 16, gap: 10 }}>
                <GroupLabel text={t('Meals day by day')} />
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 90 }}>
                  {daily.map((row) => (
                    <View
                      key={row.date}
                      style={{
                        flex: 1,
                        height: `${Math.max(3, (row.meals / peakDaily) * 100)}%`,
                        borderRadius: 2,
                        backgroundColor: row.meals ? colors.sage : colors.line,
                      }}
                    />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: font.ui, fontSize: type.xs - 1, color: colors.textMuted }}>
                    {daily[0]?.date?.slice(8)}
                  </Text>
                  <Text style={{ fontFamily: font.ui, fontSize: type.xs - 1, color: colors.textMuted }}>
                    {t('peak {n}', { n: n(mealText(peakDaily)) })}
                  </Text>
                  <Text style={{ fontFamily: font.ui, fontSize: type.xs - 1, color: colors.textMuted }}>
                    {daily[daily.length - 1]?.date?.slice(8)}
                  </Text>
                </View>
              </Panel>
            ) : null}

            {/* ---- who eats what ---- */}
            {consumption.length ? (
              <Panel style={{ marginTop: 16, gap: 10 }}>
                <GroupLabel text={t('Member consumption')} />
                {consumption.map((row) => (
                  <View key={row.memberId} style={{ gap: 5 }}>
                    <Row
                      label={row.name}
                      value={t('{meals} meals · ৳{cost}', {
                        meals: n(mealText(row.meals)),
                        cost: n(takaText(row.cost)),
                      })}
                    />
                    <Meter value={row.meals} max={peakMeals} tone="good" />
                  </View>
                ))}
              </Panel>
            ) : null}

            {/* ---- categories ---- */}
            {data.categories?.length ? (
              <Panel style={{ marginTop: 16, gap: 10 }}>
                <GroupLabel
                  text={t('Highest expense category')}
                  right={
                    data.highestCategory ? (
                      <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.text }}>
                        {data.highestCategory.label}
                      </Text>
                    ) : null
                  }
                />
                {data.categories.map((category) => (
                  <View key={category.key} style={{ gap: 5 }}>
                    <Row
                      label={category.label}
                      value={`৳${n(takaText(category.amount))}`}
                      tone={category.foodCost ? 'good' : undefined}
                    />
                    <Meter
                      value={category.amount}
                      max={data.categories[0].amount}
                      tone={category.foodCost ? 'good' : 'warn'}
                    />
                  </View>
                ))}
              </Panel>
            ) : null}

            {/* ---- deposits against spending ---- */}
            {data.depositVsExpense ? (
              <Panel style={{ marginTop: 16, gap: 0 }}>
                <GroupLabel text={t('Deposits against charges')} style={{ marginBottom: 6 }} />
                <Row
                  label={t('Deposited')}
                  value={`৳${n(takaText(data.depositVsExpense.deposits))}`}
                  tone="good"
                />
                <Row label={t('Charged')} value={`৳${n(takaText(data.depositVsExpense.charged))}`} />
                <Divider />
                <Row
                  label={t('Held by the mess')}
                  value={`৳${n(takaText(data.depositVsExpense.difference))}`}
                  tone={data.depositVsExpense.difference >= 0 ? 'good' : 'bad'}
                  strong
                />
              </Panel>
            ) : null}

            {/* ---- §4.15's waste detection ---- */}
            <Panel style={{ marginTop: 16, gap: 8, marginBottom: 8 }}>
              <GroupLabel text={t('Food waste estimate')} />
              {waste?.available ? (
                <>
                  <Row label={t('Cooked')} value={n(mealText(waste.cooked))} />
                  <Row label={t('Eaten')} value={n(mealText(waste.eaten))} tone="good" />
                  <Divider />
                  <Row
                    label={t('Surplus')}
                    value={`${n(mealText(waste.surplus))} (${n(waste.surplusPercent)}%)`}
                    tone={waste.surplus > 0 ? 'bad' : 'good'}
                    strong
                  />
                  <Row
                    label={t('Worth about')}
                    value={`৳${n(takaText(waste.estimatedCost))}`}
                    tone="warn"
                  />
                  {waste.worstDays?.length ? (
                    <>
                      <Divider />
                      <GroupLabel text={t('Most surplus')} />
                      {waste.worstDays.map((day) => (
                        <Row
                          key={day.date}
                          label={day.date}
                          value={t('{n} plates over', { n: n(mealText(day.surplus)) })}
                        />
                      ))}
                    </>
                  ) : null}
                </>
              ) : (
                <Body muted style={{ fontSize: type.xs }}>
                  {waste?.reason ??
                    t('Record how many plates the cook prepared each day and a waste estimate appears here.')}
                </Body>
              )}
            </Panel>
          </>
        )}
      </Container>
    </Screen>
  );
}
