/**
 * The whole monthly-meal system, in one place.
 *
 * The listings hub used to send a cook to three screens — service, calendar,
 * dish library — and the bookings lived on a fourth. Each screen is the right
 * place to *change* its half, but none of them answered "how is my meal
 * system doing overall": that meant opening four screens to learn what this
 * one says at a glance.
 *
 * So this is the overview, not a fifth editor. Every section reads its live
 * state and hands off to the screen that owns the edit — nothing here writes
 * except through those screens, so there is exactly one place where each
 * setting can be changed.
 */
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import { ActionRow } from '../../../src/components/CookBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius } from '../../../src/theme/tokens';
import { useSession } from '../../../src/store/SessionContext';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  Empty,
  GroupLabel,
  Loading,
  Panel,
  Row,
} from '../../../src/features/meal-plan/components';
import { fetchMealOrders, fetchMyDishes, fetchMyPlan, fetchMyService } from '../../../src/features/meal-plan/api';
import { dateLabel, dayParts, todayKey } from '../../../src/features/meal-plan/format';

export default function MealHubScreen() {
  const router = useRouter();
  const { t, n } = useLang();
  const { colors } = useTheme();
  const { token } = useSession();

  /* `undefined` = still reading, `null` = read and not there. The distinction
     is the same one the listings hub makes: a hub that says "not started"
     during a slow fetch is a hub that lies. */
  const [service, setService] = useState(undefined);
  const [plan, setPlan] = useState(null);
  const [mealDishes, setMealDishes] = useState(null);
  const [board, setBoard] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let alive = true;

      Promise.all([
        fetchMyService(token),
        fetchMyPlan(token),
        fetchMyDishes(token),
        fetchMealOrders(token, todayKey()),
      ]).then(([svc, cal, lib, day]) => {
        if (!alive) return;
        setService(svc.ok ? svc.result.service : null);
        setPlan(cal.ok ? cal.result : null);
        setMealDishes(lib.ok ? lib.result : null);
        setBoard(day.ok ? day.result : null);
      });

      return () => {
        alive = false;
      };
    }, [token]),
  );

  const orders = board?.orders ?? [];
  const total = orders.length;
  const delivered = orders.filter(
    (o) => o.status === 'delivered' || o.status === 'completed',
  ).length;

  /* One line per half, said the way the screens under them say it — the same
     sentences, so the overview and the editors can never disagree. */
  const serviceLine =
    service === undefined
      ? t('Checking…')
      : !service
        ? t('Not started yet')
        : service.active
          ? t('{label} · ৳{rate} a meal · open', {
              label: t(service.categoryLabel || service.categoryKey),
              rate: n(service.effectiveRate),
            })
          : t('{label} · ৳{rate} a meal · not offered', {
              label: t(service.categoryLabel || service.categoryKey),
              rate: n(service.effectiveRate),
            });

  const menuLine = !service
    ? t('Start a meal service first')
    : plan === null
      ? t('Checking…')
      : plan.cookPlan
        ? plan.cookPlan.status === 'published'
          ? t('Your own menu is live')
          : t('Your menu is a draft — publish it')
        : plan.systemPlan
          ? t('Cooking the platform’s menu')
          : t('No menu published for this month');

  const dishesLine = !service
    ? t('Start a meal service first')
    : mealDishes === null
      ? t('Checking…')
      : (mealDishes.mine?.length ?? 0) > 0
        ? t('{n} of your own', { n: n(mealDishes.mine.length) })
        : t('None yet — add the ones you cook most');

  const boardLine =
    board === null
      ? t('Checking…')
      : total === 0
        ? board.next
          ? t('Free today — next cooking day {date}', { date: dateLabel(board.next) })
          : t('Nothing booked right now')
        : t('{done} of {total} handed over today', { done: n(delivered), total: n(total) });

  const serviceTone = !service ? 'warn' : service.active ? 'good' : 'warn';
  const menuTone =
    !service || plan === null
      ? 'warn'
      : plan.cookPlan?.status === 'published' || plan.systemPlan
        ? 'good'
        : 'warn';

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('MONTHLY')}
          accent={t('MEALS')}
          subtitle={t('The whole meal system — service, menu, dishes and bookings — in one place.')}
          style={{ marginTop: 16 }}
        />

        {/* The state of the four halves, read straight from the server. */}
        {service === undefined ? (
          <Loading label={t('Checking your meal system…')} />
        ) : (
          <Reveal delay={1}>
            <Panel style={{ marginTop: 18 }}>
              <Row label={t('Meal service')} value={serviceLine} tone={serviceTone} />
              <Row label={t('Monthly menu')} value={menuLine} tone={menuTone} />
              <Row label={t('My dishes')} value={dishesLine} />
              <Row
                label={t('Plates today')}
                value={boardLine}
                tone={total > 0 && delivered === total ? 'good' : undefined}
              />
            </Panel>
          </Reveal>
        )}

        {/* Today at a glance, straight from the cooking board. */}
        {board?.week?.length ? (
          <Reveal delay={2}>
            <GroupLabel text={t('This week')} style={{ marginTop: 26 }} />
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
              {board.week.map((day) => (
                <View
                  key={day.date}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 8,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: day.date === todayKey() ? colors.sage : colors.line,
                    backgroundColor: day.date === todayKey() ? colors.sage50 : colors.sunken,
                  }}
                >
                  <Text style={{ fontFamily: font.ui, fontSize: 10.5, color: colors.textMuted }}>
                    {dayParts(day.date).weekday}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 14,
                      marginTop: 1,
                      color: colors.text,
                    }}
                  >
                    {n(dayParts(day.date).day)}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: 10.5,
                      marginTop: 2,
                      color: day.count ? colors.primary : colors.textMuted,
                    }}
                  >
                    {day.count ? n(day.count) : '·'}
                  </Text>
                </View>
              ))}
            </View>
          </Reveal>
        ) : null}

        <Reveal delay={3}>
          <Button
            label={t('Open the cooking board')}
            block
            style={{ marginTop: 18 }}
            onPress={() => router.push('/cook/meals')}
          />
        </Reveal>

        {/* The four editors, one tap away each. The hub reads; these write. */}
        <GroupLabel text={t('Set things up or change them')} style={{ marginTop: 30 }} />
        <View style={{ gap: 12, marginTop: 12, marginBottom: 26 }}>
          <ActionRow
            icon="pot"
            tone="saffron"
            title={t('Meal service')}
            sub={serviceLine}
            onPress={() => router.push('/cook/meal-service')}
          />
          <ActionRow
            icon="calendar"
            title={t('Monthly menu')}
            sub={menuLine}
            onPress={() => router.push('/cook/meal-plan')}
          />
          <ActionRow
            icon="utensils"
            title={t('My dishes')}
            sub={dishesLine}
            onPress={() => router.push('/cook/meal-dishes')}
          />
        </View>

        {!service ? (
          <View style={{ marginBottom: 26 }}>
            <Empty
              title={t('No meal service yet')}
              hint={t('Set your category, price and meal range, then switch the service on.')}
            />
          </View>
        ) : null}
      </Container>
    </CookScreen>
  );
}
