import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
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
  BudgetStatus,
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
import { useMealAction } from '../../src/features/meal-management/errors';
import {
  SLOTS,
  dayLabel,
  monthLabel,
  rateText,
  takaText,
} from '../../src/features/meal-management/format';

/**
 * The smart meal planner.
 *
 * A plan is a projection and this screen never lets it read as anything else:
 * every cost on it is labelled estimated, and the figure a person is actually
 * billed lives on the rate screen. What the planner is for is the question
 * before the month — "can I eat the way I want for sixty taka a meal?" — and
 * the answer it gives is a plan you can argue with, meal by meal.
 *
 * Swapping is the argument. Each meal offers cheaper stand-ins; taking one
 * re-derives the projection immediately so the consequence of the choice is
 * visible at the moment it is made.
 */
export default function SmartPlanner() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { month, plan, profile, loadPlan, loadProfile, buildPlan, changeMonth } =
    useMealManagement();

  const [busy, setBusy] = useState(false);
  const [swapFor, setSwapFor] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadPlan(month);
      loadProfile();
    }, [loadPlan, loadProfile, month]),
  );

  const target = profile?.targetRate ?? null;

  const generate = async () => {
    setBusy(true);
    await run(() => buildPlan({ month, ...(target ? { targetRate: target } : {}) }), t('Plan ready.'));
    setBusy(false);
  };

  /* Days rather than a flat list — a month of meals reads as a schedule. */
  const byDay = useMemo(() => {
    const items = plan?.items ?? [];
    const map = new Map();
    items.forEach((item, index) => {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date).push({ ...item, index });
    });
    return [...map.entries()];
  }, [plan]);

  if (!target) {
    return (
      <Screen>
        <Container>
          <BackLink />
          <SectionHeader
            lead={t('SMART')}
            accent={t('PLANNER')}
            subtitle={t('A month built around what you want to pay.')}
            style={{ marginTop: 16 }}
          />
          <View style={{ marginTop: 24 }}>
            <Empty
              icon="sparkles"
              title={t('Set a target meal rate first')}
              hint={t('The planner needs to know what you are aiming to pay for each meal.')}
              action={() => router.push('/meal-management/preferences')}
              actionLabel={t('Set a target')}
            />
          </View>
        </Container>
      </Screen>
    );
  }

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('SMART')}
          accent={t('PLANNER')}
          subtitle={monthLabel(month, lang)}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

        {!plan ? (
          <View style={{ marginTop: 24 }}>
            <Empty
              icon="sparkles"
              title={t('No plan for this month yet')}
              hint={t('Build one from your target of ৳{n} a meal, your schedule and what you like.', {
                n: n(rateText(target)),
              })}
            />
            <Button
              label={busy ? t('Building…') : t('Build my plan')}
              icon="sparkles"
              block
              disabled={busy}
              style={{ marginTop: 14 }}
              onPress={generate}
            />
          </View>
        ) : (
          <>
            <Reveal delay={1}>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <StatTile value={n(plan.expectedMeals)} label={t('Meals planned')} />
                <StatTile
                  value={`৳${n(rateText(plan.projectedRate))}`}
                  label={t('Projected rate')}
                  tone={plan.status === 'over' ? 'bad' : plan.status === 'risk' ? 'warn' : 'good'}
                />
                <StatTile value={`৳${n(takaText(plan.projectedCost))}`} label={t('Projected cost')} />
              </View>
            </Reveal>

            <Reveal delay={2}>
              <View style={{ marginTop: 14 }}>
                <BudgetStatus
                  status={plan.status}
                  projected={plan.projectedRate}
                  target={plan.targetRate}
                  note={plan.explanation}
                />
              </View>
            </Reveal>

            <Reveal delay={3}>
              <Panel style={{ marginTop: 14 }}>
                <Row label={t('Your target')} value={`৳${n(rateText(plan.targetRate))}`} />
                <Row label={t('Budget for the month')} value={`৳${n(takaText(plan.targetBudget))}`} />
                <Divider />
                <Row
                  label={t('Confidence')}
                  value={`${n(Math.round((plan.confidence ?? 0) * 100))}%`}
                />
              </Panel>
              <Body muted style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
                {t('Confidence rises as you record more months — it is built from your own history, not a guess.')}
              </Body>
            </Reveal>

            <Button
              variant="glass"
              label={busy ? t('Rebuilding…') : t('Rebuild this plan')}
              icon="sparkles"
              block
              disabled={busy}
              style={{ marginTop: 16 }}
              onPress={generate}
            />

            <GroupLabel text={t('The month')} style={{ marginTop: 28 }} />

            <View style={{ gap: 12, marginTop: 12, marginBottom: 12 }}>
              {byDay.map(([date, items], i) => (
                <Reveal key={date} delay={(i % 5) + 1}>
                  <Panel>
                    <Heading size={15.5}>{dayLabel(date, lang)}</Heading>

                    <View style={{ marginTop: 10, gap: 8 }}>
                      {items.map((item) => (
                        <Pressable
                          key={`${item.date}-${item.slot}`}
                          accessibilityRole="button"
                          accessibilityLabel={t('{slot}: {name}, estimated ৳{n}. Tap for cheaper options.', {
                            slot: t(SLOTS.find((s) => s.key === item.slot)?.label ?? item.slot),
                            name: item.name,
                            n: n(takaText(item.estCost)),
                          })}
                          onPress={() => setSwapFor(item)}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            padding: 12,
                            borderRadius: radius.md,
                            backgroundColor: colors.sunken,
                            borderWidth: 1,
                            borderColor: item.replaced ? colors.sage : 'transparent',
                            opacity: pressed ? 0.85 : 1,
                          })}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={{
                                fontFamily: font.ui,
                                fontSize: 11.5,
                                textTransform: 'uppercase',
                                color: colors.textMuted,
                              }}
                            >
                              {t(SLOTS.find((s) => s.key === item.slot)?.label ?? item.slot)}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={{
                                fontFamily: font.uiSemi,
                                fontSize: type.sm + 1,
                                color: colors.text,
                                marginTop: 1,
                              }}
                            >
                              {item.name}
                            </Text>
                          </View>

                          <View style={{ alignItems: 'flex-end' }}>
                            <Text
                              style={{
                                fontFamily: font.displayBold,
                                fontSize: 15,
                                color: colors.text,
                                fontVariant: ['tabular-nums'],
                              }}
                            >
                              ৳{n(takaText(item.estCost))}
                            </Text>
                            <Text style={{ fontFamily: font.ui, fontSize: 10.5, color: colors.textLight }}>
                              {t('estimated')}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </Panel>
                </Reveal>
              ))}
            </View>
          </>
        )}
      </Container>

      <SwapSheet item={swapFor} month={month} onClose={() => setSwapFor(null)} />
    </Screen>
  );
}

