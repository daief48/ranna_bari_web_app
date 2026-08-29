import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import useResponsive from '../theme/useResponsive';
import { font, radius, type } from '../theme/tokens';

/** `.rating-stars` — saffron, 3px gap, filled glyphs. */
export function Stars({ rating = 5, size = 16 }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: 3 }}
      accessibilityLabel={`${rating} out of 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Icon
          key={i}
          name="star"
          size={size}
          color={colors.saffron}
          fill={i < Math.round(rating) ? colors.saffron : 'none'}
        />
      ))}
    </View>
  );
}

/**
 * `.tm-track` — a native scroll-snap carousel. The scroller is the source of
 * truth in the web build: the buttons only call scrollTo and the active dot
 * is derived from scroll offset, so touch, keyboard and the controls can
 * never disagree. Same contract here, driven off onViewableItemsChanged.
 *
 * At the ≤480px breakpoint cards are 84vw and the dots are hidden -- they
 * would wrap to three rows -- so the arrows carry the job.
 */
export default function TestimonialSlider({ reviews = [], chefName }) {
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);

  const GAP = 14;
  const cardWidth = Math.round(r.tmCard);
  const stride = cardWidth + GAP;

  const viewConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;
  const onViewable = useRef(({ viewableItems }) => {
    if (viewableItems.length) setIndex(viewableItems[0].index ?? 0);
  }).current;

  const scrollTo = useCallback(
    (i) => {
      const next = Math.max(0, Math.min(reviews.length - 1, i));
      listRef.current?.scrollToOffset({ offset: next * stride, animated: true });
      setIndex(next);
    },
    [reviews.length, stride],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <View
        style={[
          {
            width: cardWidth,
            padding: 24,
            paddingBottom: 20,
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
            overflow: 'hidden',
          },
          shadow.sm,
        ]}
      >
        {/* Oversized quote glyph, clipped by the card */}
        <Text
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -14,
            right: 20,
            fontFamily: font.displayBlack,
            fontSize: 84,
            lineHeight: 96,
            color: colors.primary50,
          }}
        >
          &rdquo;
        </Text>

        <View style={{ marginBottom: 16 }}>
          <Stars rating={item.rating} />
        </View>

        <Text
          style={{
            fontFamily: font.displayRegular,
            fontSize: r.tmText,
            lineHeight: r.tmText * 1.55,
            letterSpacing: r.tmText * -0.012,
            color: colors.text,
            marginBottom: 24,
          }}
        >
          {item.text}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
            paddingTop: 18,
            borderTopWidth: 1,
            borderTopColor: colors.line2,
          }}
        >
          <Image
            source={{ uri: item.avatar }}
            contentFit="cover"
            transition={200}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              borderWidth: 2,
              borderColor: colors.raised,
              backgroundColor: colors.sunken,
            }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.uiBold,
                fontSize: 14.5,
                color: colors.text,
              }}
            >
              {item.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.ui,
                fontSize: type.xs,
                color: colors.textMuted,
              }}
            >
              Ordered from{' '}
              <Text style={{ fontFamily: font.uiSemi, color: colors.primary }}>
                {chefName(item.chefId)}
              </Text>{' '}
              &middot; {item.area}
            </Text>
          </View>
        </View>
      </View>
    ),
    [cardWidth, colors, shadow, chefName, r.tmText],
  );

  const arrow = (name, to, disabled) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name === 'arrowLeft' ? 'Previous review' : 'Next review'}
      disabled={disabled}
      onPress={() => scrollTo(to)}
      style={({ pressed }) => [
        {
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.primary : colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.line,
          opacity: disabled ? 0.35 : 1,
        },
        shadow.sm,
      ]}
    >
      {({ pressed }) => (
        <Icon
          name={name}
          size={19}
          color={pressed ? '#fff' : colors.text}
        />
      )}
    </Pressable>
  );

  return (
    <View>
      <FlatList
        ref={listRef}
        data={reviews}
        horizontal
        keyExtractor={(r) => String(r.id)}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        // scroll-snap-type: x mandatory
        snapToInterval={stride}
        snapToAlignment="start"
        decelerationRate="fast"
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
        // Full-bleed on phones so the next card peeks past the gutter
        contentContainerStyle={{
          paddingHorizontal: r.gutter,
          paddingTop: 6,
          paddingBottom: 24,
        }}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewConfig}
        getItemLayout={(_, i) => ({ length: stride, offset: stride * i, index: i })}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          marginTop: 4,
        }}
      >
        {arrow('arrowLeft', index - 1, index === 0)}

        {/* .tm-dots is hidden below 480px -- three rows of dots at that width
            is worse than nothing, so the arrows carry the job alone. */}
        {r.tmDots ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            {reviews.map((rev, i) => (
              <Pressable
                key={rev.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: i === index }}
                accessibilityLabel={`Review ${i + 1}`}
                onPress={() => scrollTo(i)}
                hitSlop={6}
                style={{
                  height: 8,
                  width: i === index ? 26 : 8,
                  borderRadius: radius.pill,
                  backgroundColor: i === index ? colors.primary : colors.line,
                }}
              />
            ))}
          </View>
        ) : null}

        {arrow('arrowRight', index + 1, index >= reviews.length - 1)}
      </View>
    </View>
  );
}
