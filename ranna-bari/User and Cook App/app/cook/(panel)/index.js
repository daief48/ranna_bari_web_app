import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import NextUp from '../../../src/components/NextUp';
import { BentoBox, IconTile } from '../../../src/components/Surfaces';
import { ActionRow, RowHeading, StatTile } from '../../../src/components/CookBits';
import { Body, Heading, Price } from '../../../src/components/Typography';
import {
  AreaTrend,
  BarList,
  CountUp,
  DonutChart,
  Gauge,
  MiniWeek,
  SegmentedBar,
  Sparkline,
  StackedWeekBars,
  TrendBars,
  setChartNumerals,
} from '../../../src/components/CookCharts';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useAction } from '../../../src/components/Alert';
import { cookPayout, isClosed, timeAgo, useOrders } from '../../../src/store/OrdersContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useChat } from '../../../src/store/ChatContext';
import { useCookReviews } from '../../../src/data/cook';
import { useSession } from '../../../src/store/SessionContext';
import {
  fetchMealOrders,
  fetchMyPlan,
  fetchMyService,
} from '../../../src/features/meal-plan/api';
import {
  countMeals,
  dateLabel,
  dayParts,
  spreadMonth,
  todayKey,
} from '../../../src/features/meal-plan/format';
import { useLang } from '../../../src/i18n/LanguageContext';

/**
 * How long an order may sit at one step before it is worth saying so.
 *
 * Not an SLA — the platform makes no promise about it. It is the point at
 * which a cook who has genuinely forgotten an order and a cook who is simply
 * busy stop looking the same on this screen, and the only cost of being wrong
 * is a nudge somebody ignores.
 */
const LATE_WAITING_MS = 10 * 60 * 1000;
const LATE_IN_PASS_MS = 45 * 60 * 1000;

const DAY = 86_400_000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** When this order last did anything, which is what "late" is measured from. */
const lastMovedAt = (order) => {
  const history = Array.isArray(order?.history) ? order.history : [];
  const last = history.length ? history[history.length - 1]?.at : null;
  return new Date(last ?? order?.createdAt ?? Date.now()).getTime();
};

const isToday = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
};

/** Midnight at the start of the day `back` days ago — the buckets the week reads into. */
const dayStart = (back = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() - back * DAY;
};

