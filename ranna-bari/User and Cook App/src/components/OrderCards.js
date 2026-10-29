/**
 * The order board's cards — one per kind, plus the small parts they share.
 *
 * Moved out of the board screen so the lists can virtualise: a FlatList
 * needs cheap, stable row components, and three card bodies inline in a
 * 1,300-line screen made that awkward. Nothing here changed behaviour —
 * every card is its old body wrapped in `React.memo`, so switching lanes
 * or filters no longer re-renders cards that did not change.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import Icon from './Icon';
import Button from './Button';
import { Body, Price } from './Typography';
import { EmptyState, MealStatusPill, PaymentPill } from './MealBits';
import { OrderLines } from './StoreBits';
import { statusMeta } from './CookBits';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';
import { cookPayout, NEXT_STEP, stageOf, timeAgo, useOrders } from '../store/OrdersContext';
import { formatAddress } from '../lib/address';
import { COOK_ADVANCES } from '../lib/ledger';
import { SLOT_LABEL } from '../features/meal-plan/format';

const STEP_AT = {
  menu: {
    placed: 0,
    accepted: 1,
    cooking: 1,
    on_the_way: 2,
    delivered: 3,
    completed: 3,
  },
  shop: {
    pending: 0,
    confirmed: 1,
    preparing: 1,
    ready: 2,
    delivering: 2,
    delivered: 3,
    completed: 3,
  },
  meals: {
    confirmed: 0,
    preparing: 1,
    delivered: 2,
    completed: 2,
  },
};

const STEP_TOTAL = { menu: 4, shop: 4, meals: 3 };

/** What the shop's button says at each stage. */
export const SHOP_NEXT = {
  confirmed: 'Start packing',
  preparing: 'Mark ready',
  ready: 'Send out',
  delivering: 'Mark delivered',
};

/** A meal plate's two working steps. Delivered is the customer's to confirm. */
export const MEAL_NEXT = {
  confirmed: 'Start cooking',
  preparing: 'Mark delivered',
};

/* ------------------------------------------------------------------ *
 * progress dots — where an order stands on its way to done
 * ------------------------------------------------------------------ */

