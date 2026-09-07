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
  BudgetStatus,
  Empty,
  ErrorState,
  GroupLabel,
  Loading,
  NavRow,
  Panel,
  Row,
  SlotToggle,
  StatTile,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import { SLOTS, monthLabel, rateText, takaText } from '../../src/features/meal-management/format';

/**
 * Meal management — the landing screen.
 *
 * Everything here comes from one request, because the figures have to agree
 * with each other and six requests can interleave with a write and disagree.
 *
 * The screen's job is to keep two pairs of numbers visibly apart: what was
 * actually eaten and spent, against what a plan projected. They sit under
 * their own headings and are never added together — the specification is
 * emphatic that a projection must never be mistaken for the books.
 */
export default function MealManagementHome() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const run = useMealAction();
  const { dashboard, loading, error, month, loadDashboard, setMeal, signedIn } =
    useMealManagement();

  /* Coming back from logging a meal should show the new figure. */
  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard]),
  );

  if (!signedIn) {
    return (
      <Screen>
        <Container>
          <BackLink fallback="/(tabs)/profile" />
          <SectionHeader
            lead={t('MEAL')}
            accent={t('MANAGEMENT')}
            subtitle={t('Track your mess meals, costs and monthly rate.')}
            style={{ marginTop: 16 }}
          />
          <Empty
            icon="user"
            title={t('Sign in to use meal management')}
            hint={t('Your meals and costs are kept against your account.')}
            action={() => router.push('/auth')}
            actionLabel={t('Sign in')}
          />
        </Container>
      </Screen>
    );
  }

  if (loading && !dashboard) {
    return (
      <Screen>
        <Container>
          <BackLink fallback="/(tabs)/profile" />
          <Loading label={t('Loading your meals…')} />
        </Container>
      </Screen>
    );
  }

  if (error && !dashboard) {
    return (
      <Screen>
        <Container>
          <BackLink fallback="/(tabs)/profile" />
          <ErrorState onRetry={loadDashboard} />
        </Container>
      </Screen>
    );
  }

  const d = dashboard ?? {};
  const actual = d.actual ?? {};
  const estimated = d.estimated;
  const target = d.target ?? {};
  const today = d.todayMeals ?? {};

  const toggleToday = (slot) => run(() => setMeal(today.date, { [slot]: !today[slot] }));

  return (
    <Screen>
      <Container>
        <BackLink fallback="/(tabs)/profile" />

        <SectionHeader
          lead={t('MEAL')}
          accent={t('MANAGEMENT')}
          subtitle={monthLabel(month, lang)}
          style={{ marginTop: 16 }}
        />

        {/* Today — the one thing a person opens this screen to do. */}
        <Reveal delay={1}>
          <GroupLabel text={t("Today's meals")} style={{ marginTop: 24 }} />
          <Panel style={{ marginTop: 12, gap: 8 }}>
            {SLOTS.map((s) => (
              <SlotToggle
                key={s.key}
                label={t(s.label)}
                taken={!!today[s.key]}
                disabled={d.closed}
                onToggle={() => toggleToday(s.key)}
              />
            ))}
            <Row
              label={t('Total today')}
              value={t('{n} meals', { n: n(today.total ?? 0) })}
              strong
            />
          </Panel>
        </Reveal>

        {/* Actual — the books. */}
        <Reveal delay={2}>
          <GroupLabel text={t('This month, actually')} style={{ marginTop: 28 }} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <StatTile value={n(actual.meals ?? 0)} label={t('Meals eaten')} />
            <StatTile
              value={`৳${n(rateText(actual.rate ?? 0))}`}
              label={t('Meal rate')}
              tone="good"
            />
            <StatTile value={`৳${n(takaText(actual.cost ?? 0))}`} label={t('Your cost')} />
          </View>

          <Panel style={{ marginTop: 12 }}>
            <Row label={t('Breakfast')} value={n(actual.breakfast ?? 0)} />
            <Row label={t('Lunch')} value={n(actual.lunch ?? 0)} />
            <Row label={t('Dinner')} value={n(actual.dinner ?? 0)} />
            {actual.guest ? <Row label={t('Guest meals')} value={n(actual.guest)} /> : null}
            <Row
              label={t('Costs counted this month')}
              value={`৳${n(takaText(actual.applicableCost ?? 0))}`}
            />
          </Panel>

          <Body muted style={{ marginTop: 8, fontSize: 12.5 }}>
            {t('Your rate is what the counted costs divide by the meals recorded — nothing else.')}
          </Body>
        </Reveal>

        {/* Estimated — the plan, kept deliberately separate. */}
        {estimated ? (
          <Reveal delay={3}>
            <GroupLabel text={t('Your plan projects')} style={{ marginTop: 28 }} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <StatTile value={n(estimated.meals ?? 0)} label={t('Meals planned')} />
              <StatTile
                value={`৳${n(rateText(estimated.rate ?? 0))}`}
                label={t('Projected rate')}
                tone={estimated.status === 'over' ? 'bad' : estimated.status === 'risk' ? 'warn' : 'good'}
              />
              <StatTile
                value={`৳${n(takaText(estimated.cost ?? 0))}`}
                label={t('Projected cost')}
              />
            </View>
          </Reveal>
        ) : null}

        {/* Target. */}
        {target.rate ? (
          <Reveal delay={4}>
            <GroupLabel text={t('Your target')} style={{ marginTop: 28 }} />
            <View style={{ marginTop: 12 }}>
              <BudgetStatus
                status={target.status ?? 'ok'}
                projected={actual.rate || estimated?.rate}
                target={target.rate}
                note={d.plan?.explanation}
              />
            </View>
          </Reveal>
        ) : (
          <Reveal delay={4}>
            <View style={{ marginTop: 20 }}>
              <Empty
                icon="sparkles"
                title={t('Set a target meal rate')}
                hint={t('Tell the planner what you want to pay per meal and it will build a month around it.')}
                action={() => router.push('/meal-management/preferences')}
                actionLabel={t('Set a target')}
              />
            </View>
          </Reveal>
        )}

        {/* The rest of the module. */}
        <Reveal delay={5}>
          <GroupLabel text={t('Manage')} style={{ marginTop: 28 }} />
          <View style={{ gap: 10, marginTop: 12 }}>
            <NavRow
              icon="calendar"
              title={t('My meals')}
              sub={t('Every day this month, and what you took')}
              onPress={() => router.push('/meal-management/meals')}
            />
            <NavRow
              icon="calendar"
              title={t('Calendar')}
              sub={t('The month at a glance')}
              onPress={() => router.push('/meal-management/calendar')}
            />
            <NavRow
              icon="receipt"
              title={t('Monthly summary')}
              sub={t('Meals, cost and rate, month by month')}
              onPress={() => router.push('/meal-management/summary')}
            />
            <NavRow
              icon="banknote"
              title={t('Meal rate')}
              sub={t('How this month’s rate was worked out')}
              tone="good"
              onPress={() => router.push('/meal-management/rate')}
            />
            <NavRow
              icon="box"
              title={t('Expenses')}
              sub={t('What the mess spent, and what counts')}
              onPress={() => router.push('/meal-management/expenses')}
            />
          </View>

          <GroupLabel text={t('Smart')} style={{ marginTop: 28 }} />
          <View style={{ gap: 10, marginTop: 12 }}>
            <NavRow
              icon="sparkles"
              title={t('Smart meal planner')}
              sub={
                d.plan
                  ? t('Planned · ৳{n} a meal', { n: n(rateText(d.plan.projectedRate)) })
                  : t('Build a month around your target')
              }
              tone="warn"
              onPress={() => router.push('/meal-management/planner')}
            />
            <NavRow
              icon="star"
              title={t('Recommendations')}
              sub={t('What to change, and why')}
              onPress={() => router.push('/meal-management/recommendations')}
            />
            <NavRow
              icon="activity"
              title={t('Forecast')}
              sub={t('What to cook, and where food is going to waste')}
              onPress={() => router.push('/meal-management/forecast')}
            />
          </View>

          <GroupLabel text={t('Settings')} style={{ marginTop: 28 }} />
          <View style={{ gap: 10, marginTop: 12, marginBottom: 12 }}>
            <NavRow
              icon="user"
              title={t('Meal schedule and preferences')}
              sub={t('Which sittings you take, and what you like')}
              onPress={() => router.push('/meal-management/preferences')}
            />
            <NavRow
              icon="lock"
              title={t('Meal management settings')}
              sub={t('Which costs count, and closing a month')}
              onPress={() => router.push('/meal-management/settings')}
            />
          </View>
        </Reveal>
      </Container>
    </Screen>
  );
}