export default function CookDashboard() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { kitchen, toggleOpen, liveDishes, loaded } = useKitchen();
  const { ordersForKitchen, advanceOrder, hydrated: ordersLoaded } = useOrders();
  const meals = useCommerce();
  const { t, n, lang } = useLang();
  /* The charts read digits through the same numerals the rest of the screen
     uses — Bengali digits in Bengali, Latin in English — set here rather
     than threaded through every chart prop. */
  setChartNumerals(n);
  const { token } = useSession();
  /* Every write below reports what happened. */
  const run = useAction();
  /* The words behind the score, for the latest-review card. Loaded only here
     and on the two screens that need them — see `data/cook`. */
  const { reviews } = useCookReviews();
  /* The inbox already renders a cook's side — it greets them with "Your
     customers, and our support desk." It simply had no door into it from
     this panel, so a customer writing about an order reached nobody. */
  const { pendingCount } = useChat();

  /* ---- the meal system's state, read the way the hub reads it ----
     The meal card below answers the same four questions the hub answers —
     is the service on, how much of the month is written, what today looks
     like — from the same endpoints, so the two can never disagree. */
  const [mealService, setMealService] = useState(undefined);
  const [mealPlan, setMealPlan] = useState(null);
  const [mealBoard, setMealBoard] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return undefined;
      let alive = true;

      Promise.all([
        fetchMyService(token),
        fetchMyPlan(token),
        fetchMealOrders(token, todayKey()),
      ]).then(([svc, cal, day]) => {
        if (!alive) return;
        setMealService(svc.ok ? svc.result.service : null);
        setMealPlan(cal.ok ? cal.result : null);
        setMealBoard(day.ok ? day.result : null);
      });

      return () => {
        alive = false;
      };
    }, [token]),
  );

  /* The month's effective menu — the cook's own plan when there is one, the
     platform's underneath when there is not — and how much of it is written. */
  const mealMonthDays = useMemo(() => {
    if (!mealPlan) return [];
    const source = mealPlan.cookPlan?.days?.length
      ? mealPlan.cookPlan
      : mealPlan.systemPlan
        ? mealPlan.systemPlan
        : null;
    return source ? spreadMonth(source.month, source.days) : [];
  }, [mealPlan]);
  const mealsWritten = countMeals(mealMonthDays);
  const mealLive = mealPlan
    ? !!(mealPlan.cookPlan?.status === 'published' || mealPlan.systemPlan)
    : null;

  const mealBoardOrders = mealBoard?.orders ?? [];
  const mealPlatesToday = mealBoardOrders.length;
  const mealPlatesDone = mealBoardOrders.filter(
    (o) => o.status === 'delivered' || o.status === 'completed',
  ).length;

  /* The shop side of the account — every shop this kitchen owns, since one
     cook can run several. The card below aggregates them: one shutter row is
     a per-shop fact, but pre-orders and stock are summed, because three
     storefronts waiting on an answer is one number to a busy cook. */
  const myShops = kitchen ? meals.myStores(kitchen.id) : [];
  const shopStore = myShops[0] ?? null;
  const closedShops = myShops.filter((s) => !s.isOpen).length;
  /* A shop that exists and is shut. Distinct from having no shop at all, and
     the more urgent of the two: the cook has already done the work of
     stocking it, and none of it is reachable. */
  const shopClosed = myShops.length > 0 && closedShops === myShops.length;
  const waitingPreorders = kitchen ? meals.pendingPreorders(kitchen.id).length : 0;
  /*
   * Products a customer can see and cannot buy.
   *
   * Silent in a way a closed shop is not: the shop is open, the shelf looks
   * stocked from here, and the only screen that counted these was the shop
   * hub two taps away. A jar at zero earns nothing and nothing said so.
   * Summed across the shops, for the same reason the pre-orders are.
   */
  const outOfStock = myShops.reduce(
    (sum, s) => sum + (meals.storeOverview(s)?.outOfStock ?? 0),
    0,
  );

  /* Requests this kitchen could bid on and has not answered yet. */
  const openRequests = kitchen
    ? meals
        .requestsForCook(kitchen.id)
        .filter((r) => r.status === 'open' && !meals.offerForCook(r.id, kitchen.id))
        .length
    : 0;

  const mine = ordersForKitchen(kitchen?.id);

  const stats = useMemo(() => {
    const earned = mine
      .filter(
        (o) =>
          isToday(o.createdAt) &&
          (o.status === 'delivered' || o.status === 'completed'),
      )
      .reduce((s, o) => s + cookPayout(o), 0);

    return {
      earned,
      waiting: mine.filter((o) => o.status === 'placed').length,
      /*
       * The cook's share of what the platform is holding.
       *
       * "Earned today" was the only money on this screen, and it is the one a
       * cook asks about least — they know what they cooked. The question that
       * actually gets asked is where the rest of it is, and the answer is
       * here: earned, not yet released, because the customer has not
       * confirmed the food arrived. It was on the earnings tab and nowhere a
       * cook would think to look for it.
       */
      held: mine
        .filter((o) => o.payment === 'held')
        .reduce((s, o) => s + cookPayout(o), 0),
      /* Orders whose money is frozen by a case rather than by the ordinary
         wait. Both read `held`, which is why one of them needed saying. */
      disputed: mine.filter((o) => o.disputed).length,
    };
  }, [mine]);

  /*
   * Plates to cook — the number the tab badge carries, read the same way.
   *
   * Counted off meal orders rather than off a published calendar. Under the
   * monthly system a plate exists because somebody booked a month that
   * includes this date, so the confirmed bookings *are* the count. Drawing it
   * from the same source as the badge means the tile and the tab can never
   * disagree about how much cooking is waiting.
   */
  const platesToCook = kitchen
    ? meals.orders.filter(
        (o) =>
          String(o.kitchenId) === String(kitchen.id) &&
          o.status === 'confirmed' &&
          (o.kind === 'meal' || o.kind === undefined),
      ).length
    : 0;

  /* The queue on this screen is a prompt, not a list: the three oldest orders
     nobody has accepted yet. The full board lives one tab over. */
  const waiting = useMemo(
    () =>
      mine
        .filter((o) => o.status === 'placed')
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .slice(0, 3),
    [mine],
  );

  const inFlight = useMemo(
    () => mine.filter((o) => !isClosed(o.status) && o.status !== 'placed'),
    [mine],
  );

  /* ---- the week, both halves ----
     Seven buckets, oldest first, so the bars read left-to-right like a week.
     Orders of any kind count on the day they were placed; revenue waits for
     delivery, because a promise is not yet money. Each bucket keeps its own
     per-kind order count *and* per-kind revenue — the business-breakdown
     panels below draw every chart here from this one fold of one list, so
     no two charts on this screen can ever disagree. */
  const trend = useMemo(() => {
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const start = dayStart(6 - i);
      return {
        start,
        label: WEEKDAY[new Date(start).getDay()],
        count: 0,
        revenue: 0,
        dish: 0,
        store: 0,
        meal: 0,
        dishRev: 0,
        storeRev: 0,
        mealRev: 0,
      };
    });

    for (const o of mine) {
      if (o.status === 'rejected' || o.status === 'cancelled') continue;
      const at = new Date(o.createdAt).getTime();
      const idx = buckets.findIndex((b) => at >= b.start && at < b.start + DAY);
      if (idx < 0) continue;
      buckets[idx].count += 1;
      const isMeal = o.kind === 'meal';
      const isStore = o.kind === 'store';
      const kind = isMeal ? 'meal' : isStore ? 'store' : 'dish';
      buckets[idx][kind] += 1;
      if (o.status === 'delivered' || o.status === 'completed') {
        const pay = cookPayout(o);
        buckets[idx].revenue += pay;
        buckets[idx][`${kind}Rev`] += pay;
      }
    }

    return buckets;
  }, [mine]);

  const trendBusy = trend.some((b) => b.count > 0);

  /* ---- per-business week totals ----
     The breakdown panels' headline figures, folded from the same buckets. */
  const perBusiness = useMemo(
    () =>
      trend.reduce(
        (acc, b) => ({
          dish: { orders: acc.dish.orders + b.dish, revenue: acc.dish.revenue + b.dishRev },
          store: {
            orders: acc.store.orders + b.store,
            revenue: acc.store.revenue + b.storeRev,
          },
          meal: { orders: acc.meal.orders + b.meal, revenue: acc.meal.revenue + b.mealRev },
        }),
        {
          dish: { orders: 0, revenue: 0 },
          store: { orders: 0, revenue: 0 },
          meal: { orders: 0, revenue: 0 },
        },
      ),
    [trend],
  );

  /* ---- when orders arrive ----
     The week's orders by part of day — the prep-timing answer. A cook who
     knows the lunch spike starts at noon starts cooking at eleven; no
     other chart on this screen says anything about *when*. Six day-parts,
     anchored at 4am so a 2am order lands in "রাত" where it belongs. */
  const hourMix = useMemo(() => {
    const parts = [0, 0, 0, 0, 0, 0];
    const since = dayStart(6);
    for (const o of mine) {
      if (new Date(o.createdAt).getTime() < since) continue;
      if (o.status === 'rejected' || o.status === 'cancelled') continue;
      const h = new Date(o.createdAt).getHours();
      parts[Math.floor(((h - 4 + 24) % 24) / 4)] += 1;
    }
    return parts;
  }, [mine]);

  /* ---- week over week ----
     This week's orders against the seven before them, total and per
     business. The % badge is the one piece of context a raw count cannot
     carry: "23 orders" is a fact, "23, up 15%" is a verdict. Null means
     no baseline — a kitchen's second week has nothing to compare against,
     and the badge says nothing rather than claiming 100% growth.
     Current counts fold from `trend` (declared above), not from `weekMix`
     (declared below) — a dependency this early would be a use-before-init. */
  const wow = useMemo(() => {
    const prev = { dish: 0, store: 0, meal: 0 };
    const since = dayStart(13);
    const until = dayStart(6);
    for (const o of mine) {
      const at = new Date(o.createdAt).getTime();
      if (at < since || at >= until) continue;
      if (o.status === 'rejected' || o.status === 'cancelled') continue;
      if (o.kind === 'store') prev.store += 1;
      else if (o.kind === 'meal') prev.meal += 1;
      else prev.dish += 1;
    }
    const cur = trend.reduce(
      (acc, b) => ({
        dish: acc.dish + b.dish,
        store: acc.store + b.store,
        meal: acc.meal + b.meal,
      }),
      { dish: 0, store: 0, meal: 0 },
    );
    const pct = (now, before) =>
      before ? Math.round(((now - before) / before) * 100) : null;
    return {
      dish: pct(cur.dish, prev.dish),
      store: pct(cur.store, prev.store),
      meal: pct(cur.meal, prev.meal),
      all: pct(cur.dish + cur.store + cur.meal, prev.dish + prev.store + prev.meal),
    };
  }, [mine, trend]);

  /* ---- where this week's orders came from ----
     The donut's three slices. A kitchen that also runs a shop and a month
     of meals earns from three doors, and a single "orders this week" number
     quietly flattens them into one — the mix says which door is carrying
     the week, which is the part a cook can act on. */
  const weekMix = useMemo(
    () =>
      trend.reduce(
        (acc, b) => ({
          dish: acc.dish + b.dish,
          store: acc.store + b.store,
          meal: acc.meal + b.meal,
        }),
        { dish: 0, store: 0, meal: 0 },
      ),
    [trend],
  );

  /* ---- what actually sells, this week ----
     Folded straight off the order rows: a dish that sold twice reads "2",
     whatever the orders it travelled on looked like. */
  const topDishes = useMemo(() => {
    const counts = new Map();
    for (const o of mine) {
      if (new Date(o.createdAt).getTime() < dayStart(6)) continue;
      if (o.status === 'rejected' || o.status === 'cancelled') continue;
      for (const item of o.items ?? []) {
        if (!item?.name) continue;
        counts.set(item.name, (counts.get(item.name) ?? 0) + (item.qty ?? 1));
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [mine]);

  const latestReview = reviews[0] ?? null;

  /* ---- the shelf, in three states ----
     Every active product across the shops, sorted by what a customer can
     do with it: buy now, pre-order, or look at and sigh. The shop panel's
     SegmentedBar draws this — a shelf's shape says more than its size. */
  const shelf = useMemo(() => {
    let inStock = 0;
    let preorderable = 0;
    let out = 0;
    for (const s of myShops) {
      for (const p of meals.productsOf(s.id)) {
        if (!p.active) continue;
        if ((p.stock ?? 0) > 0) inStock += 1;
        else if (p.preorder) preorderable += 1;
        else out += 1;
      }
    }
    return { inStock, preorderable, out };
  }, [myShops, meals]);

  /* ---- what reviewers said, as a spread ----
     Five counts off the reviews the panel already holds. A 4.8 built from
     forty fives and a 4.8 built from one five and a shrinking tail are
     different kitchens; the mean alone cannot say which. */
  const reviewSpread = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of reviews) {
      const star = Math.round(Number(r.rating) || 0);
      if (star >= 1 && star <= 5) counts[star - 1] += 1;
    }
    return counts;
  }, [reviews]);
  const reviewTotal = reviews.length || kitchen?.reviewCount || 0;

  /* Orders the dashboard is nudging about: sitting unaccepted past the wait,
     or stalled mid-cook past theirs. NextUp renders the row; the count here
     is what decides there is a row at all. */
  const lateCount = useMemo(() => {
    const now = Date.now();
    return mine.filter((o) => {
      if (isClosed(o.status)) return false;
      const idle = now - lastMovedAt(o);
      return o.status === 'placed' ? idle > LATE_WAITING_MS : idle > LATE_IN_PASS_MS;
    }).length;
  }, [mine]);

  /* ---- today's pipeline ----
     Where today's orders physically stand, stage by stage. The waiting and
     in-pass lists below name the ones that need a hand; this bar says how
     the whole day is shaped — mostly done, stuck mid-kitchen, or still
     arriving. */
  const pipeline = useMemo(() => {
    const today = mine.filter(
      (o) =>
        isToday(o.createdAt) &&
        o.status !== 'rejected' &&
        o.status !== 'cancelled' &&
        (o.kind === 'cod' || o.kind === 'wallet' || o.kind === undefined),
    );
    return {
      placed: today.filter((o) => o.status === 'placed').length,
      cooking: today.filter(
        (o) => o.status === 'accepted' || o.status === 'cooking',
      ).length,
      delivering: today.filter((o) => o.status === 'on_the_way').length,
      done: today.filter((o) => o.status === 'delivered' || o.status === 'completed')
        .length,
    };
  }, [mine]);
  const pipelineTotal =
    pipeline.placed + pipeline.cooking + pipeline.delivering + pipeline.done;

  /* The shop card's second row: what the shelf holds and how much of it is
     mid-order — the two facts between "stocked" and "earning". */
  const shopProducts = myShops.reduce(
    (sum, s) => sum + meals.productsOf(s.id).length,
    0,
  );
  const shopActiveOrders = myShops.reduce(
    (sum, s) =>
      sum +
      meals
        .storeOrders(s.id)
        .filter(
          (o) => !['delivered', 'completed', 'cancelled', 'rejected'].includes(o.status),
        ).length,
    0,
  );

  if (!kitchen) {
    return (
      <CookScreen>
        <Container style={{ alignItems: 'center', gap: 18, paddingTop: 40 }}>
          <IconTile name="chefHat" variant="sage" large />
          {/*
            * Two different nothings, and they used to read as one.
            *
            * Nothing is cached any more, so every cold open passes through
            * here on the way to the server's answer — and "Setting up your
            * kitchen…" told a cook of three months that theirs was being
            * created. `loaded` is the difference: false means the answer has
            * not arrived, true means the answer was that there is none.
            */}
          <Heading size={20}>
            {loaded ? t('Setting up your kitchen…') : t('Loading your kitchen…')}
          </Heading>
        </Container>
      </CookScreen>
    );
  }

  const open = kitchen.isOpen;

  /* Greeted the way a kitchen is greeted, by the part of the day it is. */
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t('Good morning') : hour < 17 ? t('Good afternoon') : t('Good evening');
  const cookName = (kitchen.ownerName || kitchen.name || '').trim().split(' ')[0];

  /* One handler for the card and the button inside it, so the two controls
     can never drift into meaning different things. */
  const setShutter = () => {
    Haptics.selectionAsync().catch(() => {});
    /* Worth announcing: whether the kitchen is taking orders is the one thing
       a cook most needs to be sure of. */
    run(
      () => toggleOpen(),
      () => (kitchen?.isOpen ? t('Kitchen closed.') : t('Kitchen is open for orders.')),
    );
  };

  /* The shop card's own shutter — the first shop's, when there is exactly
     one. Several shops are steered to the hub, whose switcher can say which
     one a tap would flip; a card this small cannot. */
  const setShopShutter = () => {
    if (!shopStore) return;
    Haptics.selectionAsync().catch(() => {});
    run(
      () => meals.toggleStoreOpen(shopStore.id),
      () => (shopStore.isOpen ? t('Shop closed.') : t('Shop is open.')),
    );
  };

  /* The kitchen card counts only what the kitchen cooked — à la carte dish
     orders. Store and meal orders travel on the same kitchenId, so the raw
     count would put the shop's jars on the kitchen's card. */
  const kitchenOrdersToday = mine.filter(
    (o) =>
      isToday(o.createdAt) &&
      o.status !== 'rejected' &&
      o.status !== 'cancelled' &&
      (o.kind === 'cod' || o.kind === 'wallet' || o.kind === undefined),
  ).length;

  /* How verification reads as a tile: one line, one colour, one place to tap.
     Approved says so quietly — a green plaque is not worth a second glance —
     while pending and rejected are the two states a cook can act on. */
  const kyc = kitchen.kycStatus;
  const kycTile =
    kyc === 'approved'
      ? { icon: 'shieldCheck', tone: 'sage', label: t('Verified kitchen'), go: '/cook/profile' }
      : kyc === 'rejected'
        ? { icon: 'alertCircle', tone: 'primary', label: t('Verification failed'), go: '/cook-documents' }
        : { icon: 'clock', tone: 'saffron', label: t('Verification pending'), go: '/cook-documents' };

  return (
    <CookScreen>
      <Container>
        {/* ---- The header ----
            Who this is and what hour it is being looked at — and nothing
            else. The shutter lived here once, but the cook runs two
            businesses now and neither of them belongs to the greeting; the
            open/closed chip stays on the photograph as a readout, while the
            controls moved down to the cards that own them. */}
        <Reveal delay={0}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Your kitchen photos')}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push('/cook/kitchen');
            }}
            style={({ pressed }) => [
              {
                marginTop: 8,
                borderRadius: 28,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: pressed ? colors.primary200 : colors.line,
              },
              shadow.md,
            ]}
          >
            <View style={{ height: 158 }}>
              {/* A kitchen that has not uploaded a banner yet is the ordinary
                  state of a new one, and `{ uri: undefined }` renders a real
                  <img> with no src for it — a broken-image glyph rather than
                  the tinted panel underneath. `null` shows the panel. */}
              <Image
                source={kitchen.coverImage ? { uri: kitchen.coverImage } : null}
                contentFit="cover"
                transition={200}
                style={{ width: '100%', height: '100%', backgroundColor: colors.sunken }}
              />
              <LinearGradient
                colors={['transparent', `rgba(${colors.scrim}, 0.72)`]}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />

              {/* The one chip a cook looks for across the room: is the pass
                  taking orders right now. */}
              <View
                style={{
                  position: 'absolute',
                  top: 13,
                  left: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 4.5,
                  paddingHorizontal: 10,
                  borderRadius: radius.pill,
                  backgroundColor: open ? 'rgba(255, 255, 255, 0.16)' : 'rgba(16, 12, 10, 0.5)',
                  borderWidth: 1,
                  borderColor: open ? 'rgba(255, 255, 255, 0.35)' : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: open ? colors.sage : colors.textLight,
                  }}
                />
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 10,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    color: '#FFFFFF',
                  }}
                >
                  {open ? t('Open for orders') : t('Closed')}
                </Text>
              </View>

              <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
                <Text
                  style={{
                    fontFamily: font.displayItalic,
                    fontSize: 13.5,
                    color: '#F0A88F',
                  }}
                >
                  {greeting},
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: font.displayExtra,
                    fontSize: 24,
                    letterSpacing: -0.5,
                    color: '#FFF6F1',
                    marginTop: 1,
                  }}
                >
                  {t('{name}’s kitchen', { name: cookName })}
                </Text>
              </View>
            </View>
          </Pressable>
        </Reveal>

        {/*
         * The two businesses, stacked full width.
         *
         * A cook here runs two shops — the kitchen and the store — and they
         * are separate in every way that matters: separate shutters, separate
         * photographs, separate terms of delivery. Side-by-side half-cards
         * squeezed both into names that truncated and labels that cut off,
         * so each business now owns a full row: a tinted header that names
         * it and says where it stands, one band of the four numbers that
         * matter today, and the week's shape underneath. The switch still
         * belongs to its card alone; nothing here implies flipping one
         * flips both.
         */}
        <Reveal delay={1}>
          <RowHeading icon="home" title={t('Your businesses')} style={{ marginTop: 22 }} />
          <View style={{ gap: 12 }}>
            {/* ---- the kitchen ---- */}
            <View
              style={[
                {
                  borderRadius: 26,
                  overflow: 'hidden',
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
                shadow.sm,
              ]}
            >
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('Kitchen')}
                onPress={() => router.push('/cook/kitchen')}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 13,
                  backgroundColor: colors.sage50,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Image
                  source={kitchen.coverImage ? { uri: kitchen.coverImage } : null}
                  contentFit="cover"
                  transition={180}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 15,
                    backgroundColor: colors.sunken,
                    borderWidth: 2,
                    borderColor: colors.surfaceSolid,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.displayBold,
                      fontSize: 16.5,
                      letterSpacing: -0.2,
                      color: colors.text,
                    }}
                  >
                    {kitchen.name || t('Kitchen')}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {t('{area} · {state}', {
                      area: kitchen.area,
                      state: open ? t('Open for orders') : t('Closed'),
                    })}
                  </Text>
                </View>
                {/* This business's own shutter. A sibling of the numbers
                    below, never nested inside a tap that means something
                    else. */}
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: open }}
                  accessibilityLabel={open ? t('Close the kitchen') : t('Open the kitchen')}
                  onPress={setShutter}
                  hitSlop={6}
                  style={({ pressed }) => ({
                    width: 46,
                    height: 27,
                    borderRadius: 14,
                    padding: 3,
                    justifyContent: 'center',
                    alignItems: open ? 'flex-end' : 'flex-start',
                    backgroundColor: open ? colors.sage : colors.line,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: 11,
                      backgroundColor: colors.raised,
                    }}
                  />
                </Pressable>
              </Pressable>

              {/* One band, four numbers — the whole kitchen's working state
                  without opening a board. Each number opens its own door;
                  urgent ones are the only ones in colour. */}
              <StatBand
                items={[
                  {
                    value: kitchenOrdersToday,
                    label: t('Today'),
                    onPress: () => router.push('/cook/orders'),
                  },
                  {
                    value: stats.waiting,
                    label: t('Waiting'),
                    tone: stats.waiting ? colors.primary : null,
                    onPress: () => router.push('/cook/orders'),
                  },
                  {
                    value: inFlight.length,
                    label: t('In the pass'),
                    tone: inFlight.length ? colors.saffron : null,
                    onPress: () => router.push('/cook/orders'),
                  },
                  {
                    value: liveDishes.length,
                    label: t('Live dishes'),
                    onPress: () => router.push('/cook/menu'),
                  },
                ]}
              />

              {/* The week's shape — unlabelled axes, one glance answer:
                  is this week climbing. */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderTopWidth: 1,
                  borderTopColor: colors.line2,
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: 9,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: colors.textLight,
                  }}
                >
                  {t('Last 7 days')}
                </Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Sparkline values={trend.map((b) => b.dish)} color={colors.sage} />
                </View>
              </View>
            </View>

            {/* ---- the shop ----
                Rendered even when there is no shop yet — as an invitation
                shaped like the card it will become, so a new cook can see
                this account holds two businesses and the second one is one
                tap from existing. */}
            {shopStore ? (
              <View
                style={[
                  {
                    borderRadius: 26,
                    overflow: 'hidden',
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.sm,
                ]}
              >
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={shopStore.name || t('Shop')}
                  onPress={() =>
                    router.push({ pathname: '/cook/store', params: { shop: String(shopStore.id) } })
                  }
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 13,
                    backgroundColor: colors.saffron50,
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Image
                    source={
                      shopStore.cover || shopStore.logo
                        ? { uri: shopStore.cover || shopStore.logo }
                        : null
                    }
                    contentFit="cover"
                    transition={180}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 15,
                      backgroundColor: colors.sunken,
                      borderWidth: 2,
                      borderColor: colors.surfaceSolid,
                    }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 16.5,
                        letterSpacing: -0.2,
                        color: colors.text,
                      }}
                    >
                      {shopStore.name || t('Shop')}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {myShops.length > 1
                        ? t('{n} shops · {state}', {
                            n: n(myShops.length),
                            state: shopStore.isOpen ? t('Open') : t('Closed'),
                          })
                        : t('{area} · {state}', {
                            area: shopStore.area,
                            state: shopStore.isOpen ? t('Open for orders') : t('Closed'),
                          })}
                    </Text>
                  </View>
                  {myShops.length > 1 ? (
                    /* Several shops: one switch cannot say which shop it
                       flips, so the card hands over to the hub, whose
                       switcher can. */
                    <View
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: radius.pill,
                        backgroundColor: colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: colors.line,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 12,
                          color: colors.text,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {n(myShops.length)}
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: !!shopStore.isOpen }}
                      accessibilityLabel={
                        shopStore.isOpen ? t('Shop closed.') : t('Tap to open your shop')
                      }
                      onPress={setShopShutter}
                      hitSlop={6}
                      style={({ pressed }) => ({
                        width: 46,
                        height: 27,
                        borderRadius: 14,
                        padding: 3,
                        justifyContent: 'center',
                        alignItems: shopStore.isOpen ? 'flex-end' : 'flex-start',
                        backgroundColor: shopStore.isOpen ? colors.sage : colors.line,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 21,
                          height: 21,
                          borderRadius: 11,
                          backgroundColor: colors.raised,
                        }}
                      />
                    </Pressable>
                  )}
                </Pressable>

                <StatBand
                  items={[
                    {
                      value: waitingPreorders,
                      label: t('Pre-orders'),
                      tone: waitingPreorders ? colors.primary : null,
                      onPress: () =>
                        router.push({
                          pathname: '/cook/store/preorders',
                          params: { shop: String(shopStore.id) },
                        }),
                    },
                    {
                      value: outOfStock,
                      label: t('Out of stock'),
                      tone: outOfStock ? colors.saffron : null,
                      onPress: () =>
                        router.push({
                          pathname: '/cook/store/products',
                          params: { shop: String(shopStore.id) },
                        }),
                    },
                    {
                      value: shopActiveOrders,
                      label: t('Active orders'),
                      tone: shopActiveOrders ? colors.saffron : null,
                      onPress: () =>
                        router.push({
                          pathname: '/cook/store/orders',
                          params: { shop: String(shopStore.id) },
                        }),
                    },
                    {
                      value: shopProducts,
                      label: t('Products'),
                      onPress: () =>
                        router.push({
                          pathname: '/cook/store/products',
                          params: { shop: String(shopStore.id) },
                        }),
                    },
                  ]}
                />

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderTopWidth: 1,
                    borderTopColor: colors.line2,
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: 9,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      color: colors.textLight,
                    }}
                  >
                    {t('Last 7 days')}
                  </Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Sparkline values={trend.map((b) => b.store)} color={colors.saffron} />
                  </View>
                </View>
              </View>
            ) : (
              /* No shop yet — an invitation in the shape of the card it will
                 become: same width, same header rhythm, one line of what a
                 shop is for. A big empty dashed box read as a hole; this
                 reads as a door. */
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Open your shop')}
                onPress={() => router.push('/cook/store')}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  padding: 13,
                  borderRadius: 26,
                  borderStyle: 'dashed',
                  borderWidth: 1.5,
                  borderColor: pressed ? colors.saffron : colors.line,
                  backgroundColor: pressed ? colors.saffron50 : colors.surfaceSolid,
                })}
              >
                <IconTile
                  name="box"
                  variant="saffron"
                  style={{ width: 44, height: 44, borderRadius: 15 }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.displayBold,
                      fontSize: 16.5,
                      letterSpacing: -0.2,
                      color: colors.text,
                    }}
                  >
                    {t('Open your shop')}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {t('A second business — cakes, pitha, achar, anything that keeps')}
                  </Text>
                </View>
                <Icon name="chevronRight" size={17} color={colors.textLight} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        </Reveal>

        {/* ---- Right now ----
            What neither card counts: the month's plates and today's money —
            the shared halves of the two businesses. Orders and stock live on
            the cards above, where their shutters are. */}
        <Reveal delay={1}>
          <RowHeading icon="activity" title={t('Right now')} style={{ marginTop: 22 }} />
          {ordersLoaded ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Plates to cook')}
                onPress={() => router.push('/cook/meals')}
                style={{ flex: 1 }}
              >
                <StatTile
                  icon="pot"
                  value={n(platesToCook)}
                  label={t('Plates to cook')}
                  variant="sage"
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Earned today')}
                onPress={() => router.push('/cook/earnings')}
                style={{ flex: 1 }}
              >
                <StatTile
                  icon="banknote"
                  value={`৳${n(stats.earned)}`}
                  label={t('Earned today')}
                  variant="saffron"
                />
              </Pressable>
            </View>
          ) : (
            /* The board has not answered yet. Two tiles of dash would read
               as "no orders ever" for exactly as long as the request took;
               placeholders keep the shape without asserting anything. */
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pulse style={{ flex: 1, height: 118, borderRadius: 30 }} />
              <Pulse style={{ flex: 1, height: 118, borderRadius: 30 }} />
            </View>
          )}

          {/* ---- Money that is earned but not yours yet ----
              A strip rather than a third tile: the number on its own is
              alarming — a cook reads "৳2,340" beside "earned today" and
              wonders which one is real — and the sentence under it is the
              part that answers that. A tile has no room for a sentence. */}
          {stats.held > 0 ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('Held for you, {n} taka', { n: n(stats.held) })}
              onPress={() => router.push('/cook/earnings')}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  padding: 14,
                  marginTop: 12,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: pressed ? colors.saffron100 : colors.line,
                },
                shadow.sm,
              ]}
            >
              <IconTile
                name="clock"
                variant="saffron"
                style={{ width: 42, height: 42, borderRadius: 14 }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Price size={19}>৳{n(stats.held)}</Price>
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    lineHeight: 17,
                    color: colors.textMuted,
                  }}
                >
                  {/* A case is the one reason held money is not simply
                      waiting, and both states print the same word without
                      this. */}
                  {stats.disputed
                    ? t('Held for you · {n} under review, so it stays put for now', {
                        n: n(stats.disputed),
                      })
                    : t('Held for you · released when customers confirm delivery')}
                </Text>
              </View>
              <Icon name="chevronRight" size={17} color={colors.textLight} strokeWidth={2} />
            </Pressable>
          ) : null}

          {/* ---- Today's pipeline ----
              One bar, four stages. The lists further down name the orders
              that need a hand; this says how the whole day is shaped —
              mostly done, stuck mid-kitchen, or still arriving — without
              reading a single row. */}
          {pipelineTotal > 0 ? (
            <View
              style={[
                {
                  marginTop: 12,
                  padding: 16,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
                shadow.sm,
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: type.xs,
                    letterSpacing: type.xs * 0.09,
                    textTransform: 'uppercase',
                    color: colors.textMuted,
                  }}
                >
                  {t('Today’s pipeline')}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push('/cook/orders')}
                  hitSlop={8}
                >
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: type.xs,
                      color: colors.sage,
                    }}
                  >
                    {t('See all')}
                  </Text>
                </Pressable>
              </View>
              <SegmentedBar
                segments={[
                  {
                    label: t('New'),
                    value: pipeline.placed,
                    color: colors.primary,
                  },
                  {
                    label: t('Cooking'),
                    value: pipeline.cooking,
                    color: colors.saffron,
                  },
                  {
                    label: t('On the way'),
                    value: pipeline.delivering,
                    color: colors.geo,
                  },
                  {
                    label: t('Done'),
                    value: pipeline.done,
                    color: colors.sage,
                  },
                ]}
              />
            </View>
          ) : null}
        </Reveal>

        {/*
          * What is actually waiting on this cook — promoted to the top third
          * of the screen, where a busy cook stops scrolling.
          *
          * Every row is derived from real state and disappears the moment it
          * is done. Late orders lead: an order that has sat too long is the
          * one thing here that gets worse on its own.
          */}
        <NextUp
          style={{ marginTop: 20, marginBottom: 4 }}
          steps={[
            stats.disputed > 0 && {
              key: 'disputed',
              urgent: true,
              icon: 'alertCircle',
              tone: 'primary',
              title: t('{n} orders under review', { n: n(stats.disputed) }),
              sub: t('That money stays put until the case is settled'),
              onPress: () => router.push('/cook/orders'),
            },

            lateCount > 0 && {
              key: 'late',
              urgent: true,
              icon: 'clock',
              tone: 'primary',
              title: t('{n} orders have been waiting too long', { n: n(lateCount) }),
              sub: t('Somebody has been waiting on an answer'),
              onPress: () => router.push('/cook/orders'),
            },

            !open && {
              key: 'open',
              urgent: true,
              icon: 'flame',
              tone: 'sage',
              title: t('Open your kitchen'),
              sub: t('While it is closed you are off the map and nobody can order'),
              onPress: setShutter,
            },

            /* The two that make a kitchen worth opening at all. */
            liveDishes.length === 0 && {
              key: 'dish',
              urgent: true,
              icon: 'pot',
              tone: 'sage',
              title: t('Add your first dish'),
              sub: t('An open kitchen with an empty menu has nothing to sell'),
              onPress: () => router.push('/cook/dish/new'),
            },

            (kitchen.photos ?? []).length === 0 && {
              key: 'photos',
              icon: 'gem',
              tone: 'saffron',
              title: t('Add kitchen photos'),
              sub: t('People scroll past a kitchen they cannot see'),
              onPress: () => router.push('/cook/kitchen'),
            },

            waitingPreorders > 0 && {
              key: 'preorders',
              urgent: true,
              icon: 'box',
              tone: 'primary',
              title: t('Shop: {n} pre-orders to confirm', { n: n(waitingPreorders) }),
              sub: t('They are waiting on you before they can pay'),
              onPress: () => router.push('/cook/store'),
            },

            shopClosed &&
              (myShops.length > 1
                ? {
                    key: 'shop',
                    icon: 'cart',
                    tone: 'saffron',
                    title: t('All {n} shops are closed', { n: n(myShops.length) }),
                    sub: t('Everything you stocked is there and nobody can buy it'),
                    onPress: () => router.push('/cook/store'),
                  }
                : {
                    key: 'shop',
                    icon: 'cart',
                    tone: 'saffron',
                    title: t('Your shop is closed'),
                    sub: t('Everything you stocked is there and nobody can buy it'),
                    onPress: () => router.push('/cook/store'),
                  }),

            outOfStock > 0 && {
              key: 'stock',
              icon: 'box',
              tone: 'saffron',
              title: t('Shop: {n} products are out of stock', { n: n(outOfStock) }),
              sub: t('Customers can see them and cannot buy them'),
              onPress: () => router.push('/cook/store/products'),
            },

            openRequests > 0 && {
              key: 'requests',
              icon: 'chat',
              tone: 'sage',
              title: t('{n} people are asking for food', { n: n(openRequests) }),
              sub: t('Nobody has offered to cook it yet'),
              onPress: () => router.push('/cook/requests'),
            },
          ]}
        />

        {/* ---- Waiting on you ----
            An order nobody has accepted is the only thing in this app that
            gets worse the longer it is ignored, so it leads with the wait and
            the accept button sits on the card — a task that can be finished
            where it stands does not need a second entry pointing at a board. */}
        {waiting.length ? (
          <Reveal delay={3}>
            <View style={{ marginTop: 24 }}>
              <RowHeading
                icon="alertCircle"
                title={t('{n} waiting on you', { n: n(stats.waiting) })}
                action={t('See all')}
                onAction={() => router.push('/cook/orders')}
              />

              <View style={{ gap: 12 }}>
                {waiting.map((order) => (
                  <BentoBox key={order.id} style={{ padding: 16 }}>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`${t('Order')} ${order.id}`}
                      onPress={() => router.push(`/cook/order/${order.id}`)}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          marginBottom: 12,
                        }}
                      >
                        <View
                          style={{
                            paddingVertical: 4,
                            paddingHorizontal: 10,
                            borderRadius: radius.pill,
                            backgroundColor: colors.primary50,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: font.uiBold,
                              fontSize: 9.5,
                              letterSpacing: 0.7,
                              textTransform: 'uppercase',
                              color: colors.primary,
                            }}
                          >
                            {t('New')}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontFamily: font.ui,
                            fontSize: type.xs,
                            color: colors.textMuted,
                          }}
                        >
                          {timeAgo(order.createdAt, t, n)}
                        </Text>
                        <LateChip
                          since={lastMovedAt(order)}
                          after={LATE_WAITING_MS}
                          label={t('Waiting')}
                        />
                        <View style={{ flex: 1 }} />
                        <Price size={16}>৳{n(cookPayout(order))}</Price>
                      </View>

                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.displayBold,
                          fontSize: 16,
                          letterSpacing: -0.16,
                          color: colors.text,
                        }}
                      >
                        {order.contact?.name ?? t('A customer')}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={{
                          marginTop: 2,
                          fontFamily: font.ui,
                          fontSize: type.sm,
                          lineHeight: 20,
                          color: colors.textMuted,
                        }}
                      >
                        {order.items.map((it) => `${n(it.qty)}× ${it.name}`).join(', ')}
                      </Text>
                    </Pressable>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                      <Button
                        variant="glass"
                        label={t('Open')}
                        small
                        style={{ flex: 1 }}
                        onPress={() => router.push(`/cook/order/${order.id}`)}
                      />
                      <Button
                        label={t('Accept')}
                        icon="check"
                        small
                        style={{ flex: 1 }}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          run(() => advanceOrder(order.id));
                        }}
                      />
                    </View>
                  </BentoBox>
                ))}
              </View>
            </View>
          </Reveal>
        ) : null}

        {/* ---- In the pass ---- */}
        {inFlight.length ? (
          <Reveal delay={4}>
            <View style={{ marginTop: 28 }}>
              <RowHeading
                icon="pot"
                title={t('{n} in the pass', { n: n(inFlight.length) })}
                action={t('See all')}
                onAction={() => router.push('/cook/orders')}
              />
              <View style={{ gap: 10 }}>
                {inFlight.slice(0, 3).map((order) => (
                  <Pressable
                    key={order.id}
                    accessibilityRole="link"
                    accessibilityLabel={`${t('Order')} ${order.id}`}
                    onPress={() => router.push(`/cook/order/${order.id}`)}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        padding: 14,
                        borderRadius: radius.lg,
                        backgroundColor: colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: pressed ? colors.sage100 : colors.line,
                      },
                      shadow.sm,
                    ]}
                  >
                    <IconTile
                      name={order.status === 'on_the_way' ? 'delivery' : 'pot'}
                      variant="sage"
                      style={{ width: 42, height: 42, borderRadius: 14 }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{
                            flexShrink: 1,
                            fontFamily: font.uiSemi,
                            fontSize: 15,
                            color: colors.text,
                          }}
                        >
                          {order.contact?.name ?? order.id}
                        </Text>
                        <LateChip
                          since={lastMovedAt(order)}
                          after={LATE_IN_PASS_MS}
                          label={t('Stalled')}
                        />
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {order.status === 'on_the_way'
                          ? t('Out for delivery')
                          : order.status === 'cooking'
                            ? t('Cooking now')
                            : t('Accepted')}{' '}
                        · {timeAgo(order.createdAt, t, n)}
                      </Text>
                    </View>
                    <Icon
                      name="chevronRight"
                      size={17}
                      color={colors.textLight}
                      strokeWidth={2}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          </Reveal>
        ) : null}

        {/* ---- The week ----
            A gradient hero carries the headline — the week's earnings
            counting up over a curve of the seven days — then the same
            week cut three more ways: stacked bars (which business filled
            each day), the busy hours (when orders arrive), and the donut
            (what share each business took). Four readings, one fold. */}
        <Reveal delay={5}>
          <View style={{ marginTop: 28 }}>
            <RowHeading icon="activity" title={t('Last 7 days')} />
            {trendBusy ? (
              <>
                {/* ---- the hero ---- */}
                <LinearGradient
                  colors={[colors.heroFrom, colors.heroMid, colors.heroTo]}
                  start={{ x: 0.05, y: 0 }}
                  end={{ x: 0.95, y: 1 }}
                  style={[
                    {
                      borderRadius: 28,
                      padding: 20,
                      overflow: 'hidden',
                      marginBottom: 14,
                    },
                    shadow.md,
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.micro,
                      letterSpacing: type.micro * 0.09,
                      textTransform: 'uppercase',
                      color: 'rgba(255, 255, 255, 0.75)',
                    }}
                  >
                    {t('This week’s earnings')}
                  </Text>
                  <CountUp
                    value={perBusiness.dish.revenue + perBusiness.store.revenue + perBusiness.meal.revenue}
                    format={(x) => `৳${n(x)}`}
                    style={{
                      fontFamily: font.displayExtra,
                      fontSize: 40,
                      lineHeight: 46,
                      letterSpacing: -1.2,
                      color: colors.onHero,
                      fontVariant: ['tabular-nums'],
                      marginTop: 2,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      color: 'rgba(255, 255, 255, 0.85)',
                    }}
                  >
                    {t('{n} orders · {d} delivered money', {
                      n: n(weekMix.dish + weekMix.store + weekMix.meal),
                      d: n(trend.reduce((s, b) => s + b.count, 0)),
                    })}
                  </Text>

                  {/* The verdict on that count — up, down, or no baseline.
                      White-on-gradient variant of the breakdown badge. */}
                  {wow.all != null ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingVertical: 3.5,
                          paddingHorizontal: 9,
                          borderRadius: radius.pill,
                          backgroundColor: 'rgba(255, 255, 255, 0.18)',
                          borderWidth: 1,
                          borderColor: 'rgba(255, 255, 255, 0.28)',
                        }}
                      >
                        <Icon
                          name={wow.all === 0 ? 'minus' : 'arrowRight'}
                          size={11}
                          color="#FFFFFF"
                          strokeWidth={2.6}
                          style={{
                            transform: [
                              { rotate: wow.all === 0 ? '0deg' : wow.all > 0 ? '-90deg' : '90deg' },
                            ],
                          }}
                        />
                        <Text
                          style={{
                            fontFamily: font.uiBold,
                            fontSize: 11,
                            color: '#FFFFFF',
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {t('{pct}% vs last week', { pct: n(Math.abs(wow.all)) })}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* The week's curve, drawn white into the gradient —
                      rising or falling, it reads before any number does. */}
                  <View style={{ marginTop: 10, alignItems: 'center' }}>
                    <AreaTrend
                      values={trend.map((b) => b.revenue)}
                      width={300}
                      height={58}
                      color="#FFFFFF"
                      delay={250}
                    />
                  </View>
                </LinearGradient>

                {/* ---- stacked bars: what filled each day ---- */}
                <BentoBox style={{ padding: 20, marginBottom: 14 }}>
                  <StackedWeekBars
                    days={trend.map((b, i) => ({
                      key: b.start,
                      total: b.revenue,
                      label:
                        b.revenue >= 1000
                          ? `৳${n((b.revenue / 1000).toFixed(1))}k`
                          : `৳${n(b.revenue)}`,
                      segments: [
                        { value: b.dishRev, color: colors.sage },
                        { value: b.storeRev, color: colors.saffron },
                        { value: b.mealRev, color: colors.primary },
                      ],
                      day: t(b.label),
                      count: n(b.count),
                      today: i === trend.length - 1,
                    }))}
                  />
                  <Text
                    style={{
                      marginTop: 10,
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {t('Each bar is the day’s earnings, cut by business.')}
                  </Text>

                  {/* ---- busy hours ---- */}
                  <View
                    style={{
                      marginTop: 18,
                      paddingTop: 16,
                      borderTopWidth: 1,
                      borderTopColor: colors.line2,
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.displayBold,
                          fontSize: 15,
                          letterSpacing: -0.15,
                          color: colors.text,
                        }}
                      >
                        {t('When orders arrive')}
                      </Text>
                      <Text
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {t('Last 7 days, by part of day')}
                      </Text>
                    </View>
                    <TrendBars
                      values={hourMix}
                      letters={
                        lang === 'bn'
                          ? ['ভোর', 'সকাল', 'দুপুর', 'বিকাল', 'সন্ধ্যা', 'রাত']
                          : ['4-8', '8-12', '12-4', '4-8', '8-12', '12-4']
                      }
                      color={colors.primary}
                      height={44}
                      delay={150}
                    />
                  </View>

                  {/* ---- the donut: the week's share ---- */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 18,
                      marginTop: 18,
                      paddingTop: 18,
                      borderTopWidth: 1,
                      borderTopColor: colors.line2,
                    }}
                  >
                    <DonutChart
                      size={118}
                      thickness={14}
                      segments={[
                        { value: weekMix.dish, color: colors.sage },
                        { value: weekMix.store, color: colors.saffron },
                        { value: weekMix.meal, color: colors.primary },
                      ]}
                      centerValue={n(weekMix.dish + weekMix.store + weekMix.meal)}
                      centerLabel={t('orders')}
                    />
                    <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
                      <MixRow
                        color={colors.sage}
                        label={t('Menu dishes')}
                        value={weekMix.dish}
                        total={weekMix.dish + weekMix.store + weekMix.meal}
                        onPress={() => router.push('/cook/orders')}
                      />
                      <MixRow
                        color={colors.saffron}
                        label={t('Shop goods')}
                        value={weekMix.store}
                        total={weekMix.dish + weekMix.store + weekMix.meal}
                        onPress={() => router.push('/cook/store/orders')}
                      />
                      <MixRow
                        color={colors.primary}
                        label={t('Month’s plates')}
                        value={weekMix.meal}
                        total={weekMix.dish + weekMix.store + weekMix.meal}
                        onPress={() => router.push('/cook/meals')}
                      />
                    </View>
                  </View>
                </BentoBox>
              </>
            ) : (
              /* An empty week is a state, not a failure — say what would
                 fill it rather than drawing an axis of nothing. */
              <BentoBox style={{ padding: 20 }}>
                <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
                  <IconTile name="pot" variant="sage" />
                  <Body muted size={14} style={{ textAlign: 'center' }}>
                    {open
                      ? t('No orders this week yet. The day one arrives, this fills in.')
                      : t('No orders this week. Open the kitchen and they start coming.')}
                  </Body>
                </View>
              </BentoBox>
            )}
          </View>
        </Reveal>

        {/* ---- The week, business by business ----
            One panel per business, each with its own chart and its own
            money: the kitchen's orders with the star spread behind its
            score, the shops' shelf in three states, the month's plates on
            their calendar. Every number here folds from the same buckets
            as the charts above — these panels are the same week, cut
            three ways. */}
        <Reveal delay={5}>
          <View style={{ marginTop: 28 }}>
            <RowHeading icon="pie" title={t('Business breakdown')} />
            <View style={{ gap: 14 }}>

              {/* ---- kitchen: orders trend + the reviews behind the score ---- */}
              <BentoBox style={{ overflow: 'hidden' }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    backgroundColor: colors.sage50,
                  }}
                >
                  <IconTile
                    name="chefHat"
                    variant="sage"
                    style={{ width: 40, height: 40, borderRadius: 14 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 15.5,
                        letterSpacing: -0.16,
                        color: colors.text,
                      }}
                    >
                      {kitchen.name || t('Kitchen')}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {t('{n} orders this week', { n: n(perBusiness.dish.orders) })}
                    </Text>
                      <WoWBadge pct={wow.dish} style={{ alignSelf: 'flex-start', marginTop: 3 }} />
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <CountUp
                      value={perBusiness.dish.revenue}
                      format={(x) => `৳${n(x)}`}
                      style={{
                        fontFamily: font.uiBold,
                        fontSize: 19,
                        letterSpacing: -0.38,
                        color: colors.text,
                        fontVariant: ['tabular-nums'],
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 9,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        color: colors.textMuted,
                      }}
                    >
                      {t('earned')}
                    </Text>
                  </View>
                </View>

                <View style={{ padding: 14, paddingTop: 12 }}>
                  <TrendBars
                    values={trend.map((b) => b.dish)}
                    letters={trend.map((b) => t(b.label).charAt(0))}
                    color={colors.sage}
                  />

                  {/* The reviews behind the score — a mean hides whether it
                      is built on consensus or on one five and a tail; the
                      spread says which. Draws only when somebody has
                      actually written one. */}
                  {reviewTotal ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 16,
                        marginTop: 16,
                        paddingTop: 14,
                        borderTopWidth: 1,
                        borderTopColor: colors.line2,
                      }}
                    >
                      <View style={{ alignItems: 'center', gap: 3 }}>
                        <Text
                          style={{
                            fontFamily: font.displayExtra,
                            fontSize: 24,
                            letterSpacing: -0.5,
                            color: colors.text,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {kitchen.reviewCount
                            ? n(Number(kitchen.rating ?? 0).toFixed(1))
                            : '—'}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 1.5 }}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Icon
                              key={star}
                              name="star"
                              size={9}
                              color={
                                star <= Math.round(Number(kitchen.rating ?? 0))
                                  ? colors.saffron
                                  : colors.line
                              }
                              strokeWidth={2.4}
                            />
                          ))}
                        </View>
                        <Text
                          style={{
                            fontFamily: font.ui,
                            fontSize: 9.5,
                            color: colors.textMuted,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {n(reviewTotal)}
                        </Text>
                      </View>

                      <View style={{ flex: 1, gap: 3 }}>
                        {[5, 4, 3, 2, 1].map((star) => {
                          const count = reviewSpread[star - 1];
                          const pct = reviewTotal ? (count / reviewTotal) * 100 : 0;
                          return (
                            <View
                              key={star}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 7,
                              }}
                            >
                              <Text
                                style={{
                                  width: 8,
                                  fontFamily: font.uiSemi,
                                  fontSize: 9.5,
                                  color: colors.textMuted,
                                  fontVariant: ['tabular-nums'],
                                }}
                              >
                                {n(star)}
                              </Text>
                              <View
                                style={{
                                  flex: 1,
                                  height: 5,
                                  borderRadius: 3,
                                  backgroundColor: colors.sunken,
                                  overflow: 'hidden',
                                }}
                              >
                                <View
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    borderRadius: 3,
                                    backgroundColor:
                                      star <= 2 ? colors.primary : colors.sage,
                                  }}
                                />
                              </View>
                              <Text
                                style={{
                                  width: 16,
                                  textAlign: 'right',
                                  fontFamily: font.ui,
                                  fontSize: 9,
                                  color: colors.textLight,
                                  fontVariant: ['tabular-nums'],
                                }}
                              >
                                {count ? n(count) : ''}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              </BentoBox>

              {/* ---- shop: orders trend + the shelf in three states ---- */}
              <BentoBox style={{ overflow: 'hidden' }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    backgroundColor: colors.saffron50,
                  }}
                >
                  <IconTile
                    name="box"
                    variant="saffron"
                    style={{ width: 40, height: 40, borderRadius: 14 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 15.5,
                        letterSpacing: -0.16,
                        color: colors.text,
                      }}
                    >
                      {myShops.length > 1
                        ? t('{n} shops', { n: n(myShops.length) })
                        : shopStore?.name || t('Shop')}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {t('{n} orders this week', { n: n(perBusiness.store.orders) })}
                    </Text>
                      <WoWBadge pct={wow.store} style={{ alignSelf: 'flex-start', marginTop: 3 }} />
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <CountUp
                      value={perBusiness.store.revenue}
                      format={(x) => `৳${n(x)}`}
                      style={{
                        fontFamily: font.uiBold,
                        fontSize: 19,
                        letterSpacing: -0.38,
                        color: colors.text,
                        fontVariant: ['tabular-nums'],
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 9,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        color: colors.textMuted,
                      }}
                    >
                      {t('earned')}
                    </Text>
                  </View>
                </View>

                <View style={{ padding: 14, paddingTop: 12, gap: 14 }}>
                  <TrendBars
                    values={trend.map((b) => b.store)}
                    letters={trend.map((b) => t(b.label).charAt(0))}
                    color={colors.saffron}
                  />

                  {/* The shelf as one bar: buyable, pre-orderable, gone.
                      The proportions are the stocking decision — a bar that
                      is mostly grey is a restock list wearing a chart. */}
                  <View style={{ gap: 8 }}>
                    <SegmentedBar
                      height={10}
                      segments={[
                        {
                          label: t('In stock'),
                          value: shelf.inStock,
                          color: colors.sage,
                        },
                        {
                          label: t('Pre-order'),
                          value: shelf.preorderable,
                          color: colors.saffron,
                        },
                        {
                          label: t('Out'),
                          value: shelf.out,
                          color: colors.textLight,
                        },
                      ]}
                    />
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {t('{n} products on the shelves', {
                        n: n(shelf.inStock + shelf.preorderable + shelf.out),
                      })}
                    </Text>
                  </View>
                </View>
              </BentoBox>

              {/* ---- meals: bookings week + today's rail ----
                  Absorbs the old monthly panel — same facts, now beside
                  the other two businesses instead of on their own island. */}
              {mealService ? (
                <BentoBox style={{ overflow: 'hidden' }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 14,
                      backgroundColor: colors.primary50,
                    }}
                  >
                    <IconTile
                      name="pot"
                      variant="primary"
                      style={{ width: 40, height: 40, borderRadius: 14 }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.displayBold,
                          fontSize: 15.5,
                          letterSpacing: -0.16,
                          color: colors.text,
                        }}
                      >
                        {t('Monthly meals')}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {t('{n} orders this week', { n: n(perBusiness.meal.orders) })}
                      </Text>
                      <WoWBadge pct={wow.meal} style={{ alignSelf: 'flex-start', marginTop: 3 }} />
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <CountUp
                      value={perBusiness.meal.revenue}
                      format={(x) => `৳${n(x)}`}
                      style={{
                        fontFamily: font.uiBold,
                        fontSize: 19,
                        letterSpacing: -0.38,
                        color: colors.text,
                        fontVariant: ['tabular-nums'],
                      }}
                    />
                      <Text
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: 9,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          color: colors.textMuted,
                        }}
                      >
                        {t('earned')}
                      </Text>
                    </View>
                  </View>

                  <View style={{ padding: 14, paddingTop: 12, gap: 14 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: type.xs,
                          color: mealService.active ? colors.sage : colors.textMuted,
                        }}
                      >
                        {mealService.active
                          ? t('{label} · ৳{rate} a meal', {
                              label: t(mealService.categoryLabel || mealService.categoryKey),
                              rate: n(mealService.effectiveRate),
                            })
                          : t('Not offered')}
                      </Text>
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: type.xs,
                          color: colors.text,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {t('{n} meals set', { n: n(mealsWritten) })}
                      </Text>
                    </View>

                    {mealLive === false ? (
                      <Text
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.saffron,
                        }}
                      >
                        {t('No menu published for this month — bookings are closed.')}
                      </Text>
                    ) : null}

                    {mealBoard?.week?.length ? (
                      <MiniWeek
                        days={mealBoard.week.map((day) => ({
                          date: day.date,
                          weekday: dayParts(day.date).weekday,
                          day: n(dayParts(day.date).day),
                          count: day.count,
                        }))}
                        todayKey={todayKey()}
                      />
                    ) : null}

                    {/* Today as a ring — legible from across the room, which
                        is the reading a cook mid-service actually does. The
                        count and the next cooking day sit beside it. */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 16,
                      }}
                    >
                      <Gauge
                        value={mealPlatesDone}
                        total={mealPlatesToday}
                        color={
                          mealPlatesToday && mealPlatesDone === mealPlatesToday
                            ? colors.sage
                            : colors.saffron
                        }
                        label={t('handed over')}
                      />
                      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                        <Text
                          style={{
                            fontFamily: font.uiSemi,
                            fontSize: type.xs,
                            color: colors.textMuted,
                          }}
                        >
                          {t('Today’s plates')}
                        </Text>
                        <Text
                          style={{
                            fontFamily: font.uiBold,
                            fontSize: type.xs,
                            color: colors.text,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {mealPlatesToday
                            ? t('{done} of {total} handed over', {
                                done: n(mealPlatesDone),
                                total: n(mealPlatesToday),
                              })
                            : t('None booked')}
                        </Text>
                        {mealBoard?.next ? (
                          <Text
                            style={{
                              fontFamily: font.ui,
                              fontSize: type.xs,
                              color: colors.textMuted,
                            }}
                          >
                            {t('Next cooking day {date}', { date: dateLabel(mealBoard.next) })}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <Button
                      label={t('Open the hub')}
                      variant="glass"
                      small
                      onPress={() => router.push('/cook/meal-hub')}
                      style={{ alignSelf: 'flex-start' }}
                    />
                  </View>
                </BentoBox>
              ) : mealService === null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Monthly meals')}
                  onPress={() => router.push('/cook/meal-hub')}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 13,
                    padding: 14,
                    borderRadius: 26,
                    borderStyle: 'dashed',
                    borderWidth: 1.5,
                    borderColor: pressed ? colors.primary200 : colors.line,
                    backgroundColor: pressed ? colors.primary50 : colors.surfaceSolid,
                  })}
                >
                  <IconTile
                    name="pot"
                    variant="primary"
                    style={{ width: 40, height: 40, borderRadius: 14 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 15.5,
                        letterSpacing: -0.16,
                        color: colors.text,
                      }}
                    >
                      {t('Monthly meals')}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {t('Not started yet — set a category and a rate to open a month of cooking')}
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={16} color={colors.textLight} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </Reveal>

        {/* ---- What sells, and what was said about it ---- */}
        {(topDishes.length > 0 || latestReview) && (
          <Reveal delay={6}>
            <View style={{ marginTop: 28, flexDirection: 'row', gap: 12 }}>
              {/* Top dishes as a bar list — each dish fills against the
                  leader, so "what carries the week" is visible in the shape
                  before the numbers are read. Tapping a bar opens the menu
                  the dish lives on. */}
              {topDishes.length ? (
                <BentoBox style={{ flex: 1, padding: 16, gap: 14 }}>
                  <RowHeading icon="utensils" title={t('Top this week')} style={{ marginBottom: 0 }} />
                  <BarList
                    rows={topDishes.map(([name, count]) => ({
                      key: name,
                      label: name,
                      value: count,
                      count,
                      color: colors.sage,
                      onPress: () => router.push('/cook/menu'),
                    }))}
                  />
                </BentoBox>
              ) : null}

              {/* The newest thing a customer said, with the door to the rest. */}
              {latestReview ? (
                <BentoBox style={{ flex: 1, padding: 16, gap: 10 }}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <RowHeading
                      icon="star"
                      title={t('Latest review')}
                      style={{ marginBottom: 0, flex: 1 }}
                    />
                    <Stars value={latestReview.rating} />
                  </View>
                  <Text
                    numberOfLines={3}
                    style={{
                      fontFamily: font.ui,
                      fontSize: 13.5,
                      lineHeight: 20,
                      color: colors.text,
                    }}
                  >
                    {String(latestReview.text ?? '').trim() ||
                      t('Rated, with nothing written.')}
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push('/cook/reviews')}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: font.uiBold,
                        fontSize: type.xs,
                        color: colors.sage,
                      }}
                    >
                      {latestReview.name ?? t('A customer')}
                    </Text>
                    <Icon name="chevronRight" size={12} color={colors.sage} strokeWidth={2.4} />
                  </Pressable>
                </BentoBox>
              ) : null}
            </View>
          </Reveal>
        )}

        {/* ---- Quick actions ----
            The four things this screen used to bury in two lists of rows:
            the two adds, the money, and how verification stands. Nothing
            here is navigation for its own sake — each tile is the next act
            of running the kitchen. */}
        <Reveal delay={7}>
          <View style={{ marginTop: 28 }}>
            <RowHeading icon="sparkles" title={t('Quick actions')} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <QuickTile
                icon="plus"
                tone="primary"
                label={t('Add a dish')}
                sub={t('To your menu')}
                onPress={() => router.push('/cook/dish/new')}
              />
              <QuickTile
                icon="box"
                tone="saffron"
                label={t('Add a product')}
                sub={t('To your shop')}
                onPress={() => router.push('/cook/store/product/new')}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <QuickTile
                icon="banknote"
                tone="sage"
                label={t('Earnings')}
                sub={t('৳{n} released', { n: n(meals.wallet.cook) })}
                onPress={() => router.push('/cook/earnings')}
              />
              <QuickTile
                icon={kycTile.icon}
                tone={kycTile.tone}
                label={kycTile.label}
                sub={
                  kyc === 'approved'
                    ? t('Checked and listed')
                    : kyc === 'rejected'
                      ? (kitchen.kycNote || t('Send your documents again'))
                      : t('A check is running')
                }
                onPress={() => router.push(kycTile.go)}
              />
            </View>

            {/* Messages keep a row rather than a tile: the unread count is
                the state, and the door to it is one tap from wherever it is
                true. */}
            <ActionRow
              icon="chat"
              style={{ marginTop: 12 }}
              title={t('Messages')}
              sub={
                pendingCount
                  ? t('{n} unread', { n: n(pendingCount) })
                  : t('Questions about your orders')
              }
              onPress={() => router.push('/chat')}
            />
          </View>
        </Reveal>
      </Container>
    </CookScreen>
  );
}

