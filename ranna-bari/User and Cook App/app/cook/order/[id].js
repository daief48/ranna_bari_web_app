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
import { cookPayout, formatOrderDate, timeAgo, useOrders } from '../../../src/store/OrdersContext';
import {
  NEXT_STEP,
  ORDER_STEPS,
  awaitingConfirmation,
  cookBase,
  isRequestOrder,
  payoutKindOf,
  payoutRateFor,
  stageOf,
  stepIndex,
} from '../../../src/lib/orderRails';
import { useLang } from '../../../src/i18n/LanguageContext';
import { useAction, useAlert } from '../../../src/components/Alert';
import { FoodRequestTag, RequestOrderFacts, WalletHeldLine } from '../../../src/components/RequestOrderBits';
import { useRequestOf } from '../../../src/features/requests/useRequestOf';
import { withKitchenGate } from '../../../src/components/CookBits';

/** The four reasons a kitchen actually turns an order down. */
const REJECT_REASONS = [
  'Out of an ingredient for this dish',
  'Too many orders in the pass right now',
  'The address is outside my delivery radius',
  'Closing for the day',
];

/**
 * Why a cook can't make a paid food request. The customer has already paid
 * and is refunded in full, so these are about the food and the date, not
 * about a dish being off the menu. A reason is required: it is what the
 * customer is told.
 */
const REQUEST_CANT_REASONS = [
  'I do not have the ingredients for this',
  'I cannot make it by the date wanted',
  'Too many orders in the pass right now',
  'The address is outside my delivery radius',
];

/* Held behind the same approval gate as the tab group — see `withKitchenGate`. */
export default withKitchenGate(CookOrderScreen);

function CookOrderScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { getOrder, advanceOrder, rejectOrder, hydrated, payoutRates } = useOrders();
  const [rejecting, setRejecting] = useState(false);
  const { t, n, lang } = useLang();
  /* Every write below reports what happened. */
  const run = useAction();
  const alert = useAlert();

  const order = getOrder(String(id));
  /* A paid food request: the request behind it (description, portions, wanted
     date) and the way back to its thread. Hooks stay above the early return. */
  const isReq = isRequestOrder(order);
  const request = useRequestOf(order);

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
  /* The arithmetic, at the rate for this order's kind. A meal plate or a won
     request carries `amount` rather than `subtotal`, and reading the latter
     bare printed ৳NaN on every line of this block. */
  const base = cookBase(order);
  const cut = cookPayout(order, payoutRates);
  const platformPct = Math.round((1 - payoutRateFor(payoutKindOf(order), payoutRates)) * 100);
  /* The timeline below is the cash rail's five steps; a wallet order's
     status and history are folded onto them so it draws the same way. */
  const current = stepIndex(stageOf(order.status));
  const closed = order.status === 'cancelled' || order.status === 'rejected';
  /* Who ended a closed order. A request order is cancelled by either side
     (there is no "rejected" on a paid order), so the last history entry says
     whose word it was. */
  const lastStep = (order.history ?? [])[(order.history ?? []).length - 1];
  const cancelledByCook = order.status === 'rejected' || lastStep?.by === 'cook';
  const requestId = order.requestId ?? request?.id ?? null;
  /* A paid request can be turned down until it is on its way (the server
     refuses later); a dish only while it is still new. */
  const canTurnDown = isReq
    ? ['confirmed', 'preparing', 'ready'].includes(order.status)
    : stageOf(order.status) === 'placed';
  const reasons = isReq ? REQUEST_CANT_REASONS : REJECT_REASONS;
  const actionLabel = isReq && order.status === 'confirmed' ? 'Start cooking' : meta.action;

  /* Declining a paid request refunds real money and cancels the request, so
     the reason pick is followed by a plain-words confirmation. */
  const turnDown = (reason) => {
    setRejecting(false);
    if (!isReq) {
      run(() => rejectOrder(order.id, reason), t('Order rejected.'));
      return;
    }
    alert.confirm({
      title: t('Can’t make this request?'),
      body: t('The customer is refunded to their wallet and the request is cancelled.'),
      confirmLabel: t('Yes, cancel and refund'),
      danger: true,
      onConfirm: () =>
        run(() => rejectOrder(order.id, reason), t('Cancelled. The customer was refunded.')),
    });
  };
  const stamps = Object.fromEntries(
    (order.history ?? []).map((h) => [stageOf(h.status), h.at]),
  );

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
            {isReq ? <FoodRequestTag /> : null}
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
                  {/* The rider's note — gates, bells, landmarks. */}
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
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontFamily: font.uiBold,
                            fontSize: 9.5,
                            letterSpacing: 0.7,
                            textTransform: 'uppercase',
                            color: colors.saffron,
                            marginBottom: 2,
                          }}
                        >
                          {t('Delivery instructions')}
                        </Text>
                        <Text
                          style={{
                            fontFamily: font.ui,
                            fontSize: type.xs,
                            lineHeight: 18,
                            color: colors.text,
                          }}
                        >
                          {order.address.instructions}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {/* The customer's own words for the food — a different
                      question from the rider's, and worth its own block. */}
                  {order.note ? (
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
                      <Icon name="chat" size={14} color={colors.saffron} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontFamily: font.uiBold,
                            fontSize: 9.5,
                            letterSpacing: 0.7,
                            textTransform: 'uppercase',
                            color: colors.saffron,
                            marginBottom: 2,
                          }}
                        >
                          {t('Note for the cook')}
                        </Text>
                        <Text
                          style={{
                            fontFamily: font.ui,
                            fontSize: type.xs,
                            lineHeight: 18,
                            color: colors.text,
                          }}
                        >
                          {order.note}
                        </Text>
                      </View>
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

        {/* ---- The food request behind this order ----
            What was asked for, at what price, and that the money is already
            held - plus the way back to the thread where it was agreed. */}
        {isReq ? (
          <Reveal delay={3}>
            <View style={{ marginTop: 28 }}>
              <RowHeading icon="chat" title={t('Food request')} />
              <View
                style={[
                  {
                    gap: 12,
                    padding: 16,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.sm,
                ]}
              >
                <RequestOrderFacts order={order} request={request} />
                <WalletHeldLine order={order} />
                {requestId ? (
                  <Button
                    small
                    variant="glass"
                    icon="chat"
                    iconPosition="left"
                    label={t('Open the request thread')}
                    onPress={() => router.push(`/cook/requests/${requestId}`)}
                  />
                ) : null}
              </View>
            </View>
          </Reveal>
        ) : null}

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
                  <Price size={15}>৳{n((Number(it.price) || 0) * (Number(it.qty) || 1))}</Price>
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
                <Line label={t('Food total')} value={`৳${n(base)}`} />
                <Line
                  label={t('Platform share ({pct}%)', { pct: n(platformPct) })}
                  value={`− ৳${n(Math.max(0, base - cut))}`}
                />
                <View style={{ height: 1, backgroundColor: colors.line }} />
                <Line label={t('You receive')} value={`৳${n(cut)}`} strong />

                {/* Delivered on the wallet rail: the cook's part is done and
                    the money is held until the customer confirms. */}
                {awaitingConfirmation(order) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 4 }}>
                    <Icon name="clock" size={15} color={colors.saffron} />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        lineHeight: 18,
                        color: colors.textMuted,
                      }}
                    >
                      {t('Waiting for the customer to confirm they got it.')}
                    </Text>
                  </View>
                ) : null}

                {order.kind === 'cod' ? (
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
                    {cancelledByCook
                      ? isReq
                        ? t('You cancelled this request — the customer was refunded')
                        : t('You turned this order down')
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
              label={t(actionLabel)}
              icon="arrowRight"
              block
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                run(() => advanceOrder(order.id));
              }}
            />

            {canTurnDown ? (
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
                    {isReq ? t('Why can’t you make it?') : t('Why are you turning this down?')}
                  </Text>
                  <Body muted size={13}>
                    {isReq
                      ? t('The customer sees your reason and is refunded, so pick the true one.')
                      : t('The customer sees your reason, so pick the true one.')}
                  </Body>

                  {reasons.map((reason) => (
                    <Pressable
                      key={reason}
                      accessibilityRole="button"
                      onPress={() => turnDown(reason)}
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
                  label={isReq ? t('Can’t make it') : t('Reject this order')}
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
