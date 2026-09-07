import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Reveal from '../../src/components/Reveal';
import { Body } from '../../src/components/Typography';
import { useLang } from '../../src/i18n/LanguageContext';
import { useSession } from '../../src/store/SessionContext';

import {
  BackLink,
  Divider,
  Empty,
  GroupLabel,
  InsightCard,
  Loading,
  MonthPicker,
  Panel,
  Row,
  StatTile,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { fetchInsights } from '../../src/features/meal-management/api';
import { monthLabel, rateText, takaText } from '../../src/features/meal-management/format';

/**
 * What the module has to say, and how well it has been saying it.
 *
 * The cards on top are advice; the panel below is the advice's own report
 * card — what a plan estimated against what the month actually did. Showing
 * the second under the first is deliberate: a recommendation engine that never
 * shows its error rate is asking to be trusted rather than earning it.
 */
export default function Recommendations() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { token } = useSession();

  const { month, recommendations, loadRecommendations, changeMonth } = useMealManagement();
  const [insights, setInsights] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadRecommendations(month);
    }, [loadRecommendations, month]),
  );

  useEffect(() => {
    if (token) fetchInsights(token, month).then((out) => out.ok && setInsights(out.result));
  }, [token, month]);

  const cards = recommendations?.cards ?? [];
  const comparison = insights?.comparison;

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('SMART')}
          accent={t('SUGGESTIONS')}
          subtitle={monthLabel(month, lang)}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

        {!recommendations ? (
          <Loading />
        ) : !cards.length ? (
          <View style={{ marginTop: 24 }}>
            <Empty
              icon="sparkles"
              title={t('Nothing to suggest yet')}
              hint={t('Record a few meals and costs, and suggestions appear here.')}
              action={() => router.push('/meal-management/meals')}
              actionLabel={t('Log meals')}
            />
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 22 }}>
            {cards.map((c, i) => (
              <Reveal key={`${c.kind}-${i}`} delay={(i % 5) + 1}>
                <InsightCard
                  title={c.title}
                  body={c.body}
                  tone={c.tone}
                  action={
                    c.kind === 'set-target'
                      ? () => router.push('/meal-management/preferences')
                      : c.kind === 'swap'
                        ? () => router.push('/meal-management/planner')
                        : c.kind === 'log-meals'
                          ? () => router.push('/meal-management/meals')
                          : undefined
                  }
                  actionLabel={
                    c.kind === 'set-target'
                      ? t('Set a target')
                      : c.kind === 'swap'
                        ? t('Open the planner')
                        : c.kind === 'log-meals'
                          ? t('Log meals')
                          : undefined
                  }
                />
              </Reveal>
            ))}
          </View>
        )}

        {/* Estimated against actual — the feedback loop, made visible. */}
        {comparison && insights?.estimated ? (
          <Reveal delay={6}>
            <GroupLabel text={t('Plan against reality')} style={{ marginTop: 30 }} />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <StatTile
                value={`৳${n(rateText(insights.estimated.rate))}`}
                label={t('Planned rate')}
              />
              <StatTile
                value={`৳${n(rateText(insights.actual.rate))}`}
                label={t('Actual rate')}
                tone="good"
              />
            </View>

            <Panel style={{ marginTop: 12 }}>
              <Row label={t('Meals planned')} value={n(insights.estimated.meals)} />
              <Row label={t('Meals recorded')} value={n(insights.actual.meals)} />
              <Divider />
              <Row
                label={t('Difference')}
                value={`${comparison.mealGap > 0 ? '+' : ''}${n(comparison.mealGap)}`}
                tone={comparison.mealGap === 0 ? 'good' : 'warn'}
                strong
              />
            </Panel>

            <Body muted style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
              {t('Neither figure is adjusted to match the other. The gap is what the planner learns from.')}
            </Body>
          </Reveal>
        ) : null}

        {/* What has been accepted so far. */}
        {insights?.feedback?.suggestions ? (
          <Reveal delay={7}>
            <GroupLabel text={t('Your choices')} style={{ marginTop: 28 }} />
            <Panel style={{ marginTop: 12, marginBottom: 14 }}>
              <Row label={t('Suggestions made')} value={n(insights.feedback.suggestions)} />
              <Row label={t('Swaps you took')} value={n(insights.feedback.accepted)} tone="good" />
              <Row label={t('Swaps you turned down')} value={n(insights.feedback.rejected)} />
            </Panel>
          </Reveal>
        ) : (
          <View style={{ height: 14 }} />
        )}
      </Container>
    </Screen>
  );
}
