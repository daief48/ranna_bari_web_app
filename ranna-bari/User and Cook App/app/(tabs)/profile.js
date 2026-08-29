import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import SectionHeader from '../../src/components/SectionHeader';
import { BentoBox, IconTile } from '../../src/components/Surfaces';
import { Body, Heading } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useSession } from '../../src/store/SessionContext';
import { useCart } from '../../src/store/CartContext';
import { useOrders } from '../../src/store/OrdersContext';
import { useKitchen } from '../../src/store/KitchenContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { useChat } from '../../src/store/ChatContext';
import { customerKeyOf } from '../../src/lib/ledger';
import { useLang } from '../../src/i18n/LanguageContext';

export default function ProfileScreen() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const router = useRouter();
  const { account, isSignedIn, isCook, setViewMode, signOut } = useAuth();
  /* Signing out has to drop the server session too, or the next person on
     this handset inherits a token that can still spend the last one's
     wallet. */
  const { signOutServer } = useSession();
  const { count } = useCart();
  const { orders, activeOrders } = useOrders();
  const { wallet, unreadFor, requestsForCustomer } = useCommerce();
  const [confirmOut, setConfirmOut] = useState(false);
  const { t, n } = useLang();

  const unread = unreadFor('customer');
  const { unreadTotal: chatUnread } = useChat();
  const openRequests = requestsForCustomer(customerKeyOf(account)).filter(
    (r) => r.status === 'open' || r.status === 'selected' || r.status === 'agreed',
  ).length;

  return (
    <Screen glow="both">
      <Container>
        <SectionHeader
          lead={t('YOUR')}
          accent={t('PROFILE')}
          subtitle={
            isCook
              ? t('You are browsing as a customer. Your kitchen is one tap away.')
              : isSignedIn
                ? t('Your account, your kitchens, your orders.')
                : t('Sign in to order, or open your own kitchen.')
          }
        />

        {isSignedIn ? (
          <Reveal delay={1}>
            <AccountCard
              account={account}
              orders={orders}
              activeOrders={activeOrders}
              onEdit={() => router.push('/edit-profile')}
            />
          </Reveal>
        ) : (
          <Reveal delay={1}>
            <BentoBox style={{ padding: 24, alignItems: 'center', gap: 16 }}>
              <IconTile name="user" large />
              <Heading size={20} style={{ textAlign: 'center' }}>
                {t('You’re browsing as a guest')}
              </Heading>
              <Body muted size={15} style={{ textAlign: 'center' }}>
                {t('Create an account to save your address, track orders, and get kitchens ranked by how close they are to your door.')}
              </Body>
              <Button
                label={t('Sign in or join')}
                icon="arrowRight"
                block
                onPress={() => router.push('/auth')}
              />
            </BentoBox>
          </Reveal>
        )}

        {/* ---- A cook's half ----
            A cook signed in here is the same person who runs a kitchen, and
            a flat list identical to a customer's hides that. Their kitchen
            gets its own block at the top, with the numbers that decide
            whether they need to go back to it right now. */}
        {isCook ? (
          <Reveal delay={2}>
            <View style={{ marginTop: 24 }}>
              <GroupLabel icon="chefHat" text={t('Your kitchen')} />
              <KitchenCard
                onOpen={async () => {
                  await setViewMode('cook');
                  router.replace('/cook');
                }}
                goTo={async (href) => {
                  await setViewMode('cook');
                  router.replace(href);
                }}
              />
            </View>
          </Reveal>
        ) : null}

        {isCook ? <GroupLabel icon="utensils" text={t('As a customer')} style={{ marginTop: 28 }} /> : null}

        <View style={{ gap: 12, marginTop: isCook ? 0 : 16 }}>
          <Row
            icon="receipt"
            variant="primary"
            title={t('Your orders')}
            sub={
              activeOrders.length
                ? t('{n} in progress', { n: n(activeOrders.length) })
                : orders.length
                  ? t(orders.length === 1 ? '{n} past order' : '{n} past orders', { n: n(orders.length) })
                  : t('Nothing ordered yet')
            }
            onPress={() => router.push('/orders')}
          />
          <Row
            icon="cart"
            variant="saffron"
            title={t('Your cart')}
            sub={count ? t(count === 1 ? '{n} item waiting' : '{n} items waiting', { n: n(count) }) : t('Empty right now')}
            onPress={() => router.push('/cart')}
          />
          {/* Meals are paid for from the wallet, so the balance is a thing
              people check before they go looking, not after. */}
          <Row
            icon="banknote"
            variant="sage"
            title={t('Wallet')}
            sub={
              wallet.held
                ? t('৳{n} available · ৳{held} held', {
                    n: n(wallet.customer),
                    held: n(wallet.held),
                  })
                : t('৳{n} available', { n: n(wallet.customer) })
            }
            onPress={() => router.push('/wallet')}
          />
          <Row
            icon="sparkles"
            variant="primary"
            title={t('Notifications')}
            sub={
              unread
                ? t('{n} unread', { n: n(unread) })
                : t('Meals near you, and your order updates')
            }
            onPress={() => router.push('/notifications')}
          />
          <Row
            icon="chefHat"
            title={t('Messages')}
            sub={
              chatUnread
                ? t('{n} unread', { n: n(chatUnread) })
                : t('Your cook, and our support desk')
            }
            onPress={() => router.push('/chat')}
          />
          <Row
            icon="sparkles"
            variant="saffron"
            title={t('Food requests')}
            sub={
              openRequests
                ? t('{n} taking offers', { n: n(openRequests) })
                : t('Ask cooks for something nobody has listed')
            }
            onPress={() => router.push('/requests')}
          />
          <Row
            icon="box"
            variant="primary"
            title={t('Home shops')}
            sub={t('Cakes, pitha, achar and gifts')}
            onPress={() => router.push('/stores')}
          />
          <Row
            icon="map"
            variant="saffron"
            title={t('Kitchen map')}
            sub={t('See who is cooking near you')}
            onPress={() => router.push('/map')}
          />
          {/* Guests only.
              For someone already signed in this was a trap: `/become-cook`
              feeds the three-step signup, and finishing it calls signIn(),
              which REPLACES the stored account rather than upgrading it --
              their name, email, phone and saved address all came back as the
              form's defaults. A signed-in user turns cook from the profile
              editor, which changes the role in place. */}
          {!isSignedIn ? (
            <Row
              icon="chefHat"
              variant="sage"
              title={t('Become a cook')}
              sub={t('Turn your kitchen into a business')}
              onPress={() => router.push('/become-cook')}
            />
          ) : null}
        </View>

        {isCook ? <GroupLabel icon="sliders" text={t('Account')} style={{ marginTop: 28 }} /> : null}

        <View style={{ gap: 12, marginTop: isCook ? 0 : 12 }}>
          {isSignedIn ? (
            <Row
              icon="user"
              variant="sage"
              title={t('Edit profile')}
              /* This is where a customer turns cook now, so the row has to
                 say so -- it is no longer a separate entry in the list. */
              sub={
                isCook
                  ? t('Photo, contact details and address')
                  : t('Details, address, or open your own kitchen')
              }
              onPress={() => router.push('/edit-profile')}
            />
          ) : null}
          <Row
            icon={isDark ? 'sun' : 'moon'}
            variant="primary"
            title={isDark ? t('Light mode') : t('Midnight dining')}
            sub={isDark ? t('Washi paper and shari rice') : t('Nori over sumi ink')}
            onPress={toggle}
          />
        </View>

        {/* ---- Log out ----
            A real button rather than another row: it is the one destructive
            action here, and it should not look like navigation. */}
        {isSignedIn ? (
          <View style={{ marginTop: 24 }}>
            {confirmOut ? (
              <View
                style={{
                  padding: 16,
                  borderRadius: radius.md,
                  backgroundColor: colors.primary50,
                  borderWidth: 1,
                  borderColor: colors.primary100,
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.sm,
                    lineHeight: 21,
                    color: colors.text,
                  }}
                >
                  {t('Log out of {who}? Your cart and past orders stay on this device.', { who: account.email || account.phone || t('this account') })}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    variant="glass"
                    label={t('Stay in')}
                    small
                    onPress={() => setConfirmOut(false)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={t('Log out')}
                    small
                    onPress={async () => {
                      setConfirmOut(false);
                      await Promise.all([signOut(), signOutServer()]);
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : (
              <Button
                variant="glass"
                label={t('Log out')}
                icon="x"
                iconPosition="left"
                block
                onPress={() => setConfirmOut(true)}
              />
            )}
          </View>
        ) : null}
      </Container>
    </Screen>
  );
}

/** A small caption that splits the list into the two halves of a cook's life. */
function GroupLabel({ icon, text, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
        style,
      ]}
    >
      <Icon name={icon} size={14} color={colors.textLight} />
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.micro,
          letterSpacing: type.micro * tracking.label,
          textTransform: 'uppercase',
          color: colors.textLight,
        }}
      >
        {text}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line2 }} />
    </View>
  );
}

