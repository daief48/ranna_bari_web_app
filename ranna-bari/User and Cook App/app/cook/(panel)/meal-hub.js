/**
 * The whole monthly-meal system, in one place.
 *
 * The hub used to be four rows of state and links. The state was right, but
 * the one thing a cook opens it for — "what does this month look like" — was
 * the one thing it did not show: the calendar lived a screen deep, behind an
 * editor. So the month itself is drawn here now, read-only, with the editors
 * one tap away; a hub that shows the work and a button for each edit.
 *
 * The service switch lives here too. It was on a screen called "meal
 * service", which is exactly the right place for it and exactly where nobody
 * looks when bookings are quiet — the switch that decides whether customers
 * can book at all belongs on the overview.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import { ActionRow, PublishSwitch } from '../../../src/components/CookBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius } from '../../../src/theme/tokens';
import { useSession } from '../../../src/store/SessionContext';
import { useAction } from '../../../src/components/Alert';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  Empty,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
  Row,
} from '../../../src/features/meal-plan/components';
import {
  saveMyService,
  fetchMealOrders,
  fetchMyPlan,
  fetchMyService,
} from '../../../src/features/meal-plan/api';
import {
  dateLabel,
  dayParts,
  monthLabel,
  spreadMonth,
  todayKey,
} from '../../../src/features/meal-plan/format';

export default function MealHubScreen() {
  const router = useRouter();
  const { t, n } = useLang();
  const { colors } = useTheme();
  const { token } = useSession();
  const run = useAction();

  /* `undefined` = still reading, `null` = read and not there. The distinction
     is the same one the listings hub makes: a hub that says "not started"
     during a slow fetch is a hub that lies. */
  const [service, setService] = useState(undefined);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [plan, setPlan] = useState(null);
  const [board, setBoard] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let alive = true;

      Promise.all([
        fetchMyService(token),
        fetchMyPlan(token, month),
        fetchMealOrders(token, todayKey()),
      ]).then(([svc, cal, day]) => {
        if (!alive) return;
        setService(svc.ok ? svc.result.service : null);
        setPlan(cal.ok ? cal.result : null);
        setBoard(day.ok ? day.result : null);
      });

      return () => {
        alive = false;
      };
    }, [token, month]),
  );

  /* The month's menu, effective: the cook's own plan when there is one, the
     platform's underneath when there is not. That is what a customer books
     from, so it is what the grid draws. */
  const days = useMemo(() => {
    if (!plan) return [];
    const source = plan.cookPlan?.days?.length
      ? plan.cookPlan
      : plan.systemPlan
        ? plan.systemPlan
        : null;
    return source ? spreadMonth(source.month || month, source.days) : spreadMonth(month, []);
  }, [plan, month]);

  /* Filled slots per day — the little count under each date. A calendar of
     blank cells reads as broken; a calendar of counts reads as work. */
  const counts = useMemo(() => {
    const map = new Map();
    for (const day of days) {
      map.set(
        day.date,
        ['breakfast', 'lunch', 'dinner'].filter((slot) => String(day[slot] ?? '').trim()).length,
      );
    }
    return map;
  }, [days]);

  const mealsWritten = useMemo(
    () => Array.from(counts.values()).reduce((sum, c) => sum + c, 0),
    [counts],
  );

  const monthLive =
    plan === null ? null : !!(plan.cookPlan?.status === 'published' || plan.systemPlan);

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
        : t('{label} · ৳{rate} a meal', {
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

  const boardLine =
    board === null
      ? t('Checking…')
      : total === 0
        ? board.next
          ? t('Free today — next cooking day {date}', { date: dateLabel(board.next) })
          : t('Nothing booked right now')
        : t('{done} of {total} handed over today', { done: n(delivered), total: n(total) });

  /* The switch that decides whether customers can book at all. It writes the
     service back whole — the same values, one field flipped — because there
     is no smaller verb for it, and a partial patch here would be a second
     place that can silently change the price. */
  const toggleService = () => {
    if (!service) return;
    Haptics.selectionAsync().catch(() => {});
    run(
      () =>
        saveMyService(token, {
          categoryKey: service.categoryKey,
          rate: service.rate ?? null,
          minMeals: service.minMeals,
          maxMeals: service.maxMeals,
          active: !service.active,
        }),
      () => (service.active ? t('Meal service paused.') : t('Meal service is open for bookings.')),
    );
  };

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('MONTHLY')}
          accent={t('MEALS')}
          subtitle={t('The whole meal system — service, menu, dishes and bookings — in one place.')}
          style={{ marginTop: 16 }}
        />

        {/* The state of the halves, read straight from the server. */}
        {service === undefined ? (
          <Loading label={t('Checking your meal system…')} />
        ) : (
          <Reveal delay={1}>
            <Panel style={{ marginTop: 18 }}>
              <Row label={t('Meal service')} value={serviceLine} tone={service ? 'good' : 'warn'} />
              <Row
                label={t('Monthly menu')}
                value={menuLine}
                tone={monthLive ? 'good' : 'warn'}
              />
              <Row
                label={t('Plates today')}
                value={boardLine}
                tone={total > 0 && delivered === total ? 'good' : undefined}
              />
            </Panel>
          </Reveal>
        )}

        {/* ---- The switch ----
            Off is a real state, not a failure: a cook who is not cooking
            this month should be able to say so from the overview rather
            than receiving bookings they cannot honour. */}
        {service ? (
          <Reveal delay={2}>
            <View style={{ marginTop: 14 }}>
              <PublishSwitch
                value={!!service.active}
                onChange={toggleService}
                title={service.active ? t('Open for bookings') : t('Not offered')}
                sub={
                  service.active
                    ? t('Customers can book this month from your listing.')
                    : t('Your listing shows no meal service until you switch this on.')
                }
              />
            </View>
          </Reveal>
        ) : null}

        {/* ---- The month, drawn ----
            Every day of the chosen month; a count under each date says how
            many meals are written. Today is ringed; the month rolls with the
            picker above it. Read-only on purpose — the editor owns the
            writing, and it is one tap away. */}
        {service ? (
          <Reveal delay={3}>
            <View style={{ marginTop: 26 }}>
              <GroupLabel text={t('This month’s menu')} style={{ marginBottom: 14 }} />

              <MonthPicker month={month} onChange={setMonth} />

              {plan === null ? (
                <Loading label={t('Reading the calendar…')} />
              ) : (
                <>
                  <View style={{ flexDirection: 'row', marginTop: 16, marginBottom: 6 }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <Text
                        key={`${d}-${i}`}
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          fontFamily: font.uiSemi,
                          fontSize: 10,
                          letterSpacing: 0.5,
                          color: colors.textMuted,
                        }}
                      >
                        {d}
                      </Text>
                    ))}
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.surfaceSolid,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Leading blanks, so the 1st lands on its weekday. */}
                    {Array.from({
                      length: days.length
                        ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay()
                        : 0,
                    }).map((_, i) => (
                      <View
                        key={`pad-${i}`}
                        style={{
                          width: `${100 / 7}%`,
                          aspectRatio: 1,
                          borderWidth: 0.5,
                          borderColor: colors.line2,
                          backgroundColor: colors.sunken,
                        }}
                      />
                    ))}

                    {days.map((day) => {
                      const parts = dayParts(day.date);
                      const count = counts.get(day.date) ?? 0;
                      const today = day.date === todayKey();

                      return (
                        <View
                          key={day.date}
                          style={{
                            width: `${100 / 7}%`,
                            aspectRatio: 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1,
                            borderWidth: 0.5,
                            borderColor: colors.line2,
                            backgroundColor: today
                              ? colors.sage50
                              : parts.weekend
                                ? colors.sunken
                                : 'transparent',
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: today ? font.uiBold : font.ui,
                              fontSize: 12.5,
                              color: today ? colors.sage : parts.weekend ? colors.primary : colors.text,
                            }}
                          >
                            {n(parts.day)}
                          </Text>
                          <Text
                            style={{
                              fontFamily: font.ui,
                              fontSize: 9.5,
                              color: count ? colors.primary : colors.textLight,
                            }}
                          >
                            {count ? n(count) : '·'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 12,
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: font.ui,
                        fontSize: 12.5,
                        color: colors.textMuted,
                      }}
                    >
                      {mealsWritten
                        ? t('{n} meals written for {month}', {
                            n: n(mealsWritten),
                            month: monthLabel(month),
                          })
                        : t('Nothing written for {month} yet', { month: monthLabel(month) })}
                    </Text>
                    <Button
                      label={t('Edit the menu')}
                      icon="arrowRight"
                      small
                      onPress={() =>
                        router.push({ pathname: '/cook/meal-plan', params: { month } })
                      }
                    />
                  </View>
                </>
              )}
            </View>
          </Reveal>
        ) : null}

        {/* Today at a glance, straight from the cooking board. */}
        {board?.week?.length ? (
          <Reveal delay={4}>
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

            <Button
              label={t('Open the cooking board')}
              block
              variant="glass"
              style={{ marginTop: 14 }}
              onPress={() => router.push('/cook/meals')}
            />
          </Reveal>
        ) : (
          <Reveal delay={4}>
            <Button
              label={t('Open the cooking board')}
              block
              variant="glass"
              style={{ marginTop: 18 }}
              onPress={() => router.push('/cook/meals')}
            />
          </Reveal>
        )}

        {/* The editors, one tap away each. The hub reads; these write. */}
        <GroupLabel text={t('Set things up or change them')} style={{ marginTop: 30 }} />
        <View style={{ gap: 12, marginTop: 12, marginBottom: 26 }}>
          <ActionRow
            icon="pot"
            tone="saffron"
            title={t('Meal service')}
            sub={
              !service
                ? t('Category, rate and how many meals a day')
                : serviceLine
            }
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
            sub={t('The dish names the calendar draws from')}
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
