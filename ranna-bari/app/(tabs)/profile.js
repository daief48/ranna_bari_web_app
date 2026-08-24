import React from 'react';
import { Pressable, Text, View } from 'react-native';
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

export default function ProfileScreen() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const router = useRouter();
  const { account, isSignedIn, signOut } = useAuth();
  const { count } = useCart();

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
            <LinearGradient
              colors={[colors.primary, colors.primary600]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={[
                { borderRadius: 28, padding: 24, marginBottom: 16 },
                shadow.md,
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.18)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.24)',
                  }}
                >
                  <Icon
                    name={account.role === 'cook' ? 'chefHat' : 'user'}
                    size={26}
                    color={colors.onPrimary}
                  />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.displayExtra,
                      fontSize: 22,
                      letterSpacing: -0.44,
                      color: colors.onPrimary,
                    }}
                  >
                    {account.kitchen || account.name || 'RannaBari member'}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.micro,
                      letterSpacing: type.micro * tracking.label,
                      textTransform: 'uppercase',
                      opacity: 0.85,
                      color: colors.onPrimary,
                    }}
                  >
                    {account.role === 'cook' ? 'Home cook' : 'Customer'}
                  </Text>
                </View>
              </View>

              {account.area ? (
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <Icon name="pin" size={15} color={colors.onPrimary} />
                  <Text
                    numberOfLines={2}
                    style={{
                      flex: 1,
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      lineHeight: 20,
                      opacity: 0.92,
                      color: colors.onPrimary,
                    }}
                  >
                    {account.area}
                    {account.addressDetail ? ` · ${account.addressDetail}` : ''}
                  </Text>
                </View>
              ) : null}
            </LinearGradient>
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
          <Row
            icon="cart"
            variant="primary"
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

          {isSignedIn ? (
            <Row
              icon="x"
              variant="primary"
              title="Sign out"
              sub={account.email || account.phone || 'End this session'}
              onPress={signOut}
            />
          ) : null}
        </View>
      </Container>
    </Screen>
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
