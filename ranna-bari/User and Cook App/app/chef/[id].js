import React, { useCallback, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import CartBar from '../../src/components/CartBar';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import SectionHeader from '../../src/components/SectionHeader';
import { useNavbarOffset } from '../../src/components/Navbar';
import { Badge, EcoBadge, Tag } from '../../src/components/Surfaces';
import { Body, Heading, Price } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, type } from '../../src/theme/tokens';
import { useChef, useMenu } from '../../src/data';
import { useCart } from '../../src/store/CartContext';
import DistanceChip from '../../src/components/DistanceChip';
import { isOpenNow } from '../../src/lib/kitchen';
import { useCommerce } from '../../src/store/CommerceContext';
import { useLang } from '../../src/i18n/LanguageContext';

/**
 * One kitchen, and its menu.
 *
 * Laid out the way `stores/[id]` already lays out a shop: a full-bleed cover
 * with the identity riding up over it, then left-aligned copy. The two pages
 * do the same job for the same customer and used to look like they came from
 * different apps — this one centred every line, stacked its facts into a
 * white card floating below the image, and gave each dish a full-width
 * photograph with the name, the description, the price and the button all
 * centred under it. That is roughly a screen and a half per dish, so a cook
 * with eight of them had a menu nobody reached the bottom of.
 *
 * The menu is rows now. A thumbnail, the name, two lines of description, the
 * price, and one round button to add it — which is the shape every list in
 * this app that people actually get through already uses.
 */
