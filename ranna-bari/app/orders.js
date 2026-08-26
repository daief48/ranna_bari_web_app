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
  stepIndex,
  useOrders,
} from '../src/store/OrdersContext';

/** Status pill tone: a stopped order reads muted, delivered sage, in-flight primary. */
function statusTone(status, colors) {
  if (status === 'cancelled') return { bg: colors.sunken, fg: colors.textLight, label: 'Cancelled' };
  // The kitchen turning an order down, which is not the customer's doing.
  if (status === 'rejected') return { bg: colors.sunken, fg: colors.textLight, label: 'Declined' };
  if (status === 'delivered') return { bg: colors.sage50, fg: colors.sage, label: 'Delivered' };
  const step = ORDER_STEPS[stepIndex(status)];
  return { bg: colors.primary50, fg: colors.primary, label: step?.label ?? 'In progress' };
}

export default function OrdersScreen() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { orders, hydrated } = useOrders();

  return (
    <Screen glow="both">
      <Container>
        <SectionHeader
          lead="YOUR"
          accent="ORDERS"
          subtitle={
            orders.length
              ? `${orders.length} order${orders.length === 1 ? '' : 's'} so far`
              : 'Every meal you order shows up here.'
          }
        />

        {!orders.length ? (
          <View style={{ alignItems: 'center', gap: 18, paddingVertical: 40 }}>
            <IconTile name="receipt" large />
            <Heading size={20}>
              {hydrated ? 'No orders yet' : 'Loading…'}
            </Heading>
            {hydrated ? (
              <>
                <Body muted size={15} style={{ textAlign: 'center' }}>
                  Pick a kitchen, add a dish, and pay the rider in cash when it
                  lands at your door.
                </Body>
                <Button
                  label="Browse artisans"
                  icon="arrowRight"
                  onPress={() => router.push('/browse')}
                />
              </>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {orders.map((order, i) => {
              const tone = statusTone(order.status, colors);
              const count = order.items.reduce((s, it) => s + it.qty, 0);

              return (
                <Reveal key={order.id} delay={(i % 5) + 1}>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Order ${order.id}, ${tone.label}, ৳${order.total}`}
                    onPress={() => router.push(`/order/${order.id}`)}
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
                          {tone.label}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }} />
                      <Icon name="chevronRight" size={17} color={colors.textLight} strokeWidth={2} />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {/* A stacked peek of the dishes, capped at three */}
                      <View style={{ flexDirection: 'row' }}>
                        {order.items.slice(0, 3).map((it, k) => (
                          <Image
                            key={it.id}
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
                          {order.chefName || 'RannaBari kitchen'}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontFamily: font.ui,
                            fontSize: type.xs,
                            color: colors.textMuted,
                          }}
                        >
                          {count} item{count === 1 ? '' : 's'} ·{' '}
                          {formatOrderDate(order.createdAt)}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Price size={17}>৳{order.total}</Price>
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
                            Cash
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
