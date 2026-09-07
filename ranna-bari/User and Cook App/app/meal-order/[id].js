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

  /* The order carries its own sitting now. It used to be looked up on the
     meal row this order was a copy of, and that collection went with the
     per-plate board — but `serveDate` and `slot` are on every meal order,
     which is what `serviceLabel` actually reads. */
  return (
    <OrderTracker
      orderId={String(id)}
      subtitle={order?.serveDate ? serviceLabel(order, t, lang) : null}
      backTo={order?.bookingId ? `/meal-booking/${order.bookingId}` : '/meal-bookings'}
      backLabel={t('My meal bookings')}
    />
  );
}
