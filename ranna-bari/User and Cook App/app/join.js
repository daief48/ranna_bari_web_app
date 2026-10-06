import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Button from '../src/components/Button';
import BackButton from '../src/components/BackButton';
import { IconTile } from '../src/components/Surfaces';
import { Heading } from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius } from '../src/theme/tokens';
import { useLang } from '../src/i18n/LanguageContext';

/**
 * The door.
 *
 * Signing in used to open straight on a phone-number field, and the cook's
 * way in hid behind a small "sign in with email" sentence; the role question
 * ("what brings you here?") waited until the middle of creating an account.
 * Nobody could say which of the two apps they were walking into.
 *
 * So the question moved to the front, where it belongs, and takes a whole
 * screen: two doors, each offering both of its ways in. Everything past this
 * point already knew its audience — the picker that used to be signup's step
 * 1 is gone, because this screen is it.
 */

/* The two ways in, per door. `push` rather than `replace`: the door stays
   underneath, so the back button walks you out the way you came. */
const DOORS = [
  {
    key: 'user',
    icon: 'utensils',
    variant: 'primary',
    title: "I'm here to eat",
    desc: 'Order home-cooked meals from kitchens on your street.',
    actions: [
      { label: 'Sign in', variant: 'glass', href: '/auth?tab=signin&door=user' },
      { label: 'Create account', variant: 'primary', href: '/auth?tab=signup&role=user' },
    ],
  },
  {
    key: 'cook',
    icon: 'chefHat',
    variant: 'sage',
    title: "I'm here to cook",
    desc: 'Turn your kitchen into a business. Cook, list, deliver.',
    actions: [
      { label: 'Sign in', variant: 'glass', href: '/auth?tab=signin&door=cook' },
      { label: 'Register your kitchen', variant: 'primary', href: '/auth?tab=signup&role=cook' },
    ],
  },
];

export default function JoinScreen() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t } = useLang();

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <Container style={{ maxWidth: 520, paddingTop: 32 }}>
          <BackButton />

          <Heading style={{ marginTop: 22, marginBottom: 6 }}>
            {t('What brings you here?')}
          </Heading>
          <Text
            style={{
              fontFamily: font.ui,
              fontSize: 14.5,
              lineHeight: 22,
              color: colors.textMuted,
              marginBottom: 20,
            }}
          >
            {t('You can always add the other side later from your profile.')}
          </Text>

          <View style={{ gap: 16 }}>
            {DOORS.map((door) => (
              <View
                key={door.key}
                style={[
                  {
                    padding: 18,
                    paddingHorizontal: 16,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.sunken,
                  },
                  shadow.sm,
                ]}
              >
                <IconTile
                  name={door.icon}
                  variant={door.variant}
                  style={{ width: 48, height: 48, borderRadius: 15, marginBottom: 12 }}
                />

                <Text
                  style={{
                    fontFamily: font.displayExtra,
                    fontSize: 18,
                    lineHeight: 22,
                    letterSpacing: -0.27,
                    color: colors.text,
                    marginBottom: 5,
                  }}
                >
                  {t(door.title)}
                </Text>
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: 13,
                    lineHeight: 20,
                    color: colors.textMuted,
                    marginBottom: 16,
                  }}
                >
                  {t(door.desc)}
                </Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {door.actions.map((action) => (
                    <Button
                      key={action.label}
                      variant={action.variant}
                      label={t(action.label)}
                      small
                      block
                      style={{ flex: 1 }}
                      onPress={() => router.push(action.href)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </Container>
      </ScrollView>
    </Screen>
  );
}
