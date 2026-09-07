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
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Reveal from '../../../src/components/Reveal';
import SectionHeader from '../../../src/components/SectionHeader';
import { ActionRow } from '../../../src/components/CookBits';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useSession } from '../../../src/store/SessionContext';
import { useLang } from '../../../src/i18n/LanguageContext';

import { GroupLabel } from '../../../src/features/meal-plan/components';
import { fetchMyService } from '../../../src/features/meal-plan/api';

export default function ListingsScreen() {
  const router = useRouter();
  const { t, n } = useLang();
  const { kitchen } = useKitchen();
  const { token } = useSession();
  const shop = useCommerce();

  const dishes = kitchen?.dishes ?? [];
  const live = dishes.filter((d) => d.available !== false).length;

  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;
  const products = store ? shop.productsOf(store.id) : [];
  const onSale = products.filter((p) => p.active !== false).length;

  const [service, setService] = useState(undefined);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let alive = true;
      fetchMyService(token).then((out) => {
        if (alive) setService(out.ok ? out.result.service : null);
      });
      return () => {
        alive = false;
      };
    }, [token]),
  );

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

        <GroupLabel text={t('Monthly meals')} style={{ marginTop: 30, marginBottom: 12 }} />

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
              title={t('My calendar')}
              sub={
                service
                  ? t('What you cook each day of the month')
                  : t('Start a meal service first')
              }
              locked={!service}
              onPress={() => router.push('/cook/meal-plan')}
            />
          </Reveal>

          <Reveal delay={5}>
            <ActionRow
              icon="utensils"
              title={t('My dishes')}
              sub={
                service
                  ? t('The meals you drop onto a day')
                  : t('Start a meal service first')
              }
              locked={!service}
              onPress={() => router.push('/cook/meal-dishes')}
            />
          </Reveal>
        </View>
      </Container>
    </CookScreen>
  );
}
