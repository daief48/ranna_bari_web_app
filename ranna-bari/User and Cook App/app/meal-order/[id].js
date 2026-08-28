/**
 * A booked meal's order.
 *
 * The screen itself is `OrderTracker`, shared with shop orders -- once an
 * order exists the two are the same object with the same escrow. All this
 * route adds is the line saying when the meal is served, which is the one
 * thing a shop order has no equivalent of.
 */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import OrderTracker from '../../src/components/OrderTracker';
import { serviceLabel } from '../../src/components/MealBits';
import { useCommerce } from '../../src/store/CommerceContext';
import { useLang } from '../../src/i18n/LanguageContext';

export default function MealOrderScreen() {
  const { id } = useLocalSearchParams();
  const { t, lang } = useLang();
  const shop = useCommerce();

  const order = shop.orders.find((o) => o.id === String(id));
  const meal = order?.mealId ? shop.mealById(order.mealId) : null;

  return (
    <OrderTracker
      orderId={String(id)}
      subtitle={meal ? serviceLabel(meal, t, lang) : null}
      backTo="/meals"
      backLabel={t('Tomorrow’s meals')}
    />
  );
}
