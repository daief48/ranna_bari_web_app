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
import { useRouter } from 'expo-router';
import { KitchenPending, KitchenSuspended } from '../../../src/components/CookBits';
import { font, radius } from '../../../src/theme/tokens';

/*
 * Four, not seven.
 *
 * Menu, Meals and Shop were three separate destinations for one idea — the
 * things this kitchen offers — and Earnings and Kitchen were two for another.
 * Seven labels in a phone-width pill leaves each of them about forty pixels,
 * which is how a bar stops being read and starts being hunted through.
 *
 * The five screens keep their routes and every link to them still works:
 * `state.routes.map` below draws nothing for a route with no entry here, so
 * leaving them out hides them from the bar without unmounting anything.
 */
const TABS = [
  { name: 'index', icon: 'activity', label: 'Today' },
  { name: 'orders', icon: 'receipt', label: 'Orders' },
  { name: 'listings', icon: 'utensils', label: 'Listings' },
  { name: 'business', icon: 'banknote', label: 'Business' },
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
            /* Meals moved under Listings, so the plates-to-cook count moves
               with it — a number that vanished when its tab did would be a
               count the cook simply stops seeing. */
            const badge =
              meta.name === 'orders' ? waiting : meta.name === 'listings' ? toCook : 0;

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

/**
 * The cook dashboard, behind an approval.
 *
 * This used to open and explain itself in a banner, with the actions needing
 * approval locked one at a time. Wrong shape: a dashboard whose every
 * meaningful control is disabled is a waiting room wearing a dashboard, and it
 * invites a cook to keep pressing things to find out which of them work.
 *
 * The gate is here rather than on each screen because this layout is the one
 * door into the panel — every tab renders through it, so a rule stated once
 * here cannot be forgotten on the next screen somebody adds.
 *
 * The backend refuses these actions regardless. This is the half that tells a
 * cook why, which the backend cannot do from inside a 403.
 */
export default function CookPanelLayout() {
  const { kitchen, hydrated } = useKitchen();
  const router = useRouter();

  /* Nothing until the kitchen is read. Rendering the gate first would flash
     "waiting for approval" at an approved cook on every cold start, which is
     alarming in a way that is entirely untrue. */
  if (!hydrated) return null;

  /*
   * Suspension is checked before approval, because it outranks it.
   *
   * A suspended kitchen is usually an approved one, so the KYC branch below
   * would let it straight through — which is exactly what happened: the panel
   * opened as normal and then refused every write with `no-kitchen`, because
   * `toIdentity` drops `kitchenId` for a suspended kitchen. A cook whose
   * kitchen had been stopped saw a working dashboard and a string of failures
   * with no reason attached to any of them.
   */
  if (kitchen?.suspended) {
    return (
      <KitchenSuspended
        kitchen={kitchen}
        onContact={() => router.push('/chat')}
        onBack={() => router.replace('/')}
      />
    );
  }

  if (kitchen && kitchen.kycStatus !== 'approved') {
    return (
      <KitchenPending
        kitchen={kitchen}
        onOpenDetails={() => router.push('/cook/kitchen-details')}
        onBack={() => router.replace('/')}
      />
    );
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
      tabBar={(props) => <CookBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="listings" options={{ title: 'Listings' }} />
      <Tabs.Screen name="business" options={{ title: 'Business' }} />
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
