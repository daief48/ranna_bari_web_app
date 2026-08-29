import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import Icon from '../../src/components/Icon';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/store/AuthContext';
import { useCart } from '../../src/store/CartContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { customerKeyOf } from '../../src/lib/mealLogic';
import { useLang } from '../../src/i18n/LanguageContext';
import { font, radius } from '../../src/theme/tokens';

/**
 * The seven destinations, in the order somebody moves through them.
 *
 * Shops was reachable only from a row inside Profile, which is two taps and a
 * screen nobody visits to go shopping — so the whole store side of the
 * marketplace was effectively hidden behind the settings page. It belongs
 * next to Meals: both answer "what can I buy", where Browse answers "who is
 * cooking" and Map answers "who is near me".
 *
 * That does cost something. Cart used to sit at the centre of six, which is
 * the easiest reach on a phone; at seven it moves off centre. Keeping it
 * central would have meant wedging the basket between Meals and Shops, and a
 * basket in the middle of the browsing tabs reads as a mistake. Cart also
 * carries a badge, which is its own way of being found.
 */
const TABS = [
  { name: 'index', icon: 'home', label: 'Home' },
  { name: 'browse', icon: 'search', label: 'Browse' },
  { name: 'meals', icon: 'pot', label: 'Meals' },
  { name: 'stores', icon: 'box', label: 'Shops' },
  { name: 'map', icon: 'map', label: 'Map' },
  { name: 'cart', icon: 'cart', label: 'Cart' },
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
  const { count } = useCart();
  const { account } = useAuth();
  const { orders } = useCommerce();
  const { t, n: num } = useLang();

  const key = customerKeyOf(account);
  const toConfirm = orders.filter(
    (o) => o.customerKey === key && o.status === 'delivered',
  ).length;

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
            /* The two tabs whose contents change behind your back: what is in
               the basket, and what has been delivered and is waiting on you to
               say so -- until you do, your money is held and the cook is not
               paid, so it belongs on the bar rather than one screen in. */
            const badge =
              meta.name === 'cart' ? count : meta.name === 'meals' ? toConfirm : 0;

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
                accessibilityLabel={
                  !badge
                    ? t(options.title ?? meta.label)
                    : `${t(options.title ?? meta.label)}, ${
                        meta.name === 'meals'
                          ? t('{n} to confirm', { n: num(badge) })
                          : t(badge === 1 ? '{n} item' : '{n} items', { n: num(badge) })
                      }`
                }
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
                {/* Six tabs now, so the icon and label each give up a point
                    to keep the labels off each other. */}
                <View>
                  <Icon
                    name={meta.icon}
                    size={20}
                    color={focused ? colors.primary : colors.textMuted}
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
                  numberOfLines={1}
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: 9,
                    letterSpacing: 0.1,
                    color: focused ? colors.primary : colors.textMuted,
                  }}
                >
                  {t(meta.label)}
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
  const { isCookMode, hydrated } = useAuth();

  /* The customer tabs are the app's front door, so a cook arrives here first
     and is handed straight over. Waiting on `hydrated` is what keeps that
     from flashing the wrong panel for a frame on a cold start. */
  if (hydrated && isCookMode) return <Redirect href="/cook" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
      tabBar={(props) => <AppBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="browse" options={{ title: 'Browse' }} />
      <Tabs.Screen name="meals" options={{ title: 'Meals' }} />
      {/* `(tabs)` is a route group, so this is still `/stores` — every
          existing link to it keeps working, and `stores/[id]` still serves
          the shop page from outside the group. */}
      <Tabs.Screen name="stores" options={{ title: 'Shops' }} />
      <Tabs.Screen name="map" options={{ title: 'Map' }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
