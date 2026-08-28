/**
 * One booked meal, from confirmation to the money moving.
 *
 * The rail below is not decoration: the last step belongs to the person
 * reading it. Nothing pays the cook until "Food received" is pressed here,
 * so that button is the loudest thing on the screen the moment it applies
 * and absent the rest of the time.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Button from '../../src/components/Button';
import { Body, Heading, Price } from '../../src/components/Typography';
import {
  EmptyState,
  MealStatusPill,
  PaymentPill,
  mealErrorText,
  serviceLabel,
} from '../../src/components/MealBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useMeals } from '../../src/store/MealsContext';
import { formatOrderDate } from '../../src/store/OrdersContext';
import { flowFor, stepIndexIn } from '../../src/lib/mealLogic';
import { useLang } from '../../src/i18n/LanguageContext';

export default function MealOrderScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const router = useRouter();
  const meals = useMeals();

  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(null); // 'receive' | 'cancel'
  const [flash, setFlash] = useState(null);

  const order = meals.orders.find((o) => o.id === String(id));
  const meal = order ? meals.mealById(order.mealId) : null;

  const flow = useMemo(() => flowFor(order?.handover), [order?.handover]);

  if (!order) {
    return (
      <Screen>
        <Container style={{ paddingTop: 30 }}>
          <EmptyState
            icon="alertCircle"
            title={t('Order not found')}
            body={t('That order no longer exists.')}
            action={<Button label={t('Tomorrow’s meals')} onPress={() => router.replace('/meals')} />}
          />
        </Container>
      </Screen>
    );
  }

  const cancelled = order.status === 'cancelled';
  const reached = cancelled ? -1 : stepIndexIn(flow, order.status);
  const stamps = new Map(order.history.map((h) => [h.status, h.at]));

  const canReceive = order.status === 'delivered';
  const canCancel = ['confirmed', 'preparing', 'ready'].includes(order.status);

  const receive = () => {
    const out = meals.confirmReceived(order.id);
    setAsking(null);
    if (!out.ok) return setError(mealErrorText(out.error, t, n, out));
    setError(null);
    setFlash(t('৳{n} has been released to the cook.', { n: n(out.result) }));
  };

  const cancel = () => {
    const out = meals.cancelOrder(order.id, 'customer', 'Cancelled by the customer');
    setAsking(null);
    if (!out.ok) return setError(mealErrorText(out.error, t, n, out));
    setError(null);
    setFlash(t('৳{n} has been refunded to your wallet.', { n: n(out.result) }));
  };

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/meals'))}
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

        {/* ---- what and when ---- */}
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
              {meal ? ` · ${serviceLabel(meal, t, lang)}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MealStatusPill status={order.status} />
              <PaymentPill payment={order.payment} />
            </View>
          </View>
        </View>

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
              {t(
                '৳{n} is still held. Confirming releases it to {cook}.',
                { n: n(order.amount), cook: order.cookName },
              )}
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

        {flash ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              marginTop: 16,
              borderRadius: radius.sm,
              backgroundColor: colors.sage50,
              borderWidth: 1,
              borderColor: colors.sage100,
            }}
          >
            <Icon name="shieldCheck" size={16} color={colors.sage} />
            <Text
              style={{
                flex: 1,
                fontFamily: font.uiSemi,
                fontSize: type.sm,
                color: colors.text,
              }}
            >
              {flash}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              marginTop: 16,
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
            {cancelled ? t('Order cancelled') : t('Progress')}
          </Text>

          {cancelled ? (
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

        {/* ---- the paperwork ---- */}
        <View style={{ marginTop: 8, gap: 1 }}>
          <Row label={t('Order code')} value={order.code} mono />
          <Row label={t('Amount')} value={`৳${n(order.amount)}`} />
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
            value={order.address || (order.handover === 'pickup' ? t('At the kitchen') : '—')}
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
              label={t('Cancel order')}
              block
              onPress={() => setAsking('cancel')}
            />
          ) : null}

          <Button
            variant="glass"
            label={t('Tomorrow’s meals')}
            block
            onPress={() => router.push('/meals')}
          />
        </View>
      </Container>

      <Confirm
        open={asking === 'receive'}
        title={t('Confirm you received the food?')}
        body={t(
          'This releases ৳{n} to {cook} and completes the order. It cannot be undone.',
          { n: n(order.amount), cook: order.cookName },
        )}
        confirmLabel={t('Yes, it arrived')}
        onConfirm={receive}
        onClose={() => setAsking(null)}
      />

      <Confirm
        open={asking === 'cancel'}
        title={t('Cancel this order?')}
        body={t('৳{n} goes back to your wallet, and the cook is told.', {
          n: n(order.amount),
        })}
        confirmLabel={t('Cancel order')}
        onConfirm={cancel}
        onClose={() => setAsking(null)}
      />
    </Screen>
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
            <Button
              variant="glass"
              label={t('Never mind')}
              onPress={onClose}
              style={{ flex: 1 }}
            />
            <Button label={confirmLabel} onPress={onConfirm} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
