import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import ChatLauncher from '../../../src/components/ChatLauncher';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import { IconTile } from '../../../src/components/Surfaces';
import { RowHeading, StatusPill, statusMeta } from '../../../src/components/CookBits';
import { Body, Heading, Price } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../../src/theme/tokens';
import {
  COOK_PAYOUT_RATE,
  NEXT_STEP,
  ORDER_STEPS,
  cookPayout,
  formatOrderDate,
  stepIndex,
  timeAgo,
  useOrders,
} from '../../../src/store/OrdersContext';
import { useLang } from '../../../src/i18n/LanguageContext';
import { useAction } from '../../../src/components/Alert';

/** The four reasons a kitchen actually turns an order down. */
const REJECT_REASONS = [
  'Out of an ingredient for this dish',
  'Too many orders in the pass right now',
  'The address is outside my delivery radius',
  'Closing for the day',
];

export default function CookOrderScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { getOrder, advanceOrder, rejectOrder, hydrated } = useOrders();
  const [rejecting, setRejecting] = useState(false);
  const { t, n, lang } = useLang();
  /* Every write below reports what happened. */
  const run = useAction();

  const order = getOrder(String(id));

  if (!order) {
    return (
      <CookScreen>
        <Container style={{ alignItems: 'center', gap: 16, paddingTop: 40 }}>
          <Icon name="alertCircle" size={32} color={colors.sage} />
          <Heading size={20}>{hydrated ? t('Order not found') : t('Loading…')}</Heading>
          {hydrated ? (
            <Button
              label={t('Back to the board')}
              onPress={() => router.replace('/cook/orders')}
            />
          ) : null}
        </Container>
      </CookScreen>
    );
  }

  const meta = statusMeta(order.status, colors);
  const next = NEXT_STEP[order.status];
  const current = stepIndex(order.status);
  const closed = order.status === 'cancelled' || order.status === 'rejected';
  const stamps = Object.fromEntries((order.history ?? []).map((h) => [h.status, h.at]));

  const call = () => {
    const phone = order.contact?.phone?.replace(/\s/g, '');
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  return (
    <CookScreen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/cook/orders')
          }
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 22,
          }}
        >
          <Icon name="arrowLeft" size={17} color={colors.textMuted} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: type.micro,
              letterSpacing: type.micro * tracking.label,
              textTransform: 'uppercase',
              color: colors.textMuted,
            }}
          >
            {t('Order board')}
          </Text>
        </Pressable>

        {/* ---- Header ---- */}
        <Reveal delay={1}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <StatusPill status={order.status} />
            <Text
              style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
            >
              {timeAgo(order.createdAt, t, n)}
            </Text>
          </View>

          <Text
            style={{
              fontFamily: font.displayExtra,
              fontSize: 32,
              lineHeight: 35,
              letterSpacing: -0.7,
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {order.id}
          </Text>
          <Body muted size={14} style={{ marginTop: 4 }}>
            {formatOrderDate(order.createdAt, lang)}
          </Body>
        </Reveal>

        {/* ---- The customer ----
            First, not last: a cook who has to ring the door needs the name
            and the number before anything about the food. */}
        <Reveal delay={2}>
          <View style={{ marginTop: 28 }}>
            <RowHeading icon="user" title={t('Customer')} />

            <View
              style={[
                {
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                  overflow: 'hidden',
                },
                shadow.sm,
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                }}
              >
                <IconTile
                  name="user"
                  variant="sage"
                  style={{ width: 46, height: 46, borderRadius: 15 }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.displayBold,
                      fontSize: 17,
                      letterSpacing: -0.17,
                      color: colors.text,
                    }}
                  >
                    {order.contact?.name ?? t('A customer')}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      color: colors.textMuted,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {order.contact?.phone ?? '—'}
                  </Text>
                </View>

                {order.contact?.phone ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('Call')} ${order.contact.name}`}
                    onPress={call}
                    style={({ pressed }) => ({
                      width: 44,
                      height: 44,
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: pressed ? colors.sage100 : colors.sage50,
                    })}
                  >
                    <Icon name="phone" size={19} color={colors.sage} />
                  </Pressable>
                ) : null}
              </View>

              {/* A call interrupts a cook mid-service and leaves no record.
                  A message does neither, and it is the only channel the
                  customer can start themselves. */}
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingBottom: 16,
                  borderTopWidth: 1,
                  borderTopColor: colors.line2,
                  paddingTop: 14,
                }}
              >
                <ChatLauncher
                  spec={{ kind: 'order', orderId: order.id }}
                  label={t('Message the customer')}
                  compact
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 16,
                  borderTopWidth: 1,
                  borderTopColor: colors.line2,
                }}
              >
                <Icon name="pin" size={17} color={colors.textMuted} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      lineHeight: 21,
                      color: colors.text,
                    }}
                  >
                    {[order.address?.line, order.address?.area].filter(Boolean).join(', ')}
                  </Text>
                  {order.address?.instructions ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 8,
                        marginTop: 10,
                        padding: 11,
                        borderRadius: radius.sm,
                        backgroundColor: colors.saffron50,
                      }}
                    >
                      <Icon name="alertCircle" size={14} color={colors.saffron} />
                      <Text
                        style={{
                          flex: 1,
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          lineHeight: 18,
                          color: colors.text,
                        }}
                      >
                        {order.address.instructions}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {order.address?.label ? (
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 9.5,
                      letterSpacing: 0.75,
                      textTransform: 'uppercase',
                      color: colors.textLight,
                    }}
                  >
                    {order.address.label}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </Reveal>

        {/* ---- The ticket ---- */}
        <Reveal delay={3}>
          <View style={{ marginTop: 28 }}>
            <RowHeading icon="pot" title={t('To cook')} />

            <View
              style={[
                {
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                  overflow: 'hidden',
                },
                shadow.sm,
              ]}
            >
              {/* Same as the board: a line id is optional, so it cannot be
                 the key. */}
              {order.items.map((it, i) => (
                <View
                  key={`${it.name}-${i}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 13,
                    padding: 14,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.line2,
                  }}
                >
                  <Image
                    source={{ uri: it.image }}
                    contentFit="cover"
                    transition={150}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 15,
                      backgroundColor: colors.sunken,
                    }}
                  />
                  {/* The quantity is the number a cook reads first, so it is
                      a figure in its own right, not a suffix on the name. */}
                  <View
                    style={{
                      minWidth: 34,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      borderRadius: radius.sm,
                      alignItems: 'center',
                      backgroundColor: colors.sage50,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: font.uiBold,
                        fontSize: 15,
                        color: colors.sage,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {n(it.qty)}×
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={2}
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 15,
                        lineHeight: 20,
                        color: colors.text,
                      }}
                    >
                      {it.name}
                    </Text>
                  </View>
                  <Price size={15}>৳{n(it.price * it.qty)}</Price>
                </View>
              ))}

              {/* ---- What you are paid ---- */}
              <View
                style={{
                  padding: 16,
                  gap: 9,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  backgroundColor: colors.sunken,
                }}
              >
                <Line label={t('Food total')} value={`৳${n(order.subtotal)}`} />
                <Line
                  label={t('Platform share ({pct}%)', { pct: n(Math.round((1 - COOK_PAYOUT_RATE) * 100)) })}
                  value={`− ৳${n(order.subtotal - cookPayout(order))}`}
                />
                <View style={{ height: 1, backgroundColor: colors.line }} />
                <Line label={t('You receive')} value={`৳${n(cookPayout(order))}`} strong />

                {order.paymentMethod === 'cod' ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 9,
                      marginTop: 4,
                    }}
                  >
                    <Icon name="banknote" size={15} color={colors.saffron} />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        lineHeight: 18,
                        color: colors.textMuted,
                      }}
                    >
                      {t('Cash on delivery — the rider collects ৳{total} at the door, including delivery and platform fees.', { total: n(order.total) })}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </Reveal>

        {/* ---- Where it is ---- */}
        <Reveal delay={4}>
          <View style={{ marginTop: 28 }}>
            <RowHeading icon="route" title={t('Progress')} />

            {closed ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 11,
                  padding: 16,
                  borderRadius: radius.lg,
                  backgroundColor: colors.sunken,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Icon name="x" size={18} color={colors.textLight} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.sm,
                      color: colors.text,
                    }}
                  >
                    {order.status === 'rejected'
                      ? t('You turned this order down')
                      : t('The customer cancelled this order')}
                  </Text>
                  {order.rejectReason ? (
                    <Text
                      style={{
                        marginTop: 3,
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        lineHeight: 18,
                        color: colors.textMuted,
                      }}
                    >
                      {t(order.rejectReason)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={{ gap: 2 }}>
                {ORDER_STEPS.map((step, i) => {
                  const done = i < current;
                  const active = i === current;
                  const tone = done
                    ? colors.sage
                    : active
                      ? colors.saffron
                      : colors.textLight;

                  return (
                    <View key={step.key} style={{ flexDirection: 'row', gap: 14 }}>
                      <View style={{ alignItems: 'center', width: 30 }}>
                        <View
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 15,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: done
                              ? colors.sage50
                              : active
                                ? colors.saffron50
                                : colors.sunken,
                            borderWidth: 1,
                            borderColor: active ? colors.saffron100 : colors.line2,
                          }}
                        >
                          <Icon
                            name={done ? 'check' : step.icon}
                            size={14}
                            color={tone}
                            strokeWidth={done ? 2.4 : 1.9}
                          />
                        </View>
                        {i < ORDER_STEPS.length - 1 ? (
                          <View
                            style={{
                              width: 2,
                              flex: 1,
                              minHeight: 18,
                              backgroundColor: done ? colors.sage100 : colors.line,
                            }}
                          />
                        ) : null}
                      </View>

                      <View style={{ flex: 1, paddingBottom: 16, paddingTop: 5 }}>
                        <Text
                          style={{
                            fontFamily: active || done ? font.uiSemi : font.ui,
                            fontSize: type.sm,
                            color: active || done ? colors.text : colors.textLight,
                          }}
                        >
                          {t(step.label)}
                        </Text>
                        {stamps[step.key] ? (
                          <Text
                            style={{
                              marginTop: 1,
                              fontFamily: font.ui,
                              fontSize: type.xs,
                              color: colors.textMuted,
                            }}
                          >
                            {formatOrderDate(stamps[step.key], lang)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </Reveal>

        {/* ---- The decision ---- */}
        {next ? (
          <View style={{ marginTop: 12, gap: 12 }}>
            <Button
              label={t(meta.action)}
              icon="arrowRight"
              block
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                run(() => advanceOrder(order.id));
              }}
            />

            {order.status === 'placed' ? (
              rejecting ? (
                <View
                  style={{
                    padding: 16,
                    borderRadius: radius.md,
                    backgroundColor: colors.primary50,
                    borderWidth: 1,
                    borderColor: colors.primary100,
                    gap: 10,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.sm,
                      color: colors.text,
                    }}
                  >
                    {t('Why are you turning this down?')}
                  </Text>
                  <Body muted size={13}>
                    {t('The customer sees your reason, so pick the true one.')}
                  </Body>

                  {REJECT_REASONS.map((reason) => (
                    <Pressable
                      key={reason}
                      accessibilityRole="button"
                      onPress={() => {
                        run(() => rejectOrder(order.id, reason), t('Order rejected.'));
                        setRejecting(false);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 12,
                        paddingHorizontal: 13,
                        borderRadius: radius.sm,
                        backgroundColor: pressed ? colors.primary100 : colors.raised,
                        borderWidth: 1,
                        borderColor: colors.line,
                      })}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontFamily: font.ui,
                          fontSize: type.sm,
                          lineHeight: 20,
                          color: colors.text,
                        }}
                      >
                        {t(reason)}
                      </Text>
                      <Icon name="chevronRight" size={15} color={colors.textLight} />
                    </Pressable>
                  ))}

                  <Button
                    variant="ghost"
                    label={t('Never mind')}
                    small
                    block
                    onPress={() => setRejecting(false)}
                  />
                </View>
              ) : (
                <Button
                  variant="glass"
                  label={t('Reject this order')}
                  icon="x"
                  iconPosition="left"
                  block
                  onPress={() => setRejecting(true)}
                />
              )
            ) : null}
          </View>
        ) : null}
      </Container>
    </CookScreen>
  );
}

function Line({ label, value, strong }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text
        style={{
          flex: 1,
          fontFamily: strong ? font.uiSemi : font.ui,
          fontSize: type.sm,
          color: strong ? colors.text : colors.textMuted,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: strong ? 17 : type.sm,
          color: strong ? colors.sage : colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}
