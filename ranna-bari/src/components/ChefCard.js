import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import Icon from './Icon';
import Reveal from './Reveal';
import { EcoBadge, Tag } from './Surfaces';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, tracking, type } from '../theme/tokens';

/**
 * `.cook-card` — the port of `createChefCardHTML()` in js/app.js, at the
 * phone breakpoint (20px padding, 64px avatar, 20px name).
 *
 * The verified badge sits at `top: -12px` in the CSS, i.e. it deliberately
 * hangs outside the card. Android clips absolutely-positioned children that
 * escape their parent, so the badge is a sibling inside a padded wrapper
 * instead of a child of the card.
 */
export default function ChefCard({ chef, index = 0 }) {
  const { colors, shadow } = useTheme();
  const router = useRouter();

  return (
    <Reveal delay={(index % 5) + 1} style={{ paddingTop: 12 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${chef.name}, ${chef.specialty}, ${
          chef.reviewCount ? `rated ${chef.rating}` : 'not rated yet'
        }`}
        onPress={() => router.push(`/chef/${chef.id}`)}
        style={({ pressed }) => [
          {
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: pressed ? colors.primary200 : colors.line,
            borderRadius: radius.lg,
            padding: 20,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
          shadow.sm,
        ]}
      >
        {/* .cook-card::before — a primary-50 wash down the first 120px */}
        <LinearGradient
          pointerEvents="none"
          colors={[colors.primary50, 'transparent']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 120,
            opacity: 0.85,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 18,
          }}
        >
          <Image
            source={{ uri: chef.avatar }}
            contentFit="cover"
            transition={200}
            style={[
              {
                width: 64,
                height: 64,
                borderRadius: 20,
                borderWidth: 2,
                borderColor: colors.raised,
                backgroundColor: colors.sunken,
              },
              shadow.sm,
            ]}
          />

          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.displayBold,
                fontSize: 20,
                letterSpacing: -0.2,
                color: colors.text,
                marginBottom: 4,
              }}
            >
              {chef.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.uiSemi,
                fontSize: type.xs,
                letterSpacing: type.xs * tracking.label,
                textTransform: 'uppercase',
                color: colors.primary,
              }}
            >
              {chef.specialty}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 20,
          }}
        >
          {chef.tags.slice(0, 3).map((t) => (
            <Tag key={t} label={t} />
          ))}
          {chef.ecoBadge ? <EcoBadge label={chef.ecoBadge} /> : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTopWidth: 1,
            borderTopColor: colors.line2,
            paddingTop: 18,
          }}
        >
          {/* A kitchen nobody has reviewed yet has no score, and printing
              "0" for that reads as the worst rating on the page rather than
              the absence of one. New kitchens say so instead. */}
          {chef.reviewCount ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="star" size={16} color={colors.saffron} fill={colors.saffron} />
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: 17,
                  color: colors.text,
                }}
              >
                {chef.rating}
              </Text>
              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: type.xs,
                  color: colors.textLight,
                }}
              >
                ({chef.reviewCount})
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="sparkles" size={15} color={colors.sage} />
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: type.xs,
                  letterSpacing: type.xs * tracking.label,
                  textTransform: 'uppercase',
                  color: colors.sage,
                }}
              >
                New kitchen
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: type.xs,
                letterSpacing: type.xs * tracking.label,
                textTransform: 'uppercase',
                color: colors.text,
              }}
            >
              View menu
            </Text>
            <Icon name="arrowRight" size={15} color={colors.text} strokeWidth={2} />
          </View>
        </View>
      </Pressable>

      {chef.isVerified ? (
        <View
          style={[
            {
              position: 'absolute',
              top: 0,
              right: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 5,
              paddingHorizontal: 11,
              borderRadius: radius.pill,
              backgroundColor: colors.raised,
              borderWidth: 1,
              borderColor: colors.sage100,
            },
            shadow.xs,
          ]}
        >
          <Icon name="shieldCheck" size={12} color={colors.sage} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: 10,
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              color: colors.sage,
            }}
          >
            Verified Kitchen
          </Text>
        </View>
      ) : null}
    </Reveal>
  );
}
