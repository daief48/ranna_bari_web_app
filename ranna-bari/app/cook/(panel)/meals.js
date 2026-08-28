/**
 * The cook's meals, in the order they have to be cooked.
 *
 * This is a planning screen, not a catalogue: what matters on each row is
 * how many plates are already paid for, so that number is the largest thing
 * on it. Tomorrow leads, because that is the one being shopped for tonight.
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import { EmptyState, deadlineLabel, serviceLabel } from '../../../src/components/MealBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { todayKey, tomorrowKey, useMeals } from '../../../src/store/MealsContext';
import { useLang } from '../../../src/i18n/LanguageContext';

export default function CookMeals() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const meals = useMeals();

  const mine = useMemo(
    () => (kitchen ? meals.mealsForKitchen(kitchen.id) : []),
    [meals, kitchen],
  );

  /* Upcoming first and by date; anything already served or called off drops
     to the bottom, where it is history rather than work. */
  const { upcoming, past } = useMemo(() => {
    const today = todayKey();
    const up = mine
      .filter((m) => m.serveDate >= today && m.status !== 'cancelled')
      .sort((a, b) => a.serveDate.localeCompare(b.serveDate));
    const old = mine
      .filter((m) => m.serveDate < today || m.status === 'cancelled')
      .sort((a, b) => b.serveDate.localeCompare(a.serveDate));
    return { upcoming: up, past: old };
  }, [mine]);

  const toCook = upcoming
    .filter((m) => m.serveDate === tomorrowKey())
    .reduce((sum, m) => sum + meals.confirmedCount(m.id), 0);

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('YOUR')}
          accent={t('MEALS')}
          subtitle={
            toCook
              ? t('{n} plates confirmed for tomorrow.', { n: n(toCook) })
              : t('Plan tomorrow’s meal tonight and let people book a plate.')
          }
        />

        <Reveal delay={1}>
          <Button
            label={t('Plan a meal')}
            icon="plus"
            iconPosition="left"
            block
            onPress={() => router.push('/cook/meal/new')}
          />
        </Reveal>

        {upcoming.length ? (
          <View style={{ marginTop: 26, gap: 12 }}>
            <Label text={t('Coming up')} />
            {upcoming.map((meal, i) => (
              <Reveal key={meal.id} delay={(i % 5) + 1}>
                <MealRow
                  meal={meal}
                  confirmed={meals.confirmedCount(meal.id)}
                  remaining={meals.remaining(meal)}
                  onPress={() => router.push(`/cook/meal/${meal.id}`)}
                />
              </Reveal>
            ))}
          </View>
        ) : null}

        {past.length ? (
          <View style={{ marginTop: 30, gap: 12 }}>
            <Label text={t('Earlier')} />
            {past.map((meal) => (
              <MealRow
                key={meal.id}
                meal={meal}
                confirmed={meals.confirmedCount(meal.id)}
                remaining={meals.remaining(meal)}
                muted
                onPress={() => router.push(`/cook/meal/${meal.id}`)}
              />
            ))}
          </View>
        ) : null}

        {!mine.length ? (
          <EmptyState
            icon="pot"
            title={t('No meals planned yet')}
            body={t(
              'Publish tomorrow’s meal and every customer in your delivery radius sees it tonight. They book a plate, you find out how much to cook.',
            )}
          />
        ) : null}
      </Container>
    </CookScreen>
  );
}

function Label({ text }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: font.uiBold,
        fontSize: type.sm,
        letterSpacing: type.sm * tracking.label,
        textTransform: 'uppercase',
        color: colors.textMuted,
      }}
    >
      {text}
    </Text>
  );
}

function MealRow({ meal, confirmed, remaining, muted, onPress }) {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();

  const closing = deadlineLabel(meal.deadline, t, n);
  const cancelled = meal.status === 'cancelled';

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${meal.title}, ${confirmed} ${t('confirmed')}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 12,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? colors.sage100 : colors.line,
          opacity: muted ? 0.72 : 1,
        },
        shadow.sm,
      ]}
    >
      <Image
        source={{ uri: meal.image }}
        contentFit="cover"
        transition={200}
        style={{ width: 62, height: 62, borderRadius: 18, backgroundColor: colors.sunken }}
      />

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.displayBold,
            fontSize: 16,
            letterSpacing: -0.16,
            color: colors.text,
          }}
        >
          {meal.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.sage }}
        >
          {serviceLabel(meal, t, lang)}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
        >
          {cancelled
            ? t('Cancelled')
            : meal.status === 'closed'
              ? t('Closed')
              : `${closing ?? ''}${
                  remaining != null ? ` · ${t('{n} left', { n: n(remaining) })}` : ''
                }`}
        </Text>
      </View>

      {/* The number the whole screen exists for. */}
      <View style={{ alignItems: 'center', minWidth: 52 }}>
        <Text
          style={{
            fontFamily: font.displayExtra,
            fontSize: 26,
            lineHeight: 30,
            color: confirmed ? colors.sage : colors.textLight,
          }}
        >
          {n(confirmed)}
        </Text>
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: 9,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: colors.textMuted,
          }}
        >
          {t('plates')}
        </Text>
      </View>

      <Icon name="chevronRight" size={16} color={colors.textLight} />
    </Pressable>
  );
}
