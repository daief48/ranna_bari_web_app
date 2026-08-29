/**
 * One meal, from the kitchen's side.
 *
 * The headline is a single number — how many plates are paid for — because
 * that is the question this whole system exists to answer before the
 * shopping is done. Interest sits next to it, smaller, because it is a
 * forecast and not a commitment.
 *
 * Orders are driven in bulk. A cook with fourteen plates is not tapping
 * fourteen buttons at each stage, so the primary control moves everything
 * sitting at the same step, and individual rows stay available for the one
 * order that is different.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Button from '../../../src/components/Button';
import Reveal from '../../../src/components/Reveal';
import { Body, Heading, Price } from '../../../src/components/Typography';
import {
  CountTile,
  EmptyState,
  MealStatusPill,
  PaymentPill,
  deadlineLabel,
  errorText,
  serviceLabel,
} from '../../../src/components/MealBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../../src/theme/tokens';
import { useCommerce } from '../../../src/store/CommerceContext';
import { COOK_ADVANCES } from '../../../src/lib/mealLogic';
import { useLang } from '../../../src/i18n/LanguageContext';
import { formatAddress } from '../../../src/lib/address';
import { useAlert } from '../../../src/components/Alert';

/** What the bulk button says when everything is sitting at `status`. */
const BULK_LABEL = {
  confirmed: 'Start cooking',
  preparing: 'Mark all ready',
  ready: 'Send all out',
  delivering: 'Mark all delivered',
};

export default function CookMealScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const alert = useAlert();
  const router = useRouter();
  const meals = useCommerce();

  const [asking, setAsking] = useState(null); // 'close' | 'cancel'
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  const meal = meals.mealById(String(id));
  const orders = useMemo(
    () => (meal ? meals.ordersForMeal(meal.id) : []),
    [meals, meal],
  );

  if (!meal) {
    return (
      <CookScreen>
        <Container style={{ paddingTop: 20 }}>
          <EmptyState
            icon="alertCircle"
            title={t('Meal not found')}
            body={t('That meal is no longer listed.')}
            action={<Button label={t('Your meals')} onPress={() => router.replace('/cook/meals')} />}
          />
        </Container>
      </CookScreen>
    );
  }

  const confirmed = orders.length;
  const interested = meal.interestCount ?? 0;
  const left = meals.remaining(meal);
  const live = orders.filter((o) => o.status !== 'completed');
  const held = orders
    .filter((o) => o.payment === 'held')
    .reduce((sum, o) => sum + o.amount, 0);
  const earned = orders
    .filter((o) => o.payment === 'released')
    .reduce((sum, o) => sum + o.amount, 0);

  /* The earliest stage anything is sitting at. Advancing that moves the
     whole batch without ever skipping an order forward past its own step. */
  const table = COOK_ADVANCES[meal.handover === 'pickup' ? 'pickup' : 'delivery'];
  const batch = ['confirmed', 'preparing', 'ready', 'delivering'].find(
    (status) => table[status] && live.some((o) => o.status === status),
  );

  const advanceAll = async () => {
    const targets = live.filter((o) => o.status === batch).map((o) => o.id);
    let moved = 0;
    for (const orderId of targets) {
      /* One at a time, not `Promise.all`: each order is its own transition
         and the server refuses one that is already past this step. Firing
         them together would have the batch race its own refreshes. */
      const out = await meals.advanceOrder(orderId);
      if (out.ok) moved += 1;
    }
    alert.success(t('{n} orders moved on.', { n: n(moved) }));
  };

  const advanceOne = async (orderId) => {
    const out = await meals.advanceOrder(orderId);
    if (!out.ok) alert.error(errorText(out.error, t, n, out));
  };

  /* One customer's plate called off -- they ran out of an ingredient, or the
     order cannot be delivered. Their money goes straight back; the rest of
     the service carries on. */
  const cancelOne = async (orderId) => {
    const out = await meals.cancelOrder(orderId, 'cook', 'Cancelled by the kitchen');
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(t('Order cancelled. ৳{n} refunded.', { n: n(out.result) }));
  };

  const close = async () => {
    setAsking(null);
    const out = await meals.closeMeal(meal.id);
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(t('Closed. Existing orders are unaffected.'));
  };

  const cancel = async () => {
    setAsking(null);
    const out = await meals.cancelMeal(meal.id, 'Cancelled by the kitchen');
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(t('Cancelled. ৳{n} refunded to customers.', { n: n(out.result.refunded) }));
  };

  return (
    <CookScreen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook/meals'))}
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
            {t('Your meals')}
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
            source={{ uri: meal.image }}
            contentFit="cover"
            transition={200}
            style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: colors.sunken }}
          />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.displayBold,
                fontSize: 18,
                letterSpacing: -0.2,
                color: colors.text,
              }}
            >
              {meal.title}
            </Text>
            <Text
              style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.sage }}
            >
              {serviceLabel(meal, t, lang)}
            </Text>
            <Text
              style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
            >
              ৳{n(meal.price)} ·{' '}
              {meal.status === 'published'
                ? (deadlineLabel(meal.deadline, t, n) ?? t('Open'))
                : meal.status === 'closed'
                  ? t('Closed')
                  : t('Cancelled')}
            </Text>
          </View>
        </View>

        {/* ---- the number that decides the shopping ---- */}
        <Reveal delay={1}>
          <View
            style={{
              alignItems: 'center',
              gap: 4,
              paddingVertical: 26,
              marginTop: 16,
              borderRadius: radius.md,
              backgroundColor: colors.sage50,
              borderWidth: 1,
              borderColor: colors.sage100,
            }}
          >
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: type.xs + 1,
                letterSpacing: (type.xs + 1) * tracking.label,
                textTransform: 'uppercase',
                color: colors.sage,
              }}
            >
              {t('Prepare')}
            </Text>
            <Text
              style={{
                fontFamily: font.displayExtra,
                fontSize: 64,
                lineHeight: 70,
                letterSpacing: -2,
                color: colors.sage,
              }}
            >
              {n(confirmed)}
            </Text>
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: type.sm + 1,
                color: colors.textMuted,
              }}
            >
              {confirmed === 1 ? t('plate confirmed') : t('plates confirmed')}
            </Text>
          </View>
        </Reveal>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <CountTile value={n(interested)} label={t('Interested')} tone="saffron" />
          <CountTile
            value={left == null ? '∞' : n(left)}
            label={t('Left')}
            tone={left != null && left <= 3 ? 'saffron' : 'sage'}
          />
          <CountTile value={`৳${n(held)}`} label={t('Held')} tone="primary" />
        </View>

        {earned ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              marginTop: 12,
              borderRadius: radius.sm,
              backgroundColor: colors.sage50,
              borderWidth: 1,
              borderColor: colors.sage100,
            }}
          >
            <Icon name="banknote" size={16} color={colors.sage} />
            <Text
              style={{
                flex: 1,
                fontFamily: font.ui,
                fontSize: type.sm,
                color: colors.text,
              }}
            >
              {t('৳{n} released to your wallet from this meal.', { n: n(earned) })}
            </Text>
          </View>
        ) : null}

        {flash ? <Flash tone="sage" icon="check" text={flash} /> : null}
        {error ? <Flash tone="primary" icon="alertCircle" text={error} /> : null}

        {/* ---- drive the batch ---- */}
        {batch ? (
          <Button
            label={t(BULK_LABEL[batch])}
            icon="arrowRight"
            block
            onPress={advanceAll}
            style={{ marginTop: 18 }}
          />
        ) : null}

        {/* ---- the orders ---- */}
        <View style={{ marginTop: 28 }}>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.sm,
              letterSpacing: type.sm * tracking.label,
              textTransform: 'uppercase',
              color: colors.textMuted,
              marginBottom: 14,
            }}
          >
            {t('{n} confirmed orders', { n: n(confirmed) })}
          </Text>

          {orders.length ? (
            <View style={{ gap: 10 }}>
              {orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  next={table[order.status]}
                  onAdvance={() => advanceOne(order.id)}
                  onCancel={() => cancelOne(order.id)}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="receipt"
              title={t('No orders yet')}
              body={
                interested
                  ? t('{n} people are interested. They pay to confirm.', { n: n(interested) })
                  : t('Nobody has booked this meal yet.')
              }
            />
          )}
        </View>

        {/* ---- meal-level controls ---- */}
        {meal.status === 'published' ? (
          <View style={{ marginTop: 26, gap: 10 }}>
            <Button
              variant="glass"
              label={t('Stop taking orders')}
              block
              onPress={() => setAsking('close')}
            />
            <Button
              variant="ghost"
              label={t('Cancel this meal')}
              block
              onPress={() => setAsking('cancel')}
            />
          </View>
        ) : null}
      </Container>

      <Confirm
        open={asking === 'close'}
        title={t('Stop taking orders?')}
        body={t('The meal stays visible but nobody new can book it. Orders already placed are unaffected.')}
        confirmLabel={t('Stop orders')}
        onConfirm={close}
        onClose={() => setAsking(null)}
      />

      <Confirm
        open={asking === 'cancel'}
        title={t('Cancel this meal?')}
        body={t(
          'All {n} confirmed orders are cancelled and ৳{amount} goes back to the customers. This cannot be undone.',
          { n: n(confirmed), amount: n(held) },
        )}
        confirmLabel={t('Cancel meal')}
        onConfirm={cancel}
        onClose={() => setAsking(null)}
      />
    </CookScreen>
  );
}

