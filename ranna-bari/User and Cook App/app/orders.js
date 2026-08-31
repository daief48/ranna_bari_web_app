import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Reveal from '../src/components/Reveal';
import Button from '../src/components/Button';
import SectionHeader from '../src/components/SectionHeader';
import { IconTile } from '../src/components/Surfaces';
import { Body, Heading, Price } from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../src/theme/tokens';
import {
  ORDER_STEPS,
  formatOrderDate,
  useOrders,
} from '../src/store/OrdersContext';
import { ORDER_FLOW } from '../src/lib/ledger';
import { useLang } from '../src/i18n/LanguageContext';

/**
 * Where each kind of order is read, and what to call it on the card.
 *
 * Four rails end up on this one list and they do not share a screen: a meal
 * is a seat at a service, a shop order is a basket of stock, a request is a
 * job a cook won. Routing by kind is what makes the row openable at all —
 * sending a meal to `/order/[id]` finds nothing, because that screen reads
 * the cash-on-delivery rail.
 */
const KIND = {
  cod: { route: 'order', label: 'Dish' },
  meal: { route: 'meal-order', label: 'Meal' },
  store: { route: 'store-order', label: 'Shop' },
  request: { route: 'request-order', label: 'Request' },
};

const kindOf = (order) => KIND[order.kind] ?? KIND.cod;

/**
 * Status pill tone: a stopped order reads muted, finished sage, in-flight
 * primary.
 *
 * The two rails have different last steps and it matters which one is being
 * read. On the COD rail `delivered` is the end. On the escrow rail it is not:
 * `delivered` is the courier's word for it, `completed` is the customer's,
 * and the money moves on the second — so a delivered escrow order is still
 * waiting on the person looking at this screen.
 */
function statusTone(status, kind, colors) {
  if (status === 'cancelled') return { bg: colors.sunken, fg: colors.textLight, label: 'Cancelled' };
  // The kitchen turning an order down, which is not the customer's doing.
  if (status === 'rejected') return { bg: colors.sunken, fg: colors.textLight, label: 'Declined' };

  const escrow = kind !== 'cod';

  if (status === 'completed' || (!escrow && status === 'delivered')) {
    return { bg: colors.sage50, fg: colors.sage, label: escrow ? 'Completed' : 'Delivered' };
  }

  const steps = escrow ? ORDER_FLOW : ORDER_STEPS;
  const step = steps.find((s) => s.key === status);
  return { bg: colors.primary50, fg: colors.primary, label: step?.label ?? 'In progress' };
}

export default function OrdersScreen() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { orders, hydrated } = useOrders();
  const { t, n, lang } = useLang();

  return (
    <Screen glow="both">
      <Container>
        <SectionHeader
          lead={t('YOUR')}
          accent={t('ORDERS')}
          subtitle={
            orders.length
              ? t(orders.length === 1 ? '{n} order so far' : '{n} orders so far', { n: n(orders.length) })
              : t('Every meal you order shows up here.')
          }
        />

        {!orders.length ? (
          <View style={{ alignItems: 'center', gap: 18, paddingVertical: 40 }}>
            <IconTile name="receipt" large />
            <Heading size={20}>
              {hydrated ? t('No orders yet') : t('Loading…')}
            </Heading>
            {hydrated ? (
              <>
                <Body muted size={15} style={{ textAlign: 'center' }}>
                  {t('Pick a kitchen, add a dish, and pay the rider in cash when it lands at your door.')}
                </Body>
                <Button
                  label={t('Browse artisans')}
                  icon="arrowRight"
                  onPress={() => router.push('/browse')}
                />
              </>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {orders.map((order, i) => {
              const kind = kindOf(order);
              const tone = statusTone(order.status, order.kind, colors);
              /* A line without a quantity counts as one: a meal seat and a
                 won request each arrive as a single line with no `qty`, and
                 `undefined` here would render the count as NaN. */
              const count = (order.items ?? []).reduce((s, it) => s + (it.qty ?? 1), 0);

              return (
                <Reveal key={order.id} delay={(i % 5) + 1}>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`${t(kind.label)} ${t('order')} ${order.id}, ${t(tone.label)}, ৳${n(order.total)}`}
                    onPress={() => router.push(`/${kind.route}/${order.id}`)}
                    style={({ pressed }) => [
                      {
                        padding: 18,
                        borderRadius: radius.lg,
                        backgroundColor: colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: pressed ? colors.primary200 : colors.line,
                        transform: [{ scale: pressed ? 0.99 : 1 }],
                      },
                      shadow.sm,
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 14,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: type.sm,
                          letterSpacing: 1.1,
                          color: colors.text,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {order.id}
                      </Text>

                      <View
                        style={{
                          paddingVertical: 5,
                          paddingHorizontal: 11,
                          borderRadius: radius.pill,
                          backgroundColor: tone.bg,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: font.uiBold,
                            fontSize: 9.5,
                            letterSpacing: 0.7,
                            textTransform: 'uppercase',
                            color: tone.fg,
                          }}
                        >
                          {t(tone.label)}
                        </Text>
                      </View>

                      {/* Which rail this row is on. Four kinds share the list
                          now and they behave differently once opened — a meal
                          is a seat at a service, a shop order a basket of
                          stock — so the card says which before you tap it. */}
                      <View
                        style={{
                          paddingVertical: 5,
                          paddingHorizontal: 10,
                          borderRadius: radius.pill,
                          borderWidth: 1,
                          borderColor: colors.line,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: font.uiSemi,
                            fontSize: 9.5,
                            letterSpacing: 0.7,
                            textTransform: 'uppercase',
                            color: colors.textMuted,
                          }}
                        >
                          {t(kind.label)}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }} />
                      <Icon name="chevronRight" size={17} color={colors.textLight} strokeWidth={2} />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {/* A stacked peek of the dishes, capped at three.
                          Filtered on having a usable image: a meal seat and a
                          won request carry lines with no picture, and an
                          empty `uri` renders as three grey squares that read
                          as failed loads rather than as absent art. */}
                      <View style={{ flexDirection: 'row' }}>
                        {(order.items ?? [])
                          .filter((it) => /^https?:\/\//i.test(it.image ?? ''))
                          .slice(0, 3)
                          .map((it, k) => (
                          <Image
                            key={it.id ?? k}
                            source={{ uri: it.image }}
                            contentFit="cover"
                            transition={150}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              marginLeft: k === 0 ? 0 : -12,
                              borderWidth: 2,
                              borderColor: colors.surfaceSolid,
                              backgroundColor: colors.sunken,
                            }}
                          />
                        ))}
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontFamily: font.displayBold,
                            fontSize: 16,
                            letterSpacing: -0.16,
                            color: colors.text,
                          }}
                        >
                          {order.chefName || t('RannaBari member')}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontFamily: font.ui,
                            fontSize: type.xs,
                            color: colors.textMuted,
                          }}
                        >
                          {t(count === 1 ? '{n} item' : '{n} items', { n: n(count) })} ·{' '}
                          {formatOrderDate(order.createdAt, lang)}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Price size={17}>৳{n(order.total)}</Price>
                        {order.paymentMethod === 'cod' ? (
                          <Text
                            style={{
                              fontFamily: font.uiSemi,
                              fontSize: type.micro,
                              letterSpacing: type.micro * tracking.label,
                              textTransform: 'uppercase',
                              color: colors.saffron,
                            }}
                          >
                            {t('Cash')}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                </Reveal>
              );
            })}
          </View>
        )}
      </Container>
    </Screen>
  );
}
