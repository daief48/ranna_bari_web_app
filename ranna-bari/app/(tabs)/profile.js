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
import { useCart } from '../../src/store/CartContext';
import { useOrders } from '../../src/store/OrdersContext';

export default function ProfileScreen() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const router = useRouter();
  const { account, isSignedIn, signOut } = useAuth();
  const { count } = useCart();
  const { orders, activeOrders } = useOrders();
  const [confirmOut, setConfirmOut] = useState(false);

  return (
    <Screen activeIcon="user" glow="both">
      <Container>
        <SectionHeader
          lead="YOUR"
          accent="PROFILE"
          subtitle={
            isSignedIn
              ? 'Your account, your kitchens, your orders.'
              : 'Sign in to order, or open your own kitchen.'
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
                You&rsquo;re browsing as a guest
              </Heading>
              <Body muted size={15} style={{ textAlign: 'center' }}>
                Create an account to save your address, track orders, and get
                kitchens ranked by how close they are to your door.
              </Body>
              <Button
                label="Sign in or join"
                icon="arrowRight"
                block
                onPress={() => router.push('/auth')}
              />
            </BentoBox>
          </Reveal>
        )}

        <View style={{ gap: 12, marginTop: 16 }}>
          {isSignedIn ? (
            <Row
              icon="user"
              variant="sage"
              title="Edit profile"
              sub="Photo, contact details and address"
              onPress={() => router.push('/edit-profile')}
            />
          ) : null}
          <Row
            icon="receipt"
            variant="primary"
            title="Your orders"
            sub={
              activeOrders.length
                ? `${activeOrders.length} in progress`
                : orders.length
                  ? `${orders.length} past order${orders.length === 1 ? '' : 's'}`
                  : 'Nothing ordered yet'
            }
            onPress={() => router.push('/orders')}
          />
          <Row
            icon="cart"
            variant="saffron"
            title="Your cart"
            sub={count ? `${count} item${count === 1 ? '' : 's'} waiting` : 'Empty right now'}
            onPress={() => router.push('/cart')}
          />
          <Row
            icon="chefHat"
            variant="sage"
            title="Become a cook"
            sub="Turn your kitchen into a business"
            onPress={() => router.push('/become-cook')}
          />
          <Row
            icon="map"
            variant="saffron"
            title="Kitchen map"
            sub="See who is cooking near you"
            onPress={() => router.push('/map')}
          />
          <Row
            icon={isDark ? 'sun' : 'moon'}
            variant="primary"
            title={isDark ? 'Light mode' : 'Midnight dining'}
            sub={isDark ? 'Washi paper and shari rice' : 'Nori over sumi ink'}
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
                  Log out of {account.email || account.phone || 'this account'}?
                  Your cart and past orders stay on this device.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    variant="glass"
                    label="Stay in"
                    small
                    onPress={() => setConfirmOut(false)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Log out"
                    small
                    onPress={() => {
                      signOut();
                      setConfirmOut(false);
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : (
              <Button
                variant="glass"
                label="Log out"
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

  const isCook = account.role === 'cook';
  const title = account.kitchen || account.name || 'RannaBari member';
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
                {isCook ? 'Home cook' : 'Customer'}
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
        <Stat value={orders.length} label="Orders" />
        <View style={{ width: 1, backgroundColor: 'rgba(255, 255, 255, 0.2)' }} />
        <Stat value={activeOrders.length} label="In progress" />
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Edit your profile"
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
          Edit profile
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