/**
 * Cheaper stand-ins for one planned meal.
 *
 * Only cheaper ones are offered, because the sheet exists to recover budget;
 * an equally priced alternative would be a row that changes nothing. Declining
 * is recorded too — the specification wants both halves of the feedback pair.
 */
function SwapSheet({ item, month, onClose }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const run = useMealAction();
  const { alternativesFor, swapPlanItem, declineSuggestion } = useMealManagement();

  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    let alive = true;
    if (!item) {
      setOptions(null);
      return undefined;
    }
    setLoading(true);
    alternativesFor(month, item.index).then((out) => {
      if (!alive) return;
      setOptions(out.ok ? out.result.alternatives : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [item, month, alternativesFor]);

  const choose = async (alt) => {
    setBusy(true);
    const out = await run(
      () => swapPlanItem({ month, index: item.index, recipeKey: alt.key }),
      t('Swapped.'),
    );
    setBusy(false);
    if (out?.ok !== false) onClose();
  };

  const decline = async () => {
    if (options?.length) {
      /* Recorded so the engine learns what this person will not take. */
      declineSuggestion({ month, from: item.recipeKey, to: options[0].key });
    }
    onClose();
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
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
          <Heading size={18}>{t('Swap this meal')}</Heading>

          {item ? (
            <Panel style={{ marginTop: 14 }}>
              <Row label={t('Currently')} value={item.name} />
              <Row
                label={t('Estimated cost')}
                value={`৳${n(takaText(item.estCost))}`}
                strong
              />
            </Panel>
          ) : null}

          {loading ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : !options?.length ? (
            <Panel style={{ marginTop: 14 }}>
              <Body muted>
                {t('Nothing cheaper is available for this sitting — this is already one of your least costly options.')}
              </Body>
            </Panel>
          ) : (
            <View style={{ gap: 10, marginTop: 14 }}>
              {options.map((alt) => (
                <Pressable
                  key={alt.key}
                  accessibilityRole="button"
                  accessibilityLabel={t('{name}, ৳{n}. Saves ৳{s}.', {
                    name: alt.name,
                    n: n(takaText(alt.cost)),
                    s: n(takaText(Math.max(0, (item?.estCost ?? 0) - alt.cost))),
                  })}
                  disabled={busy}
                  onPress={() => choose(alt)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: pressed ? colors.sage : colors.line,
                  })}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
                      {alt.name}
                    </Text>
                    <Text style={{ fontFamily: font.ui, fontSize: 12, color: colors.sage, marginTop: 2 }}>
                      {t('Saves ৳{n}', {
                        n: n(takaText(Math.max(0, (item?.estCost ?? 0) - alt.cost))),
                      })}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: font.displayBold,
                      fontSize: 16,
                      color: colors.text,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    ৳{n(takaText(alt.cost))}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Button
            variant="ghost"
            label={t('Keep what I have')}
            block
            style={{ marginTop: 14 }}
            onPress={decline}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