/**
 * The kitchen, seen from the customer side of the app.
 *
 * A cook over here still has a kitchen running, and the two numbers that
 * decide whether they should drop the shopping and go back to it are orders
 * waiting and whether they are even open. Those lead; the three ways in sit
 * under them.
 */
function KitchenCard({ onOpen, goTo }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const { kitchen, liveDishes } = useKitchen();
  const { ordersForKitchen } = useOrders();

  if (!kitchen) return null;

  const mine = ordersForKitchen(kitchen.id);
  const waiting = mine.filter((o) => o.status === 'placed').length;
  const cooking = mine.filter(
    (o) => o.status === 'accepted' || o.status === 'cooking' || o.status === 'on_the_way',
  ).length;
  const open = kitchen.isOpen;

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: waiting ? colors.primary100 : colors.line,
          overflow: 'hidden',
        },
        shadow.sm,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${kitchen.name}. ${
          open ? t('Open for orders') : t('Closed')
        }. ${t('{n} waiting on you', { n: n(waiting) })}`}
        onPress={onOpen}
        style={({ pressed }) => ({
          padding: 16,
          backgroundColor: pressed ? colors.sunken : 'transparent',
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile
            name="chefHat"
            variant="sage"
            style={{ width: 48, height: 48, borderRadius: 15 }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.displayBold,
                fontSize: 17,
                letterSpacing: -0.17,
                color: colors.text,
              }}
            >
              {kitchen.name}
            </Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}
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
                  fontFamily: font.uiSemi,
                  fontSize: type.xs,
                  color: open ? colors.sage : colors.textMuted,
                }}
              >
                {open
                  ? t(liveDishes.length === 1 ? 'Open · {n} dish live' : 'Open · {n} dishes live', { n: n(liveDishes.length) })
                  : t('Closed · not taking orders')}
              </Text>
            </View>
          </View>
          <Icon name="arrowRight" size={17} color={colors.sage} strokeWidth={2} />
        </View>

        {/* The interrupt. Only drawn when there is actually something to do. */}
        {waiting || cooking ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              marginTop: 14,
              padding: 12,
              borderRadius: radius.sm,
              backgroundColor: waiting ? colors.primary50 : colors.sunken,
            }}
          >
            <Icon
              name={waiting ? 'alertCircle' : 'pot'}
              size={16}
              color={waiting ? colors.primary : colors.textMuted}
            />
            <Text
              style={{
                flex: 1,
                fontFamily: font.uiSemi,
                fontSize: type.sm,
                color: waiting ? colors.primary : colors.textMuted,
              }}
            >
              {waiting
                ? t(waiting === 1 ? '{n} order waiting to be accepted' : '{n} orders waiting to be accepted', { n: n(waiting) })
                : t(cooking === 1 ? '{n} order in the pass' : '{n} orders in the pass', { n: n(cooking) })}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {/* Straight into the three screens that matter, without a stop on the
          dashboard first. */}
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: colors.line2,
        }}
      >
        {[
          { icon: 'receipt', label: 'Orders', href: '/cook/orders', badge: waiting },
          { icon: 'utensils', label: 'Menu', href: '/cook/menu' },
          { icon: 'banknote', label: 'Earnings', href: '/cook/earnings' },
        ].map((q, i) => (
          <React.Fragment key={q.href}>
            {i > 0 ? <View style={{ width: 1, backgroundColor: colors.line2 }} /> : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={
                q.badge ? `${t(q.label)}, ${t('{n} waiting on you', { n: n(q.badge) })}` : t(q.label)
              }
              onPress={() => goTo(q.href)}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                gap: 5,
                paddingVertical: 13,
                backgroundColor: pressed ? colors.sage50 : 'transparent',
              })}
            >
              <View>
                <Icon name={q.icon} size={19} color={colors.sage} />
                {q.badge ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -8,
                      minWidth: 15,
                      height: 15,
                      paddingHorizontal: 4,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.primary,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: font.uiBold,
                        fontSize: 9,
                        lineHeight: 11,
                        color: '#FFFFFF',
                      }}
                    >
                      {n(q.badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: type.micro,
                  letterSpacing: type.micro * tracking.label,
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                }}
              >
                {t(q.label)}
              </Text>
            </Pressable>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/**
 * The account header.
 *
 * The edit control used to float over the top-right corner, where it landed on
 * top of any kitchen name long enough to reach it. It is a full-width action
 * at the foot of the card now, so nothing can collide with the wordmark.
 *
 * Depth comes from three stacked layers on the vermilion fill: a diagonal
 * sheen, a dot field, and glass insets for the address and stats — the same
 * material language the bento surfaces use, inverted onto a colour ground.
 */
function AccountCard({ account, orders, activeOrders, onEdit }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  const isCook = account.role === 'cook';
  const title = account.kitchen || account.name || t('RannaBari member');
  const address = [account.area, account.addressDetail]
    .filter(Boolean)
    .join(' · ');

  return (
    <LinearGradient
      colors={[colors.primary300, colors.primary, colors.primary600]}
      locations={[0, 0.45, 1]}
      start={{ x: 0.05, y: 0 }}
      end={{ x: 0.95, y: 1 }}
      style={[
        { borderRadius: 28, padding: 20, marginBottom: 16, overflow: 'hidden' },
        shadow.md,
      ]}
    >
      {/* Layer 1: a soft sheen off the top-right, so the fill is not flat */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255, 255, 255, 0.22)', 'rgba(255, 255, 255, 0)']}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.25, y: 0.75 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Layer 2: the same 20px dot field the map tile uses on the home screen */}
      <CardDots />

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <View>
          {account.avatar ? (
            <Image
              source={{ uri: account.avatar }}
              contentFit="cover"
              transition={200}
              style={{
                width: 64,
                height: 64,
                borderRadius: 21,
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.45)',
                backgroundColor: 'rgba(255, 255, 255, 0.18)',
              }}
            />
          ) : (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.32)',
              }}
            >
              <Icon
                name={isCook ? 'chefHat' : 'user'}
                size={28}
                color={colors.onPrimary}
              />
            </View>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={2}
            style={{
              fontFamily: font.displayExtra,
              fontSize: 21,
              lineHeight: 24,
              letterSpacing: -0.42,
              color: colors.onPrimary,
              marginBottom: 7,
            }}
          >
            {title}
          </Text>

          <View style={{ flexDirection: 'row' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: radius.pill,
                backgroundColor: 'rgba(255, 255, 255, 0.22)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.26)',
              }}
            >
              <Icon
                name={isCook ? 'chefHat' : 'utensils'}
                size={12}
                color={colors.onPrimary}
              />
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 9.5,
                  letterSpacing: 0.85,
                  textTransform: 'uppercase',
                  color: colors.onPrimary,
                }}
              >
                {isCook ? t('Home cook') : t('Customer')}
              </Text>
            </View>
          </View>

          {account.email || account.phone ? (
            <Text
              numberOfLines={1}
              style={{
                marginTop: 7,
                fontFamily: font.ui,
                fontSize: type.xs,
                opacity: 0.88,
                color: colors.onPrimary,
              }}
            >
              {account.email || account.phone}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Glass inset: the address the next order will go to */}
      {address ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            marginTop: 18,
            padding: 13,
            borderRadius: radius.md,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.2)',
          }}
        >
          <Icon name="pin" size={15} color={colors.onPrimary} />
          <Text
            numberOfLines={2}
            style={{
              flex: 1,
              fontFamily: font.ui,
              fontSize: type.sm,
              lineHeight: 20,
              opacity: 0.94,
              color: colors.onPrimary,
            }}
          >
            {address}
          </Text>
          {account.addressLabel ? (
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 9.5,
                letterSpacing: 0.75,
                textTransform: 'uppercase',
                opacity: 0.8,
                color: colors.onPrimary,
              }}
            >
              {account.addressLabel}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Two numbers worth surfacing, split by a hairline */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: 14,
          borderRadius: radius.md,
          backgroundColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.18)',
          overflow: 'hidden',
        }}
      >
        <Stat value={n(orders.length)} label={t('Orders')} />
        <View style={{ width: 1, backgroundColor: 'rgba(255, 255, 255, 0.2)' }} />
        <Stat value={n(activeOrders.length)} label={t('In progress')} />
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('Edit profile')}
        onPress={onEdit}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          marginTop: 14,
          paddingVertical: 13,
          borderRadius: radius.pill,
          backgroundColor: pressed
            ? 'rgba(255, 255, 255, 0.34)'
            : 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.28)',
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <Icon name="sliders" size={16} color={colors.onPrimary} />
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: 13,
            letterSpacing: 13 * tracking.label,
            textTransform: 'uppercase',
            color: colors.onPrimary,
          }}
        >
          {t('Edit profile')}
        </Text>
      </Pressable>
    </LinearGradient>
  );
}

function Stat({ value, label }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <Text
        style={{
          fontFamily: font.displayExtra,
          fontSize: 22,
          lineHeight: 25,
          letterSpacing: -0.5,
          color: colors.onPrimary,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: 9.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          opacity: 0.82,
          color: colors.onPrimary,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** White dot field at low opacity — depth without another image asset. */
function CardDots() {
  const dots = [];
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 20; x++) {
      dots.push(
        <View
          key={`${x}-${y}`}
          style={{
            position: 'absolute',
            left: x * 20,
            top: y * 20,
            width: 2,
            height: 2,
            borderRadius: 1,
            backgroundColor: '#FFFFFF',
          }}
        />,
      );
    }
  }
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.14 }}
    >
      {dots}
    </View>
  );
}

function Row({ icon, variant, title, sub, onPress }) {
  const { colors, shadow } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? colors.primary200 : colors.line,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        shadow.sm,
      ]}
    >
      <IconTile name={icon} variant={variant} style={{ width: 48, height: 48, borderRadius: 15 }} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.displayBold,
            fontSize: 17,
            letterSpacing: -0.17,
            color: colors.text,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.ui,
            fontSize: type.sm,
            color: colors.textMuted,
          }}
        >
          {sub}
        </Text>
      </View>

      <Icon name="chevronRight" size={17} color={colors.textLight} strokeWidth={2} />
    </Pressable>
  );
}
