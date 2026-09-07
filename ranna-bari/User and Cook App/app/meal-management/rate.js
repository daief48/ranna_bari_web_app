import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Reveal from '../../src/components/Reveal';
import { Body, Heading } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';
import { useSession } from '../../src/store/SessionContext';

import {
  BackLink,
  Divider,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
  Row,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { fetchRate } from '../../src/features/meal-management/api';
import { monthLabel, rateText, takaText } from '../../src/features/meal-management/format';

const CATEGORY_LABEL = {
  bazar: 'Food / Bazar',
  gas: 'Gas / Kitchen',
  utility: 'Utility',
  rent: 'Rent',
  other: 'Other',
};

/**
 * The rate, with its arithmetic shown.
 *
 * A single number nobody can check is a number nobody trusts, so this screen
 * is the division written out: which costs were counted, which were left out
 * and why, how many meals they were divided by, and what came of it. Every
 * figure here is deterministic — the smart layer has no say in any of it, and
 * the screen says so plainly at the bottom.
 */
export default function MealRate() {
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const { token } = useSession();
  const { month, changeMonth } = useMealManagement();

  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const out = await fetchRate(token, month);
    if (out.ok) setRate(out.result);
    setLoading(false);
  }, [token, month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('MEAL')}
          accent={t('RATE')}
          subtitle={monthLabel(month, lang)}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

        {loading && !rate ? (
          <Loading />
        ) : !rate ? null : (
          <>
            {/* The answer, before the working. */}
            <Reveal delay={1}>
              <Panel tone="good" style={{ marginTop: 22, alignItems: 'center', paddingVertical: 26 }}>
                <Body muted>{t('Your meal rate this month')}</Body>
                <Heading
                  size={44}
                  style={{ marginTop: 6, color: colors.sage, fontVariant: ['tabular-nums'] }}
                >
                  ৳{n(rateText(rate.rate))}
                </Heading>
                <Body muted style={{ marginTop: 4 }}>
                  {t('per meal')}
                </Body>
              </Panel>
            </Reveal>

            {/* The working. */}
            <Reveal delay={2}>
              <GroupLabel text={t('How that was worked out')} style={{ marginTop: 28 }} />
              <Panel style={{ marginTop: 12 }}>
                <Row
                  label={t('Costs that count')}
                  value={`৳${n(takaText(rate.applicableCost))}`}
                  strong
                />
                <Row label={t('Divided by meals')} value={n(rate.totalMeals)} strong />
                <Divider />
                <Row
                  label={t('Meal rate')}
                  value={`৳${n(rateText(rate.rate))}`}
                  tone="good"
                  strong
                />
              </Panel>

              <Body muted style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18 }}>
                {t('Meal rate = applicable monthly cost ÷ total monthly meals')}
              </Body>
            </Reveal>

            {/* What was and was not counted. */}
            <Reveal delay={3}>
              <GroupLabel text={t('Every cost this month')} style={{ marginTop: 28 }} />
              <Panel style={{ marginTop: 12 }}>
                {(rate.categories ?? []).map((c, i) => (
                  <View key={c.category}>
                    {i ? <Divider /> : null}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        gap: 12,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Body>{t(CATEGORY_LABEL[c.category] ?? c.category)}</Body>
                        <Body
                          muted
                          style={{ fontSize: 12, marginTop: 1 }}
                        >
                          {c.applicable ? t('Counted in the rate') : t('Not part of a meal')}
                        </Body>
                      </View>
                      <Body
                        style={{
                          fontFamily: font.uiSemi,
                          color: c.applicable ? colors.text : colors.textLight,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        ৳{n(takaText(c.amount))}
                      </Body>
                    </View>
                  </View>
                ))}

                <Divider />
                <Row label={t('All costs')} value={`৳${n(takaText(rate.totalCost))}`} />
                <Row
                  label={t('Counted')}
                  value={`৳${n(takaText(rate.applicableCost))}`}
                  tone="good"
                />
              </Panel>
            </Reveal>

            {/* Your share of it. */}
            {rate.mine ? (
              <Reveal delay={4}>
                <GroupLabel text={t('Your share')} style={{ marginTop: 28 }} />
                <Panel style={{ marginTop: 12 }}>
                  <Row label={t('Your meals')} value={n(rate.mine.meals ?? 0)} />
                  <Row label={t('Meal rate')} value={`৳${n(rateText(rate.rate))}`} />
                  <Divider />
                  <Row
                    label={t('You owe')}
                    value={`৳${n(takaText(rate.mine.share ?? 0))}`}
                    strong
                    tone="good"
                  />
                </Panel>
              </Reveal>
            ) : null}

            <Reveal delay={5}>
              <Panel style={{ marginTop: 20, marginBottom: 12 }}>
                <Body muted style={{ fontSize: 12.5, lineHeight: 19 }}>
                  {t(
                    'This figure is arithmetic over the meals you recorded and the costs you entered. The smart planner never changes it — it only suggests what to eat next.',
                  )}
                </Body>
              </Panel>
            </Reveal>
          </>
        )}
      </Container>
    </Screen>
  );
}
