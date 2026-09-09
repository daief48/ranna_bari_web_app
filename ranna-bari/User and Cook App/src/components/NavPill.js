import React, { createContext, useContext } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius } from '../theme/tokens';

/**
 * The floating bottom bar, as a shape rather than as a navigator.
 *
 * There were three of these: the customer tab bar, the cook tab bar, and the
 * mess `BottomNav` — the same 74px blurred pill, the same badge, the same
 * pressed transform, written out three times. That was survivable while each
 * belonged to exactly one navigator. It stopped being survivable the moment
 * the bar had to appear on screens that are not in any tab group at all,
 * because the fourth copy would have been the one that drifted.
 *
 * So this is the pill and nothing else. It knows how to draw items and how to
 * report a press; it does not know what a route is. The adapters above it do:
 * a tab navigator hands it `state`/`navigation`, a plain screen hands it a
 * pathname and `router.push`. Both draw the identical bar, which is the whole
 * point — a footer that changed shape depending on which screen you reached
 * it from would read as two different apps.
 */

/** The pill's own height plus the 12 it floats above the home indicator by. */
export const BAR_HEIGHT = 74;

/**
 * How much room the bottom navigation is taking on this screen.
 *
 * Anything else that anchors itself to the bottom — `CartBar`,
 * `LiveOrderStrip` — has to clear it, and only the shell knows whether the
 * bar is drawn here at all. Passing it down as context rather than as a prop
 * is what lets a screen keep writing `footer={<CartBar />}` and still land
 * above the bar it has never heard of.
 */
export const NavOffsetContext = createContext(0);

export function useNavOffset() {
  return useContext(NavOffsetContext);
}

export default function NavPill({ items, accent, accentSoft }) {
  const { colors, shadow, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, n: num } = useLang();

  const on = accent ?? colors.primary;
  const soft = accentSoft ?? colors.primary50;

  return (
    <View
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12 + insets.bottom,
          borderRadius: radius.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.line,
        },
        shadow.lg,
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'android' ? 40 : 26}
        tint={isDark ? 'dark' : 'light'}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 8,
            backgroundColor: isDark
              ? `rgba(${colors.rgbRaised}, 0.88)`
              : 'rgba(250, 247, 240, 0.85)',
          }}
        >
          {items.map((item) => {
            const focused = !!item.active;
            const badge = item.badge ?? 0;

            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={item.accessibilityLabel ?? t(item.label)}
                onPress={item.onPress}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 8,
                  borderRadius: 16,
                  backgroundColor: focused ? soft : 'transparent',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <View>
                  <Icon
                    name={item.icon}
                    size={20}
                    color={focused ? on : colors.textMuted}
                    strokeWidth={focused ? 2.1 : 1.75}
                  />
                  {badge > 0 ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -5,
                        right: -9,
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: 4,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.primary,
                        borderWidth: 1.5,
                        borderColor: colors.canvas,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 9,
                          lineHeight: 11,
                          color: '#FFFFFF',
                        }}
                      >
                        {num(badge)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  /* Capped, not disabled. A large system font is an
                     accessibility setting and content must honour it — but
                     five tab labels in a 50px cell have nowhere to grow, and
                     unbounded scaling turns the bar into overlapping
                     fragments. Content text elsewhere still scales freely. */
                  maxFontSizeMultiplier={1.2}
                  numberOfLines={1}
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: 9,
                    letterSpacing: 0.1,
                    color: focused ? on : colors.textMuted,
                  }}
                >
                  {t(item.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}
