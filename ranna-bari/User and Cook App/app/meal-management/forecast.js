import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Reveal from '../../src/components/Reveal';
import { Body, Heading } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Empty,
  GroupLabel,
  InsightCard,
  Loading,
  Panel,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { SLOTS } from '../../src/features/meal-management/format';

const CONFIDENCE_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

/**
 * What to cook, and where food is going to waste.
 *
 * Attendance per sitting over the last four weeks, turned into a portion count
 * for tomorrow. The bar is the honest part: a sitting taken half the time gets
 * a half-full bar, and the insight underneath names it as the place food is
 * being thrown away.
 *
 * Confidence is shown next to every figure because a forecast from three days
 * of history and one from three weeks are different kinds of claim.
 */
export default function Forecast() {
  const router = useRouter();
  const { t, n } = useLang();
  const { colors } = useTheme();
  const { forecast, loadForecast } = useMealManagement();

  useFocusEffect(
    useCallback(() => {
      loadForecast();
    }, [loadForecast]),
  );

  if (!forecast) {
    return (
      <Screen>
        <Container>
          <BackLink />
          <Loading />
        </Container>
      </Screen>
    );
  }

  const slots = forecast.slots ?? [];
  const noHistory = slots.every((s) => s.days === 0);

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('KITCHEN')}
          accent={t('FORECAST')}
          subtitle={t('What the last four weeks suggest you will actually eat.')}
          style={{ marginTop: 16 }}
        />

        {noHistory ? (
          <View style={{ marginTop: 24 }}>
            <Empty
              icon="activity"
              title={t('Nothing to forecast from yet')}
              hint={t('Record a week of meals and this fills in.')}
              action={() => router.push('/meal-management/meals')}
              actionLabel={t('Log meals')}
            />
          </View>
        ) : (
          <>
            <Reveal delay={1}>
              <GroupLabel text={t('Expected portions')} style={{ marginTop: 26 }} />
              <View style={{ gap: 12, marginTop: 12 }}>
                {slots.map((s) => (
                  <Panel key={s.slot}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Heading size={16}>
                          {t(SLOTS.find((x) => x.key === s.slot)?.label ?? s.slot)}
                        </Heading>
                        <Body muted style={{ fontSize: 12.5, marginTop: 2 }}>
                          {t('Taken {n}% of the time · {c} confidence', {
                            n: n(Math.round(s.rate * 100)),
                            c: t(CONFIDENCE_LABEL[s.confidence] ?? s.confidence),
                          })}
                        </Body>
                      </View>

                      <Text
                        style={{
                          fontFamily: font.displayBold,
                          fontSize: 26,
                          color:
                            s.rate >= 0.7
                              ? colors.sage
                              : s.rate >= 0.4
                                ? colors.saffron
                                : colors.textLight,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {n(s.expected)}
                      </Text>
                    </View>

                    {/* The rate, drawn. */}
                    <View
                      style={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: colors.sunken,
                        marginTop: 12,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.round(s.rate * 100)}%`,
                          height: '100%',
                          borderRadius: 4,
                          backgroundColor:
                            s.rate >= 0.7
                              ? colors.sage
                              : s.rate >= 0.4
                                ? colors.saffron
                                : colors.primary,
                        }}
                      />
                    </View>
                  </Panel>
                ))}
              </View>
            </Reveal>

            <Reveal delay={2}>
              <GroupLabel text={t('What that means')} style={{ marginTop: 28 }} />
              <View style={{ gap: 12, marginTop: 12, marginBottom: 14 }}>
                {(forecast.insights ?? []).map((line, i) => (
                  <InsightCard
                    key={i}
                    title={t('Kitchen note')}
                    body={line}
                    tone={line.includes('waste') || line.includes('only') ? 'warn' : 'good'}
                  />
                ))}
              </View>
            </Reveal>
          </>
        )}
      </Container>
    </Screen>
  );
}