/** One customer's plate. */
function OrderRow({ order, next, onAdvance, onCancel }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  return (
    <View
      style={[
        {
          gap: 12,
          padding: 14,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.line,
        },
        shadow.xs,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
            {order.code}
            {formatAddress(order.address) ? ` · ${formatAddress(order.address)}` : ''}
          </Text>
        </View>
        <Price size={16}>৳{n(order.amount)}</Price>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <MealStatusPill status={order.status} />
        <PaymentPill payment={order.payment} />
      </View>

      {next ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            variant="glass"
            small
            label={t('Move on')}
            onPress={onAdvance}
            style={{ flex: 1 }}
          />
          {/* Only while it is still in the kitchen. Once it is on a bike,
              cancelling is a dispute rather than a decision. */}
          {order.status !== 'delivering' ? (
            <Button variant="ghost" small label={t('Cancel')} onPress={onCancel} />
          ) : null}
        </View>
      ) : order.status === 'delivered' ? (
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.xs + 1,
            color: colors.textMuted,
          }}
        >
          {t('Waiting for the customer to confirm they got it.')}
        </Text>
      ) : null}
    </View>
  );
}

function Flash({ tone, icon, text }) {
  const { colors } = useTheme();
  const fg = tone === 'sage' ? colors.sage : colors.primary;
  const bg = tone === 'sage' ? colors.sage50 : colors.primary50;
  const line = tone === 'sage' ? colors.sage100 : colors.primary200;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        marginTop: 14,
        borderRadius: radius.sm,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: line,
      }}
    >
      <Icon name={icon} size={16} color={fg} />
      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: type.sm,
          lineHeight: type.sm * 1.5,
          color: colors.text,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

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
