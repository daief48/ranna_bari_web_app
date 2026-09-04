import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import CookScreen from '../../src/components/CookScreen';
import { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import SectionHeader from '../../src/components/SectionHeader';
import { EmptyState } from '../../src/components/MealBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useKitchen } from '../../src/store/KitchenContext';
import { useCookReviews } from '../../src/data/cook';
import { useLang } from '../../src/i18n/LanguageContext';

/**
 * What customers actually wrote.
 *
 * The panel showed a cook their score in three places and the reviews behind
 * it in none — `rating` and `reviewCount` were on the wire, the reviews were
 * not, and there was no endpoint that would have returned them. So a kitchen
 * that slid from 4.8 to 4.1 could watch it happen and had no way to find out
 * why, which is the only part of it they can do anything about.
 *
 * The breakdown leads, because one number cannot tell a kitchen with forty
 * fives and four ones apart from a kitchen where everybody shrugged — and
 * those two need completely different things done about them.
 */
export default function CookReviewsScreen() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t, n } = useLang();
  const { kitchen } = useKitchen();
  const { reviews, loaded } = useCookReviews();

  const spread = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const review of reviews) {
      const star = Math.round(Number(review.rating) || 0);
      if (star >= 1 && star <= 5) counts[star - 1] += 1;
    }
    return counts;
  }, [reviews]);

  const total = reviews.length;
  const score = kitchen?.reviewCount ? kitchen.rating : 0;

  return (
    <CookScreen>
      <Container>
        <Back />

        <SectionHeader
          lead={t('YOUR')}
          accent={t('REVIEWS')}
          subtitle={
            kitchen?.reviewCount
              ? t('What customers said after their food arrived.')
              : t('Nobody has rated your kitchen yet.')
          }
        />

        {/* ---- the score, and how it is made up ---- */}
        {total ? (
          <Reveal delay={1}>
            <View
              style={[
                {
                  flexDirection: 'row',
                  gap: 18,
                  padding: 18,
                  marginBottom: 20,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
                shadow.sm,
              ]}
            >
              <View style={{ alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Text
                  style={{
                    fontFamily: font.displayExtra,
                    fontSize: 38,
                    letterSpacing: -1.2,
                    color: colors.text,
                  }}
                >
                  {n(score)}
                </Text>
                <Stars value={score} size={12} />
                {/*
                  * The public count, and — when they differ — what the bars
                  * beside it are actually counting.
                  *
                  * The score and the count are the kitchen's all-time figures,
                  * the ones every card shows. The breakdown can only be built
                  * from the page of reviews this screen fetched, so a kitchen
                  * past that page would print a headline of two hundred over
                  * bars adding up to fifty and look broken. Saying which is
                  * which costs one line.
                  */}
                <Text
                  style={{
                    marginTop: 3,
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    textAlign: 'center',
                    color: colors.textMuted,
                  }}
                >
                  {t('{n} reviews', { n: n(kitchen?.reviewCount ?? total) })}
                </Text>
                {(kitchen?.reviewCount ?? total) !== total ? (
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.micro,
                      textAlign: 'center',
                      color: colors.textLight,
                    }}
                  >
                    {t('latest {n} shown', { n: n(total) })}
                  </Text>
                ) : null}
              </View>

              {/* Five bars, five first. A cook scanning this is looking for
                  the short bar at the bottom, not the long one at the top. */}
              <View style={{ flex: 1, justifyContent: 'center', gap: 5 }}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = spread[star - 1];
                  return (
                    <View
                      key={star}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                    >
                      <Text
                        style={{
                          width: 10,
                          fontFamily: font.uiSemi,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {n(star)}
                      </Text>
                      <View
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          overflow: 'hidden',
                          backgroundColor: colors.sunken,
                        }}
                      >
                        <View
                          style={{
                            width: `${total ? (count / total) * 100 : 0}%`,
                            height: '100%',
                            borderRadius: 3,
                            /* One and two stars are the rows worth acting on,
                               so they are the ones that are not sage. */
                            backgroundColor: star <= 2 ? colors.primary : colors.sage,
                          }}
                        />
                      </View>
                      <Text
                        style={{
                          minWidth: 18,
                          textAlign: 'right',
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textLight,
                        }}
                      >
                        {n(count)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </Reveal>
        ) : null}

        {/* ---- the reviews themselves ---- */}
        <View style={{ gap: 10 }}>
          {reviews.map((review, i) => (
            <Reveal key={review.id} delay={(i % 5) + 1}>
              <View
                style={[
                  {
                    padding: 15,
                    gap: 9,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.sm,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  {review.avatar ? (
                    <Image
                      source={{ uri: review.avatar }}
                      contentFit="cover"
                      transition={180}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 13,
                        backgroundColor: colors.sunken,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 13,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.sunken,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.displayBold,
                          fontSize: 16,
                          color: colors.textMuted,
                        }}
                      >
                        {String(review.name ?? '?').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: font.uiSemi, fontSize: 14.5, color: colors.text }}
                    >
                      {review.name}
                    </Text>
                    {review.area ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {review.area}
                      </Text>
                    ) : null}
                  </View>

                  <Stars value={review.rating} size={13} />
                </View>

                {String(review.text ?? '').trim() ? (
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: 14,
                      lineHeight: 21,
                      color: colors.text,
                    }}
                  >
                    {review.text}
                  </Text>
                ) : (
                  /* A rating with no words is still a review, and saying so is
                     better than a card that looks like it failed to load. */
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      fontStyle: 'italic',
                      color: colors.textLight,
                    }}
                  >
                    {t('Rated, with nothing written.')}
                  </Text>
                )}
              </View>
            </Reveal>
          ))}

          {/* Only once the server has actually answered. Drawing the empty
              state while the request is in flight tells a cook with forty
              reviews that they have none. */}
          {loaded && !total ? (
            <EmptyState
              icon="star"
              title={t('No reviews yet')}
              body={t(
                'A customer can rate your kitchen once their food has arrived. The first one usually follows your first few deliveries.',
              )}
            />
          ) : null}
        </View>
      </Container>
    </CookScreen>
  );
}

/** Five stars, filled to the rating. */
function Stars({ value, size = 13 }) {
  const { colors } = useTheme();
  const filled = Math.round(Number(value) || 0);

  return (
    <View style={{ flexDirection: 'row', gap: 1.5 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="star"
          size={size}
          color={star <= filled ? colors.saffron : colors.line}
          strokeWidth={star <= filled ? 2.6 : 2}
        />
      ))}
    </View>
  );
}

function Back() {
  const { colors } = useTheme();
  const { t } = useLang();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook/business'))}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 18,
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
        {t('Business')}
      </Text>
    </Pressable>
  );
}
