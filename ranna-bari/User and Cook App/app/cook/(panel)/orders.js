/**
 * Every order the kitchen owes anybody, on one board.
 *
 * Three kinds of orders were three screens: this board for the à-la-carte
 * cooking, the shop's orders two levels inside the shop, and the month's
 * plates on their own dated board. A cook who wanted to know what they owe
 * before dinner had to visit all three, and the answer never appeared in one
 * place. Now the kinds are tabs on the board, each with the count of orders
 * that are still the cook's to finish, and the tab with the most urgent work
 * opens first.
 *
 * The sub-controls stay per kind, because the three kinds genuinely differ:
 * menu orders move through statuses, shop parcels start as pre-orders whose
 * answer sits on the card, and meal plates belong to a date. What is shared
 * is the rule that every card carries its own action, so working a queue
 * never means leaving the board — even a pre-order, with money held, is
 * answered where it stands.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import SectionHeader from '../../../src/components/SectionHeader';
import Button from '../../../src/components/Button';
import { statusMeta } from '../../../src/components/CookBits';
import { Price } from '../../../src/components/Typography';
import {
  EmptyState,
  MealStatusPill,
  PaymentPill,
  errorText,
} from '../../../src/components/MealBits';
import { OrderLines } from '../../../src/components/StoreBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import {
  NEXT_STEP,
  cookPayout,
  isClosed,
  timeAgo,
  useOrders,
} from '../../../src/store/OrdersContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useSession } from '../../../src/store/SessionContext';
import { formatAddress } from '../../../src/lib/address';
import { COOK_ADVANCES } from '../../../src/lib/ledger';
import { ORDER_FILTERS, filterOrders } from '../../../src/lib/storeLogic';
import { fetchMealOrders } from '../../../src/features/meal-plan/api';
import {
  SLOT_LABEL,
  dateLabel,
  dayParts,
  todayKey,
} from '../../../src/features/meal-plan/format';
import { useAlert } from '../../../src/components/Alert';
import { useLang } from '../../../src/i18n/LanguageContext';

/**
 * The board is cut by what the cook has to do next, not by the raw status:
 * "New" is a decision, "Cooking" is work, "Delivering" is a wait, and
 * "History" is everything already settled.
 */
const LANES = [
  { key: 'new', label: 'New', match: (s) => s === 'placed' },
  { key: 'cooking', label: 'Cooking', match: (s) => s === 'accepted' || s === 'cooking' },
  { key: 'delivering', label: 'Delivering', match: (s) => s === 'on_the_way' },
  { key: 'history', label: 'History', match: isClosed },
];

/** What the shop's button says at each stage. */
const SHOP_NEXT = {
  confirmed: 'Start packing',
  preparing: 'Mark ready',
  ready: 'Send out',
  delivering: 'Mark delivered',
};

/** A meal plate's two working steps. Delivered is the customer's to confirm. */
const MEAL_NEXT = {
  confirmed: 'Start cooking',
  preparing: 'Mark delivered',
};

const KINDS = [
  { key: 'menu', label: 'Menu' },
  { key: 'shop', label: 'Shop' },
  { key: 'meals', label: 'Meals' },
];

