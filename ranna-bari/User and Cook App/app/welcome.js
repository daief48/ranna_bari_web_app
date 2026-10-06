import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import Screen, { Container } from '../src/components/Screen';
import Button from '../src/components/Button';
import Brand from '../src/components/Brand';
import { IconTile } from '../src/components/Surfaces';
import { useTheme } from '../src/theme/ThemeProvider';
import { font } from '../src/theme/tokens';
import { useLang } from '../src/i18n/LanguageContext';

/**
 * The first page of the app.
 *
 * Nothing here asks for anything: a logo, one sentence about what this
 * place is, and a Continue. The asking — eat or cook, then an account —
 * waits for the next two screens, so the first thing anybody meets is the
 * brand rather than a form.
 */
export default function WelcomeScreen() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t } = useLang();

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48, flexGrow: 1 }}
      >
        <Container style={{ maxWidth: 520, paddingTop: 32, flexGrow: 1 }}>
          <View style={{ flex: 1, justifyContent: 'center', gap: 26, paddingBottom: 30 }}>
            {/* The mark, on its own plate — the welcome is the one place the
                logo is allowed to be the whole content. */}
            <Animated.View
              entering={FadeInDown.duration(500)}
              style={{ alignItems: 'center' }}
            >
              <View
                style={[
                  {
                    width: 116,
                    height: 116,
                    borderRadius: 34,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.lg,
                ]}
              >
                <Brand markSize={84} markOnly />
              </View>

              <View style={{ marginTop: 22, alignItems: 'center' }}>
                <Brand size={30} markOnly={false} />
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(500).delay(150)}
              style={{ alignItems: 'center', gap: 18 }}
            >
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: 24,
                  lineHeight: 31,
                  letterSpacing: -0.5,
                  textAlign: 'center',
                  color: colors.text,
                }}
              >
                {t('Every plate here was cooked by somebody’s hands.')}
              </Text>
              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: 14.5,
                  lineHeight: 22,
                  textAlign: 'center',
                  color: colors.textMuted,
                }}
              >
                {t('Home kitchens, near you')}
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(500).delay(280)}
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <IconTile name="utensils" variant="primary" />
              <IconTile name="chefHat" variant="sage" />
              <IconTile name="delivery" variant="saffron" />
            </Animated.View>
          </View>

          <Animated.View entering={FadeInDown.duration(500).delay(400)}>
            <Button
              label={t('Continue')}
              icon="arrowRight"
              block
              onPress={() => router.replace('/join')}
            />
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 12,
                textAlign: 'center',
                color: colors.textLight,
                marginTop: 12,
                marginBottom: 8,
              }}
            >
              {t('Browsing is open to everyone; ordering needs an account')}
            </Text>
          </Animated.View>
        </Container>
      </ScrollView>
    </Screen>
  );
}