function Steps({ at, total }) {
  const { colors } = useTheme();

  /* Decorative on purpose: the status pill beside it already names the
     stage in words, so a screen reader gets the fact once, not twice. */
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      {Array.from({ length: total }, (_, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <View
              style={{
                flex: 1,
                height: 2,
                borderRadius: 1,
                backgroundColor: i <= at ? colors.sage100 : colors.line,
              }}
            />
          ) : null}
          <View
            style={{
              width: i === at ? 9 : 7,
              height: i === at ? 9 : 7,
              borderRadius: 5,
              backgroundColor: i <= at ? colors.sage : colors.line,
            }}
          />
        </React.Fragment>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * the customer's note, where work is triaged
 * ------------------------------------------------------------------ */

/**
 * "Jhal kom diben", in the customer's own words, on the card.
 *
 * This used to live nowhere — the only free text on an order was
 * `address.instructions`, which is the rider's note and answers a different
 * question. Saffron, like the detail screen's callout, and capped at two
 * lines with a tap to open: the note must be seen, but never own the card.
 */
function CookNote({ note }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  if (!String(note ?? '').trim()) return null;

  return (
    <Pressable
      accessibilityRole={String(note).length > 90 ? 'button' : 'text'}
      onPress={String(note).length > 90 ? () => setOpen((v) => !v) : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        padding: 10,
        borderRadius: radius.sm,
        backgroundColor: colors.saffron50,
        borderWidth: 1,
        borderColor: colors.saffron100,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Icon name="chat" size={13} color={colors.saffron} />
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
          numberOfLines={open ? undefined : 2}
          style={{
            fontFamily: font.ui,
            fontSize: type.xs + 1,
            lineHeight: (type.xs + 1) * 1.5,
            color: colors.text,
          }}
        >
          {note}
        </Text>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * shop card
 * ------------------------------------------------------------------ */

function ShopCard({ order, onAdvance, onAnswer }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const [busy, setBusy] = useState(false);

  const next = COOK_ADVANCES[order.handover === 'pickup' ? 'pickup' : 'delivery'][order.status];

  const answer = async (which) => {
    if (busy) return;
    Haptics.selectionAsync().catch(() => {});
    setBusy(true);
    await onAnswer(which, order.id);
    setBusy(false);
  };

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

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <MealStatusPill status={order.status} />
        <PaymentPill payment={order.payment} />
      </View>

      <OrderLines lines={order.lines ?? []} />

      <CookNote note={order.note} />

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

      {STEP_AT.shop[order.status] !== undefined ? (
        <Steps at={STEP_AT.shop[order.status]} total={STEP_TOTAL.shop} />
      ) : null}

      {/* A pending pre-order is a decision, not a stage — so the card gets
          the decision itself, in the same two-tap shape the pre-order queue
          uses. The held money is the customer's stake; naming it beside the
          buttons is what makes declining feel safe. */}
      {order.status === 'pending' ? (
        <View style={{ gap: 10 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              borderRadius: radius.sm,
              backgroundColor: colors.saffron50,
            }}
          >
            <Icon name="lock" size={13} color={colors.saffron} />
            <Text
              style={{
                flex: 1,
                fontFamily: font.ui,
                fontSize: type.xs,
                lineHeight: type.xs * 1.5,
                color: colors.text,
              }}
            >
              {t('৳{n} is held. Declining returns it in full.', { n: n(order.amount) })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              variant="glass"
              small
              label={t('Decline')}
              disabled={busy}
              style={{ flex: 1 }}
              onPress={() => answer('decline')}
            />
            <Button
              small
              label={busy ? t('Updating…') : t('Accept')}
              icon={busy ? undefined : 'check'}
              iconPosition="left"
              disabled={busy}
              style={{ flex: 1 }}
              onPress={() => answer('accept')}
            />
          </View>
        </View>
      ) : next ? (
        <Button small label={t(SHOP_NEXT[order.status])} block onPress={() => onAdvance(order.id)} />
      ) : order.status === 'delivered' ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs + 1, color: colors.textMuted }}>
          {t('Waiting for the customer to confirm they got it.')}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * one meal plate
 * ------------------------------------------------------------------ */

function MealPlate({ order, busy, onDeliver }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  const done = order.status === 'delivered' || order.status === 'completed';
  const nextLabel = MEAL_NEXT[order.status];

  return (
    <View
      style={[
        {
          gap: 10,
          padding: 14,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: done ? colors.line : colors.saffron100,
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.displayBold, fontSize: 16, letterSpacing: -0.2, color: colors.text }}
          >
            {order.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted, marginTop: 2 }}
          >
            {order.customerName || order.customerKey}
            {order.slot ? ` · ${t(SLOT_LABEL[order.slot] ?? order.slot)}` : ''}
          </Text>
          {order.address?.line || order.address?.area ? (
            <Text
              numberOfLines={1}
              style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted, marginTop: 1 }}
            >
              {[order.address.line, order.address.area].filter(Boolean).join(', ')}
            </Text>
          ) : null}
        </View>
        <Price size={17}>৳{n(order.amount)}</Price>
      </View>

      {/* A plate's note, on the plate — a month of cooking carries the same
          "jhal kom" every single day. */}
      <CookNote note={order.note} />

      <Steps at={STEP_AT.meals[order.status] ?? 0} total={STEP_TOTAL.meals} />

      {done ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs + 1, color: colors.textMuted }}>
          {order.status === 'completed'
            ? t('The customer confirmed this one. Payment is with the platform to release.')
            : t('Handed over. The money moves when the customer confirms they got it.')}
        </Text>
      ) : (
        <Button
          small
          label={busy ? t('Updating…') : t(nextLabel ?? 'Mark delivered')}
          icon={busy ? undefined : 'check'}
          block
          disabled={busy}
          onPress={() => onDeliver(order.id)}
        />
      )}
    </View>
  );
}

/**
 * The serving dome beside the title.
 *
 * Decoration, and marked as such: `accessibilityElementsHidden` keeps it out
 * of the reading order, because a screen reader announcing "pot, sparkles,
 * leaf" before the order list is noise standing where information should be.
 */
function Cloche() {
  const { colors } = useTheme();

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 92, height: 78, marginTop: 2 }}
    >
      <View style={{ position: 'absolute', right: 2, bottom: 6 }}>
        <Icon name="pot" size={62} color={colors.saffron100} strokeWidth={1.4} />
      </View>
      <View style={{ position: 'absolute', left: 0, top: 8 }}>
        <Icon name="sparkles" size={18} color={colors.saffron} strokeWidth={1.7} />
      </View>
      <View style={{ position: 'absolute', right: 4, top: 0 }}>
        <Icon name="sparkles" size={13} color={colors.saffron100} strokeWidth={1.7} />
      </View>
      <View style={{ position: 'absolute', right: 0, bottom: 2 }}>
        <Icon name="leaf" size={17} color={colors.sage100} strokeWidth={1.7} />
      </View>
    </View>
  );
}

/**
 * One order, as a card a cook can act on without opening it.
 *
 * The whole surface opens the order; the two buttons at the foot are the
 * decision itself, so a cook working a queue never has to leave the board.
 */
