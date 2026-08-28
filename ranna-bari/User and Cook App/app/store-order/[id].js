/**
 * A shop order.
 *
 * Same tracker as a booked meal, because once the money is held the two are
 * the same thing. The subtitle names the shop's own shelf label rather than
 * a serving time -- a jar of achar is not served at lunch.
 */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import OrderTracker from '../../src/components/OrderTracker';
import { useCommerce } from '../../src/store/CommerceContext';
import { useLang } from '../../src/i18n/LanguageContext';

export default function StoreOrderScreen() {
  const { id } = useLocalSearchParams();
  const { t, n } = useLang();
  const shop = useCommerce();

  const order = shop.orders.find((o) => o.id === String(id));
  const items = order?.lines?.reduce((sum, l) => sum + l.qty, 0) ?? 0;

  return (
    <OrderTracker
      orderId={String(id)}
      subtitle={items ? t(items === 1 ? '{n} item' : '{n} items', { n: n(items) }) : null}
      backTo="/stores"
      backLabel={t('All shops')}
    />
  );
}