export default function CookOrders() {
  const { colors } = useTheme();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const { ordersForKitchen, advanceOrder } = useOrders();
  const shop = useCommerce();
  const { token } = useSession();
  const alert = useAlert();
  const [lane, setLane] = useState(null);
  const [kind, setKind] = useState(null);
  const [shopFilter, setShopFilter] = useState('all');
  const [mealDate, setMealDate] = useState(todayKey());
  const [meals, setMeals] = useState(null);
  const [busyMeal, setBusyMeal] = useState(null);
  const { t, n } = useLang();

  /* ---- menu ---- */
  const mine = ordersForKitchen(kitchen?.id);

  const counts = useMemo(() => {
    const out = {};
    for (const l of LANES) out[l.key] = mine.filter((o) => l.match(o.status)).length;
    return out;
  }, [mine]);

  /* ---- shop ---- */
  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;
  const shopOrders = useMemo(
    () => (store ? shop.storeOrders(store.id) : []),
    [shop, store],
  );
  const shopNeeds = useMemo(
    () =>
      shopOrders.filter((o) => o.status === 'pending' || o.status === 'confirmed').length,
    [shopOrders],
  );
  const shopOpen = useMemo(
    () => shopOrders.filter((o) => !['delivered', 'completed', 'cancelled', 'rejected'].includes(o.status)).length,
    [shopOrders],
  );

  const advanceShop = async (orderId) => {
    const out = await shop.advanceOrder(orderId);
    if (!out.ok) alert.error(errorText(out.error, t, n, out));
  };

  /* A pre-order is a decision, and the board carries it: the same two
     answers the pre-order queue gives, with the same words back. */
  const answerPreorder = async (order, answer) => {
    const out =
      answer === 'accept'
        ? await shop.acceptPreorder(order.id)
        : await shop.rejectPreorder(order.id, 'Declined by the kitchen');
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(
      answer === 'accept'
        ? t('Accepted. {customer} has been told.', { customer: order.customerName })
        : t('Declined. ৳{n} went back to {customer}.', {
            n: n(out.result),
            customer: order.customerName,
          }),
    );
  };

  /* ---- meals ---- */
  const loadMeals = useCallback(async () => {
    if (!token) return;
    const out = await fetchMealOrders(token, mealDate);
    setMeals(out.ok ? out.result : { orders: [], week: [], next: null });
  }, [token, mealDate]);

  /* Meals are dated, so this refetches on focus and on every day change —
     the same contract the cooking board keeps. */
  useFocusEffect(
    useCallback(() => {
      loadMeals();
    }, [loadMeals]),
  );

  const mealOrders = meals?.orders ?? [];
  const mealDone = (o) => o.status === 'delivered' || o.status === 'completed';
  const mealOpen = mealOrders.filter((o) => !mealDone(o)).length;

  const deliverMeal = async (order) => {
    setBusyMeal(order.id);
    const out = await advanceOrder(order.id);
    setBusyMeal(null);
    if (out && out.ok === false) {
      alert.error(out.message ?? t('That did not work.'), t('Not updated'));
      return;
    }
    loadMeals();
  };

  /* ---- menu lanes (as before) ----
     Open on the lane that has something in it — New still wins whenever
     anything is actually waiting. A tap pins the choice. */
  const shownLane = lane ?? (LANES.find((l) => counts[l.key] > 0)?.key ?? 'new');

  const menuRows = useMemo(() => {
    const active = LANES.find((l) => l.key === shownLane);
    const list = mine.filter((o) => active.match(o.status));
    /* Work lanes put the longest wait first -- that is the one going cold.
       History reads newest-first like any log. */
    return list.sort((a, b) =>
      shownLane === 'history'
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : new Date(a.createdAt) - new Date(b.createdAt),
    );
  }, [mine, shownLane]);

  const shopRows = useMemo(
    () => filterOrders(shopOrders, shopFilter),
    [shopOrders, shopFilter],
  );

  /* ---- which kind opens ----
     The one that most needs the cook: an unpaid-decision order beats a
     parcel waiting to be packed beats a plate. A tap pins the choice. */
  const autoKind =
    counts.new > 0
      ? 'menu'
      : shopNeeds > 0
        ? 'shop'
        : mealOpen > 0
          ? 'meals'
          : 'menu';
  const shownKind = kind ?? autoKind;

  const kindItems = KINDS.map((k) => ({
    ...k,
    count:
      k.key === 'menu'
        ? counts.new
        : k.key === 'shop'
          ? shopNeeds
          : mealOpen,
  }));

  const subtitle =
    shownKind === 'menu'
      ? counts.new
        ? t(
            counts.new === 1
              ? '{n} order waiting to be accepted.'
              : '{n} orders waiting to be accepted.',
            { n: n(counts.new) },
          )
        : counts.cooking || counts.delivering
          ? t('{c} cooking, {d} out for delivery.', {
              c: n(counts.cooking),
              d: n(counts.delivering),
            })
          : t('Nothing in the kitchen right now.')
      : shownKind === 'shop'
        ? shopNeeds
          ? t('{n} orders need you — answer or pack them.', { n: n(shopNeeds) })
          : shopOrders.length
            ? t('Shop orders are moving. Nothing is stuck.')
            : t('No shop orders yet.')
        : mealOpen
          ? t('{n} plates to hand over on {date}.', {
              n: n(mealOpen),
              date: dateLabel(mealDate),
            })
          : t('No plates booked for {date}.', { date: dateLabel(mealDate) });

  return (
    <CookScreen>
      <Container>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SectionHeader
              lead={t('Order')}
              accent={t('Board')}
              subtitle={subtitle}
              style={{ marginBottom: 18 }}
            />
          </View>

          <Cloche />
        </View>

        {/* ---- the three kinds ---- */}
        <Segmented items={kindItems} value={shownKind} onChange={setKind} />

        {/* ---- per-kind sub-control ---- */}
        {shownKind === 'menu' ? (
          <View style={{ marginTop: 12 }}>
            <Segmented
              items={LANES.map((l) => ({ key: l.key, label: l.label, count: counts[l.key], badgeless: l.key === 'history' }))}
              value={shownLane}
              onChange={setLane}
            />
          </View>
        ) : null}

        {shownKind === 'shop' ? (
          <View style={{ marginTop: 12 }}>
            <Segmented
              items={ORDER_FILTERS.filter((f) =>
                ['all', 'pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered'].includes(f.key),
              ).map((f) => ({ key: f.key, label: f.label, count: filterOrders(shopOrders, f.key).length }))}
              value={shopFilter}
              onChange={setShopFilter}
              scroll
            />
          </View>
        ) : null}

        {shownKind === 'meals' ? (
          <View style={{ marginTop: 12 }}>
            {meals?.week?.length ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {meals.week.map((day) => {
                  const on = day.date === mealDate;
                  return (
                    <Pressable
                      key={day.date}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={t('{date}, {n} plates', {
                        date: dateLabel(day.date),
                        n: n(day.count),
                      })}
                      onPress={() => setMealDate(day.date)}
                      style={({ pressed }) => ({
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: 8,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: on ? colors.sage : colors.line,
                        backgroundColor: on ? colors.sage50 : colors.sunken,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Text style={{ fontFamily: font.ui, fontSize: 10.5, color: colors.textMuted }}>
                        {dayParts(day.date).weekday}
                      </Text>
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 14,
                          marginTop: 1,
                          color: on ? colors.sage : colors.text,
                        }}
                      >
                        {n(dayParts(day.date).day)}
                      </Text>
                      <Text
                        style={{
                          fontFamily: font.ui,
                          fontSize: 10.5,
                          marginTop: 2,
                          color: day.count ? colors.primary : colors.textMuted,
                        }}
                      >
                        {day.count ? n(day.count) : '·'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </Container>

      <Container style={{ marginTop: 18 }}>
        {/* ---- menu ---- */}
        {shownKind === 'menu' ? (
          menuRows.length ? (
            <View style={{ gap: 14 }}>
              {menuRows.map((order, i) => (
                <Reveal key={order.id} delay={(i % 5) + 1}>
                  <OrderCard order={order} onOpen={() => router.push(`/cook/order/${order.id}`)} />
                </Reveal>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="pot"
              title={t('No menu orders')}
              body={
                counts.new
                  ? t('Try another lane.')
                  : kitchen?.isOpen
                    ? t('Your kitchen is open. New orders land here first.')
                    : t('Your kitchen is closed, so nothing can come in.')
              }
            />
          )
        ) : null}

        {/* ---- shop ---- */}
        {shownKind === 'shop' ? (
          !store ? (
            <EmptyState
              icon="box"
              title={t('You have not opened a shop yet')}
              body={t('A shop sells the things you make to keep. Open one and its orders land here.')}
            />
          ) : shopRows.length ? (
            <View style={{ gap: 12 }}>
              {shopRows.map((order, i) => (
                <Reveal key={order.id} delay={(i % 5) + 1}>
                  <ShopCard
                    order={order}
                    onAdvance={() => advanceShop(order.id)}
                    onAnswer={(answer) => answerPreorder(order, answer)}
                  />
                </Reveal>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="box"
              title={shopOrders.length ? t('Nothing in this view') : t('No shop orders yet')}
              body={shopOrders.length ? t('Try another filter.') : t('When somebody buys from your shop it lands here.')}
            />
          )
        ) : null}

        {/* ---- meals ---- */}
        {shownKind === 'meals' ? (
          meals === null ? null : mealOrders.length ? (
            <View style={{ gap: 12 }}>
              {mealOrders.map((order, i) => (
                <Reveal key={order.id} delay={(i % 5) + 1}>
                  <MealPlate order={order} busy={busyMeal === order.id} onDeliver={() => deliverMeal(order)} />
                </Reveal>
              ))}
              <Button
                label={t('Open the cooking board')}
                variant="glass"
                block
                style={{ marginTop: 4 }}
                onPress={() => router.push('/cook/meals')}
              />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <EmptyState
                icon="pot"
                title={t('Nothing booked for this day')}
                body={t('Meals appear here when a customer books a month that includes this date.')}
              />
              {meals?.next ? (
                <Button
                  label={t('Next cooking day — {date}', { date: dateLabel(meals.next) })}
                  block
                  onPress={() => setMealDate(meals.next)}
                />
              ) : null}
            </View>
          )
        ) : null}
      </Container>
    </CookScreen>
  );
}

/* ------------------------------------------------------------------ *
 * the segmented control — kinds, lanes and shop filters share it
 * ------------------------------------------------------------------ */

function Segmented({ items, value, onChange, scroll = false }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  const Row = ({ item, active, prevActive }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => onChange(item.key)}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 9,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.sage : colors.surfaceSolid,
        borderWidth: scroll ? 1 : 0,
        borderColor: active ? colors.sage : colors.line,
        opacity: pressed && !active ? 0.6 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
        style={{
          fontFamily: font.uiBold,
          fontSize: 10.5,
          letterSpacing: 0.2,
          textTransform: 'uppercase',
          color: active ? '#FFFFFF' : colors.textMuted,
        }}
      >
        {t(item.label)}
      </Text>

      {item.count > 0 && !item.badgeless ? (
        <View
          style={{
            minWidth: 16,
            paddingHorizontal: 4,
            paddingVertical: 1,
            borderRadius: radius.pill,
            alignItems: 'center',
            backgroundColor: active ? 'rgba(255, 255, 255, 0.3)' : colors.primary50,
          }}
        >
          <Text
            maxFontSizeMultiplier={1.1}
            style={{
              fontFamily: font.uiBold,
              fontSize: 10,
              color: active ? '#FFFFFF' : colors.primary,
            }}
          >
            {n(item.count)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );

  if (scroll) {
    /* The shop's filters are an open-ended list in spirit — seven of them,
       too many for one pill row on a phone. */
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {items.map((item) => (
          <Row key={item.key} item={item} active={value === item.key} />
        ))}
      </ScrollView>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        padding: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceSolid,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      {items.map((item, i) => {
        const active = value === item.key;
        const prevActive = i > 0 && value === items[i - 1].key;
        return (
          <React.Fragment key={item.key}>
            {i > 0 ? (
              <View
                style={{
                  width: 1,
                  marginVertical: 7,
                  backgroundColor: active || prevActive ? 'transparent' : colors.line,
                }}
              />
            ) : null}
            <Row item={item} active={active} prevActive={prevActive} />
          </React.Fragment>
        );
      })}
    </View>
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
    await onAnswer(which);
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
        <Button small label={t(SHOP_NEXT[order.status])} block onPress={onAdvance} />
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
          onPress={onDeliver}
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
  const isNew = order.status === 'placed';
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
        onPress={onOpen}
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
      </Pressable>

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
              onPress={onOpen}
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
