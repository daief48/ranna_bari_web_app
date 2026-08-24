import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import { IconTile } from '../../src/components/Surfaces';
import { Body, GradientText, Heading, Price } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import {
  ORDER_STEPS,
  formatOrderDate,
  stepIndex,
  useOrders,
} from '../../src/store/OrdersContext';

export default function OrderScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { getOrder, cancelOrder, hydrated } = useOrders();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const order = useMemo(() => getOrder(String(id)), [getOrder, id]);

  if (!order) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', gap: 16, paddingTop: 40 }}>
          <Icon name="alertCircle" size={32} color={colors.primary} />
          <Heading size={20}>
            {hydrated ? 'Order not found' : 'Loading your order…'}
          </Heading>
          {hydrated ? (
            <>
              <Body muted size={15} style={{ textAlign: 'center' }}>
                We could not find an order with the code {String(id)}.
              </Body>
              <Button label="Your orders" onPress={() => router.replace('/orders')} />
            </>
          ) : null}
        </Container>
      </Screen>
    );
  }

  const cancelled = order.status === 'cancelled';
  const current = stepIndex(order.status);
  const isCod = order.paymentMethod === 'cod';

  return (
    <Screen glow="both">
      <Container>
        {/* ---- Confirmation mark ---- */}
        <Animated.View
          entering={FadeInDown.duration(420)}
          style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 28 }}
        >
          <LinearGradient
            colors={
              cancelled
                ? [colors.ink3, colors.ink2]
                : [colors.sage, '#33441f']
            }
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={{
              width: 66,
              height: 66,
              borderRadius: 33,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <Icon
              name={cancelled ? 'x' : 'check'}
              size={30}
              color="#FFFFFF"
              strokeWidth={2.4}
            />
          </LinearGradient>

          <Heading size={23} style={{ marginBottom: 8, textAlign: 'center' }}>
            {cancelled ? 'Order cancelled' : 'Order placed.'}
          </Heading>
          <Body muted size={14} style={{ textAlign: 'center' }}>
            {cancelled
              ? 'Nothing was charged — cash orders are only paid on delivery.'
              : `${order.chefName || 'The kitchen'} has your order. You pay when it arrives.`}
          </Body>

          <View
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
              },
              shadow.sm,
            ]}
          >
            <Icon name="receipt" size={15} color={colors.primary} />
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: type.sm,
                letterSpacing: 1.2,
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {order.id}
            </Text>
          </View>
        </Animated.View>

        {/* ---- Cash callout: the single most important line on the page ---- */}
        {isCod && !cancelled ? (
          <Reveal delay={1}>
            <View
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 18,
                  marginBottom: 16,
                  borderRadius: radius.lg,
                  backgroundColor: colors.saffron50,
                  borderWidth: 1,
                  borderColor: colors.saffron100,
                },
                shadow.sm,
              ]}
            >
              <IconTile
                name="banknote"
                variant="saffron"
                style={{ width: 48, height: 48, borderRadius: 15 }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: type.micro,
                    letterSpacing: type.micro * tracking.label,
                    textTransform: 'uppercase',
                    color: colors.textMuted,
                    marginBottom: 4,
                  }}
                >
                  Cash on delivery
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <GradientText
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 24,
                      letterSpacing: -0.48,
                    }}
                  >
                    ৳{order.total}
                  </GradientText>
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      color: colors.textMuted,
                    }}
                  >
                    ready for the rider
                  </Text>
                </View>
              </View>
            </View>
          </Reveal>
        ) : null}

        {/* ---- Status timeline ---- */}
        <Reveal delay={2}>
          <View style={[card(colors), shadow.sm]}>
            <CardHeading icon="route" title={cancelled ? 'What happened' : 'Order status'} />

            {cancelled ? (
              <Body muted size={14}>
                You cancelled this order on{' '}
                {formatOrderDate(order.cancelledAt ?? order.createdAt)}.
              </Body>
            ) : (
              <View>
                {ORDER_STEPS.map((step, i) => {
                  const done = i < current;
                  const active = i === current;
                  const tone = done
                    ? colors.sage
                    : active
                      ? colors.primary
                      : colors.line;

                  return (
                    <View key={step.key} style={{ flexDirection: 'row', gap: 14 }}>
                      {/* rail */}
                      <View style={{ alignItems: 'center', width: 30 }}>
                        <View
                          style={[
                            {
                              width: 30,
                              height: 30,
                              borderRadius: 15,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor:
                                done || active ? tone : colors.sunken,
                              borderWidth: done || active ? 0 : 1,
                              borderColor: colors.line,
                            },
                            active ? shadow.primary : null,
                          ]}
                        >
                          <Icon
                            name={done ? 'check' : step.icon}
                            size={15}
                            color={
                              done || active ? '#FFFFFF' : colors.textLight
                            }
                            strokeWidth={done ? 3 : 1.9}
                          />
                        </View>

                        {i < ORDER_STEPS.length - 1 ? (
                          <View
                            style={{
                              width: 2,
                              flex: 1,
                              minHeight: 26,
                              borderRadius: 1,
                              marginVertical: 4,
                              backgroundColor: done ? colors.sage : colors.line,
                            }}
                          />
                        ) : null}
                      </View>

                      {/* label */}
                      <View style={{ flex: 1, paddingBottom: 18 }}>
                        <Text
                          style={{
                            fontFamily: active ? font.uiBold : font.uiSemi,
                            fontSize: type.sm + 1,
                            color:
                              done || active ? colors.text : colors.textLight,
                          }}
                        >
                          {step.label}
                        </Text>
                        {active ? (
                          <Text
                            style={{
                              fontFamily: font.ui,
                              fontSize: type.xs,
                              color: colors.textMuted,
                              marginTop: 2,
                            }}
                          >
                            {formatOrderDate(order.createdAt)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 9,
                    marginTop: 2,
                  }}
                >
                  <Icon name="clock" size={14} color={colors.textLight} />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: font.ui,
                      fontSize: 12.5,
                      lineHeight: 19,
                      color: colors.textLight,
                    }}
                  >
                    The kitchen moves this along as they cook. You will see it
                    update here.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </Reveal>

        {/* ---- Items ---- */}
        <Reveal delay={3}>
          <View style={[card(colors), shadow.sm, { marginTop: 16 }]}>
            <CardHeading icon="pot" title={order.chefName || 'Your order'} />

            <View style={{ gap: 12, marginBottom: 20 }}>
              {order.items.map((i) => (
                <View
                  key={i.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <Image
                    source={{ uri: i.image }}
                    contentFit="cover"
                    transition={150}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 13,
                      backgroundColor: colors.sunken,
                    }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: type.sm + 1,
                        color: colors.text,
                      }}
                    >
                      {i.name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      ৳{i.price} × {i.qty}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.sm + 1,
                      color: colors.text,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    ৳{i.price * i.qty}
                  </Text>
                </View>
              ))}
            </View>

            <Row label="Subtotal" value={order.subtotal} />
            <Row label="Delivery Fee" value={order.deliveryFee} />
            <Row label="Platform Fee" value={order.platformFee} />

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: colors.line,
              }}
            >
              <Price size={22}>{isCod ? 'Due in cash' : 'Total'}</Price>
              <Price size={22}>৳{order.total}</Price>
            </View>
          </View>
        </Reveal>

        {/* ---- Delivery details ---- */}
        <Reveal delay={4}>
          <View style={[card(colors), shadow.sm, { marginTop: 16 }]}>
            <CardHeading icon="navigation" title="Delivering to" />

            <Detail icon="user" text={order.contact.name} />
            <Detail icon="phone" text={order.contact.phone} />
            <Detail
              icon="pin"
              text={[order.address.line, order.address.area]
                .filter(Boolean)
                .join(', ')}
              badge={order.address.label}
            />
            {order.address.instructions ? (
              <Detail icon="alertCircle" text={order.address.instructions} />
            ) : null}
          </View>
        </Reveal>

        {/* ---- Actions ---- */}
        <View style={{ marginTop: 24, gap: 12 }}>
          <Button
            label="Browse more kitchens"
            icon="arrowRight"
            block
            onPress={() => router.replace('/browse')}
          />

          {order.status === 'placed' ? (
            confirmCancel ? (
              <View
                style={{
                  padding: 16,
                  borderRadius: radius.md,
                  backgroundColor: colors.primary50,
                  borderWidth: 1,
                  borderColor: colors.primary100,
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.sm,
                    lineHeight: 21,
                    color: colors.text,
                  }}
                >
                  Cancel this order? The kitchen may already have started
                  cooking.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    variant="glass"
                    label="Keep it"
                    small
                    onPress={() => setConfirmCancel(false)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Cancel order"
                    small
                    onPress={() => {
                      cancelOrder(order.id);
                      setConfirmCancel(false);
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmCancel(true)}
                style={{ alignItems: 'center', paddingVertical: 12 }}
              >
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: type.sm,
                    color: colors.textMuted,
                    textDecorationLine: 'underline',
                  }}
                >
                  Cancel this order
                </Text>
              </Pressable>
            )
          ) : (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/orders')}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: type.sm,
                  color: colors.primary,
                }}
              >
                See all your orders
              </Text>
            </Pressable>
          )}
        </View>
      </Container>
    </Screen>
  );
}

const card = (colors) => ({
  paddingVertical: 24,
  paddingHorizontal: 20,
  borderRadius: radius.lg,
  backgroundColor: colors.surfaceSolid,
  borderWidth: 1,
  borderColor: colors.line,
});

function CardHeading({ icon, title }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
      }}
    >
      <Heading size={19} style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Heading>
      <Icon name={icon} size={19} color={colors.textLight} />
    </View>
  );
}

function Detail({ icon, text, badge }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 14,
      }}
    >
      <Icon name={icon} size={17} color={colors.primary} />
      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: type.sm + 1,
          lineHeight: 21,
          color: colors.text,
        }}
      >
        {text}
      </Text>
      {badge ? (
        <View
          style={{
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: radius.pill,
            backgroundColor: colors.sage50,
          }}
        >
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: 9.5,
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              color: colors.sage,
            }}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, value }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}
    >
      <Text style={{ fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: font.uiMedium,
          fontSize: type.sm,
          color: colors.textMuted,
          fontVariant: ['tabular-nums'],
        }}
      >
        ৳{value}
      </Text>
    </View>
  );
}
