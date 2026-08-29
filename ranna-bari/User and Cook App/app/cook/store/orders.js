/**
 * Shop orders, filtered the way a cook thinks about them.
 *
 * Kept apart from the kitchen's à-la-carte board because they are different
 * work with different money: those are cooked now and paid in cash at the
 * door, these are packed from a shelf and paid from a wallet that is holding
 * the money until the customer says it arrived.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import { Body, Heading, Price } from '../../../src/components/Typography';
import {
  EmptyState,
  MealStatusPill,
  PaymentPill,
  errorText,
} from '../../../src/components/MealBits';
import { OrderLines } from '../../../src/components/StoreBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import useResponsive from '../../../src/theme/useResponsive';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { formatAddress } from '../../../src/lib/address';
import { timeAgo } from '../../../src/store/OrdersContext';
import { COOK_ADVANCES } from '../../../src/lib/ledger';
import { ORDER_FILTERS, filterOrders } from '../../../src/lib/storeLogic';
import { useLang } from '../../../src/i18n/LanguageContext';

/** What the cook's button says at each stage. */
const NEXT_LABEL = {
  confirmed: 'Start packing',
  preparing: 'Mark ready',
  ready: 'Send out',
  delivering: 'Mark delivered',
};

export default function StoreOrders() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const r = useResponsive();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);

  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;
  const all = useMemo(() => (store ? shop.storeOrders(store.id) : []), [shop, store]);
  const orders = useMemo(() => filterOrders(all, filter), [all, filter]);

  const advance = async (orderId) => {
    const out = await shop.advanceOrder(orderId);
    if (!out.ok) setError(errorText(out.error, t, n, out));
    else setError(null);
  };

  return (
    <CookScreen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook/store'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 18,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.sage} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.sage,
            }}
          >
            {t('Your shop')}
          </Text>
        </Pressable>

        <Reveal delay={1}>
          <Heading size={30} style={{ letterSpacing: -0.6 }}>
            {t('Shop orders')}
          </Heading>
          <Body muted size={15} style={{ marginTop: 4 }}>
            {t('You are paid when the customer confirms the parcel arrived.')}
          </Body>
        </Reveal>
      </Container>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: r.gutter, paddingVertical: 2 }}
        style={{ marginTop: 20 }}
      >
        {ORDER_FILTERS.map((f) => {
          const active = filter === f.key;
          const count = filterOrders(all, f.key).length;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              aria-pressed={active}
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f.key)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  paddingVertical: 10,
                  paddingHorizontal: 15,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.sage : colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: active ? colors.sage : colors.line,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
                shadow.xs,
              ]}
            >
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: 13,
                  color: active ? '#FFFFFF' : colors.text,
                }}
              >
                {t(f.label)}
              </Text>
              {count ? (
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 11,
                    color: active ? 'rgba(255,255,255,0.85)' : colors.textMuted,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {n(count)}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Container style={{ paddingTop: 20 }}>
        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              marginBottom: 16,
              borderRadius: radius.sm,
              backgroundColor: colors.primary50,
              borderWidth: 1,
              borderColor: colors.primary200,
            }}
          >
            <Icon name="alertCircle" size={16} color={colors.primary} />
            <Text style={{ flex: 1, fontFamily: font.ui, fontSize: type.sm, color: colors.text }}>
              {error}
            </Text>
          </View>
        ) : null}

        {orders.length ? (
          <View style={{ gap: 12 }}>
            {orders.map((order, i) => (
              <Reveal key={order.id} delay={(i % 5) + 1}>
                <OrderCard
                  order={order}
                  onAdvance={() => advance(order.id)}
                  onPreorders={() => router.push('/cook/store/preorders')}
                />
              </Reveal>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="receipt"
            title={all.length ? t('Nothing in this view') : t('No shop orders yet')}
            body={
              all.length
                ? t('Try another filter.')
                : t('When somebody buys from your shop it lands here.')
            }
          />
        )}
      </Container>
    </CookScreen>
  );
}

function OrderCard({ order, onAdvance, onPreorders }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  const next = COOK_ADVANCES[order.handover === 'pickup' ? 'pickup' : 'delivery'][order.status];

  return (
    <View
      style={[
        {
          gap: 12,
          padding: 14,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: order.status === 'pending' ? colors.saffron100 : colors.line,
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image
          source={{ uri: order.image }}
          contentFit="cover"
          transition={200}
          style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.sunken }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.uiSemi, fontSize: type.sm + 2, color: colors.text }}
          >
            {order.customerName || t('A customer')}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
          >
            {order.code} · {timeAgo(order.createdAt, t, n)}
          </Text>
        </View>
        <Price size={17}>৳{n(order.amount)}</Price>
      </View>

      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
      >
        <MealStatusPill status={order.status} />
        <PaymentPill payment={order.payment} />
      </View>

      <OrderLines lines={order.lines ?? []} />

      {formatAddress(order.address) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="pin" size={13} color={colors.textLight} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
          >
            {formatAddress(order.address)}
          </Text>
        </View>
      ) : null}

      {/* A pending pre-order is a decision, not a stage, so its button goes
          to the queue where accepting and declining sit side by side. */}
      {order.status === 'pending' ? (
        <Button
          variant="glass"
          small
          label={t('Answer this pre-order')}
          block
          onPress={onPreorders}
        />
      ) : next ? (
        <Button small label={t(NEXT_LABEL[order.status])} block onPress={onAdvance} />
      ) : order.status === 'delivered' ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs + 1, color: colors.textMuted }}>
          {t('Waiting for the customer to confirm they got it.')}
        </Text>
      ) : null}
    </View>
  );
}