export default function ChefScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const router = useRouter();
  const { add } = useCart();
  const { t, n } = useLang();

  /* Under the floating bar rather than at a guessed offset, the same way the
     shop page places its own — 52 sat behind the brand pill on a notch. */
  const backTop = useNavbarOffset() - 18;

  const chef = useChef(id);
  const menu = useMenu(id);

  /* A cook can run a shop as well as a kitchen. If they do, this is the only
     place a customer already looking at them would think to find it. */
  const commerce = useCommerce();
  const shop = commerce.storeForKitchen(id);

  if (!chef) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', gap: 16, paddingTop: 40 }}>
          <Icon name="alertCircle" size={32} color={colors.primary} />
          <Heading size={20}>{t('Kitchen not found')}</Heading>
          <Body muted size={15} style={{ textAlign: 'center' }}>
            {t('That kitchen is no longer listed.')}
          </Body>
          <Button label={t('Browse artisans')} onPress={() => router.replace('/browse')} />
        </Container>
      </Screen>
    );
  }

  const closed = !isOpenNow(chef);

  /* The gallery arrives from `/kitchens/:id` a moment after the page paints,
     so this is empty on the first render of every kitchen and the section
     below is absent rather than a row of grey boxes. */
  const photos = Array.isArray(chef.photos) ? chef.photos.filter(Boolean) : [];

  /*
   * The facts, as one line rather than three tall columns.
   *
   * A kitchen with no reviews has no score to show, so it shows none — and
   * the entry is dropped rather than printed as a dash, because a row of
   * facts is scanned and a dash is a fact that has to be decoded.
   */
  const facts = [
    chef.reviewCount
      ? { icon: 'star', text: `${n(chef.rating)} (${n(chef.reviewCount)})` }
      : { icon: 'sparkles', text: t('New kitchen') },
    { icon: 'pot', text: t('{n} dishes', { n: n(menu.length) }) },
    chef.area ? { icon: 'pin', text: chef.area } : null,
  ].filter(Boolean);

  return (
    <Screen footer={<CartBar />} contentStyle={{ paddingTop: 0 }}>
      {/* ---- COVER ----
          Full bleed and taller than the old 200px inset image, because it is
          the only thing on the page that says what this kitchen feels like
          before a single word is read. */}
      <View>
        <Image
          source={{ uri: chef.coverImage }}
          contentFit="cover"
          transition={250}
          style={{ width: '100%', height: 230, backgroundColor: colors.sunken }}
        />
        {/* Only over the lower half: the scrim exists so the chips at the top
            and the avatar at the bottom stay legible on a bright photograph,
            not to dim the picture. */}
        <LinearGradient
          colors={['transparent', `rgba(${colors.scrim}, 0.55)`]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '40%' }}
        />

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('Back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}
          style={({ pressed }) => ({
            position: 'absolute',
            top: backTop,
            left: 16,
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 19,
            backgroundColor: 'rgba(20, 16, 14, 0.5)',
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          <Icon name="arrowLeft" size={18} color="#FFFFFF" strokeWidth={2} />
        </Pressable>

        {/* Whether they are cooking, said once and said first. It used to be
            discoverable only by reaching the menu and finding every button
            greyed out. */}
        <View
          style={{
            position: 'absolute',
            top: backTop,
            right: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 7,
            paddingHorizontal: 11,
            borderRadius: radius.pill,
            backgroundColor: 'rgba(20, 16, 14, 0.5)',
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: closed ? colors.ink3 : colors.sage,
            }}
          />
          <Text
            maxFontSizeMultiplier={1.2}
            style={{
              fontFamily: font.uiBold,
              fontSize: 10.5,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: '#FFFFFF',
            }}
          >
            {closed ? t('Closed') : t('Open now')}
          </Text>
        </View>
      </View>

      {/* ---- IDENTITY ---- */}
      <Container style={{ paddingTop: 0 }}>
        <Image
          source={{ uri: chef.avatar }}
          contentFit="cover"
          transition={250}
          style={[
            {
              width: 78,
              height: 78,
              marginTop: -30,
              borderRadius: 26,
              borderWidth: 3,
              borderColor: colors.canvas,
              backgroundColor: colors.sunken,
            },
            shadow.sm,
          ]}
        />

        <View style={{ gap: 9, marginTop: 14 }}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
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
            {chef.rating >= 4.8 ? <Badge tone="accent" label={t('Top Artisan')} /> : null}
          </View>

          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs + 1,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.primary,
            }}
          >
            {t(chef.specialty)}
          </Text>

          {/* ---- the facts, in one scannable row ----
              Rating, dishes, area and distance were a centred grid of display
              numerals, a centred uppercase line and a centred chip — three
              blocks and about 140px for four short facts.

              Each separator lives *inside* the fact it precedes. As a sibling
              it was laid out as its own wrappable item, so a row that broke
              before a long area name left the dot stranded at the end of the
              line above, reading as a typo. */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              marginTop: 2,
            }}
          >
            {facts.map((f, i) => (
              <View
                key={f.icon}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                {i ? (
                  <View
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: 2,
                      marginRight: 3,
                      backgroundColor: colors.textLight,
                    }}
                  />
                ) : null}
                <Icon name={f.icon} size={13} color={colors.textLight} />
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: type.xs + 1,
                    color: colors.textMuted,
                  }}
                >
                  {f.text}
                </Text>
              </View>
            ))}
            <DistanceChip target={chef} kind="kitchen" />
          </View>

          {chef.description ? (
            <Body muted size={14.5} style={{ marginTop: 4, lineHeight: 22 }}>
              {chef.description}
            </Body>
          ) : null}

          {chef.isVerified || chef.ecoBadge ? (
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}
            >
              {chef.isVerified ? (
                <EcoBadge icon="shieldCheck" label="100% Verified Clean" />
              ) : null}
              {chef.ecoBadge ? <EcoBadge icon="sprout" label={chef.ecoBadge} /> : null}
            </View>
          ) : null}
        </View>
      </Container>

      {/* ---- THE KITCHEN ----
          The room the food is cooked in, which is the one thing a customer
          cannot infer from a menu. The cook submits these at registration and
          an operator approves the kitchen on them; until recently the only
          people who ever saw them were the operator and the cook.

          Horizontal rather than a wrapped grid: these are worth looking at
          rather than counting, and a phone can show one properly or five as
          thumbnails. */}
      {photos.length ? (
        <Container style={{ paddingTop: 34 }}>
          <Reveal delay={2}>
            <SectionHeader
              small
              lead={t('THE')}
              accent={t('KITCHEN')}
              subtitle={t('Where your food is cooked.')}
            />
            <KitchenGallery photos={photos} />
          </Reveal>
        </Container>
      ) : null}

      {/* ---- their shop, if they keep one ---- */}
      {shop ? (
        <Container style={{ paddingTop: 28 }}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/stores/${shop.id}`)}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: pressed ? colors.primary200 : colors.line,
              },
              shadow.sm,
            ]}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary50,
              }}
            >
              <Icon name="box" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ fontFamily: font.uiSemi, fontSize: type.sm + 2, color: colors.text }}
              >
                {shop.name}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
              >
                {shop.tagline || t('Cakes, pitha, achar and gifts')}
              </Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.textLight} />
          </Pressable>
        </Container>
      ) : null}

      {/* ---- MENU ---- */}
      <Container style={{ paddingTop: 34 }}>
        <SectionHeader lead={t('CURATED')} accent={t('MENU')} />

        {/* A closed kitchen keeps its listing but cannot be ordered from, so
            say that once at the top rather than only on each greyed button. */}
        {closed ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 11,
              padding: 15,
              marginBottom: 18,
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
              {t('{name} is not taking orders right now. The menu is here for when they open again.', { name: chef.name })}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          {menu.map((item, i) => (
            <Reveal key={item.id} delay={(i % 5) + 1}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={item.name}
                onPress={() => router.push(`/dish/${item.id}`)}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    gap: 13,
                    padding: 11,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: pressed ? colors.primary200 : colors.line,
                  },
                  shadow.sm,
                ]}
              >
                <Image
                  source={{ uri: item.image }}
                  contentFit="cover"
                  transition={200}
                  style={{
                    width: 94,
                    height: 94,
                    borderRadius: radius.sm,
                    backgroundColor: colors.sunken,
                  }}
                />

                <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-between' }}>
                  <View style={{ gap: 4 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 17,
                        letterSpacing: -0.2,
                        color: colors.text,
                      }}
                    >
                      {item.name}
                    </Text>
                    {/* Two lines, then it stops. A description that runs to
                        five makes every row a different height and the list
                        stops being a list. */}
                    <Text
                      numberOfLines={2}
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs + 1,
                        lineHeight: 18,
                        color: colors.textMuted,
                      }}
                    >
                      {item.description}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                      gap: 10,
                      marginTop: 8,
                    }}
                  >
                    {/* `flex-start`, or the column stretches its children and
                        a tag meant to hug two words runs the whole width. */}
                    <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 5 }}>
                      {item.tags?.[0] ? <Tag label={item.tags[0]} /> : null}
                      <Price size={19}>৳{n(item.price)}</Price>
                    </View>

                    {/* Round and quiet rather than a full-width bar. The row
                        is the dish; this is the one thing you do to it, and a
                        button as wide as the card was competing with the food
                        for the eye. Closed locks it rather than hiding it, so
                        the reason stays visible. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: closed }}
                      accessibilityLabel={
                        closed
                          ? t('Kitchen closed')
                          : t('Add {name} to cart', { name: item.name })
                      }
                      disabled={closed}
                      onPress={() => add(item, chef)}
                      style={({ pressed }) => ({
                        width: 38,
                        height: 38,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 14,
                        backgroundColor: closed ? colors.sunken : colors.primary,
                        transform: [{ scale: pressed ? 0.9 : 1 }],
                      })}
                    >
                      <Icon
                        name={closed ? 'lock' : 'plus'}
                        size={17}
                        color={closed ? colors.textLight : colors.onPrimary}
                        strokeWidth={2.4}
                      />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </Reveal>
          ))}

          {!menu.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
              <Icon name="pot" size={30} color={colors.textLight} />
              <Body muted size={15}>
                {t('This kitchen has not published a menu yet.')}
              </Body>
            </View>
          ) : null}
        </View>
      </Container>
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * the kitchen gallery
 * ------------------------------------------------------------------ */

/** The slice of the next card left showing, so the row reads as a slider. */
const PEEK = 44;
const GAP = 12;
/** How long each photograph holds before the slider moves itself on. */
const DWELL = 4000;
/** And how long it leaves you alone after you have touched it. */
const RESUME_AFTER = 7000;

/**
 * The cook's photographs, as a slider.
 *
 * It was a free-scrolling strip of 208px thumbnails, which is a row of
 * evidence rather than something anybody looks at — and at that size a
 * kitchen is unreadable. This is one photograph at a time, big enough to
 * judge, snapping so a swipe lands somewhere rather than drifting.
 *
 * Everything that moves is driven by the scroll offset rather than by an
 * index in state: the neighbouring card scales and fades *as* you drag, and
 * the dots stretch with it, instead of both jumping when a threshold is
 * crossed. It also means no re-render per frame — the whole thing is one
 * shared value read by workletised styles.
 */
function KitchenGallery({ photos }) {
  const { colors } = useTheme();
  const r = useResponsive();
  const { t } = useLang();
  const reduced = useReducedMotion();

  /* Capped, or a tablet gets one enormous photograph and no sense of a set. */
  const cardW = Math.min(r.width - r.gutter * 2 - PEEK, 460);
  const step = cardW + GAP;

  const ref = useAnimatedRef();
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });

  /*
   * Advancing on its own, and getting out of the way when it should.
   *
   * `pausedUntil` is a timestamp rather than a boolean so one ref covers both
   * halves of the rule: touching the slider sets it to forever, letting go
   * sets it to a few seconds out. No second timer, and no way to leave the
   * thing paused because a resume never fired.
   */
  const pausedUntil = useRef(0);
  /*
   * Direction, because it turns round at the ends rather than looping.
   *
   * Wrapping from the last photograph to the first means animating backwards
   * across every slide — a long sweep that reads as the page glitching — and
   * jumping there without animation is a hard cut in the middle of something
   * whose whole job is to drift. Turning round costs nothing and looks
   * deliberate.
   */
  const direction = useRef(1);

  useFocusEffect(
    useCallback(() => {
      /* Nothing to advance through, or somebody has asked the system to stop
         moving things at them. `Reveal` honours the same setting. */
      if (reduced || photos.length < 2) return undefined;

      const timer = setInterval(() => {
        if (Date.now() < pausedUntil.current) return;

        /* Read from where the slider actually is, not from a counter kept
           beside it — a manual swipe moves one of those and not the other. */
        const at = Math.round(x.value / step);
        let next = at + direction.current;
        if (next >= photos.length) {
          direction.current = -1;
          next = at - 1;
        } else if (next < 0) {
          direction.current = 1;
          next = at + 1;
        }

        ref.current?.scrollTo({ x: next * step, animated: true });
      }, DWELL);

      return () => clearInterval(timer);
    }, [photos.length, step, reduced, ref, x]),
  );

  const hold = () => {
    pausedUntil.current = Number.POSITIVE_INFINITY;
  };
  const release = () => {
    pausedUntil.current = Date.now() + RESUME_AFTER;
  };

  return (
    <View>
      <Animated.ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        /* Touch as well as drag: on web a wheel or a trackpad swipe moves the
           row without ever beginning a drag, and the slider stealing the
           photograph out from under somebody mid-scroll is the whole reason
           autoplay gets turned off in other apps. */
        onTouchStart={hold}
        onScrollBeginDrag={hold}
        onScrollEndDrag={release}
        onMomentumScrollEnd={release}
        onTouchEnd={release}
        /* Snapping to the card pitch with momentum disabled is what makes a
           flick advance exactly one photograph instead of four. */
        snapToInterval={step}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        accessibilityLabel={t('Photos of this kitchen')}
        /* Bleeding past the container and padding it back keeps the first
           photograph on the page's left margin while the row still runs off
           the right edge. */
        style={{ marginHorizontal: -r.gutter }}
        contentContainerStyle={{
          gap: GAP,
          paddingHorizontal: r.gutter,
          /* Room for the scaled card's shadow, which a tight box clips. */
          paddingVertical: 4,
        }}
      >
        {photos.map((uri, i) => (
          <Slide
            key={`${i}-${uri.slice(-24)}`}
            uri={uri}
            index={i}
            x={x}
            step={step}
            width={cardW}
          />
        ))}
      </Animated.ScrollView>

      {/* One photograph needs no map of where you are in it. */}
      {photos.length > 1 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 16,
            alignSelf: 'center',
          }}
        >
          {photos.map((uri, i) => (
            <Dot key={`${i}-${uri.slice(-12)}`} index={i} x={x} step={step} color={colors.primary} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** One photograph, largest when it is the one you are looking at. */
function Slide({ uri, index, x, step, width }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();
  const reduced = useReducedMotion();

  const style = useAnimatedStyle(() => {
    if (reduced) return {};
    const away = Math.abs(x.value / step - index);
    return {
      transform: [{ scale: interpolate(away, [0, 1], [1, 0.94], Extrapolation.CLAMP) }],
      /* Dimmed, not hidden. Far enough to say "not this one", nowhere near
         far enough to read as a picture that failed to load. */
      opacity: interpolate(away, [0, 1], [1, 0.72], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View style={style}>
      <Image
        source={{ uri }}
        contentFit="cover"
        transition={220}
        accessibilityLabel={t('A photo of this kitchen')}
        style={[
          {
            width,
            height: Math.round(width * 0.72),
            borderRadius: radius.md,
            backgroundColor: colors.sunken,
            borderWidth: 1,
            borderColor: colors.line,
          },
          shadow.sm,
        ]}
      />
    </Animated.View>
  );
}

/** A dot that stretches into a bar as its photograph comes into view. */
function Dot({ index, x, step, color }) {
  const style = useAnimatedStyle(() => {
    const away = Math.abs(x.value / step - index);
    return {
      width: interpolate(away, [0, 1], [22, 6], Extrapolation.CLAMP),
      opacity: interpolate(away, [0, 1], [1, 0.28], Extrapolation.CLAMP),
    };
  });

  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: color }, style]} />;
}
