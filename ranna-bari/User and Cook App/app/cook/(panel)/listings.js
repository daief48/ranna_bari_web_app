/**
 * Everything a cook sells, in one place.
 *
 * The bar used to carry Menu, Meals and Shop as three of its seven
 * destinations, which is three-sevenths of the navigation spent on one idea:
 * the things this kitchen offers. They are still three separate catalogues —
 * cooked to order, cooked for one service, and made to keep — but they are
 * one errand, and this is where it starts.
 *
 * Each row carries its own count, so the hub answers "what do I have out
 * there" without being opened three times.
 */
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Reveal from '../../../src/components/Reveal';
import SectionHeader from '../../../src/components/SectionHeader';
import { ActionRow } from '../../../src/components/CookBits';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useLang } from '../../../src/i18n/LanguageContext';

export default function ListingsScreen() {
  const router = useRouter();
  const { t, n } = useLang();
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  const dishes = kitchen?.dishes ?? [];
  const live = dishes.filter((d) => d.available !== false).length;

  const meals = kitchen ? shop.mealsForKitchen(kitchen.id) : [];
  const openMeals = meals.filter((m) => m.status === 'published').length;

  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;
  const products = store ? shop.productsOf(store.id) : [];
  const onSale = products.filter((p) => p.active !== false).length;

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
              icon="pot"
              tone="saffron"
              title={t('Meals')}
              sub={
                openMeals
                  ? t('{n} taking orders', { n: n(openMeals) })
                  : t('Plan tomorrow’s meal tonight')
              }
              onPress={() => router.push('/cook/meals')}
            />
          </Reveal>

          <Reveal delay={3}>
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
      </Container>
    </CookScreen>
  );
}
