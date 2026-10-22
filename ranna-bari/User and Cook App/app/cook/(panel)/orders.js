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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import SectionHeader from '../../../src/components/SectionHeader';
import Button from '../../../src/components/Button';
import { EmptyState, errorText } from '../../../src/components/MealBits';
import {
  Cloche,
  MemoMealPlate,
  MemoOrderCard,
  MemoShopCard,
} from '../../../src/components/OrderCards';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { cookPayout, isClosed, useOrders } from '../../../src/store/OrdersContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useSession } from '../../../src/store/SessionContext';
import { ORDER_FILTERS, filterOrders } from '../../../src/lib/storeLogic';
import { fetchMealOrders } from '../../../src/features/meal-plan/api';
import {
  dateLabel,
  dayParts,
  todayKey,
} from '../../../src/features/meal-plan/format';
import { useAlert } from '../../../src/components/Alert';
import { LoadMoreFooter } from '../../../src/lib/useInfinite';
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

/* SHOP_NEXT and MEAL_NEXT — what each kind's button says per stage — live
   with the cards that render them, in src/components/OrderCards. */

const KINDS = [
  { key: 'menu', label: 'Menu', icon: 'receipt' },
  { key: 'shop', label: 'Shop', icon: 'box' },
  { key: 'meals', label: 'Meals', icon: 'pot' },
];

