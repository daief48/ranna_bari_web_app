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
 * Meals is one row again — but to a place built for it, not to the old
 * per-plate board. The monthly system is genuinely three decisions plus the
 * bookings they produce, and no single editor shows all four; `/cook/meal-hub`
 * is the one overview that does, and the editors sit one tap inside it.
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
import { fetchMyPlan, fetchMyService } from '../../../src/features/meal-plan/api';

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

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let alive = true;

      Promise.all([fetchMyService(token), fetchMyPlan(token)]).then(([svc, cal]) => {
        if (!alive) return;
        setService(svc.ok ? svc.result.service : null);
        setPlan(cal.ok ? cal.result : null);
      });

      return () => {
        alive = false;
      };
    }, [token]),
  );

  /* One line for the whole system — the two facts a cook acts on: is it on,
     and is there a menu behind it. The hub carries the rest. */
  const menuLive =
    plan === null ? null : !!(plan.cookPlan?.status === 'published' || plan.systemPlan);

  const mealsSub =
    service === undefined
      ? t('Checking…')
      : !service
        ? t('Not started yet')
        : !service.active
          ? t('Service set — not switched on')
          : menuLive === null
            ? t('Checking…')
            : menuLive
              ? t('Open for bookings')
              : t('Open, but no menu for this month');

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
              title={t('Monthly meals')}
              sub={mealsSub}
              onPress={() => router.push('/cook/meal-hub')}
            />
          </Reveal>
        </View>
      </Container>
    </CookScreen>
  );
}
