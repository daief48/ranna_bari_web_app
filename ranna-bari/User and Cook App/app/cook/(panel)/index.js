import React, { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
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
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useAction } from '../../../src/components/Alert';
import { cookPayout, isClosed, timeAgo, useOrders } from '../../../src/store/OrdersContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useChat } from '../../../src/store/ChatContext';
import { useCookReviews } from '../../../src/data/cook';
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
  const { t, n } = useLang();
  /* Every write below reports what happened. */
  const run = useAction();
  /* The words behind the score, for the latest-review card. Loaded only here
     and on the two screens that need them — see `data/cook`. */
  const { reviews } = useCookReviews();
  /* The inbox already renders a cook's side — it greets them with "Your
     customers, and our support desk." It simply had no door into it from
     this panel, so a customer writing about an order reached nobody. */
  const { pendingCount } = useChat();

  /* The shop's one urgent number, on the screen a cook opens first. */
  const shopStore = kitchen ? meals.storeForKitchen(kitchen.id) : null;
  /* A shop that exists and is shut. Distinct from having no shop at all, and
     the more urgent of the two: the cook has already done the work of
     stocking it, and none of it is reachable. */
  const shopClosed = !!shopStore && !shopStore.isOpen;
  const waitingPreorders = kitchen ? meals.pendingPreorders(kitchen.id).length : 0;
  /*
   * Products a customer can see and cannot buy.
   *
   * Silent in a way a closed shop is not: the shop is open, the shelf looks
   * stocked from here, and the only screen that counted these was the shop
   * hub two taps away. A jar at zero earns nothing and nothing said so.
   */
  const outOfStock = shopStore ? (meals.storeOverview(shopStore)?.outOfStock ?? 0) : 0;

  /* Requests this kitchen could bid on and has not answered yet. */
  const openRequests = kitchen
    ? meals
        .requestsForCook(kitchen.id)
        .filter((r) => r.status === 'open' && !meals.offerForCook(r.id, kitchen.id))
        .length
    : 0;

  const mine = ordersForKitchen(kitchen?.id);

  const stats = useMemo(() => {
    const today = mine.filter(
      (o) => isToday(o.createdAt) && o.status !== 'rejected' && o.status !== 'cancelled',
    );
    const earned = today
      .filter((o) => o.status === 'delivered' || o.status === 'completed')
      .reduce((s, o) => s + cookPayout(o), 0);

    return {
      today: today.length,
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
     delivery, because a promise is not yet money. */
  const trend = useMemo(() => {
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const start = dayStart(6 - i);
      return { start, label: WEEKDAY[new Date(start).getDay()], count: 0, revenue: 0 };
    });

    for (const o of mine) {
      if (o.status === 'rejected' || o.status === 'cancelled') continue;
      const at = new Date(o.createdAt).getTime();
      const idx = buckets.findIndex((b) => at >= b.start && at < b.start + DAY);
      if (idx < 0) continue;
      buckets[idx].count += 1;
      if (o.status === 'delivered' || o.status === 'completed') {
        buckets[idx].revenue += cookPayout(o);
      }
    }

    return buckets;
  }, [mine]);

  const trendBusy = trend.some((b) => b.count > 0);

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
            One card that answers, in one glance: whose kitchen this is, what
            hour it is being looked at, and whether the pass is open. Tapping
            the photograph opens the page that edits what it shows; the strip
            beneath it is the shutter itself. */}
        <Reveal delay={0}>
          <View
            style={[
              {
                marginTop: 8,
                borderRadius: 28,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
              },
              shadow.md,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Your kitchen photos')}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                router.push('/cook/kitchen');
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.94 : 1 })}
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

            {/*
             * The shutter, as the header's second half rather than a card of
             * its own further down.
             *
             * It used to sit below the fold on a busy dashboard, and the one
             * control that decides whether a kitchen earns money does not
             * belong below anything. Here it is the strip the eye lands on
             * after the name: state, then the verb that changes it.
             */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: open }}
              accessibilityLabel={open ? t('Open for orders') : t('Tap to start taking orders')}
              onPress={setShutter}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 16,
                opacity: pressed ? 0.96 : 1,
              })}
            >
              <IconTile
                name={open ? 'flame' : 'moon'}
                variant={open ? 'sage' : 'primary'}
                style={{ width: 46, height: 46, borderRadius: 15 }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: font.displayBold,
                    fontSize: 18,
                    letterSpacing: -0.3,
                    color: colors.text,
                  }}
                >
                  {open ? t('Open for orders') : t('Closed')}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    fontFamily: font.ui,
                    fontSize: type.xs + 0.5,
                    color: colors.textMuted,
                  }}
                >
                  {open
                    ? t(liveDishes.length === 1 ? '{n} dish listed right now' : '{n} dishes listed right now', { n: n(liveDishes.length) })
                    : t('Nobody can order until you open')}
                </Text>
              </View>

              {/* A track-and-knob, so the tap target reads as a switch even
                  before the label is parsed. */}
              <View
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 15,
                  padding: 3,
                  justifyContent: 'center',
                  alignItems: open ? 'flex-end' : 'flex-start',
                  backgroundColor: open ? colors.sage : colors.line,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: colors.raised,
                  }}
                />
              </View>
            </Pressable>

            {/* And the same thing as a button that says what it does — what
                it says is the next state, which is the one thing a switch
                cannot spell. */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={open ? t('Close the kitchen') : t('Open the kitchen')}
                onPress={setShutter}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  borderWidth: 1,
                  /* Open: a quiet outline on a tinted card — the loud option
                     should not be the one that stops the orders. Closed:
                     solid, because starting is what a cook came here to do. */
                  backgroundColor: open
                    ? colors.sage50
                    : pressed
                      ? colors.primary600
                      : colors.primary,
                  borderColor: open ? colors.sage100 : 'transparent',
                  opacity: pressed && open ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: type.sm + 1,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    color: open ? colors.sage : colors.onPrimary,
                  }}
                >
                  {open ? t('Close the kitchen') : t('Open the kitchen')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Reveal>

        {/* ---- Right now ----
            The three numbers a cook opens this screen for, counted where the
            tab badge counts them — so this strip and the badge can never
            disagree. Each tile opens the board it is counted from. */}
        <Reveal delay={1}>
          <RowHeading icon="activity" title={t('Right now')} style={{ marginTop: 22 }} />
          {ordersLoaded ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('New orders today')}
                onPress={() => router.push('/cook/orders')}
                style={{ flex: 1 }}
              >
                <StatTile
                  icon="receipt"
                  value={n(stats.today)}
                  label={t('New orders')}
                  variant={stats.today ? 'primary' : 'sage'}
                />
              </Pressable>
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
            /* The board has not answered yet. Three tiles of dash would read
               as "no orders ever" for exactly as long as the request took;
               placeholders keep the shape without asserting anything. */
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pulse style={{ flex: 1, height: 118, borderRadius: 30 }} />
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
              title: t('{n} pre-orders to confirm', { n: n(waitingPreorders) }),
              sub: t('They are waiting on you before they can pay'),
              onPress: () => router.push('/cook/store'),
            },

            shopClosed && {
              key: 'shop',
              icon: 'cart',
              tone: 'saffron',
              title: t('Your shop is closed'),
              sub: t('Everything you stocked is there and nobody can buy it'),
              onPress: () => router.push('/cook/store'),
            },

            outOfStock > 0 && {
              key: 'stock',
              icon: 'box',
              tone: 'saffron',
              title: t('{n} products are out of stock', { n: n(outOfStock) }),
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
            Seven days of orders and earnings, drawn by hand off the same
            order rows the tiles above count. Bars are money; the small figure
            under each day is orders — a busy day that earned nothing (rain,
            rejections) and a quiet day that earned well read differently,
            which one number apiece would have flattened into the same bar. */}
        <Reveal delay={5}>
          <View style={{ marginTop: 28 }}>
            <RowHeading icon="activity" title={t('Last 7 days')} />
            <BentoBox style={{ padding: 20 }}>
              {trendBusy ? (
                <>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                      height: 128,
                      gap: 8,
                    }}
                  >
                    {trend.map((b, i) => {
                      const today = i === trend.length - 1;
                      const peak = Math.max(...trend.map((x) => x.revenue), 1);
                      /* A zero day still gets a 3px stub so the axis reads as
                         seven days rather than a gap. */
                      const h = b.revenue ? Math.max(10, (b.revenue / peak) * 96) : 3;

                      return (
                        <View key={b.start} style={{ flex: 1, alignItems: 'center', gap: 7 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontFamily: font.uiSemi,
                              fontSize: 9,
                              color: b.revenue ? colors.text : 'transparent',
                              fontVariant: ['tabular-nums'],
                            }}
                          >
                            {b.revenue >= 1000
                              ? `৳${n((b.revenue / 1000).toFixed(1))}k`
                              : `৳${n(b.revenue)}`}
                          </Text>
                          <View
                            style={{
                              width: '100%',
                              height: h,
                              borderRadius: 7,
                              backgroundColor: b.revenue
                                ? today
                                  ? colors.sage
                                  : colors.sage100
                                : colors.line,
                            }}
                          />
                          <Text
                            style={{
                              fontFamily: today ? font.uiBold : font.ui,
                              fontSize: 10,
                              color: today ? colors.sage : colors.textLight,
                            }}
                          >
                            {t(b.label)}
                          </Text>
                          <Text
                            style={{
                              fontFamily: font.ui,
                              fontSize: 9.5,
                              color: b.count ? colors.textMuted : 'transparent',
                              fontVariant: ['tabular-nums'],
                            }}
                          >
                            {n(b.count)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text
                    style={{
                      marginTop: 12,
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {t('Bars are earnings — the small figure under each day is orders.')}
                  </Text>
                </>
              ) : (
                /* An empty week is a state, not a failure — say what would
                   fill it rather than drawing an axis of nothing. */
                <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
                  <IconTile name="pot" variant="sage" />
                  <Body muted size={14} style={{ textAlign: 'center' }}>
                    {open
                      ? t('No orders this week yet. The day one arrives, this fills in.')
                      : t('No orders this week. Open the kitchen and they start coming.')}
                  </Body>
                </View>
              )}
            </BentoBox>
          </View>
        </Reveal>

        {/* ---- What sells, and what was said about it ---- */}
        {(topDishes.length > 0 || latestReview) && (
          <Reveal delay={6}>
            <View style={{ marginTop: 28, flexDirection: 'row', gap: 12 }}>
              {/* Top dishes, ranked by plates sold this week. */}
              {topDishes.length ? (
                <BentoBox style={{ flex: 1, padding: 16, gap: 12 }}>
                  <RowHeading icon="utensils" title={t('Top this week')} style={{ marginBottom: 0 }} />
                  {topDishes.map(([name, count], i) => (
                    <View
                      key={name}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <Text
                        style={{
                          width: 20,
                          fontFamily: font.displayExtra,
                          fontSize: 16,
                          color: i === 0 ? colors.saffron : colors.textLight,
                        }}
                      >
                        {n(i + 1)}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          fontFamily: font.uiSemi,
                          fontSize: 14,
                          color: colors.text,
                        }}
                      >
                        {name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 13,
                          color: colors.sage,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        ×{n(count)}
                      </Text>
                    </View>
                  ))}
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