/* How far along each kind is, as dots on a line. The maps collapse the
   statuses that mean the same posture on the pass — accepted and cooking
   are both "at the fire" — so one short line fits every kind. A status
   missing from a map is an ending (cancelled, rejected), and takes no
   line at all. */

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
  /* Pull-to-refresh — one gesture re-reads every kind. */
  const [refreshing, setRefreshing] = useState(false);
  /* History search + the window: the lane is unbounded, so it renders a
     sliding window and grows on demand rather than all at once. */
  const [query, setQuery] = useState('');
  const [historyLimit, setHistoryLimit] = useState(30);
  const { t, n } = useLang();
  /* Ids the board opened with — the "new while open" detector below
     compares against this. Declared beside the state it accompanies; the
     effect that reads it lives after `mine` is computed. */
  const seenRef = useRef(null);
  const [newCount, setNewCount] = useState(0);

  /* ---- menu ---- */
  const mine = ordersForKitchen(kitchen?.id);

  /* ---- new orders while the board is open ----
     The socket already re-reads the list live; this only notices. Ids seen
     on the first pass are the board's opening state, not news — anything
     placed after that raises the chip, and tapping it (or opening the New
     lane) settles it. Never auto-switches: yanking a cook out of the lane
     they chose is worse than a chip. */
  useEffect(() => {
    const placed = mine.filter((o) => o.status === 'placed');
    if (seenRef.current === null) {
      seenRef.current = new Set(placed.map((o) => String(o.id)));
      return;
    }
    const fresh = placed.filter((o) => !seenRef.current.has(String(o.id))).length;
    setNewCount(fresh);
    for (const o of placed) seenRef.current.add(String(o.id));
  }, [mine]);

  const counts = useMemo(() => {
    const out = {};
    for (const l of LANES) out[l.key] = mine.filter((o) => l.match(o.status)).length;
    return out;
  }, [mine]);

  /* ---- shop ----
     Every shop this kitchen owns — the board folds their orders into one
     queue, since a cook answering a pre-order does not care which storefront
     it walked in through. */
  const shopOrders = useMemo(
    () =>
      (kitchen ? shop.myStores(kitchen.id) : []).flatMap((s) => shop.storeOrders(s.id)),
    [shop, kitchen],
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

  const advanceShop = useCallback(
    async (orderId) => {
      const out = await shop.advanceOrder(orderId);
      if (!out.ok) alert.error(errorText(out.error, t, n, out));
    },
    [shop, alert, t, n],
  );

  /* A pre-order is a decision, and the board carries it: the same two
     answers the pre-order queue gives, with the same words back. The card
     hands up `(answer, orderId)` — a stable signature, so a memoised card
     does not re-render because its handler was rebuilt around it. */
  const answerPreorder = useCallback(
    async (answer, orderId) => {
      const order = shopOrders.find((o) => String(o.id) === String(orderId));
      const out =
        answer === 'accept'
          ? await shop.acceptPreorder(orderId)
          : await shop.rejectPreorder(orderId, 'Declined by the kitchen');
      if (!out.ok) return alert.error(errorText(out.error, t, n, out));
      alert.success(
        answer === 'accept'
          ? t('Accepted. {customer} has been told.', {
              customer: order?.customerName ?? '',
            })
          : t('Declined. ৳{n} went back to {customer}.', {
              n: n(out.result),
              customer: order?.customerName ?? '',
            }),
      );
    },
    [shopOrders, shop, alert, t, n],
  );

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

  const deliverMeal = useCallback(
    async (orderId) => {
      setBusyMeal(orderId);
      const out = await advanceOrder(orderId);
      setBusyMeal(null);
      if (out && out.ok === false) {
        alert.error(out.message ?? t('That did not work.'), t('Not updated'));
        return;
      }
      loadMeals();
    },
    [advanceOrder, alert, t, loadMeals],
  );

  /* Opening a card is the one action every row shares, so the handler is
     stable too — a memoised card re-renders for order changes only. */
  const openOrder = useCallback(
    (orderId) => router.push(`/cook/order/${orderId}`),
    [router],
  );

  /* ---- menu lanes (as before) ----
     Open on the lane that has something in it — New still wins whenever
     anything is actually waiting. A tap pins the choice. */
  const shownLane = lane ?? (LANES.find((l) => counts[l.key] > 0)?.key ?? 'new');

  /* History searched + windowed separately from the working lanes: the
     lane is unbounded, so it renders a sliding window that grows on
     demand, and the search narrows the whole set before the window cuts. */
  const historySearched = useMemo(() => {
    let list = mine.filter((o) => isClosed(o.status));
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (o) =>
          (o.code ?? '').toLowerCase().includes(q) ||
          (o.contact?.name ?? '').toLowerCase().includes(q) ||
          (o.items ?? []).some((it) => (it.name ?? '').toLowerCase().includes(q)),
      );
    }
    return list;
  }, [mine, query]);

  const menuRows = useMemo(() => {
    if (shownLane === 'history') return historySearched.slice(0, historyLimit);
    const active = LANES.find((l) => l.key === shownLane);
    /* Work lanes put the longest wait first -- that is the one going cold. */
    return mine
      .filter((o) => active.match(o.status))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [mine, shownLane, historySearched, historyLimit]);

  const historyHasMore = historySearched.length > historyLimit;

  /* The lane's money — what the visible queue is worth at the cook's rate.
     A count says how many; the taka says whether any of it is worth
     staying late for. */
  const laneMoney = useMemo(() => {
    const active = LANES.find((l) => l.key === shownLane);
    return mine
      .filter((o) => active.match(o.status))
      .reduce((sum, o) => sum + cookPayout(o), 0);
  }, [mine, shownLane]);

  /* ---- pull-to-refresh ----
     One gesture re-reads everything the board draws: orders, shops, meals. */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([shop.refresh(), loadMeals()]);
    setRefreshing(false);
  }, [shop, loadMeals]);

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

  /* A quiet board is worth saying out loud: nothing in any of the three
     kinds needs the cook right now. History lanes don't count — settled
     work is not work. */
  const boardQuiet =
    !counts.new && !counts.cooking && !counts.delivering && !shopNeeds && !mealOpen;

  return (
    <CookScreen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.sage}
          colors={[colors.sage]}
        />
      }
    >
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

        {/* ---- new orders while the board is open ----
            A chip, not an auto-switch: the cook chose this lane, and a
            board that yanks them around teaches them not to trust it. */}
        {newCount > 0 && !(shownKind === 'menu' && shownLane === 'new') ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('{n} new orders — view now', { n: n(newCount) })}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setKind('menu');
              setLane('new');
              setNewCount(0);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 12,
              paddingVertical: 11,
              borderRadius: radius.pill,
              backgroundColor: pressed ? colors.primary50 : colors.primary,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Icon name="sparkles" size={14} color="#FFFFFF" strokeWidth={2.4} />
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: type.sm,
                color: '#FFFFFF',
              }}
            >
              {t('{n} new orders — view now', { n: n(newCount) })}
            </Text>
          </Pressable>
        ) : null}

        {/* ---- the three kinds ---- */}
        <View style={{ marginTop: 12 }}>
          <Segmented items={kindItems} value={shownKind} onChange={setKind} />
        </View>

        {/* ---- per-kind sub-control ---- */}
        {shownKind === 'menu' ? (
          <View style={{ marginTop: 12 }}>
            <Segmented
              items={LANES.map((l) => ({ key: l.key, label: l.label, count: counts[l.key], badgeless: l.key === 'history' }))}
              value={shownLane}
              onChange={setLane}
            />

            {/* The lane's worth — a count says how many, the taka says
                whether any of it is worth staying late for. */}
            <Text
              style={{
                marginTop: 8,
                fontFamily: font.uiSemi,
                fontSize: type.xs,
                color: colors.textMuted,
              }}
            >
              {t('This lane is worth ৳{n} to you.', { n: n(laneMoney) })}
            </Text>

            {/* History search — code, customer, or a dish on the line. */}
            {shownLane === 'history' ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: radius.pill,
                  backgroundColor: colors.sunken,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Icon name="search" size={14} color={colors.textLight} strokeWidth={2.2} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('Search code, customer or dish')}
                  placeholderTextColor={colors.textLight}
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    fontFamily: font.ui,
                    fontSize: type.sm,
                    color: colors.text,
                    paddingVertical: 0,
                  }}
                />
                {query ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Cancel')}
                    onPress={() => setQuery('')}
                    hitSlop={8}
                  >
                    <Icon name="x" size={14} color={colors.textLight} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
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
                      {/* You-are-here mark: with seven boxes of numbers,
                          the eye needs one that is not a number. */}
                      <View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          marginTop: 3,
                          backgroundColor:
                            day.date === todayKey() ? colors.saffron : 'transparent',
                        }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </Container>

      <Container style={{ marginTop: 18 }}>
        {/* ---- menu ----
            Memoised cards, no per-row entrance animation: the Screen's own
            entrance covers the swap, and a lane switch repaints instantly
            instead of replaying thirty fades. History grows two ways — the
            local window by button, then the server's older pages by the
            footer once the window has shown everything the context holds. */}
        {shownKind === 'menu' ? (
          menuRows.length ? (
            <View style={{ gap: 12 }}>
              {menuRows.map((order) => (
                <MemoOrderCard key={String(order.id)} order={order} onOpen={openOrder} />
              ))}
              {shownLane === 'history' && historyHasMore ? (
                <Button
                  variant="glass"
                  block
                  icon="chevronDown"
                  label={t('Show 30 more')}
                  onPress={() => setHistoryLimit((l) => l + 30)}
                />
              ) : null}
              {shownLane === 'history' && !historyHasMore ? (
                <HistoryFromServer />
              ) : null}
            </View>
          ) : (
            <EmptyState
              icon={boardQuiet ? 'sparkles' : 'pot'}
              title={boardQuiet ? t('All done.') : t('No menu orders')}
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
          !(kitchen && shop.myStores(kitchen.id).length) ? (
            <EmptyState
              icon="box"
              title={t('You have not opened a shop yet')}
              body={t('A shop sells the things you make to keep. Open one and its orders land here.')}
            />
          ) : shopRows.length ? (
            <View style={{ gap: 12 }}>
              {shopRows.map((order) => (
                <MemoShopCard
                  key={String(order.id)}
                  order={order}
                  onAdvance={advanceShop}
                  onAnswer={answerPreorder}
                />
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
              {mealOrders.map((order) => (
                <MemoMealPlate
                  key={String(order.id)}
                  order={order}
                  busy={busyMeal === order.id}
                  onDeliver={deliverMeal}
                />
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
 * the segmented control
 *
 * Kinds and lanes get a sunken track with a thumb that slides under the
 * labels — the selection is a moving surface rather than a repaint, so
 * the eye follows it to the new count. The shop's filters stay chips:
 * seven of them is an open-ended row, not a switch.
 * ------------------------------------------------------------------ */

function Segmented({ items, value, onChange, scroll = false }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  /* Hooks come before the chip branch — the branch is about pixels, not
     about whether the component animates. */
  const index = Math.max(
    0,
    items.findIndex((i) => i.key === value),
  );
  const reduced = useReducedMotion();
  const at = useSharedValue(index);

  useEffect(() => {
    at.value = reduced
      ? index
      : withTiming(index, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [at, index, reduced]);

  /* The thumb is `100/n %` wide, so translating by its own width per step
     lands it exactly on each slot — no measuring, no onLayout. */
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: `${at.value * 100}%` }],
  }));

  if (scroll) {
    /* The shop's filters are an open-ended list in spirit — seven of them,
       too many for one pill row on a phone. */
    const Chip = ({ item, active }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => {
          if (!active) Haptics.selectionAsync().catch(() => {});
          onChange(item.key);
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          paddingVertical: 9,
          paddingHorizontal: 10,
          borderRadius: radius.pill,
          backgroundColor: active ? colors.sage : colors.surfaceSolid,
          borderWidth: 1,
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

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {items.map((item) => (
          <Chip key={item.key} item={item} active={value === item.key} />
        ))}
      </ScrollView>
    );
  }

  return (
    <View
      style={{
        padding: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.sunken,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        <Animated.View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${100 / Math.max(items.length, 1)}%`,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceSolid,
            },
            thumb,
            shadow.xs,
          ]}
        />
        {items.map((item) => {
          const active = value === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (!active) Haptics.selectionAsync().catch(() => {});
                onChange(item.key);
              }}
              style={({ pressed }) => ({
                flexGrow: 1,
                flexBasis: 0,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                paddingVertical: 9,
                paddingHorizontal: 6,
                opacity: pressed && !active ? 0.6 : 1,
              })}
            >
              {item.icon ? (
                <Icon
                  name={item.icon}
                  size={13}
                  color={active ? colors.primary : colors.textMuted}
                  strokeWidth={2.2}
                />
              ) : null}
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 10.5,
                  letterSpacing: 0.2,
                  textTransform: 'uppercase',
                  color: active ? colors.text : colors.textMuted,
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
                    backgroundColor: colors.primary50,
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1.1}
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 10,
                      color: colors.primary,
                    }}
                  >
                    {n(item.count)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * History past what the context holds — the server's older pages.
 *
 * The board reads orders out of `CommerceContext`, which loads one page
 * (fifty). History can reach further back than that, so once the local
 * window has shown everything the context holds, this footer asks the
 * server for the next page — appending into the context, so the board,
 * the customer list and every count agree about what exists.
 */
function HistoryFromServer() {
  const { loadMoreOrders, ordersCursor } = useCommerce();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const out = await loadMoreOrders();
    setLoading(false);
    if (out?.more === false) setDone(true);
  }, [loadMoreOrders]);

  return (
    <LoadMoreFooter onLoad={load} loading={loading} exhausted={done || ordersCursor === null} />
  );
}
