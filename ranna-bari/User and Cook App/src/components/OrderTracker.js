/**
 * One order, from confirmation to the money moving — whichever system sold
 * it.
 *
 * A pre-booked meal and a shop basket are the same object once they exist:
 * the same rail, the same escrow, the same one button that pays the cook.
 * Two copies of this screen would drift, and the half that drifted would be
 * the half handling money.
 *
 * The rail is not decoration. Its last step belongs to the person reading it:
 * nothing pays the cook until "Food received" is pressed here, so that button
 * is the loudest thing on the screen the moment it applies and absent the
 * rest of the time.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import Screen, { Container } from './Screen';
import Icon from './Icon';
import Button from './Button';
import { Body, Heading, Price } from './Typography';
import { EmptyState, MealStatusPill, PaymentPill, errorText } from './MealBits';
import { OrderLines, Totals } from './StoreBits';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, tracking, type } from '../theme/tokens';
import { useCommerce } from '../store/CommerceContext';
import { formatOrderDate } from '../store/OrdersContext';
import { flowFor, stepIndexIn } from '../lib/ledger';
import { formatAddress } from '../lib/address';
import { useLang } from '../i18n/LanguageContext';
import { useAlert } from './Alert';

export default function OrderTracker({ orderId, subtitle, backTo, backLabel }) {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const alert = useAlert();
  const router = useRouter();
  const shop = useCommerce();

  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(null); // 'receive' | 'cancel'
  const [flash, setFlash] = useState(null);

  /* The list is capped, so an order older than the last fifty is real,
     openable by link and absent from state until this asks for it. */
  const { ensureOrder } = shop;
  useEffect(() => {
    if (orderId) ensureOrder(String(orderId));
  }, [orderId, ensureOrder]);

  const order = shop.orders.find((o) => String(o.id) === String(orderId));

  const flow = useMemo(
    () => flowFor(order?.handover, { preorder: order?.preorder }),
    [order?.handover, order?.preorder],
  );

  if (!order) {
    return (
      <Screen>
        <Container style={{ paddingTop: 30 }}>
          <EmptyState
            icon="alertCircle"
            title={t('Order not found')}
            body={t('That order no longer exists.')}
            action={<Button label={backLabel} onPress={() => router.replace(backTo)} />}
          />
        </Container>
      </Screen>
    );
  }

  const dead = order.status === 'cancelled' || order.status === 'rejected';
  const reached = dead ? -1 : stepIndexIn(flow, order.status);
  const stamps = new Map(order.history.map((h) => [h.status, h.at]));

  const canReceive = order.status === 'delivered';
  /* Once it is on a bike, cancelling is a dispute rather than a decision --
     and a pending pre-order can always be withdrawn, since nobody has
     started cooking it. */
  const canCancel = ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);

  const receive = async () => {
    const out = await shop.confirmReceived(order.id);
    setAsking(null);
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(t('৳{n} has been released to the cook.', { n: n(out.result) }));
  };

  const cancel = async () => {
    const out = await shop.cancelOrder(order.id, 'customer', 'Cancelled by the customer');
    setAsking(null);
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(t('৳{n} has been refunded to your wallet.', { n: n(out.result) }));
  };

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(backTo))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.primary} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.primary,
            }}
          >
            {t('Back')}
          </Text>
        </Pressable>

        {/* ---- what and who ---- */}
        <View
          style={[
            {
              flexDirection: 'row',
              gap: 14,
              padding: 14,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
            },
            shadow.sm,
          ]}
        >
          <Image
            source={{ uri: order.image }}
            contentFit="cover"
            transition={200}
            style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: colors.sunken }}
          />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.displayBold,
                fontSize: 18,
                letterSpacing: -0.2,
                color: colors.text,
              }}
            >
              {order.title}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
            >
              {order.cookName}
              {subtitle ? ` · ${subtitle}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <MealStatusPill status={order.status} />
              <PaymentPill payment={order.payment} />
            </View>
          </View>
        </View>

        {/* ---- a pre-order nobody has answered yet ---- */}
        {order.status === 'pending' ? (
          <Banner
            tone="saffron"
            icon="clock"
            title={t('Waiting for the cook')}
            body={t(
              '{cook} has not answered yet. ৳{n} is held, and comes straight back if they decline.',
              { cook: order.cookName, n: n(order.amount) },
            )}
          />
        ) : null}

        {/* ---- the one thing that pays the cook ---- */}
        {canReceive ? (
          <View
            style={{
              gap: 12,
              padding: 18,
              marginTop: 16,
              borderRadius: radius.md,
              backgroundColor: colors.saffron50,
              borderWidth: 1,
              borderColor: colors.saffron100,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="box" size={18} color={colors.saffron} />
              <Heading size={17} style={{ flex: 1 }}>
                {t('Did your food arrive?')}
              </Heading>
            </View>
            <Body muted size={14}>
              {t('৳{n} is still held. Confirming releases it to {cook}.', {
                n: n(order.amount),
                cook: order.cookName,
              })}
            </Body>
            <Button
              label={t('Food received')}
              icon="check"
              iconPosition="left"
              block
              onPress={() => setAsking('receive')}
            />
          </View>
        ) : null}

        {flash ? <Banner tone="sage" icon="shieldCheck" body={flash} /> : null}
        {error ? <Banner tone="primary" icon="alertCircle" body={error} /> : null}

        {/* ---- the rail ---- */}
        <View style={{ marginTop: 26 }}>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.sm,
              letterSpacing: type.sm * tracking.label,
              textTransform: 'uppercase',
              color: colors.textMuted,
              marginBottom: 16,
            }}
          >
            {dead
              ? order.status === 'rejected'
                ? t('Pre-order declined')
                : t('Order cancelled')
              : t('Progress')}
          </Text>

          {dead ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 12,
                padding: 16,
                borderRadius: radius.sm,
                backgroundColor: colors.sunken,
                borderWidth: 1,
                borderColor: colors.line2,
              }}
            >
              <Icon name="x" size={17} color={colors.textMuted} />
              <Text
                style={{
                  flex: 1,
                  fontFamily: font.ui,
                  fontSize: type.sm,
                  lineHeight: type.sm * 1.5,
                  color: colors.textMuted,
                }}
              >
                {order.cancelReason
                  ? `${order.cancelReason} · ${t('৳{n} was refunded to your wallet.', { n: n(order.amount) })}`
                  : t('৳{n} was refunded to your wallet.', { n: n(order.amount) })}
              </Text>
            </View>
          ) : (
            flow.map((step, i) => {
              const at = stamps.get(step.key);
              const past = i <= reached;
              return (
                <View key={step.key} style={{ flexDirection: 'row', gap: 14 }}>
                  <View style={{ alignItems: 'center', width: 32 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: past ? colors.primary : colors.sunken,
                        borderWidth: 1,
                        borderColor: past ? colors.primary : colors.line,
                      }}
                    >
                      <Icon
                        name={past ? 'check' : step.icon}
                        size={15}
                        color={past ? '#FFFFFF' : colors.textLight}
                        strokeWidth={past ? 2.4 : 2}
                      />
                    </View>
                    {i < flow.length - 1 ? (
                      <View
                        style={{
                          width: 2,
                          flex: 1,
                          minHeight: 22,
                          backgroundColor: i < reached ? colors.primary : colors.line,
                        }}
                      />
                    ) : null}
                  </View>

                  <View style={{ flex: 1, paddingBottom: 18 }}>
                    <Text
                      style={{
                        fontFamily: past ? font.uiSemi : font.ui,
                        fontSize: type.sm + 2,
                        color: past ? colors.text : colors.textLight,
                      }}
                    >
                      {t(step.label)}
                    </Text>
                    {at ? (
                      <Text
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textLight,
                          marginTop: 2,
                        }}
                      >
                        {formatOrderDate(at, lang)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ---- what was bought ---- */}
        {order.lines?.length ? (
          <View style={{ marginTop: 8 }}>
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: type.sm,
                letterSpacing: type.sm * tracking.label,
                textTransform: 'uppercase',
                color: colors.textMuted,
                marginBottom: 8,
              }}
            >
              {t('Items')}
            </Text>
            <OrderLines lines={order.lines} style={{ marginBottom: 16 }} />
            <Totals
              subtotal={order.subtotal}
              delivery={order.deliveryFee}
              total={order.amount}
            />
          </View>
        ) : null}

        {/* ---- the paperwork ---- */}
        <View style={{ marginTop: 20, gap: 1 }}>
          <Row label={t('Order code')} value={order.code} mono />
          {!order.lines?.length ? <Row label={t('Amount')} value={`৳${n(order.amount)}`} /> : null}
          <Row
            label={t('Payment')}
            value={
              order.payment === 'held'
                ? t('Held by RannaBari')
                : order.payment === 'released'
                  ? t('Released to the cook')
                  : t('Refunded to your wallet')
            }
          />
          <Row
            label={order.handover === 'pickup' ? t('Collection') : t('Delivery')}
            value={
              formatAddress(order.address) ||
              (order.handover === 'pickup' ? t('At the kitchen') : '—')
            }
          />
          <Row label={t('Booked')} value={formatOrderDate(order.createdAt, lang)} />
        </View>

        <View style={{ marginTop: 22, gap: 10 }}>
          {order.status === 'completed' ? (
            <Price size={20} style={{ textAlign: 'center' }}>
              ৳{n(order.amount)} {t('paid')}
            </Price>
          ) : null}

          {canCancel ? (
            <Button
              variant="ghost"
              label={order.status === 'pending' ? t('Withdraw pre-order') : t('Cancel order')}
              block
              onPress={() => setAsking('cancel')}
            />
          ) : null}

          <Button variant="glass" label={backLabel} block onPress={() => router.push(backTo)} />
        </View>
      </Container>

      <Confirm
        open={asking === 'receive'}
        title={t('Confirm you received the food?')}
        body={t('This releases ৳{n} to {cook} and completes the order. It cannot be undone.', {
          n: n(order.amount),
          cook: order.cookName,
        })}
        confirmLabel={t('Yes, it arrived')}
        onConfirm={receive}
        onClose={() => setAsking(null)}
      />

      <Confirm
        open={asking === 'cancel'}
        title={
          order.status === 'pending' ? t('Withdraw this pre-order?') : t('Cancel this order?')
        }
        body={t('৳{n} goes back to your wallet, and the cook is told.', { n: n(order.amount) })}
        confirmLabel={
          order.status === 'pending' ? t('Withdraw pre-order') : t('Cancel order')
        }
        onConfirm={cancel}
        onClose={() => setAsking(null)}
      />
    </Screen>
  );
}

function Banner({ tone, icon, title, body }) {
  const { colors } = useTheme();
  const map = {
    sage: [colors.sage, colors.sage50, colors.sage100],
    saffron: [colors.saffron, colors.saffron50, colors.saffron100],
    primary: [colors.primary, colors.primary50, colors.primary200],
  };
  const [fg, bg, line] = map[tone] ?? map.primary;

  return (
    <View
      style={{
        gap: 8,
        padding: 16,
        marginTop: 16,
        borderRadius: radius.sm,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={icon} size={16} color={fg} />
        {title ? (
          <Text
            style={{ flex: 1, fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}
          >
            {title}
          </Text>
        ) : (
          <Text
            style={{
              flex: 1,
              fontFamily: font.uiSemi,
              fontSize: type.sm,
              lineHeight: type.sm * 1.5,
              color: colors.text,
            }}
          >
            {body}
          </Text>
        )}
      </View>
      {title ? (
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: type.sm * 1.55,
            color: colors.textMuted,
          }}
        >
          {body}
        </Text>
      ) : null}
    </View>
  );
}

function Row({ label, value, mono }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: colors.line2,
      }}
    >
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.xs + 1,
          letterSpacing: (type.xs + 1) * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
          flex: 1,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          flexShrink: 1,
          textAlign: 'right',
          fontFamily: mono ? font.uiBold : font.ui,
          fontSize: type.sm + 1,
          color: colors.text,
          fontVariant: mono ? ['tabular-nums'] : undefined,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** A yes/no the user has to mean. */
function Confirm({ open, title, body, confirmLabel, onConfirm, onClose }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 20,
          backgroundColor: 'rgba(20, 16, 14, 0.5)',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              padding: 22,
              gap: 14,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
            },
            shadow.lg,
          ]}
        >
          <Heading size={19}>{title}</Heading>
          <Body muted size={14}>
            {body}
          </Body>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="glass" label={t('Never mind')} onPress={onClose} style={{ flex: 1 }} />
            <Button label={confirmLabel} onPress={onConfirm} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
