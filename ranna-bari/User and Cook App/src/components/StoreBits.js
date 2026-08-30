/**
 * The pieces the storefront and the cook's shop management draw with.
 *
 * The one idea running through all of them: a product has four possible
 * answers to "can I have this", not two. In stock, orderable but only as a
 * request the cook has to accept, out of stock for good, and taken off sale.
 * Collapsing those into available/unavailable is what makes a shop feel
 * broken, so every card, badge and button here branches on all four.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';

import Icon from './Icon';
import { Price } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, tracking, type } from '../theme/tokens';
import { photo } from '../lib/image';
import { useLang } from '../i18n/LanguageContext';
import { formatDistance } from '../lib/geo';

/* ------------------------------------------------------------------ *
 * availability
 * ------------------------------------------------------------------ */

/**
 * How each answer reads.
 *
 * `preorder` is the only one that is an invitation rather than a state, so
 * it gets the accent colour and a bell rather than a grey label.
 */
export function stockMeta(availability, colors) {
  return {
    'in-stock': { label: 'In stock', icon: 'check', fg: colors.sage, bg: colors.sage50 },
    preorder: { label: 'Pre-order', icon: 'clock', fg: colors.saffron, bg: colors.saffron50 },
    out: { label: 'Out of stock', icon: 'x', fg: colors.textMuted, bg: colors.sunken },
    off: { label: 'Unavailable', icon: 'eyeOff', fg: colors.textMuted, bg: colors.sunken },
    closed: { label: 'Shop closed', icon: 'moon', fg: colors.textMuted, bg: colors.sunken },
    gone: { label: 'Unavailable', icon: 'x', fg: colors.textMuted, bg: colors.sunken },
  }[availability] ?? { label: 'Unavailable', icon: 'x', fg: colors.textMuted, bg: colors.sunken };
}

