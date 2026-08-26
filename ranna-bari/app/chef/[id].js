import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import SectionHeader from '../../src/components/SectionHeader';
import { Badge, EcoBadge, Tag } from '../../src/components/Surfaces';
import { Body, Heading, Price } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useChef, useMenu } from '../../src/data';
import { useCart } from '../../src/store/CartContext';

export default function ChefScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const router = useRouter();
  const { add } = useCart();

  const chef = useChef(id);
  const menu = useMenu(id);

  if (!chef) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', gap: 16, paddingTop: 40 }}>
          <Icon name="alertCircle" size={32} color={colors.primary} />
          <Heading size={20}>Kitchen not found</Heading>
          <Body muted size={15} style={{ textAlign: 'center' }}>
            That kitchen is no longer listed.
          </Body>
          <Button label="Browse artisans" onPress={() => router.replace('/browse')} />
        </Container>
      </Screen>
    );
  }

  const stats = [
    // A kitchen with no reviews has no score to show, so it shows none.
    { value: chef.reviewCount ? chef.rating : '—', label: 'Rating' },
    { value: chef.reviewCount, label: 'Reviews' },
    { value: menu.length, label: 'Dishes' },
  ];

  /* Only a live kitchen carries an `isOpen` flag -- the seeded ones are
     always taking orders, so an undefined value is not "closed". */
  const closed = chef.isOpen === false;

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 24,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.primary} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.primary,
            }}
          >
            Return to artisans
          </Text>
        </Pressable>

        {/* ---- PROFILE HERO ----
                On phones the hero image and the info card stop overlaying and
                stack instead, with the card pulled up 48px over the image. */}
        <Reveal delay={1}>
          <Image
            source={{ uri: chef.coverImage }}
            contentFit="cover"
            transition={250}
            style={{
              width: '100%',
              height: 200,
              borderRadius: radius.md,
              backgroundColor: colors.sunken,
            }}
          />

          <View
            style={[
              {
                marginTop: -48,
                alignItems: 'center',
                gap: 18,
                paddingVertical: 24,
                paddingHorizontal: 20,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
              },
              shadow.lg,
            ]}
          >
            <Image
              source={{ uri: chef.avatar }}
              contentFit="cover"
              transition={250}
              style={{
                width: 96,
                height: 96,
                borderRadius: radius.md,
                borderWidth: 4,
                borderColor: colors.raised,
                backgroundColor: colors.sunken,
              }}
            />

            <View style={{ width: '100%', alignItems: 'center' }}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: font.displayExtra,
                    fontSize: r.profileName,
                    lineHeight: r.profileName * 1.1,
                    letterSpacing: r.profileName * -0.03,
                    color: colors.text,
                  }}
                >
                  {chef.name}
                </Text>
                {chef.rating >= 4.8 ? (
                  <Badge tone="accent" label="Top Artisan" />
                ) : null}
              </View>

              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.xs + 1,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  color: colors.primary,
                  marginBottom: 16,
                }}
              >
                {chef.specialty} • {chef.area}
              </Text>

              <Body muted size={14} style={{ textAlign: 'center' }}>
                {chef.description}
              </Body>

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 28,
                  marginTop: 20,
                }}
              >
                {stats.map((s) => (
                  <View key={s.label} style={{ alignItems: 'center', gap: 4 }}>
                    <Text
                      style={{
                        fontFamily: font.displayExtra,
                        fontSize: 24,
                        letterSpacing: -0.7,
                        color: colors.primary,
                      }}
                    >
                      {s.value}
                    </Text>
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: type.micro,
                        letterSpacing: type.micro * tracking.label,
                        textTransform: 'uppercase',
                        color: colors.textMuted,
                      }}
                    >
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 10,
                  marginTop: 16,
                }}
              >
                {chef.isVerified ? (
                  <EcoBadge icon="shieldCheck" label="100% Verified Clean" />
                ) : null}
                {chef.ecoBadge ? (
                  <EcoBadge icon="sprout" label={chef.ecoBadge} />
                ) : null}
              </View>
            </View>
          </View>
        </Reveal>
      </Container>

      {/* ---- MENU ---- */}
      <Container style={{ paddingTop: 56 }}>
        <SectionHeader lead="CURATED" accent="MENU" />

        {/* A closed kitchen keeps its listing but cannot be ordered from, so
            say that once at the top rather than only on each greyed button. */}
        {closed ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 11,
              padding: 15,
              marginBottom: 20,
              borderRadius: radius.sm,
              backgroundColor: colors.saffron50,
              borderWidth: 1,
              borderColor: colors.saffron100,
            }}
          >
            <Icon name="moon" size={17} color={colors.saffron} />
            <Text
              style={{
                flex: 1,
                fontFamily: font.ui,
                fontSize: type.sm,
                lineHeight: 21,
                color: colors.text,
              }}
            >
              {chef.name} is not taking orders right now. The menu is here for
              when they open again.
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 14 }}>
          {menu.map((item, i) => (
            <Reveal key={item.id} delay={(i % 5) + 1}>
              <View
                style={[
                  {
                    padding: 16,
                    gap: 16,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.sm,
                ]}
              >
                <Image
                  source={{ uri: item.image }}
                  contentFit="cover"
                  transition={250}
                  style={{
                    width: '100%',
                    height: 180,
                    borderRadius: 20,
                    backgroundColor: colors.sunken,
                  }}
                />

                <View style={{ alignItems: 'center' }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <Heading size={20} style={{ textAlign: 'center' }}>
                      {item.name}
                    </Heading>
                    {item.tags?.[0] ? <Tag label={item.tags[0]} /> : null}
                  </View>

                  <Body muted size={14} style={{ textAlign: 'center' }}>
                    {item.description}
                  </Body>
                </View>

                {/* Below 480px the price and the CTA each get their own line. */}
                <View style={{ gap: 12 }}>
                  <Price size={26} style={{ textAlign: 'center' }}>
                    ৳{item.price}
                  </Price>
                  <Button
                    label={closed ? 'Kitchen closed' : 'Add to cart'}
                    icon={closed ? 'lock' : 'plus'}
                    iconPosition="left"
                    block
                    small
                    disabled={closed}
                    onPress={() => add(item, chef)}
                  />
                </View>
              </View>
            </Reveal>
          ))}

          {!menu.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
              <Icon name="pot" size={30} color={colors.textLight} />
              <Body muted size={15}>
                This kitchen has not published a menu yet.
              </Body>
            </View>
          ) : null}
        </View>
      </Container>
    </Screen>
  );
}
