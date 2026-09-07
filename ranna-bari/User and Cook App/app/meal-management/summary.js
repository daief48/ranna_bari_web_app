import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Reveal from '../../src/components/Reveal';
import { Body } from '../../src/components/Typography';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Divider,
  Empty,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
  Row,
  StatTile,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { monthLabel, rateText, takaText } from '../../src/features/meal-management/format';

/**
 * The month, totalled.
 *
 * Breakfast, lunch and dinner counted separately because that is how the
 * specification's own table reads, and because a person checking a bill wants
 * to find the sitting they think is wrong rather than a single total they can
 * only accept or dispute.
 *
 * Last month sits beside this one: a rate means very little on its own and a
 * great deal next to the rate before it.
 */
export default function MonthlySummary() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { month, summary, loadSummary, changeMonth } = useMealManagement();

  useFocusEffect(
    useCallback(() => {
      loadSummary(month);
    }, [loadSummary, month]),
  );

  if (!summary) {
    return (
      <Screen>
        <Container>
          <BackLink />
          <Loading />
        </Container>
      </Screen>
    );
  }

  const mine = summary.mine ?? {};
  const comparison = summary.comparison;
  const nothing = !summary.totalMeals && !summary.applicableCost;

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('MONTHLY')}
          accent={t('SUMMARY')}
          subtitle={monthLabel(month, lang)}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

        {nothing ? (
          <View style={{ marginTop: 24 }}>
            <Empty
              icon="calendar"
              title={t('Nothing recorded this month')}
              hint={t('Log a few meals and the totals appear here.')}
              action={() => router.push('/meal-management/meals')}
              actionLabel={t('Log meals')}
            />
          </View>
        ) : (
          <>
            <Reveal delay={1}>
              <GroupLabel text={t('Your meals')} style={{ marginTop: 26 }} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <StatTile value={n(mine.breakfast ?? 0)} label={t('Breakfast')} />
                <StatTile value={n(mine.lunch ?? 0)} label={t('Lunch')} />
                <StatTile value={n(mine.dinner ?? 0)} label={t('Dinner')} />
              </View>

              <Panel style={{ marginTop: 12 }}>
                <Row
                  label={t('Total meals')}
                  value={t('{n} meals', { n: n(mine.meals ?? 0) })}
                  strong
                />
                <Divider />
                <Row
                  label={t('Meal rate')}
                  value={`৳${n(rateText(summary.rate))}`}
                  tone="good"
                  strong
                />
                <Row
                  label={t('Your share')}
                  value={`৳${n(takaText(mine.share ?? 0))}`}
                  strong
                />
              </Panel>
            </Reveal>

            <Reveal delay={2}>
              <GroupLabel text={t('The mess this month')} style={{ marginTop: 28 }} />
              <Panel style={{ marginTop: 12 }}>
                <Row
                  label={t('Costs that count')}
                  value={`৳${n(takaText(summary.applicableCost))}`}
                />
                <Row label={t('All costs')} value={`৳${n(takaText(summary.totalCost))}`} />
                <Divider />
                <Row label={t('Meals across the mess')} value={n(summary.totalMeals)} />
              </Panel>

              <Body muted style={{ marginTop: 8, fontSize: 12.5 }}>
                {t('Rate = costs that count ÷ meals recorded.')}
              </Body>
            </Reveal>

            {comparison ? (
              <Reveal delay={3}>
                <GroupLabel text={t('Against last month')} style={{ marginTop: 28 }} />
                <Panel style={{ marginTop: 12 }}>
                  <Row
                    label={monthLabel(comparison.month, lang)}
                    value={`৳${n(rateText(comparison.rate))}`}
                  />
                  <Row
                    label={monthLabel(month, lang)}
                    value={`৳${n(rateText(summary.rate))}`}
                  />
                  <Divider />
                  <Row
                    label={t('Change')}
                    value={`${comparison.rateChange > 0 ? '+' : ''}৳${n(rateText(Math.abs(comparison.rateChange)))}`}
                    tone={comparison.rateChange > 0 ? 'bad' : comparison.rateChange < 0 ? 'good' : undefined}
                    strong
                  />
                  <Row label={t('Meals last month')} value={n(comparison.meals)} />
                </Panel>
              </Reveal>
            ) : null}

            {summary.closed ? (
              <Reveal delay={4}>
                <Panel tone="warn" style={{ marginTop: 20, marginBottom: 12 }}>
                  <Body>{t('This month is settled. These figures are final.')}</Body>
                </Panel>
              </Reveal>
            ) : (
              <View style={{ height: 12 }} />
            )}
          </>
        )}
      </Container>
    </Screen>
  );
}