export function StockPill({ availability, stock, style }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const meta = stockMeta(availability, colors);

  /* A number, when there is one worth knowing. "3 left" moves people in a
     way "in stock" never does, and it is the truth either way. */
  const label =
    availability === 'in-stock' && stock != null && stock <= 5
      ? t('{n} left', { n: n(stock) })
      : t(meta.label);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
          paddingVertical: 4,
          paddingHorizontal: 9,
          borderRadius: radius.pill,
          backgroundColor: meta.bg,
        },
        style,
      ]}
    >
      <Icon name={meta.icon} size={11} color={meta.fg} />
      <Text
        /* A 10px uppercase chip on a product tile. */
        maxFontSizeMultiplier={1.2}
        style={{
          fontFamily: font.uiBold,
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: meta.fg,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * products
 * ------------------------------------------------------------------ */

/**
 * One product on a shelf.
 *
 * The add button is on the card because a shop where every purchase costs
 * two taps and a page load is a catalogue, not a shop. It disappears rather
 * than greys out when there is nothing to add: a dead button invites a tap
 * that teaches nothing.
 */
/**
 * What a photograph's absence should look like.
 *
 * A cook listing a jar of achar at eleven at night does not always have a
 * photograph of it, and an `<Image>` with no source renders as a flat grey
 * rectangle — which reads as *broken*, not as *no picture yet*. This is the
 * same space, deliberately filled: a soft tinted ground and the first letter
 * of the thing's name, so a shelf of unphotographed products still looks like
 * a shelf.
 *
 * Tinted from the name rather than at random, so the same product is the same
 * colour on every screen and every launch.
 */
const TINTS = ['primary', 'sage', 'saffron'];

export function Placeholder({ name, height = 120, radius: r = 0, style }) {
  const { colors } = useTheme();

  let hash = 0;
  for (const ch of String(name ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const tint = TINTS[hash % TINTS.length];

  const letter = String(name ?? '').trim().charAt(0).toUpperCase();

  return (
    <View
      style={[
        {
          height,
          width: '100%',
          borderRadius: r,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors[`${tint}50`] ?? colors.sunken,
        },
        style,
      ]}
    >
      {letter ? (
        <Text
          style={{
            fontFamily: font.displayExtra,
            fontSize: Math.max(20, height * 0.34),
            color: colors[tint] ?? colors.textLight,
            opacity: 0.45,
          }}
        >
          {letter}
        </Text>
      ) : (
        <Icon name="cart" size={Math.max(16, height * 0.22)} color={colors.textLight} />
      )}
    </View>
  );
}

export function ProductCard({ product, availability, onPress, onAdd, wide }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  const buyable = availability === 'in-stock' || availability === 'preorder';
  const image = product.images?.[0];

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${product.name}, ৳${n(product.price)}, ${t(
        stockMeta(availability, colors).label,
      )}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: wide ? 220 : undefined,
          flex: wide ? undefined : 1,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? colors.primary200 : colors.line,
          overflow: 'hidden',
          opacity: availability === 'off' ? 0.6 : 1,
        },
        shadow.sm,
      ]}
    >
      <View>
        {image ? (
          <Image
            /* Two to a row on a phone, so about half the widest screen. The
               stored URL is an 800×800 square — four times the pixels this
               tile can show, on a grid that draws eight of them. */
            source={photo(image, wide ? 220 : 215, 120)}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            style={{ width: '100%', height: 120, backgroundColor: colors.sunken }}
          />
        ) : (
          <Placeholder name={product.name} height={120} />
        )}
        <View style={{ position: 'absolute', top: 8, left: 8 }}>
          <StockPill availability={availability} stock={product.stock} />
        </View>
      </View>

      <View style={{ padding: 12, gap: 8 }}>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: font.displayBold,
            fontSize: 15,
            lineHeight: 19,
            letterSpacing: -0.14,
            color: colors.text,
            minHeight: 38,
          }}
        >
          {product.name}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Price size={16}>৳{n(product.price)}</Price>
          {product.options?.choices?.length ? (
            <Text
              style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textLight }}
            >
              {t('and up')}
            </Text>
          ) : null}
        </View>

        {buyable && onAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${
              availability === 'preorder' ? t('Pre-order') : t('Add')
            } ${product.name}`}
            onPress={onAdd}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 9,
              borderRadius: radius.pill,
              backgroundColor:
                availability === 'preorder'
                  ? pressed
                    ? colors.saffron100
                    : colors.saffron50
                  : pressed
                    ? colors.primary200
                    : colors.primary50,
            })}
          >
            <Icon
              name={availability === 'preorder' ? 'clock' : 'plus'}
              size={13}
              color={availability === 'preorder' ? colors.saffron : colors.primary}
              strokeWidth={2.2}
            />
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 11,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: availability === 'preorder' ? colors.saffron : colors.primary,
              }}
            >
              {availability === 'preorder' ? t('Pre-order') : t('Add')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * navigation
 * ------------------------------------------------------------------ */

/** The store's own categories, in the cook's own order. */
export function CategoryTabs({ categories, value, onChange, gutter = 0 }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

  const all = [{ id: null, name: 'All', emoji: '' }, ...categories];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: gutter, paddingVertical: 2 }}
    >
      {all.map((c) => {
        const active = value === c.id;
        return (
          <Pressable
            key={c.id ?? 'all'}
            accessibilityRole="button"
            aria-pressed={active}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(c.id)}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.primary : colors.surfaceSolid,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.line,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
              active ? shadow.primary : shadow.xs,
            ]}
          >
            {c.emoji ? <Text style={{ fontSize: 13 }}>{c.emoji}</Text> : null}
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: 13,
                color: active ? '#FFFFFF' : colors.text,
              }}
            >
              {c.id ? c.name : t('All')}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ *
 * quantity
 * ------------------------------------------------------------------ */

/**
 * A stepper that knows the cook's limits.
 *
 * Buttons go dead at the boundary rather than letting a tap through to a
 * refusal, because "you cannot have five" is better learned from a button
 * that will not press than from an error after you tried.
 */
export function QtyStepper({ value, min = 1, max, onChange, small }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  const size = small ? 30 : 36;
  const canDown = value > min;
  const canUp = max == null || value < max;

  const Step = ({ dir, enabled }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? t('Fewer') : t('More')}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => onChange(value + dir)}
      style={({ pressed }) => ({
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size / 2,
        backgroundColor: pressed && enabled ? colors.primary50 : 'transparent',
        opacity: enabled ? 1 : 0.35,
      })}
    >
      <Icon
        name={dir < 0 ? 'minus' : 'plus'}
        size={small ? 14 : 16}
        color={colors.text}
        strokeWidth={2.2}
      />
    </Pressable>
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.pill,
        backgroundColor: colors.sunken,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Step dir={-1} enabled={canDown} />
      <Text
        style={{
          minWidth: small ? 22 : 28,
          textAlign: 'center',
          fontFamily: font.uiBold,
          fontSize: small ? 14 : 16,
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {n(value)}
      </Text>
      <Step dir={1} enabled={canUp} />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * stores
 * ------------------------------------------------------------------ */

/** A shop, as it appears in the discovery list. */
/**
 * A shop in a list.
 *
 * `onSave` is optional. Given one, the card grows a star on its cover — the
 * same control the shop's own page carries, in the same place and the same
 * colours, so keeping a shop from the directory and keeping it from inside
 * are visibly one action rather than two features.
 *
 * It sits *over* the cover rather than in the row of text below, because the
 * whole card is already a link: a button inline with the name would be a tap
 * target inside a tap target, and on a phone the two would be a coin toss.
 * Up on the cover it has its own corner and its own hit area.
 */
export function StoreCard({ store, km, products, onPress, onSave, saved = false }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const away = formatDistance(km, t, n);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${store.name}, ${n(products)} ${t('products')}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? colors.primary200 : colors.line,
          overflow: 'hidden',
        },
        shadow.sm,
      ]}
    >
      <View>
        <Image
          source={photo(store.cover, 430, 110)}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={200}
          style={{ width: '100%', height: 110, backgroundColor: colors.sunken }}
        />

        {onSave ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={
              saved
                ? `${store.name} — ${t('Saved — tap to remove')}`
                : `${store.name} — ${t('Save this shop')}`
            }
            onPress={onSave}
            /* Generous, because it is a 34px circle sitting on a card that is
               itself pressable — a near miss should not open the shop. */
            hitSlop={10}
            style={({ pressed }) => ({
              position: 'absolute',
              top: 10,
              right: 10,
              width: 34,
              height: 34,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 17,
              backgroundColor: saved ? colors.saffron : 'rgba(20, 16, 14, 0.5)',
              transform: [{ scale: pressed ? 0.9 : 1 }],
            })}
          >
            <Icon
              name="star"
              size={16}
              color={saved ? colors.onDark : '#FFFFFF'}
              strokeWidth={saved ? 2.4 : 2}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 12, padding: 14 }}>
        <Image
          source={photo(store.logo, 46, 46)}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={200}
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            marginTop: -34,
            borderWidth: 2,
            borderColor: colors.surfaceSolid,
            backgroundColor: colors.sunken,
          }}
        />

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: font.displayBold,
                fontSize: 17,
                letterSpacing: -0.2,
                color: colors.text,
              }}
            >
              {store.name}
            </Text>
            {!store.isOpen ? <StockPill availability="closed" /> : null}
          </View>

          {store.tagline ? (
            <Text
              /* A shop's one-line pitch, which is a whole sentence and was
                 losing its end on a narrow card. */
              numberOfLines={2}
              style={{
                fontFamily: font.ui,
                fontSize: type.xs,
                lineHeight: type.xs * 1.45,
                color: colors.textMuted,
              }}
            >
              {store.tagline}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text
              style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.primary }}
            >
              {t('{n} products', { n: n(products) })}
            </Text>
            {away ? (
              <>
                <View
                  style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textLight }}
                />
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
              </>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * order lines
 * ------------------------------------------------------------------ */

/** What was actually bought, as the order recorded it. */
export function OrderLines({ lines, style }) {
  const { colors } = useTheme();
  const { n } = useLang();

  return (
    <View style={[{ gap: 1 }, style]}>
      {lines.map((line, i) => (
        <View
          key={`${line.productId}-${line.option ?? ''}-${i}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 11,
            borderBottomWidth: i < lines.length - 1 ? 1 : 0,
            borderBottomColor: colors.line2,
          }}
        >
          <Text
            style={{
              minWidth: 26,
              fontFamily: font.uiBold,
              fontSize: type.sm,
              color: colors.textMuted,
              fontVariant: ['tabular-nums'],
            }}
          >
            {n(line.qty)}×
          </Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
            >
              {line.name}
            </Text>
            {line.option ? (
              <Text
                style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textLight }}
              >
                {line.option}
              </Text>
            ) : null}
          </View>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.sm + 1,
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            ৳{n(line.lineTotal ?? line.unitPrice * line.qty)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A totals block: what it cost, and why. */
export function Totals({ subtotal, delivery, total }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  const Row = ({ label, value, strong }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text
        style={{
          flex: 1,
          fontFamily: strong ? font.uiBold : font.ui,
          fontSize: strong ? type.sm + 2 : type.sm + 1,
          color: strong ? colors.text : colors.textMuted,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: strong ? type.md : type.sm + 1,
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <View
      style={{
        gap: 10,
        padding: 16,
        borderRadius: radius.sm,
        backgroundColor: colors.sunken,
        borderWidth: 1,
        borderColor: colors.line2,
      }}
    >
      <Row label={t('Subtotal')} value={`৳${n(subtotal)}`} />
      <Row
        label={t('Delivery')}
        value={delivery ? `৳${n(delivery)}` : t('Free')}
      />
      <View style={{ height: 1, backgroundColor: colors.line2 }} />
      <Row label={t('Total')} value={`৳${n(total)}`} strong />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * loading
 * ------------------------------------------------------------------ */

/**
 * A placeholder while the document is being read off the device.
 *
 * That read is fast enough that this is usually one frame, which is exactly
 * why it exists: a storefront that flashes an empty state before its
 * products arrive reads as a shop with nothing in it.
 */
export function Skeleton({ height = 16, width = '100%', round = 8, style }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: round,
          backgroundColor: colors.sunken,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
        },
        style,
      ]}
    />
  );
}

export function ProductGridSkeleton({ count = 4 }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flex: 1, minWidth: 150, gap: 8 }}>
          <Skeleton height={120} round={16} />
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="40%" />
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * headings
 * ------------------------------------------------------------------ */

/** The uppercase label above a block. */
export function BlockLabel({ text, right, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
        style,
      ]}
    >
      <Text
        style={{
          flex: 1,
          fontFamily: font.uiBold,
          fontSize: type.sm,
          letterSpacing: type.sm * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {text}
      </Text>
      {right}
    </View>
  );
}