/**
 * One quick action, as a tile rather than a row.
 *
 * A row list teaches scanning; a grid teaches acting. These four are acts —
 * add, check, look — so each carries one icon, one verb-sized label, and the
 * one value that makes it now (the balance, the KYC state) rather than a
 * description of what pressing it would do.
 */
function QuickTile({ icon, tone = 'sage', label, sub, onPress }) {
  const { colors, shadow } = useTheme();

  const tint = {
    sage: { bg: colors.sage50, fg: colors.sage, edge: colors.sage100 },
    saffron: { bg: colors.saffron50, fg: colors.saffron, edge: colors.saffron100 },
    primary: { bg: colors.primary50, fg: colors.primary, edge: colors.primary100 },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          padding: 14,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? tint.edge : colors.line,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        shadow.sm,
      ]}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint.bg,
          borderWidth: 1,
          borderColor: colors.line2,
          marginBottom: 10,
        }}
      >
        <Icon name={icon} size={18} color={tint.fg} />
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.displayBold,
          fontSize: 15,
          letterSpacing: -0.15,
          color: colors.text,
        }}
      >
        {label}
      </Text>
      {sub ? (
        <Text
          numberOfLines={1}
          style={{
            marginTop: 1,
            fontFamily: font.ui,
            fontSize: type.xs,
            color: colors.textMuted,
          }}
        >
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The week-over-week pill — "▲ 15%", "▼ 8%", "—" — tinted to the verdict.
 *
 * This is the one piece of context a raw order count cannot carry: a count
 * is a fact, the badge is the trend. Null (no baseline — the kitchen's
 * first or second week) renders nothing rather than a manufactured 0%.
 * Up is sage and down is vermilion, matching every other verdict colour
 * on this screen.
 */
function WoWBadge({ pct, style }) {
  const { colors } = useTheme();

  if (pct == null) return null;

  const flat = pct === 0;
  const up = pct > 0;
  const fg = flat ? colors.textMuted : up ? colors.sage : colors.primary;
  const bg = flat ? colors.sunken : up ? colors.sage50 : colors.primary50;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingVertical: 3,
          paddingHorizontal: 8,
          borderRadius: radius.pill,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      {/* The kit has no up/down arrows — a rotated arrowRight is the same
          glyph with the verdict's direction. */}
      <Icon
        name={flat ? 'minus' : 'arrowRight'}
        size={10}
        color={fg}
        strokeWidth={2.8}
        style={{ transform: [{ rotate: flat ? '0deg' : up ? '-90deg' : '90deg' }] }}
      />
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: 10.5,
          color: fg,
          fontVariant: ['tabular-nums'],
        }}
      >
        {t('{pct}% vs last week', { pct: n(Math.abs(pct)) })}
      </Text>
    </View>
  );
}

