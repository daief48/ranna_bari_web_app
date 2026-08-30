import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import Icon from '../../../src/components/Icon';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useOrders } from '../../../src/store/OrdersContext';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useLang } from '../../../src/i18n/LanguageContext';
import { font, radius } from '../../../src/theme/tokens';

const TABS = [
  { name: 'index', icon: 'activity', label: 'Today' },
  { name: 'orders', icon: 'receipt', label: 'Orders' },
  { name: 'meals', icon: 'pot', label: 'Meals' },
  { name: 'menu', icon: 'utensils', label: 'Menu' },
  /* The shelf, beside the menu. A cook's two catalogues — what they cook to
     order and what they sell off the shelf — were one tap apart and a whole
     navigation apart: the shop lived at a URL with nothing pointing at it. */
  { name: 'store', icon: 'box', label: 'Shop' },
  { name: 'earnings', icon: 'banknote', label: 'Earnings' },
  { name: 'kitchen', icon: 'chefHat', label: 'Kitchen' },
];

/**
 * The same floating pill the customer app uses, in sage rather than
 * vermilion.
 *
 * Both panels ship on one device and a cook moves between them, so they need
 * to be distinguishable at a glance without becoming two different products.
 * Colour is the whole signal: identical geometry, identical material, one
 * hue apart.
 *
 * Five tabs instead of four also means the labels get less room, which is
 * why they are a couple of points smaller here.
 */
function CookBar({ state, descriptors, navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { ordersForKitchen } = useOrders();
  const { kitchen } = useKitchen();
  const { orders: mealOrders } = useCommerce();
  const { t, n: num } = useLang();

  /* The one number worth interrupting a cook for: orders nobody has looked
     at yet. It rides the Orders tab so it is visible from every screen. */
  const waiting = kitchen
    ? ordersForKitchen(kitchen.id).filter((o) => o.status === 'placed').length
    : 0;

  /* Its equivalent for pre-booked meals: plates paid for and not yet
     started. This is the number the cook shops against, so it should be
     legible from wherever they are standing. */
  const toCook = kitchen
    ? mealOrders
        .filter((o) => String(o.kitchenId) === String(kitchen.id))
        .filter((o) => o.status === 'confirmed').length
    : 0;

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
            const badge =
              meta.name === 'orders' ? waiting : meta.name === 'meals' ? toCook : 0;

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
                          ? t('{n} plates to cook', { n: num(badge) })
                          : t('{n} waiting on you', { n: num(badge) })
                      }`
                }
                onPress={onPress}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 8,
                  borderRadius: 16,
                  backgroundColor: focused ? colors.sage50 : 'transparent',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <View>
                  <Icon
                    name={meta.icon}
                    size={20}
                    color={focused ? colors.sage : colors.textMuted}
                    strokeWidth={focused ? 2.1 : 1.75}
                  />
                  {/* Vermilion on a sage bar: the count is the one thing here
                      that is urgent, and it should not read as chrome. */}
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
                     seven tab labels in a 50px cell have nowhere to grow, and
                     unbounded scaling turns the bar into overlapping fragments.
                     Content text elsewhere still scales freely. */
                  maxFontSizeMultiplier={1.2}
                  numberOfLines={1}
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: 9,
                    letterSpacing: 0.1,
                    color: focused ? colors.sage : colors.textMuted,
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

export default function CookPanelLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
      tabBar={(props) => <CookBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="meals" options={{ title: 'Meals' }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu' }} />
      {/* `(panel)` is a group, so this is still `/cook/store` — the rows and
          links already pointing there keep working, and the sub-pages under
          `cook/store/` still serve their own paths. */}
      <Tabs.Screen name="store" options={{ title: 'Shop' }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
      <Tabs.Screen name="kitchen" options={{ title: 'Kitchen' }} />
    </Tabs>
  );
}
