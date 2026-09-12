import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

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
import {
  cookPayout,
  isClosed,
  timeAgo,
  useOrders,
} from '../../../src/store/OrdersContext';
import { tomorrowKey, useCommerce } from '../../../src/store/CommerceContext';
import { useChat } from '../../../src/store/ChatContext';
import { useSession } from '../../../src/store/SessionContext';
import {
  fetchMealOrders,
  fetchMyPlan,
  fetchMyService,
} from '../../../src/features/meal-plan/api';
import { todayKey } from '../../../src/features/meal-plan/format';
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

export default function CookDashboard() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { kitchen, toggleOpen, liveDishes, loaded } = useKitchen();
  const { ordersForKitchen, advanceOrder } = useOrders();
  const meals = useCommerce();
  const { token } = useSession();
  const { t, n } = useLang();
  /* Every write below reports what happened. */
  const run = useAction();

  /*
   * The two days a cook plans around, read straight off the meal orders.
   *
   * Counted off meal orders rather than off published meals. Under the monthly
   * system there is nothing to publish per day: a plate exists because somebody
   * booked a month that includes that date, so the orders *are* the count. The
   * old reading came from the per-plate board and its endpoints are gone, which
   * made this quietly zero on every kitchen.
   */
  const [platesTomorrow, setPlatesTomorrow] = useState(0);
  const [mealsToday, setMealsToday] = useState(null);
  /* The meal system's two switches, so the dashboard can say how it stands
     without making a cook open the hub to find out. */
  const [service, setService] = useState(undefined);
  const [plan, setPlan] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let alive = true;

      Promise.all([
        fetchMealOrders(token, tomorrowKey()),
        fetchMealOrders(token, todayKey()),
        fetchMyService(token),
        fetchMyPlan(token),
      ]).then(([tomorrow, today, svc, cal]) => {
        if (!alive) return;
        setPlatesTomorrow(tomorrow.ok ? (tomorrow.result.orders?.length ?? 0) : 0);
        const todays = today.ok ? (today.result.orders ?? []) : [];
        setMealsToday({
          plates: todays.length,
          done: todays.filter((o) => o.status === 'delivered' || o.status === 'completed')
            .length,
        });
        setService(svc.ok ? svc.result.service : null);
        setPlan(cal.ok ? cal.result : null);
      });

      return () => {
        alive = false;
      };
    }, [token]),
  );
  const unread = meals.unreadFor('cook');
  /* The inbox already renders a cook's side — it greets them with "Your
     customers, and our support desk." It simply had no door into it from
     this panel, so a customer writing about an order reached nobody. */
  const { pendingCount } = useChat();


  /* The shop's one urgent number, on the screen a cook opens first. */
  const shopStore = kitchen ? meals.storeForKitchen(kitchen.id) : null;
  const storeOpen = !!shopStore?.isOpen;
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
    const today = mine.filter((o) => isToday(o.createdAt) && o.status !== 'rejected');
    const earned = today
      .filter((o) => o.status === 'delivered')
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

  /* How the meal system stands, in the same sentences the hub says it — the
     dashboard and the hub can never disagree about what "on" means. */
  const menuLive =
    plan === null ? null : !!(plan.cookPlan?.status === 'published' || plan.systemPlan);
  const mealsSub =
    service === undefined
      ? t('Checking…')
      : !service
        ? t('Not started yet')
        : !service.active
          ? t('Service set — not switched on')
          : menuLive === null
            ? t('Checking…')
            : menuLive
              ? t('Open for bookings')
              : t('Open, but no menu for this month');

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

  return (
    <CookScreen>
      <Container>
        {/* ---- The pass ----
            The screen opens on the kitchen itself, the way a cook meets it:
            the room, the greeting, and whether the shutter is up. Tapping it
            goes to the page that edits what it shows. */}
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
                marginBottom: 16,
                borderRadius: 24,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: pressed ? colors.primary200 : colors.line,
              },
              shadow.md,
            ]}
          >
            <View style={{ height: 148 }}>
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

              {/* Greeted the way a kitchen is greeted — by the hour, by name,
                  over the room itself. */}
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
          * What is actually waiting on this cook.
          *
          * Every one of these was already somewhere on this screen — the
          * open/close control says a closed kitchen takes no orders, the
          * gallery says there are no photos, the shop row says the shop is
          * shut. All of it below the fold, on a screen a busy cook scrolls
          * half of. This promotes whichever of them is true right now, and
          * renders nothing on the day none of them is.
          */}
        <NextUp
          style={{ marginTop: 6, marginBottom: 18 }}
          steps={[
            stats.waiting > 0 && {
              key: 'accept',
              urgent: true,
              icon: 'receipt',
              tone: 'primary',
              title: t(
                stats.waiting === 1 ? 'Accept 1 order' : 'Accept {n} orders',
                { n: n(stats.waiting) },
              ),
              sub: t('Somebody has paid and is waiting to hear from you'),
              onPress: () => router.push('/cook/orders'),
            },

            stats.disputed > 0 && {
              key: 'disputed',
              urgent: true,
              icon: 'alertCircle',
              tone: 'primary',
              title: t('{n} orders under review', { n: n(stats.disputed) }),
              sub: t('That money stays put until the case is settled'),
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
              onPress: () => router.push('/cook/menu'),
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

        {/* ---- The shopfront ----
            What a customer sees, on the screen the cook starts on. Tapping
            anything here goes to the page that edits it rather than editing
            in place: two editors for one gallery is how they disagree. */}
        <Reveal delay={1}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Your kitchen photos')}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push('/cook/kitchen');
            }}
            style={({ pressed }) => [
              {
                marginTop: 4,
                marginBottom: 18,
                borderRadius: 24,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: pressed ? colors.primary200 : colors.line,
              },
            ]}
          >
            <View style={{ height: 92 }}>
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
                colors={['transparent', `rgba(${colors.scrim}, 0.5)`]}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 }}>
              <Image
                source={kitchen.avatar ? { uri: kitchen.avatar } : null}
                contentFit="cover"
                transition={200}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 15,
                  marginTop: -34,
                  borderWidth: 2.5,
                  borderColor: colors.surfaceSolid,
                  backgroundColor: colors.sunken,
                }}
              />

              {/* The gallery itself, as far as it fits. Four is what a 412pt
                  phone holds beside the avatar without the row wrapping. */}
              <View style={{ flex: 1, flexDirection: 'row', gap: 6, minWidth: 0 }}>
                {(kitchen.photos ?? []).slice(0, 4).map((uri) => (
                  <Image
                    key={uri}
                    source={{ uri }}
                    contentFit="cover"
                    transition={150}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      backgroundColor: colors.sunken,
                      borderWidth: 1,
                      borderColor: colors.line,
                    }}
                  />
                ))}

                {/* Said plainly. A cook whose photographs never saved sees an
                    empty strip and no reason, which is exactly the state this
                    platform was in for every kitchen on it. */}
                {(kitchen.photos ?? []).length === 0 ? (
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                      alignSelf: 'center',
                    }}
                  >
                    {t('No kitchen photos yet')}
                  </Text>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                {(kitchen.photos ?? []).length > 4 ? (
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    +{n((kitchen.photos ?? []).length - 4)}
                  </Text>
                ) : null}
                <Icon name="chevronRight" size={15} color={colors.textMuted} />
              </View>
            </View>
          </Pressable>
        </Reveal>

        {/* ---- The shutter ----
            Everything else on this screen is a readout. This is the one
            control that changes what customers can do, so it gets the whole
            width and the only filled surface. */}
        <Reveal delay={1}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: open }}
            accessibilityLabel={
              open
                ? t('Open for orders')
                : t('Tap to start taking orders')
            }
            onPress={setShutter}
            style={({ pressed }) => [
              {
                borderRadius: 28,
                overflow: 'hidden',
                transform: [{ scale: pressed ? 0.99 : 1 }],
              },
              open ? shadow.md : shadow.sm,
            ]}
          >
            <LinearGradient
              colors={open ? [colors.sage, colors.sage] : [colors.sunken, colors.sunken]}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={{
                padding: 20,
                borderWidth: 1,
                borderColor: open ? 'transparent' : colors.line,
                borderRadius: 28,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: open
                      ? 'rgba(255, 255, 255, 0.22)'
                      : colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: open ? 'rgba(255, 255, 255, 0.28)' : colors.line,
                  }}
                >
                  <Icon
                    name={open ? 'flame' : 'moon'}
                    size={26}
                    color={open ? '#FFFFFF' : colors.textMuted}
                  />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontFamily: font.displayExtra,
                      fontSize: 24,
                      letterSpacing: -0.48,
                      color: open ? '#FFFFFF' : colors.text,
                    }}
                  >
                    {open ? t('Open for orders') : t('Closed')}
                  </Text>
                  <Text
                    style={{
                      marginTop: 3,
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      lineHeight: 20,
                      color: open ? 'rgba(255, 255, 255, 0.9)' : colors.textMuted,
                    }}
                  >
                    {/* Closed used to say "tap to start taking orders", which
                        the button underneath now says better. This says the
                        thing the button cannot: what being closed costs. */}
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
                    backgroundColor: open ? 'rgba(255, 255, 255, 0.32)' : colors.line,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: open ? '#FFFFFF' : colors.surfaceSolid,
                    }}
                  />
                </View>
              </View>

              {/*
               * And the same thing as a button that says what it does.
               *
               * The card was already the control — the whole surface toggles
               * and the knob on the right is a switch — but "tap the big
               * green thing" is a convention you have to already know, and
               * the one control on this screen that decides whether a
               * kitchen earns money should not need to be discovered. This
               * spells the next state out: what it says is what happens.
               */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={open ? t('Close the kitchen') : t('Open the kitchen')}
                onPress={setShutter}
                style={({ pressed }) => ({
                  marginTop: 16,
                  paddingVertical: 12,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  borderWidth: 1,
                  /* Open: a quiet outline on the filled card — the loud
                     option should not be the one that stops the orders.
                     Closed: solid, because starting is what a cook came
                     here to do. */
                  backgroundColor: open
                    ? 'rgba(255, 255, 255, 0.16)'
                    : pressed
                      ? colors.primary600
                      : colors.primary,
                  borderColor: open ? 'rgba(255, 255, 255, 0.45)' : 'transparent',
                  opacity: pressed && open ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: type.sm + 1,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    color: open ? '#FFFFFF' : colors.onPrimary,
                  }}
                >
                  {open ? t('Close the kitchen') : t('Open the kitchen')}
                </Text>
              </Pressable>
            </LinearGradient>
          </Pressable>
        </Reveal>

        {/* ---- Today ----
            Both halves of the cooking, counted where they happen: à la carte
            orders on one row, the month's plates on the other. Each tile
            opens the board it is counted from. */}
        <Reveal delay={2}>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Orders today')}
              onPress={() => router.push('/cook/orders')}
              style={{ flex: 1 }}
            >
              <StatTile
                icon="receipt"
                value={n(stats.today)}
                label={t('Orders today')}
                variant="primary"
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

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Plates today')}
              onPress={() => router.push('/cook/meals')}
              style={{ flex: 1 }}
            >
              <StatTile
                icon="pot"
                value={n(mealsToday?.plates ?? 0)}
                label={t('Plates today')}
                variant="sage"
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Plates tomorrow')}
              onPress={() => router.push('/cook/meals')}
              style={{ flex: 1 }}
            >
              <StatTile
                icon="calendar"
                value={n(platesTomorrow)}
                label={t('Plates tomorrow')}
                variant={platesTomorrow ? 'primary' : 'sage'}
              />
            </Pressable>
          </View>

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

        {/* ---- Waiting on you ----
            An order nobody has accepted is the only thing in this app that
            gets worse the longer it is ignored, so it leads with the wait. */}
        {waiting.length ? (
          <Reveal delay={3}>
            <View style={{ marginTop: 28 }}>
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

        {/* ---- Nothing on ---- */}
        {!waiting.length && !inFlight.length ? (
          <Reveal delay={3}>
            <BentoBox
              style={{ padding: 28, alignItems: 'center', gap: 16, marginTop: 24 }}
            >
              <IconTile name="pot" variant="sage" large />
              <Heading size={19} style={{ textAlign: 'center' }}>
                {open ? t('No orders right now') : t('Your kitchen is closed')}
              </Heading>
              <Body muted size={14} style={{ textAlign: 'center' }}>
                {open
                  ? t('You are listed and taking orders. This fills up as they come in.')
                  : t('Open the kitchen above and your dishes go live on the map.')}
              </Body>
            </BentoBox>
          </Reveal>
        ) : null}

        {/* ---- Tomorrow ----
            The number a cook needs before they go shopping, on the screen
            they open first. */}
        <Reveal delay={5}>
          <View style={{ gap: 12, marginTop: 28 }}>
            {/* The month in one tap: the hub carries the service, the menu,
                the dish library and the bookings — everything the tiles above
                only count. */}
            <ActionRow
              icon="pot"
              tone={service?.active ? 'saffron' : 'sage'}
              title={t('Monthly meals')}
              sub={mealsSub}
              onPress={() => router.push('/cook/meal-hub')}
            />
            <ActionRow
              icon="sparkles"
              tone={openRequests ? 'primary' : 'sage'}
              title={t('Food requests')}
              sub={
                openRequests
                  ? t('{n} waiting for your price', { n: n(openRequests) })
                  : t('Customers asking for things nobody has listed')
              }
              onPress={() => router.push('/cook/requests')}
            />
            {/* Three states, not two. A cook with no shop and a cook whose
                shop is shut both used to read "Open a shop for the things you
                make to keep", which tells the second one nothing: their shop
                exists, has products in it, and is invisible to customers.
                The kitchen switch on this same screen does not open it —
                they are separate shutters — so a cook who flipped the kitchen
                open reasonably believes everything is live. */}
            <ActionRow
              icon="box"
              tone={waitingPreorders || shopClosed ? 'primary' : 'sage'}
              title={t('Your shop')}
              /* Ordered by what it costs to ignore: a pre-order is somebody
                 waiting on an answer with money already held, a closed shop
                 sells nothing at all, and an empty shelf sells one thing less
                 than it looks like it does. */
              sub={
                waitingPreorders
                  ? t('{n} pre-orders waiting for your answer', { n: n(waitingPreorders) })
                  : shopClosed
                    ? t('Closed — nothing in it can be bought. Tap to open.')
                    : outOfStock
                      ? t('{n} out of stock — nobody can buy them', { n: n(outOfStock) })
                      : storeOpen
                        ? t('Products, stock and shop orders')
                        : t('Open a shop for the things you make to keep')
              }
              onPress={() => router.push('/cook/store')}
            />
            <ActionRow
              icon="chat"
              title={t('Messages')}
              sub={
                pendingCount
                  ? t('{n} unread', { n: n(pendingCount) })
                  : t('Questions about your orders')
              }
              onPress={() => router.push('/chat')}
            />
            <ActionRow
              icon="sparkles"
              title={t('Notifications')}
              sub={
                unread
                  ? t('{n} unread', { n: n(unread) })
                  : t('Interest, orders and payouts')
              }
              onPress={() => router.push('/notifications')}
            />
          </View>
        </Reveal>

        {/* ---- Quick actions ---- */}
        <Reveal delay={6}>
          <View style={{ gap: 12, marginTop: 12, marginBottom: 26 }}>
            <ActionRow
              icon="plus"
              title={t('Add a dish')}
              sub={t('List something new on your menu')}
              onPress={() => router.push('/cook/dish/new')}
            />
            <ActionRow
              icon="utensils"
              title={t('Your menu')}
              sub={t('{dishes} dishes, {live} available', { dishes: n(kitchen.dishes.length), live: n(liveDishes.length) })}
              onPress={() => router.push('/cook/menu')}
            />
            <ActionRow
              icon="gem"
              title={t('Kitchen profile')}
              sub={t('Cover, photos and where you are')}
              onPress={() => router.push('/cook/kitchen')}
            />
          </View>
        </Reveal>
      </Container>
    </CookScreen>
  );
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