/**
 * One donut legend row — colour, name, count, share.
 *
 * A legend that only named the colours would make the reader do the
 * arithmetic against the ring; the count and the percent are the reading.
 * The whole row opens the board its slice was counted from.
 */
function MixRow({ color, label, value, total, onPress }) {
  const { colors } = useTheme();
  const pct = total ? Math.round((value / total) * 100) : 0;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${n(value)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: font.uiSemi,
          fontSize: 13,
          color: colors.text,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: 13,
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        ×{n(value)}
      </Text>
      <Text
        style={{
          width: 38,
          textAlign: 'right',
          fontFamily: font.ui,
          fontSize: 12,
          color: colors.textMuted,
          fontVariant: ['tabular-nums'],
        }}
      >
        {n(pct)}%
      </Text>
    </Pressable>
  );
}

/**
 * One full-width band of business numbers.
 *
 * Four across on a full card, hairline-separated, values first and labels
 * under — the shape a till summary wears. Every cell is its own door: the
 * band's items carry their own onPress, so "waiting" opens the queue while
 * "live dishes" opens the menu, and colour lands only on the numbers that
 * need acting on today.
 */
function StatBand({ items }) {
  const { colors } = useTheme();
  const { n } = useLang();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
      }}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {i > 0 ? <View style={{ width: 1, backgroundColor: colors.line2 }} /> : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={item.label}
            onPress={item.onPress}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              gap: 2,
              paddingVertical: 12,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontFamily: font.displayExtra,
                fontSize: 21,
                lineHeight: 25,
                letterSpacing: -0.5,
                color: item.tone ?? colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {n(item.value)}
            </Text>
            <Text
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              style={{
                fontFamily: font.uiSemi,
                fontSize: 9,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

/** Five stars, filled to the rating — the reviews screen's, at dashboard size. */
function Stars({ value, size = 11 }) {
  const { colors } = useTheme();
  const filled = Math.round(Number(value) || 0);

  return (
    <View style={{ flexDirection: 'row', gap: 1.5 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="star"
          size={size}
          color={star <= filled ? colors.saffron : colors.line}
          strokeWidth={star <= filled ? 2.6 : 2}
        />
      ))}
    </View>
  );
}

/**
 * The shape of a number nobody has yet.
 *
 * Three placeholder tiles pulse while the order board is on its way, because
 * the alternative was dashes that read as "no orders ever" for exactly as
 * long as one request took. Nothing here asserts a value; it keeps the
 * layout honest until the real figures land.
 */
function Pulse({ style }) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [opacity]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const { colors } = useTheme();

  return <Animated.View style={[anim, { backgroundColor: colors.sunken }, style]} />;
}

/**
 * Said only when there is something to say.
 *
 * An order that has sat at one step too long is the one thing on this screen
 * that gets worse on its own, and nothing anywhere in the app measured it —
 * every row printed how old the order was and left the reader to decide
 * whether that was bad. "12 minutes ago" means nothing without knowing what
 * normal is; this is the app saying so.
 *
 * Renders nothing below the threshold rather than a green "on time" chip. A
 * kitchen with six orders running well should show six calm rows, not six
 * badges telling it there is nothing wrong.
 */
function LateChip({ since, after, label }) {
  const { colors } = useTheme();

  if (!since || Date.now() - since < after) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 2.5,
        paddingHorizontal: 7,
        borderRadius: radius.pill,
        backgroundColor: colors.primary50,
      }}
    >
      <Icon name="clock" size={10} color={colors.primary} strokeWidth={2.4} />
      <Text
        maxFontSizeMultiplier={1.2}
        style={{
          fontFamily: font.uiBold,
          fontSize: 9.5,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: colors.primary,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
