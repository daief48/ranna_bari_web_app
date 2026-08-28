import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import CartBar from '../../src/components/CartBar';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import { Tag } from '../../src/components/Surfaces';
import { Body, Heading, Price } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useDish, useMenu } from '../../src/data';
import { useCart } from '../../src/store/CartContext';
import { useAuth } from '../../src/store/AuthContext';
import { distanceKm, formatDistance } from '../../src/lib/geo';
import { useLang } from '../../src/i18n/LanguageContext';

/**
 * One dish, on its own page.
 *
 * Search results used to open the kitchen and leave you to find the thing
 * you searched for somewhere in its menu. This is the page that result
 * promised: the dish itself, and under it the kitchen it comes from — which
 * is the fact that decides whether the dish is any use to you.
 */
export default function DishScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t, n } = useLang();
  const { add } = useCart();
  const { account } = useAuth();

  const found = useDish(id);
  const menu = useMenu(found?.chef?.id);

  if (!found) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', gap: 16, paddingTop: 40 }}>
          <Icon name="alertCircle" size={32} color={colors.primary} />
          <Heading size={20}>{t('Dish not found')}</Heading>
          <Body muted size={15} style={{ textAlign: 'center' }}>
            {t('It may have been removed from the menu.')}
          </Body>
          <Button
            label={t('Browse artisans')}
            onPress={() => router.replace('/browse')}
          />
        </Container>
      </Screen>
    );
  }

  const { dish, chef } = found;
  const closed = chef.isOpen === false;

  const km =
    typeof account?.lat === 'number' &&
    typeof account?.lng === 'number' &&
    typeof chef.lat === 'number' &&
    typeof chef.lng === 'number'
      ? distanceKm(
          { lat: account.lat, lng: account.lng },
          { lat: chef.lat, lng: chef.lng },
        )
      : null;
  const away = formatDistance(km, t, n);

  /* The rest of the same menu, so the page is a way into the kitchen rather
     than a dead end. Three is enough to suggest there is more. */
  const alsoHere = menu.filter((d) => String(d.id) !== String(dish.id)).slice(0, 3);

  return (
    <Screen footer={<CartBar />}>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.primary} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: type.xs * tracking.label,
              textTransform: 'uppercase',
              color: colors.primary,
            }}
          >
            {t('Back')}
          </Text>
        </Pressable>

        {/* ---- The dish ---- */}
        <Reveal delay={1}>
          <View
            style={[
              {
                borderRadius: radius.md,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
              },
              shadow.md,
            ]}
          >
            <Image
              source={{ uri: dish.image }}
              contentFit="cover"
              transition={250}
              style={{ width: '100%', height: 230, backgroundColor: colors.sunken }}
            />

            <View style={{ padding: 20 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 14,
                  marginBottom: 12,
                }}
              >
                <Heading size={24} style={{ flex: 1, letterSpacing: -0.5 }}>
                  {dish.name}
                </Heading>
                <Price size={24}>৳{n(dish.price)}</Price>
              </View>

              {dish.description ? (
                <Body muted size={15} style={{ marginBottom: 16 }}>
                  {dish.description}
                </Body>
              ) : null}

              {dish.tags?.length ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 20,
                  }}
                >
                  {dish.tags.map((tag) => (
                    <Tag key={tag} label={t(tag)} />
                  ))}
                </View>
              ) : null}

              <Button
                label={closed ? t('Kitchen closed') : t('Add to cart')}
                icon={closed ? 'lock' : 'plus'}
                iconPosition="left"
                block
                disabled={closed}
                onPress={() => add(dish, chef)}
              />
            </View>
          </View>
        </Reveal>

        {closed ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 11,
              padding: 15,
              marginTop: 16,
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
              {t(
                '{name} is not taking orders right now. The menu is here for when they open again.',
                { name: chef.name },
              )}
            </Text>
          </View>
        ) : null}

        {/* ---- The kitchen behind it ---- */}
        <Reveal delay={2}>
          <View style={{ marginTop: 32 }}>
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: type.sm,
                letterSpacing: type.sm * tracking.label,
                textTransform: 'uppercase',
                color: colors.textMuted,
                marginBottom: 14,
              }}
            >
              {t('From this kitchen')}
            </Text>

            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${chef.name}, ${t(chef.specialty)}`}
              onPress={() => router.push(`/chef/${chef.id}`)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
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
              <Image
                source={{ uri: chef.avatar }}
                contentFit="cover"
                transition={200}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 18,
                  borderWidth: 2,
                  borderColor: colors.raised,
                  backgroundColor: colors.sunken,
                }}
              />

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: font.displayBold,
                    fontSize: 18,
                    letterSpacing: -0.18,
                    color: colors.text,
                  }}
                >
                  {chef.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    fontFamily: font.uiSemi,
                    fontSize: type.xs,
                    color: colors.primary,
                  }}
                >
                  {t(chef.specialty)}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {chef.area}
                  </Text>

                  {away ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        paddingVertical: 2,
                        paddingHorizontal: 7,
                        borderRadius: radius.pill,
                        backgroundColor: colors.sage50,
                      }}
                    >
                      <Icon name="navigation" size={9} color={colors.sage} />
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 10,
                          color: colors.sage,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {away}
                      </Text>
                    </View>
                  ) : null}

                  {chef.reviewCount ? (
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                    >
                      <Icon
                        name="star"
                        size={11}
                        color={colors.saffron}
                        fill={colors.saffron}
                      />
                      <Text
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {n(chef.rating)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <Icon
                name="chevronRight"
                size={17}
                color={colors.textLight}
                strokeWidth={2}
              />
            </Pressable>
          </View>
        </Reveal>

        {/* ---- The rest of the menu ---- */}
        {alsoHere.length ? (
          <Reveal delay={3}>
            <View style={{ marginTop: 28 }}>
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.sm,
                  letterSpacing: type.sm * tracking.label,
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                  marginBottom: 14,
                }}
              >
                {t('More from {name}', { name: chef.name })}
              </Text>

              <View style={{ gap: 10 }}>
                {alsoHere.map((other) => (
                  <Pressable
                    key={other.id}
                    accessibilityRole="link"
                    accessibilityLabel={`${other.name}, ৳${n(other.price)}`}
                    onPress={() => router.replace(`/dish/${other.id}`)}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        padding: 10,
                        borderRadius: radius.lg,
                        backgroundColor: colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: pressed ? colors.primary200 : colors.line,
                      },
                      shadow.xs,
                    ]}
                  >
                    <Image
                      source={{ uri: other.image }}
                      contentFit="cover"
                      transition={150}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        backgroundColor: colors.sunken,
                      }}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        fontFamily: font.uiSemi,
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
                      {other.name}
                    </Text>
                    <Price size={15}>৳{n(other.price)}</Price>
                  </Pressable>
                ))}
              </View>
            </View>
          </Reveal>
        ) : null}
      </Container>
    </Screen>
  );
}
