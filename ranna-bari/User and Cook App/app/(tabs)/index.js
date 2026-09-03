import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import PulseDot from '../../src/components/PulseDot';
import Button from '../../src/components/Button';
import ChefCard from '../../src/components/ChefCard';
import MoodPill from '../../src/components/MoodPill';
import SectionHeader from '../../src/components/SectionHeader';
import TestimonialSlider, { Stars } from '../../src/components/TestimonialSlider';
import Brand from '../../src/components/Brand';
import { BentoBox, IconTile } from '../../src/components/Surfaces';
import { useCart } from '../../src/store/CartContext';
import { useOrders } from '../../src/store/OrdersContext';
import {
  Body,
  Display,
  GradientText,
  Heading,
  Label,
  displayStyle,
} from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useChefs, useReviewSummary } from '../../src/data';
import { useAuth } from '../../src/store/AuthContext';
import { distanceKm } from '../../src/lib/geo';
import { deliversTo } from '../../src/lib/kitchen';
import { MealCard } from '../../src/components/MealBits';
import { StoreCard } from '../../src/components/StoreBits';
import { tomorrowKey, useCommerce } from '../../src/store/CommerceContext';
import { useLang } from '../../src/i18n/LanguageContext';

/** The seven cravings from index.html's mood carousel, in source order. */
const MOODS = [
  { filter: 'healthy', icon: 'activity', label: 'Healthy & Keto' },
  { filter: 'heritage', icon: 'flame', label: 'Heritage Spices' },
  { filter: 'comfort', icon: 'pot', label: 'Comfort Stews' },
  { filter: 'street', icon: 'utensils', label: 'Clean Street Food' },
  { filter: 'sweet', icon: 'dessert', label: 'Sweet Tooth' },
  { filter: 'seafood', icon: 'fish', label: 'Coastal Catch' },
  { filter: 'vegan', icon: 'salad', label: 'Plant-Based' },
];

const STEPS = [
  {
    n: '1',
    icon: 'chefHat',
    variant: 'primary',
    title: 'Pick an Artisan',
    body: 'Browse curated menus from verified home cooks right in your neighbourhood.',
  },
  {
    n: '2',
    icon: 'pot',
    variant: 'saffron',
    title: 'Freshly Prepared',
    body: 'Your meal is cooked to order using fresh, safe, and authentic ingredients.',
  },
  {
    n: '3',
    icon: 'delivery',
    variant: 'sage',
    title: 'Delivered Hot',
    body: 'Enjoy doorstep delivery right in time for breakfast, lunch, or dinner.',
  },
];

const TRUST = [
  {
    icon: 'searchCheck',
    variant: 'primary',
    title: 'Verified Kitchens',
    body: 'Our team personally inspects every home kitchen to ensure it meets strict hygiene and cleanliness standards.',
  },
  {
    icon: 'sprout',
    variant: 'sage',
    title: 'Fresh Ingredients',
    body: 'Chefs are committed to using locally sourced, fresh ingredients just like they would feed their own families.',
  },
  {
    icon: 'star',
    variant: 'saffron',
    title: 'Community Rated',
    body: 'Consistent high quality is maintained through real-time ratings and transparent feedback from foodies like you.',
  },
];

const AVATARS = [
  'https://i.pravatar.cc/100?img=1',
  'https://i.pravatar.cc/100?img=5',
  'https://i.pravatar.cc/100?img=9',
];

