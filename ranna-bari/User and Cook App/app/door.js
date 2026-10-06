import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';

import Screen, { Container } from '../src/components/Screen';
import BackButton from '../src/components/BackButton';
import { IconTile } from '../src/components/Surfaces';
import { Heading } from '../src/components/Typography';
import Icon from '../src/components/Icon';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius } from '../src/theme/tokens';
import { useLang } from '../src/i18n/LanguageContext';

/**
 * The door's second leaf.
 *
 * The partition asked eat-or-cook; this page answers with that side's own
 * two ways in, and nothing belonging to the other side. One card per way —
 * sign in, or make the account — each carrying the sentence that tells a
 * first-timer from a regular before anything is typed.
 */

/* Per side: how the sign-in walks in, and what registration costs. */
const DOORS = {
  user: {
    icon: 'utensils',
    variant: 'primary',
    title: "I'm here to eat",
    signin: {
      label: 'Sign in',
      desc: 'You already have an account.',
      href: '/auth?tab=signin&door=user&locked=1',
    },
    register: {
      label: 'Create account',
      desc: 'New here? A phone number is all it takes.',
      href: '/auth?tab=signup&role=user&locked=1',
    },
  },
  cook: {
    icon: 'chefHat',
    variant: 'sage',
    title: "I'm here to cook",
    signin: {
      label: 'Sign in',
      desc: 'You already have a kitchen here.',
      href: '/auth?tab=signin&door=cook&locked=1',
    },
    register: {
      label: 'Register your kitchen',
      desc: 'Three short steps, an email code, and your documents.',
      href: '/auth?tab=signup&role=cook&locked=1',
    },
  },
};

export default function DoorScreen() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t } = useLang();
  const params = useLocalSearchParams();
  const door = DOORS[params.role] ?? null;

  if (!door) return <Redirect href="/join" />;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <Container style={{ maxWidth: 520, paddingTop: 32 }}>
          <BackButton fallback="/join" />

          {/* The side this door serves, said once in its own colours. */}
          <Animated.View
            entering={FadeInDown.duration(450)}
            style={[
              {
                marginTop: 22,
                padding: 18,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.sunken,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
              },
              shadow.sm,
            ]}
          >
            <IconTile
              name={door.icon}
              variant={door.variant}
              style={{ width: 52, height: 52, borderRadius: 16 }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: 18,
                  color: colors.text,
                  marginBottom: 2,
                }}
              >
                {t(door.title)}
              </Text>
              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: 12.5,
                  color: colors.textMuted,
                }}
              >
                {t('How would you like to go in?')}
              </Text>
            </View>
          </Animated.View>

          <View style={{ gap: 14, marginTop: 18 }}>
            {[door.signin, door.register].map((action, i) => (
              <Animated.View
                key={action.label}
                entering={FadeInDown.duration(450).delay(120 + i * 120)}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(action.label)}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    router.push(action.href);
                  }}
                  style={({ pressed }) => [
                    {
                      padding: 18,
                      borderRadius: radius.md,
                      borderWidth: 1.5,
                      borderColor: pressed ? colors.primary : colors.line,
                      backgroundColor: pressed ? colors.sunken : colors.surfaceSolid,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    },
                    pressed ? shadow.md : null,
                  ]}
                >
                  <IconTile
                    name={i === 0 ? 'receipt' : 'plus'}
                    variant={i === 0 ? 'saffron' : door.variant}
                    style={{ width: 46, height: 46, borderRadius: 15 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 17,
                        color: colors.text,
                        marginBottom: 3,
                      }}
                    >
                      {t(action.label)}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{
                        fontFamily: font.ui,
                        fontSize: 12.5,
                        lineHeight: 18,
                        color: colors.textMuted,
                      }}
                    >
                      {t(action.desc)}
                    </Text>
                  </View>
                  <Icon name="arrowRight" size={17} color={colors.primary} />
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </Container>
      </ScrollView>
    </Screen>
  );
}
