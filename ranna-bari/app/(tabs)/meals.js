/**
 * Tomorrow's meals, near you.
 *
 * The whole point of pre-booking is that it happens the night before, so
 * tomorrow leads and today follows -- the reverse of every other list in the
 * app. Meals from kitchens that will not deliver to your address are not
 * shown at all: a meal you cannot be sent is not an option, it is a tease.
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import SectionHeader from '../../src/components/SectionHeader';
import { EmptyState, MealCard } from '../../src/components/MealBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import {
  addDays,
  dayKey,
  todayKey,
  tomorrowKey,
  useMeals,
} from '../../src/store/MealsContext';
import { useLang } from '../../src/i18n/LanguageContext';

export default function MealsScreen() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const { account, isSignedIn } = useAuth();
  const { mealsNearby, remaining, wallet, hydrated } = useMeals();

  const origin = useMemo(
    () =>
      typeof account?.lat === 'number' && typeof account?.lng === 'number'
        ? { lat: account.lat, lng: account.lng }
        : null,
    [account],
  );

  /* Tomorrow, today, and the rest of the week in that order. A meal being
     cooked in four days is real but it is not what this screen is for. */
  const groups = useMemo(() => {
    const all = mealsNearby(origin);
    const later = new Set(
      [2, 3, 4, 5, 6].map((d) => dayKey(addDays(d))),
    );

    return [
      { key: 'tomorrow', label: 'Tomorrow', rows: all.filter((r) => r.meal.serveDate === tomorrowKey()) },
      { key: 'today', label: 'Later today', rows: all.filter((r) => r.meal.serveDate === todayKey()) },
      { key: 'later', label: 'This week', rows: all.filter((r) => later.has(r.meal.serveDate)) },
    ].filter((g) => g.rows.length);
  }, [mealsNearby, origin]);

  const total = groups.reduce((sum, g) => sum + g.rows.length, 0);

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead={t('TOMORROW’S')}
          accent={t('MEALS')}
          subtitle={t('Home cooks near you are planning tomorrow. Book your plate tonight.')}
          style={{ marginBottom: 20 }}
        />

        {/* Wallet, up front: confirming a meal spends from it, and finding
            that out at the last step is the wrong time to learn it. */}
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/wallet')}
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              marginBottom: 24,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: pressed ? colors.primary200 : colors.line,
            },
            shadow.sm,
          ]}
        >
          <Icon name="banknote" size={17} color={colors.primary} />
          <Text
            style={{
              flex: 1,
              fontFamily: font.ui,
              fontSize: type.sm + 1,
              color: colors.textMuted,
            }}
          >
            {t('Wallet balance')}
          </Text>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.md,
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            ৳{n(wallet.customer)}
          </Text>
          <Icon name="chevronRight" size={15} color={colors.textLight} />
        </Pressable>

        {!origin && isSignedIn ? (
          <Note
            icon="pin"
            text={t('Add a delivery address so we can show only the kitchens that reach you.')}
            onPress={() => router.push('/edit-profile')}
          />
        ) : null}

        {!isSignedIn ? (
          <Note
            icon="user"
            text={t('Sign in to book a meal and use your wallet.')}
            onPress={() => router.push('/auth')}
          />
        ) : null}

        {groups.map((group) => (
          <View key={group.key} style={{ marginBottom: 30 }}>
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
              {t(group.label)} · {t('{n} meals', { n: n(group.rows.length) })}
            </Text>

            <View style={{ gap: 14 }}>
              {group.rows.map(({ meal, km }, i) => (
                <Reveal key={meal.id} delay={(i % 5) + 1}>
                  <MealCard
                    meal={meal}
                    km={km}
                    remaining={remaining(meal)}
                    interested={meal.interested?.length ?? 0}
                    onPress={() => router.push(`/meals/${meal.id}`)}
                  />
                </Reveal>
              ))}
            </View>
          </View>
        ))}

        {hydrated && !total ? (
          <EmptyState
            icon="pot"
            title={t('No meals planned near you yet')}
            body={t(
              'Cooks publish tomorrow’s meals the evening before. Check back tonight, or browse kitchens cooking to order right now.',
            )}
            action={
              <Button
                label={t('Browse kitchens')}
                onPress={() => router.push('/browse')}
                style={{ marginTop: 6 }}
              />
            }
          />
        ) : null}
      </Container>
    </Screen>
  );
}

/** A quiet, tappable line that fixes the thing it is complaining about. */
function Note({ icon, text, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        marginBottom: 20,
        borderRadius: radius.sm,
        backgroundColor: colors.saffron50,
        borderWidth: 1,
        borderColor: colors.saffron100,
      }}
    >
      <Icon name={icon} size={16} color={colors.saffron} />
      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: type.xs + 1,
          lineHeight: (type.xs + 1) * 1.5,
          color: colors.text,
        }}
      >
        {text}
      </Text>
      <Icon name="chevronRight" size={15} color={colors.saffron} />
    </Pressable>
  );
}
