/**
 * An order that started life as a request.
 *
 * The same tracker as a meal or a shop basket -- once a price is agreed and
 * paid, a haggled-over cake is an order like any other, with the same escrow
 * and the same one button that releases it.
 */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import OrderTracker from '../../src/components/OrderTracker';
import { useCommerce } from '../../src/store/CommerceContext';
import { useLang } from '../../src/i18n/LanguageContext';

export default function RequestOrderScreen() {
  const { id } = useLocalSearchParams();
  const { t, n } = useLang();
  const shop = useCommerce();

  const order = shop.orders.find((o) => o.id === String(id));

  return (
    <OrderTracker
      orderId={String(id)}
      subtitle={
        order?.quantity > 1 ? t('{n} portions', { n: n(order.quantity) }) : t('Agreed price')
      }
      backTo="/requests"
      backLabel={t('Your requests')}
    />
  );
}