export default function HomeScreen() {
  const chefs = useChefs();
  const { account } = useAuth();
  const { orders } = useOrders();
  const { reorder } = useCart();

  /**
   * The last three kitchens worth repeating.
   *
   * By kitchen rather than by order: three rows for the same biryani ordered
   * three Fridays running is not three choices, it is one. The most recent
   * order from each is the one offered, because that is the basket they last
   * actually wanted.
   */
  /**
   * Somebody who has ordered has already been sold to.
   *
   * Keyed on having ordered at all rather than on being signed in: an account
   * with no orders behind it is still deciding, and the sections that explain
   * the platform are exactly what it is deciding on.
   */
  const returning = (orders?.length ?? 0) > 0;

  const again = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const order of orders ?? []) {
      if (!order?.items?.length) continue;
      const key = order.chefId ?? order.chefName;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(order);
      if (out.length === 3) break;
    }
    return out;
  }, [orders]);
  const { mealsNearby, remaining: mealRemaining, storesNearby } = useCommerce();
  const { colors, shadow, isDark } = useTheme();
  const r = useResponsive();
  const router = useRouter();
  const [area, setArea] = useState('');
  const { t, n } = useLang();

  const summary = useReviewSummary();
  const chefName = useMemo(() => {
    const map = new Map(chefs.map((c) => [String(c.id), c.name]));
    return (id) => map.get(String(id)) ?? 'a home kitchen';
  }, [chefs]);

  const reviews = useMemo(() => {
    return chefs.slice(0, 10).map((chef, idx) => ({
      id: String(chef.id),
      chefId: chef.id,
      rating: chef.rating || 5,
      text: chef.description || `${chef.name} prepares fresh, home-cooked culinary specialties with authentic ingredients.`,
      author: chef.ownerName || chef.name || 'Verified Foodie',
      location: chef.area || 'Dhaka',
      avatar: chef.avatar || `https://i.pravatar.cc/100?img=${(idx % 20) + 1}`,
    }));
  }, [chefs]);

  /**
   * The three kitchens under "the highest-rated artists near you".
   *
   * It used to be the first three rows of the file, which was neither
   * highest-rated nor near anyone -- and once browse started honouring each
   * cook's delivery radius, it was also the one screen left showing kitchens
   * that cannot reach you. Rated first among the ones that can.
   */
  const featured = useMemo(() => {
    const origin =
      typeof account?.lat === 'number' && typeof account?.lng === 'number'
        ? { lat: account.lat, lng: account.lng }
        : null;

    const reachable = chefs.filter((c) => {
      if (!origin || typeof c.lat !== 'number' || typeof c.lng !== 'number') {
        return true;
      }
      return deliversTo(c, distanceKm(origin, { lat: c.lat, lng: c.lng }));
    });

    return [...reachable]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 3);
  }, [chefs, account]);

  const tomorrowsMeals = useMemo(() => {
    const origin =
      typeof account?.lat === 'number' && typeof account?.lng === 'number'
        ? { lat: account.lat, lng: account.lng }
        : null;
    return mealsNearby(origin, { day: tomorrowKey() }).slice(0, 6);
  }, [mealsNearby, account]);

  const shops = useMemo(() => {
    const origin =
      typeof account?.lat === 'number' && typeof account?.lng === 'number'
        ? { lat: account.lat, lng: account.lng }
        : null;
    return storesNearby(origin).filter((row) => row.products > 0).slice(0, 5);
  }, [storesNearby, account]);

  const search = () =>
    router.push({ pathname: '/browse', params: area ? { q: area } : {} });

  return (
    <Screen>
      {/* ============ HERO BENTO ============
          Twelve columns on desktop; one column on a phone, in source order. */}
      <Container style={{ gap: 16 }}>
        <Reveal delay={1}>
          <BentoBox style={{ paddingVertical: 32, paddingHorizontal: 20 }}>
            {/* The two radial washes on .hero-main: saffron from the top-right
                corner, primary from the bottom-left. */}
            <LinearGradient
              pointerEvents="none"
              colors={[
                isDark ? `rgba(${colors.rgbSaffron}, 0.11)` : colors.saffron50,
                'transparent',
                isDark ? `rgba(${colors.rgbPrimary}, 0.12)` : colors.primary50,
              ]}
              locations={[0, 0.55, 1]}
              start={{ x: 0.95, y: 0 }}
              end={{ x: 0.05, y: 1 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 10,
                paddingVertical: 7,
                paddingHorizontal: 14,
                marginBottom: 18,
                borderRadius: radius.pill,
                backgroundColor: colors.raised,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <PulseDot />
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: 11,
                  letterSpacing: 11 * tracking.label,
                  textTransform: 'uppercase',
                  color: colors.text,
                }}
              >
                {t('100% Authentic Home Kitchens')}
              </Text>
            </View>

            {/* "CRAFTED AT HOME." — only HOME. takes the gradient, so the
                first two words and the gradient word share one wrapping row. */}
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <Display>{t('CRAFTED AT')} </Display>
                <GradientText style={displayStyle(r.heroTitle)}>{t('HOME.')}</GradientText>
              </View>
              <Display>{t('DELIVERED TO YOU.')}</Display>
            </View>

            <Body muted size={15} style={{ marginBottom: 28 }}>
              {t('Experience the finest home-cooked meals from verified culinary artisans in your neighbourhood. Authentic. Fresh. Made with love.')}
            </Body>

            {/* .hero-search-modern stacks on phones: field over full-width button */}
            <View
              style={[
                {
                  backgroundColor: colors.raised,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: radius.md,
                  padding: 10,
                  gap: 10,
                },
                shadow.md,
              ]}
            >
              <TextInput
                value={area}
                onChangeText={setArea}
                onSubmitEditing={search}
                returnKeyType="search"
                /* The full sentence is cut off mid-word in a 320px field, which
                     reads as a rendering fault rather than as a hint. */
                placeholder={r.xs ? t('Search food or kitchens…') : t('Search a dish, kitchen or area…')}
                placeholderTextColor={colors.textLight}
                style={{
                  fontFamily: font.ui,
                  fontSize: 16,
                  color: colors.text,
                  paddingVertical: 12,
                  paddingHorizontal: 10,
                }}
              />
              <Button label={t('Find Food')} onPress={search} block />
            </View>
          </BentoBox>
        </Reveal>

        {/* Featured dish tile */}
        <Reveal delay={2}>
          <BentoBox
            onPress={() =>
              router.push({ pathname: '/browse', params: { filter: 'lunch' } })
            }
            accessibilityRole="link"
            accessibilityLabel={t('Featured')}
            style={{ minHeight: 260, justifyContent: 'flex-end' }}
          >
            <Image
              source={{
                uri: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80',
              }}
              contentFit="cover"
              transition={250}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(24, 14, 11, 0)',
                'rgba(24, 14, 11, 0.24)',
                'rgba(24, 14, 11, 0.86)',
              ]}
              locations={[0.28, 0.55, 1]}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            <View style={{ padding: 24 }}>
              <View
                style={[
                  {
                    alignSelf: 'flex-start',
                    paddingVertical: 5,
                    paddingHorizontal: 12,
                    borderRadius: radius.pill,
                    backgroundColor: colors.raised,
                    marginBottom: 12,
                  },
                  shadow.xs,
                ]}
              >
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 10,
                    letterSpacing: 10 * tracking.label,
                    textTransform: 'uppercase',
                    color: colors.primary,
                  }}
                >
                  {t('Featured')}
                </Text>
              </View>

              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: r.bentoImgTitle,
                  lineHeight: r.bentoImgTitle * 1.12,
                  letterSpacing: r.bentoImgTitle * -0.025,
                  color: '#FFFFFF',
                  maxWidth: '72%',
                }}
              >
                {'Authentic\nMutton Curry'}
              </Text>
            </View>

            <View
              style={{
                position: 'absolute',
                bottom: 24,
                right: 24,
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.16)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.26)',
              }}
            >
              <Icon name="arrowRight" size={18} color="#FFFFFF" strokeWidth={2} />
            </View>
          </BentoBox>
        </Reveal>

        {/* Trust stat */}
        <Reveal delay={3}>
          <BentoBox
            style={{
              minHeight: 150,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <Text
              style={{
                fontFamily: font.displayExtra,
                fontSize: r.statNumber,
                lineHeight: r.statNumber * 1.06,
                letterSpacing: r.statNumber * -0.03,
                color: colors.text,
              }}
            >
              50+
            </Text>
            <Label style={{ marginTop: 4, textAlign: 'center' }}>
              {t('Verified Artisans')}
            </Label>

            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              {AVATARS.map((uri, i) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  contentFit="cover"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    borderWidth: 2,
                    borderColor: colors.raised,
                    marginLeft: i === 0 ? 0 : -12,
                    backgroundColor: colors.sunken,
                  }}
                />
              ))}
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  marginLeft: -12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.saffron,
                  borderWidth: 2,
                  borderColor: colors.raised,
                }}
              >
                <Text style={{ fontFamily: font.uiBold, fontSize: 12, color: '#FFFFFF' }}>
                  +
                </Text>
              </View>
            </View>
          </BentoBox>
        </Reveal>

        {/* Live map shortcut */}
        <Reveal delay={4}>
          <BentoBox
            onPress={() => router.push('/map')}
            accessibilityRole="link"
            accessibilityLabel={t('Kitchen map')}
            style={{
              minHeight: 150,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <DotGrid color={colors.primary} />

            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary50,
              }}
            >
              <Icon name="map" size={30} color={colors.primary} strokeWidth={1.6} />
            </View>

            <Text
              style={{
                marginTop: 12,
                textAlign: 'center',
                fontFamily: font.uiSemi,
                fontSize: 16,
                lineHeight: 20,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: colors.primary,
              }}
            >
              {t('Kitchen map')}
            </Text>

            <View
              style={{
                position: 'absolute',
                bottom: 24,
                right: 24,
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.textLight,
              }}
            >
              <Icon name="chevronRight" size={18} color={colors.text} strokeWidth={2} />
            </View>
          </BentoBox>
        </Reveal>
      </Container>

      {/* ============ ORDER AGAIN ============
          Nothing at all for somebody who has not ordered, so a first visit
          sees the page it always did. */}
      {again.length ? (
        <Container style={{ marginTop: 28 }}>
          <Reveal delay={1}>
            <SectionHeader
              lead={t('ORDER')}
              accent={t('AGAIN')}
              subtitle={t('Straight back into your basket.')}
              action={t('All orders')}
              onAction={() => router.push('/orders')}
            />
          </Reveal>

          <Reveal delay={2}>
            <View style={{ gap: 10, marginTop: 14 }}>
              {again.map((order) => (
                <Pressable
                  key={order.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('Order {title} again', { title: order.title })}
                  onPress={() => {
                    const added = reorder(order);
                    if (added) router.push('/cart');
                  }}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 13,
                      padding: 12,
                      borderRadius: radius.lg,
                      backgroundColor: colors.surfaceSolid,
                      borderWidth: 1,
                      borderColor: pressed ? colors.primary200 : colors.line,
                    },
                    shadow.xs,
                  ]}
                >
                  <Image
                    source={{ uri: order.image }}
                    contentFit="cover"
                    transition={150}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 16,
                      backgroundColor: colors.sunken,
                    }}
                  />

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 15.5,
                        letterSpacing: -0.15,
                        color: colors.text,
                      }}
                    >
                      {order.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        marginTop: 2,
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {order.chefName}
                      {order.items.length > 1
                        ? ' · ' + t('{n} items', { n: n(order.items.length) })
                        : ''}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      borderRadius: radius.pill,
                      backgroundColor: colors.primary50,
                    }}
                  >
                    <Icon name="plus" size={13} color={colors.primary} strokeWidth={2.4} />
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 12.5,
                        color: colors.primary,
                      }}
                    >
                      {t('Again')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Reveal>
        </Container>
      ) : null}

      {/* ============ MOOD CAROUSEL ============
          Edge-to-edge scroller: it bleeds past the container to the screen
          edges so a part-cut pill is an honest "scroll me" signal. */}
      <View style={{ paddingTop: 36, paddingBottom: 20 }}>
        <Container>
          <Heading size={20} style={{ marginBottom: 16 }}>
            {t('What are you craving?')}
          </Heading>
        </Container>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: 10,
            paddingHorizontal: r.gutter,
            paddingTop: 12,
            paddingBottom: 20,
          }}
          snapToAlignment="start"
          decelerationRate="fast"
        >
          {MOODS.map((m) => (
            <MoodPill
              key={m.filter}
              icon={m.icon}
              label={t(m.label)}
              onPress={() =>
                router.push({ pathname: '/browse', params: { filter: m.filter } })
              }
            />
          ))}
        </ScrollView>
      </View>

      {/* ============ TOMORROW'S MEALS ============
          Pre-booking only works if people see it the evening before, and the
          home screen is where they are. Hidden entirely when no kitchen near
          them has planned anything: an empty rail here would teach people to
          scroll past this spot. */}
      {tomorrowsMeals.length ? (
        <View style={{ paddingTop: 16, paddingBottom: 20 }}>
          <Container>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <Heading size={20} style={{ flex: 1 }}>
                {t('Tomorrow’s meals near you')}
              </Heading>
              <Button
                variant="glass"
                small
                label={t('See all')}
                onPress={() => router.push('/meals')}
              />
            </View>
          </Container>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingHorizontal: r.gutter, paddingVertical: 2 }}
          >
            {tomorrowsMeals.map(({ meal, km }) => (
              <MealCard
                key={meal.id}
                meal={meal}
                km={km}
                remaining={mealRemaining(meal)}
                interested={meal.interestCount ?? 0}
                wide
                onPress={() => router.push(`/meals/${meal.id}`)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* ============ HOME SHOPS ============
          Cakes and jars keep, so they are a different errand from dinner --
          and a different one from a kitchen, which is why they are not in
          Browse. Hidden when nobody near you has opened one. */}
      {shops.length ? (
        <View style={{ paddingTop: 16, paddingBottom: 20 }}>
          <Container>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <Heading size={20} style={{ flex: 1 }}>
                {t('Home shops near you')}
              </Heading>
              <Button
                variant="glass"
                small
                label={t('See all')}
                onPress={() => router.push('/stores')}
              />
            </View>
          </Container>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingHorizontal: r.gutter, paddingVertical: 2 }}
          >
            {shops.map(({ store, km, products }) => (
              <View key={store.id} style={{ width: 260 }}>
                <StoreCard
                  store={store}
                  km={km}
                  products={products}
                  onPress={() => router.push(`/stores/${store.id}`)}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* ============ HOW IT WORKS ============
          First visit only. Somebody who has ordered knows how it works; they
          proved it by ordering. */}
      {returning ? null : (
      <Container style={{ paddingTop: 20, paddingBottom: 56 }}>
        <SectionHeader
          center
          lead={t('HOW IT')}
          accent={t('WORKS')}
          subtitle={t('From their kitchen to your table in 3 simple steps')}
        />

        <View style={{ gap: 16 }}>
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i + 1}>
              <BentoBox
                style={{
                  paddingVertical: 32,
                  paddingHorizontal: 22,
                  alignItems: 'center',
                }}
              >
                {/* The ghost step numeral: 140px Fraunces at 3% opacity */}
                <Text
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: -22,
                    right: -10,
                    fontFamily: font.displayBlack,
                    fontSize: 140,
                    lineHeight: 140,
                    opacity: 0.03,
                    color: colors.text,
                  }}
                >
                  {s.n}
                </Text>

                <IconTile
                  name={s.icon}
                  variant={s.variant}
                  large
                  style={{ marginBottom: 24 }}
                />
                <Heading size={19} style={{ marginBottom: 16, textAlign: 'center' }}>
                  {t(s.title)}
                </Heading>
                <Body muted size={15} style={{ textAlign: 'center' }}>
                  {t(s.body)}
                </Body>
              </BentoBox>
            </Reveal>
          ))}
        </View>
      </Container>
      )}

      {/* ============ FEATURED CHEFS ============ */}
      <Container style={{ paddingBottom: 56 }}>
        <SectionHeader
          lead={t('FEATURED')}
          accent={t('CHEFS')}
          subtitle={t('The highest-rated culinary artists near you')}
          right={
            <Button
              variant="glass"
              label={t('View all')}
              onPress={() => router.push('/browse')}
            />
          }
        />

        <View style={{ gap: 16 }}>
          {featured.map((c, i) => (
            <ChefCard key={c.id} chef={c} index={i} />
          ))}
        </View>
      </Container>

      {/* ============ TESTIMONIALS ============ */}
      <View style={{ paddingVertical: 56, backgroundColor: colors.sunken }}>
        <Container>
          <SectionHeader
            lead={t('WHAT')}
            accent={t('FOODIES')}
            trail={t('SAY')}
            subtitle={t('Real orders, real kitchens, real neighbours.')}
            style={{ marginBottom: 28 }}
            right={
              <View
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.sm,
                ]}
              >
                <Text
                  style={{
                    fontFamily: font.displayExtra,
                    fontSize: 26,
                    lineHeight: 28,
                    letterSpacing: -0.5,
                    color: colors.text,
                  }}
                >
                  {summary.average.toFixed(1)}
                </Text>
                <View style={{ gap: 3 }}>
                  <Stars rating={summary.average} size={14} />
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {n(summary.count)} {t('verified reviews')}
                  </Text>
                </View>
              </View>
            }
          />
        </Container>

        <TestimonialSlider reviews={reviews} chefName={chefName} />
      </View>

      {/* ============ THE RANNABARI STANDARD ============
          The trust pitch, and the same reasoning: it is an argument for
          ordering, read by somebody who already has. */}
      {returning ? null : (
      <Container style={{ paddingVertical: 56, gap: 16 }}>
        <Reveal delay={1}>
          <LinearGradient
            colors={[colors.heroMid, colors.heroTo]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={[{ borderRadius: 28, paddingVertical: 24, paddingHorizontal: 20 }, shadow.md]}
          >
            <Icon
              name="shield"
              size={36}
              color={colors.onHero}
              style={{ opacity: 0.85, marginBottom: 20 }}
            />
            <Text
              style={{
                fontFamily: font.displayExtra,
                fontSize: 28,
                lineHeight: 31,
                letterSpacing: -0.6,
                color: colors.onHero,
                marginBottom: 16,
              }}
            >
              {'THE RANNABARI\nSTANDARD'}
            </Text>
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 14,
                lineHeight: 22,
                opacity: 0.9,
                color: colors.onHero,
              }}
            >
              {t('We take your safety and health seriously. Every home cook on our platform goes through a rigorous vetting process so you can eat with complete peace of mind.')}
            </Text>
          </LinearGradient>
        </Reveal>

        {/* Below 480px the three trust points stop being icon-beside-text rows
            and become centred stacks. */}
        {TRUST.map((item, i) => (
          <Reveal key={item.title} delay={i + 2}>
            <BentoBox
              style={{
                paddingVertical: 24,
                paddingHorizontal: 20,
                alignItems: 'center',
                gap: 16,
              }}
            >
              <IconTile name={item.icon} variant={item.variant} />
              <View style={{ alignItems: 'center' }}>
                <Heading size={17} style={{ marginBottom: 8, textAlign: 'center' }}>
                  {t(item.title)}
                </Heading>
                <Body muted size={14} style={{ textAlign: 'center' }}>
                  {t(item.body)}
                </Body>
              </View>
            </BentoBox>
          </Reveal>
        ))}
      </Container>
      )}

      {/* ============ FOOTER ============ */}
      <View
        style={{
          paddingTop: 40,
          paddingHorizontal: r.gutter,
          alignItems: 'center',
          borderTopWidth: 1,
          borderTopColor: colors.line2,
        }}
      >
        <View style={{ marginBottom: 24 }}>
          <Brand size={20} markSize={34} />
        </View>
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: 21,
            textAlign: 'center',
            color: colors.textLight,
          }}
        >
          {t('© 2026 RannaBari. Shaping the future of localized gastronomy with authentic flavor.')}
        </Text>
      </View>
    </Screen>
  );
}

/**
 * The dot positions, worked out once.
 *
 * 198 absolutely-positioned dots at 5% opacity — texture behind the map tile,
 * not content. The positions never change, so building them inside the
 * component meant every render of the home screen produced 198 fresh elements
 * for React to reconcile in service of something nobody consciously sees.
 *
 * Only the colour varies with the theme, so that stays a prop and the
 * geometry is shared.
 */
const DOT_POSITIONS = Array.from({ length: 9 }, (_, y) =>
  Array.from({ length: 22 }, (_, x) => ({ key: `${x}-${y}`, left: x * 20, top: y * 20 })),
).flat();

/** `.map-bg-pattern` — the 20px dot grid at 5% opacity behind the map tile. */
function DotGrid({ color }) {
  const dots = DOT_POSITIONS.map((d) => (
    <View
      key={d.key}
      style={{
        position: 'absolute',
        left: d.left,
        top: d.top,
        width: 2,
        height: 2,
        borderRadius: 1,
        backgroundColor: color,
      }}
    />
  ));

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05 }}
    >
      {dots}
    </View>
  );
}
