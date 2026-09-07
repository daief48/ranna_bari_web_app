/**
 * Everything a cook sells, in one place.
 *
 * The bar used to carry Menu, Meals and Shop as three of its seven
 * destinations, which is three-sevenths of the navigation spent on one idea:
 * the things this kitchen offers. They are still three separate catalogues —
 * cooked to order, cooked for a month, and made to keep — but they are one
 * errand, and this is where it starts.
 *
 * Each row carries its own count, so the hub answers "what do I have out
 * there" without being opened three times.
 *
 * Meals is now three rows rather than one. The per-plate board it used to open
 * was replaced by the monthly system, where offering meals is genuinely three
 * decisions — the service, the calendar and the dish list — and a single row
 * hid two of them behind a screen nobody had a reason to open.
 */
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Reveal from '../../../src/components/Reveal';
import SectionHeader from '../../../src/components/SectionHeader';
import { ActionRow } from '../../../src/components/CookBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useSession } from '../../../src/store/SessionContext';
import { useLang } from '../../../src/i18n/LanguageContext';

import { GroupLabel } from '../../../src/features/meal-plan/components';
import { fetchMyDishes, fetchMyPlan, fetchMyService } from '../../../src/features/meal-plan/api';

export default function ListingsScreen() {
  const router = useRouter();
  const { t, n } = useLang();
  const { kitchen } = useKitchen();
  const { colors } = useTheme();
  const { token } = useSession();
  const shop = useCommerce();

  const dishes = kitchen?.dishes ?? [];
  const live = dishes.filter((d) => d.available !== false).length;

  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;
  const products = store ? shop.productsOf(store.id) : [];
  const onSale = products.filter((p) => p.active !== false).length;

  /*
   * The state of each meal row, not a description of it.
   *
   * "Menu — Nothing listed yet" tells a cook something; "My calendar — What you
   * cook each day of the month" is a dictionary definition of a word already in
   * the title. Two of the three rows read like that, which left the hub unable
   * to answer the only question it is opened with: is anything waiting on me.
   */
  const [service, setService] = useState(undefined);
  const [plan, setPlan] = useState(null);
  const [mealDishes, setMealDishes] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let alive = true;

      Promise.all([fetchMyService(token), fetchMyPlan(token), fetchMyDishes(token)]).then(
        ([svc, cal, lib]) => {
          if (!alive) return;
          setService(svc.ok ? svc.result.service : null);
          setPlan(cal.ok ? cal.result : null);
          setMealDishes(lib.ok ? lib.result : null);
        },
      );

      return () => {
        alive = false;
      };
    }, [token]),
  );

  /** Which month is live for this kitchen, and whether it needs finishing. */
  const calendarSub = !service
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

  /** How much of the library is actually doing work. */
  const dishesSub = !service
    ? t('Start a meal service first')
    : mealDishes === null
      ? t('Checking…')
      : (mealDishes.mine?.length ?? 0) > 0
        ? t('{n} of your own', { n: n(mealDishes.mine.length) })
        : t('None yet — add the ones you cook most');

  /* `undefined` while it is still being read, `null` when there is none —
     different sentences, and a hub that says "not started" for half a second
     on every visit is a hub that lies. */
  const serviceSub =
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

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('YOUR')}
          accent={t('LISTINGS')}
          subtitle={t('Everything you have out there, and what it is doing.')}
          style={{ marginBottom: 22 }}
        />

        <View style={{ gap: 12 }}>
          <Reveal delay={1}>
            <ActionRow
              icon="utensils"
              tone="primary"
              title={t('Menu')}
              sub={
                dishes.length
                  ? t('{live} of {total} available to order', {
                      live: n(live),
                      total: n(dishes.length),
                    })
                  : t('Nothing listed yet')
              }
              onPress={() => router.push('/cook/menu')}
            />
          </Reveal>

          <Reveal delay={2}>
            <ActionRow
              icon="box"
              title={t('Shop')}
              sub={
                store
                  ? t('{n} products on sale', { n: n(onSale) })
                  : t('You have not opened a shop yet')
              }
              onPress={() => router.push('/cook/store')}
            />
          </Reveal>
        </View>

        {/* Each row says where that half of the meal system stands. A cook
            reading three rows should be able to close the app if all three are
            settled, and know which one to open if they are not. */}
        <GroupLabel text={t('Monthly meals')} style={{ marginTop: 30, marginBottom: 12 }} />

        {/*
          The order to do things in, for as long as it is not obvious.
          Three equally-weighted rows do not say that the service comes first
          and the switch comes last, so a cook setting up for the first time
          had to deduce the sequence from the locks. It disappears the moment
          the kitchen is actually open for bookings.
        */}
        {service !== undefined && !(service && service.active) ? (
          <View
            style={{
              marginBottom: 12,
              padding: 14,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.saffron,
              backgroundColor: colors.saffron50,
              gap: 6,
            }}
          >
            {[
              { done: !!service, label: t('Set your category, price and meal range') },
              {
                done: !!service && !!(plan?.cookPlan || plan?.systemPlan),
                label: t('Have a menu for the month'),
              },
              { done: !!service?.active, label: t('Switch the service on') },
            ].map((step, i) => (
              <View key={step.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text
                  style={{
                    width: 18,
                    fontFamily: font.uiBold,
                    fontSize: 12,
                    color: step.done ? colors.sage : colors.textMuted,
                  }}
                >
                  {step.done ? '✓' : n(i + 1)}
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontFamily: step.done ? font.ui : font.uiBold,
                    fontSize: 13,
                    color: step.done ? colors.textMuted : colors.text,
                  }}
                >
                  {step.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <Reveal delay={3}>
            <ActionRow
              icon="pot"
              tone="saffron"
              title={t('Meal service')}
              sub={serviceSub}
              onPress={() => router.push('/cook/meal-service')}
            />
          </Reveal>

          <Reveal delay={4}>
            <ActionRow
              icon="calendar"
              title={t('Monthly menu')}
              sub={calendarSub}
              locked={!service}
              onPress={() => router.push('/cook/meal-plan')}
            />
          </Reveal>

          <Reveal delay={5}>
            <ActionRow
              icon="utensils"
              title={t('My dishes')}
              sub={dishesSub}
              locked={!service}
              onPress={() => router.push('/cook/meal-dishes')}
            />
          </Reveal>
        </View>
      </Container>
    </CookScreen>
  );
}
