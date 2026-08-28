import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import Icon from './Icon';
import Reveal from './Reveal';
import { EcoBadge, Tag } from './Surfaces';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { useAuth } from '../store/AuthContext';
import { distanceKm, formatDistance } from '../lib/geo';
import { isOpenNow } from '../lib/kitchen';
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
  const { t, n } = useLang();
  const { account } = useAuth();
  const router = useRouter();

  /* Measured from the account's delivery address, so the card answers "can
     this reach me" wherever it is shown -- browse, home, anywhere. A guest
     has no address, and gets no number rather than a made-up one. */
  const away =
    typeof account?.lat === 'number' &&
    typeof account?.lng === 'number' &&
    typeof chef.lat === 'number' &&
    typeof chef.lng === 'number'
      ? formatDistance(
          distanceKm(
            { lat: account.lat, lng: account.lng },
            { lat: chef.lat, lng: chef.lng },
          ),
          t,
          n,
        )
      : null;

  /* Whether it is cooking right now. This used to be read only on the
     kitchen's own page, so a closed kitchen sat in the feed looking exactly
     like an open one and only admitted it after a tap. */
  const closed = !isOpenNow(chef);

  return (
    <Reveal delay={(index % 5) + 1} style={{ paddingTop: 12 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${chef.name}, ${t(chef.specialty)}, ${
          chef.reviewCount ? `${t('Rating')} ${n(chef.rating)}` : t('New kitchen')
        }${away ? `, ${away}` : ''}${closed ? `, ${t('Closed')}` : ''}`}
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
              {t(chef.specialty)}
            </Text>

            {/* Where it is, and how far that is from your door. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                marginTop: 5,
              }}
            >
              <Icon name="pin" size={11} color={colors.textLight} />
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
            </View>
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
          {chef.tags.slice(0, 3).map((tag) => (
            <Tag key={tag} label={t(tag)} />
          ))}
          {chef.ecoBadge ? <EcoBadge label={t(chef.ecoBadge)} /> : null}
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
                {n(chef.rating)}
              </Text>
              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: type.xs,
                  color: colors.textLight,
                }}
              >
                ({n(chef.reviewCount)})
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
                {t('New kitchen')}
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
              {t('View menu')}
            </Text>
            <Icon name="arrowRight" size={15} color={colors.text} strokeWidth={2} />
          </View>
        </View>
      </Pressable>

      {/* Hung off the top edge like the verified badge, on the other side:
          both are facts about the kitchen rather than about its menu, and
          "not cooking tonight" is the one worth reading before the tap. */}
      {closed ? (
        <View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 5,
              paddingHorizontal: 11,
              borderRadius: radius.pill,
              backgroundColor: colors.saffron50,
              borderWidth: 1,
              borderColor: colors.saffron100,
            },
            shadow.xs,
          ]}
        >
          <Icon name="moon" size={12} color={colors.saffron} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: 10,
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              color: colors.saffron,
            }}
          >
            {t('Closed')}
          </Text>
        </View>
      ) : null}

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
            {t('Verified Kitchen')}
          </Text>
        </View>
      ) : null}
    </Reveal>
  );
}
