/**
 * An order that started life as a request.
 *
 * The same tracker as a meal or a shop basket -- once a price is agreed and
 * paid, a haggled-over cake is an order like any other, with the same escrow
 * and the same one button that releases it. What it adds on top of the shared
 * tracker is only what a request knows: that it IS a food request (the tag),
 * what was agreed, how many portions and by when, and a way to message the
 * cook while it is being made.
 *
 * Cancelling is limited to what the server allows a customer to cancel
 * (confirmed, i.e. paid and not yet started): past that the cook has begun
 * cooking something made for one person, and the refund is a conversation.
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
  /* The request this order came from -- by the order's own pointer when it
     has one, else by the request that points at the order. */
  const request =
    (order?.requestId ? shop.requestById(String(order.requestId)) : null) ??
    shop.requestsForCustomer().find((r) => String(r.orderId) === String(id)) ??
    null;

  const quantity = order?.quantity ?? request?.quantity ?? 1;
  const facts = [
    /* The agreed price is the tracker's own "Amount" row. */
    quantity > 1 ? { label: t('Portions'), value: n(quantity) } : null,
    request?.wantedDate ? { label: t('Wanted by'), value: String(request.wantedDate) } : null,
  ].filter(Boolean);

  return (
    <OrderTracker
      orderId={String(id)}
      subtitle={quantity > 1 ? t('{n} portions', { n: n(quantity) }) : t('Agreed price')}
      backTo="/requests"
      backLabel={t('Your requests')}
      tag={t('Food request')}
      chat
      canRate
      cancelStatuses={['pending', 'confirmed']}
      facts={facts}
    />
  );
}
