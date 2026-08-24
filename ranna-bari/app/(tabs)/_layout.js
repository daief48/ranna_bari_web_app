import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import Icon from '../../src/components/Icon';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius } from '../../src/theme/tokens';

const TABS = [
  { name: 'index', icon: 'home', label: 'Home' },
  { name: 'browse', icon: 'search', label: 'Browse' },
  { name: 'map', icon: 'map', label: 'Map' },
  { name: 'profile', icon: 'user', label: 'Profile' },
];

/**
 * `.bottom-app-bar` — a floating pill 12px above the home indicator, inset
 * 12px each side, 22px radius, 8px padding, with 10px labels under 21px
 * icons. `.app-bar-item.active` gets a primary-50 pill and a heavier stroke.
 *
 * The web build hides this above 769px because the navbar already carries
 * every destination; on a phone it *is* the navigation, which is why the
 * navbar up top only keeps the icon cluster.
 */
function AppBar({ state, descriptors, navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const insets = useSafeAreaInsets();

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
          {state.routes.map((route, i) => {
            const meta = TABS.find((t) => t.name === route.name);
            if (!meta) return null;

            const focused = state.index === i;
            const { options } = descriptors[route.key];

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                Haptics.selectionAsync().catch(() => {});
                navigation.navigate(route.name);
              }
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={options.title ?? meta.label}
                onPress={onPress}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 8,
                  borderRadius: 16,
                  backgroundColor: focused ? colors.primary50 : 'transparent',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Icon
                  name={meta.icon}
                  size={21}
                  color={focused ? colors.primary : colors.textMuted}
                  strokeWidth={focused ? 2.1 : 1.75}
                />
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: 10,
                    letterSpacing: 0.15,
                    color: focused ? colors.primary : colors.textMuted,
                  }}
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
      tabBar={(props) => <AppBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="browse" options={{ title: 'Browse' }} />
      <Tabs.Screen name="map" options={{ title: 'Map' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