function OrderCard({ order, onOpen }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const { advanceOrder } = useOrders();
  const [copied, setCopied] = useState(false);

  const meta = statusMeta(order.status, colors);
  const next = NEXT_STEP[order.status];
  const isNew = stageOf(order.status) === 'placed';
  const count = order.items.reduce((s, it) => s + it.qty, 0);

  /* The code is what a cook reads to a rider or pastes into a message, so it
     is worth one tap rather than a careful retype of eight characters. */
  const copyCode = async () => {
    if (!order.code) return;
    Haptics.selectionAsync().catch(() => {});
    await Clipboard.setStringAsync(order.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: isNew ? colors.primary100 : colors.line,
          overflow: 'hidden',
        },
        shadow.sm,
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t('Order')} ${order.code ?? ''}, ${t(meta.label)}`}
        onPress={() => onOpen(order.id)}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingTop: 15,
          backgroundColor: pressed ? colors.sunken : 'transparent',
        })}
      >
        {/* ---- status, age, and the code ---- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 4,
              paddingHorizontal: 9,
              borderRadius: radius.pill,
              backgroundColor: meta.bg,
            }}
          >
            <Icon name={meta.icon} size={11} color={meta.fg} strokeWidth={2.2} />
            <Text
              maxFontSizeMultiplier={1.2}
              style={{
                fontFamily: font.uiBold,
                fontSize: 10,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: meta.fg,
              }}
            >
              {t(meta.label)}
            </Text>
          </View>

          <Text
            numberOfLines={1}
            style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
          >
            {timeAgo(order.createdAt, t, n)}
          </Text>

          <View style={{ flex: 1 }} />

          {order.code ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Copy order ID {code}', { code: order.code })}
              onPress={copyCode}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <Text
                numberOfLines={1}
                style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textLight }}
              >
                {t('Order ID:')}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.xs,
                  letterSpacing: 0.4,
                  color: colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {order.code}
              </Text>
              <Icon
                name={copied ? 'check' : 'copy'}
                size={14}
                color={copied ? colors.sage : colors.textLight}
                strokeWidth={2}
              />
            </Pressable>
          ) : null}
        </View>

        {/* ---- who, where, and the cook's share ---- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <Image
            source={{ uri: order.items[0]?.image }}
            contentFit="cover"
            transition={150}
            style={{
              width: 54,
              height: 54,
              borderRadius: radius.sm,
              backgroundColor: colors.sunken,
            }}
          />

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.displayBold,
                fontSize: 17,
                letterSpacing: -0.2,
                color: colors.text,
              }}
            >
              {order.contact?.name ?? t('A customer')}
            </Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
            >
              <Icon name="pin" size={12} color={colors.textLight} />
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
              >
                {t(count === 1 ? '{n} item' : '{n} items', { n: n(count) })}
                {order.address?.area ? ` • ${order.address.area}` : ''}
              </Text>
            </View>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Price size={19}>৳{n(cookPayout(order))}</Price>
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 9.5,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: colors.sage,
              }}
            >
              {t('Your cut')}
            </Text>
          </View>
        </View>

        {/* A dashed rule, because what is above it is the order and what is
            below it is the food — related, but not the same reading. */}
        <View
          style={{
            marginTop: 13,
            borderTopWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.line,
          }}
        />

        <Text
          numberOfLines={2}
          style={{
            marginTop: 11,
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: 20,
            color: colors.textMuted,
          }}
        >
          {order.items.map((it) => `${n(it.qty)}×  ${it.name}`).join(',  ')}
        </Text>

        {/* Where this order stands on its way to done — the pill names the
            stage, the dots say how much of the road is behind it. */}
        {STEP_AT.menu[order.status] !== undefined ? (
          <View style={{ marginTop: 13, marginBottom: 2 }}>
            <Steps at={STEP_AT.menu[order.status]} total={STEP_TOTAL.menu} />
          </View>
        ) : null}
      </Pressable>

      {/* The customer's note, outside the pressed surface — tapping it to
          expand must never open the order. */}
      <View style={{ paddingHorizontal: 16, ...(order.note ? { paddingTop: 12 } : {}) }}>
        <CookNote note={order.note} />
      </View>

      {next ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 16,
          }}
        >
          {/* Rejecting needs a reason, and the reason list is on the order
              screen -- so this opens it rather than deciding here. */}
          {isNew ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Reject')}
              onPress={() => onOpen(order.id)}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                paddingVertical: 12,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.primary100,
                backgroundColor: pressed ? colors.primary50 : 'transparent',
              })}
            >
              <Icon name="x" size={15} color={colors.primary} strokeWidth={2.4} />
              <Text
                style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.primary }}
              >
                {t('Reject')}
              </Text>
            </Pressable>
          ) : null}

          {/*
            * Green, and it is the only green button on the screen.
            *
            * This was the same vermilion as Reject, so the two decisions on a
            * new order looked alike at a glance and the destructive one had
            * no less weight than the one a cook makes forty times a day.
            */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(meta.action)}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              advanceOrder(order.id);
            }}
            style={({ pressed }) => ({
              flex: isNew ? 1.35 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 12,
              borderRadius: radius.pill,
              backgroundColor: pressed ? colors.sage100 : colors.sage,
            })}
          >
            <Icon name="check" size={15} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: '#FFFFFF' }}>
              {t(meta.action)}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {order.status === 'rejected' && order.rejectReason ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 9,
            paddingHorizontal: 16,
            paddingBottom: 16,
          }}
        >
          <Icon name="alertCircle" size={15} color={colors.textLight} />
          <Text
            style={{
              flex: 1,
              fontFamily: font.ui,
              fontSize: type.xs,
              lineHeight: 18,
              color: colors.textMuted,
            }}
          >
            {order.rejectReason}
          </Text>
        </View>
      ) : null}
    </View>
  );
}


export const MemoOrderCard = React.memo(OrderCard);
export const MemoShopCard = React.memo(ShopCard);
export const MemoMealPlate = React.memo(MealPlate);

export { Steps, Cloche };
