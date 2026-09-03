import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
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
import { KycBanner } from '../../../src/components/CookBits';
import { useChat } from '../../../src/store/ChatContext';
import { useLang } from '../../../src/i18n/LanguageContext';

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
  const { kitchen, toggleOpen, liveDishes } = useKitchen();
  const { ordersForKitchen, advanceOrder } = useOrders();
  const meals = useCommerce();
  const { t, n } = useLang();
  /* Every write below reports what happened. */
  const run = useAction();

  /* Tomorrow's service, summarised: plates already paid for, and the softer
     number of people who said they were interested. */
  const tomorrow = kitchen
    ? meals
        .mealsForKitchen(kitchen.id)
        .filter((m) => m.serveDate === tomorrowKey() && m.status !== 'cancelled')
    : [];
  const platesTomorrow = tomorrow.reduce(
    (sum, m) => sum + meals.confirmedCount(m.id),
    0,
  );
  const interestTomorrow = tomorrow.reduce(
    (sum, m) => sum + (m.interestCount ?? 0),
    0,
  );
  const unread = meals.unreadFor('cook');
  /* The inbox already renders a cook's side — it greets them with "Your
     customers, and our support desk." It simply had no door into it from
     this panel, so a customer writing about an order reached nobody. */
  const { pendingCount } = useChat();

  /* Approval is the platform's decision and it gates everything that takes on
     a customer: listing a dish, publishing a meal, opening a shop, accepting
     a pre-order. The backend enforces it; this is where the cook finds out. */
  const approved = kitchen?.kycStatus === 'approved';

  /* The shop's one urgent number, on the screen a cook opens first. */
  const shopStore = kitchen ? meals.storeForKitchen(kitchen.id) : null;
  const storeOpen = !!shopStore?.isOpen;
  /* A shop that exists and is shut. Distinct from having no shop at all, and
     the more urgent of the two: the cook has already done the work of
     stocking it, and none of it is reachable. */
  const shopClosed = !!shopStore && !shopStore.isOpen;
  const waitingPreorders = kitchen ? meals.pendingPreorders(kitchen.id).length : 0;

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
          <Heading size={20}>{t('Setting up your kitchen…')}</Heading>
        </Container>
      </CookScreen>
    );
  }

  const open = kitchen.isOpen;

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('YOUR')}
          accent={t('KITCHEN')}
          subtitle={
            !approved
              ? t('{name} is waiting for approval.', { name: kitchen.name })
              : open
                ? t('{name} is taking orders.', { name: kitchen.name })
                : t('{name} is closed. Nothing can be ordered.', { name: kitchen.name })
          }
        />

        {/* The first thing a waiting cook should see, rather than the last.
            It lived on the kitchen-details screen, which nobody opens daily. */}
        <KycBanner
          status={kitchen?.kycStatus}
          note={kitchen?.kycNote}
          style={{ marginBottom: 16 }}
        />

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
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              /* Worth announcing: whether the kitchen is taking orders is the
                 one thing a cook most needs to be sure of. */
              run(
                () => toggleOpen(),
                () => (kitchen?.isOpen ? t('Kitchen closed.') : t('Kitchen is open for orders.')),
              );
            }}
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
                    {open
                      ? t(liveDishes.length === 1 ? '{n} dish listed right now' : '{n} dishes listed right now', { n: n(liveDishes.length) })
                      : t('Tap to start taking orders')}
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
            </LinearGradient>
          </Pressable>
        </Reveal>

        {/* ---- Today ---- */}
        <Reveal delay={2}>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <StatTile icon="receipt" value={n(stats.today)} label={t('Orders today')} />
            <StatTile
              icon="banknote"
              value={`৳${n(stats.earned)}`}
              label={t('Earned today')}
              variant="saffron"
            />
          </View>
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
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: 15,
                          color: colors.text,
                        }}
                      >
                        {order.contact?.name ?? order.id}
                      </Text>
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
            <ActionRow
              icon="pot"
              tone={platesTomorrow ? 'primary' : 'sage'}
              title={
                platesTomorrow
                  ? t('Prepare {n} plates tomorrow', { n: n(platesTomorrow) })
                  : t('Plan tomorrow’s meal')
              }
              sub={
                platesTomorrow
                  ? t('{n} interested, {c} confirmed', {
                      n: n(interestTomorrow),
                      c: n(platesTomorrow),
                    })
                  : t('Publish tonight and let people book a plate')
              }
              locked={!approved}
              onPress={() => router.push('/cook/meals')}
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
              sub={
                waitingPreorders
                  ? t('{n} pre-orders waiting for your answer', { n: n(waitingPreorders) })
                  : shopClosed
                    ? t('Closed — nothing in it can be bought. Tap to open.')
                    : storeOpen
                      ? t('Products, stock and shop orders')
                      : t('Open a shop for the things you make to keep')
              }
              locked={!approved}
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
          <View style={{ gap: 12, marginTop: 12 }}>
            <ActionRow
              icon="plus"
              title={t('Add a dish')}
              sub={
                approved
                  ? t('List something new on your menu')
                  : t('Available once your kitchen is approved')
              }
              locked={!approved}
              onPress={() => router.push('/cook/dish/new')}
            />
            <ActionRow
              icon="utensils"
              title={t('Your menu')}
              sub={t('{dishes} dishes, {live} available', { dishes: n(kitchen.dishes.length), live: n(liveDishes.length) })}
              onPress={() => router.push('/cook/menu')}
            />
          </View>
        </Reveal>
      </Container>
    </CookScreen>
  );
}
