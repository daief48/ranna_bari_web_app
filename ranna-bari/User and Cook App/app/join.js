import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
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
 * The partition.
 *
 * Second page of the way in: the welcome has said who this place is, and
 * this screen asks the one question that shapes everything after it. The
 * answer is carried to the door screen, where the side's own sign-in and
 * registration wait — neither choice is asked to share a page with the
 * other any more.
 */
const DOORS = [
  {
    key: 'user',
    icon: 'utensils',
    variant: 'primary',
    title: "I'm here to eat",
    desc: 'Order home-cooked meals from kitchens on your street.',
  },
  {
    key: 'cook',
    icon: 'chefHat',
    variant: 'sage',
    title: "I'm here to cook",
    desc: 'Turn your kitchen into a business. Cook, list, deliver.',
  },
];

export default function JoinScreen() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t } = useLang();

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <Container style={{ maxWidth: 520, paddingTop: 32 }}>
          <BackButton fallback="/welcome" />

          <Heading style={{ marginTop: 22, marginBottom: 6 }}>
            {t('What brings you here?')}
          </Heading>
          <Text
            style={{
              fontFamily: font.ui,
              fontSize: 14.5,
              lineHeight: 22,
              color: colors.textMuted,
              marginBottom: 22,
            }}
          >
            {t('You can always add the other side later from your profile.')}
          </Text>

          <View style={{ gap: 16 }}>
            {DOORS.map((door, i) => (
              <Animated.View key={door.key} entering={FadeInDown.duration(450).delay(i * 120)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(door.title)}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    router.push({ pathname: '/door', params: { role: door.key } });
                  }}
                  style={({ pressed }) => [
                    {
                      padding: 20,
                      paddingHorizontal: 18,
                      borderRadius: radius.md,
                      borderWidth: 1.5,
                      borderColor: pressed ? colors.primary : colors.line,
                      backgroundColor: colors.surfaceSolid,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 16,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    },
                    pressed ? shadow.md : shadow.sm,
                  ]}
                >
                  <IconTile
                    name={door.icon}
                    variant={door.variant}
                    style={{ width: 56, height: 56, borderRadius: 18 }}
                  />

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 19,
                        lineHeight: 24,
                        letterSpacing: -0.3,
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {t(door.title)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: 13,
                        lineHeight: 19,
                        color: colors.textMuted,
                      }}
                    >
                      {t(door.desc)}
                    </Text>
                  </View>

                  <Icon name="chevronRight" size={18} color={colors.textMuted} />
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </Container>
      </ScrollView>
    </Screen>
  );
}
