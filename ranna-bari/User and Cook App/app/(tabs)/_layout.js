import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';

import NavPill, { BAR_HEIGHT } from '../../src/components/NavPill';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/store/AuthContext';
import { useCart } from '../../src/store/CartContext';
import LiveOrderStrip from '../../src/components/LiveOrderStrip';
import { useCommerce } from '../../src/store/CommerceContext';
import { customerKeyOf } from '../../src/lib/ledger';
import { useLang } from '../../src/i18n/LanguageContext';

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
/*
 * Five, not seven.
 *
 * Map and Shops are gone from the bar and not from the app. Map is a view of
 * Browse — the round shortcut in Browse's own toolbar was already saying so —
 * and Shops is a category of it, which Browse now carries as a segment. Seven
 * labels across a phone leaves each about forty pixels, which is the point at
 * which a bar stops being read and starts being hunted through.
 *
 * Meals stays. It is time-boxed — book tonight, eat tomorrow — and it carries
 * a "to confirm" badge; a deadline behind a segment is a deadline nobody
 * meets.
 */
const TABS = [
  { name: 'index', icon: 'home', label: 'Home' },
  { name: 'browse', icon: 'search', label: 'Browse' },
  { name: 'meals', icon: 'pot', label: 'Meals' },
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
  const { colors } = useTheme();
  const { lineCount } = useCart();
  const { account } = useAuth();
  const commerce = useCommerce();
  const { orders } = commerce;
  const { t, n: num } = useLang();

  const key = customerKeyOf(account);
  const toConfirm = orders.filter(
    (o) => o.customerKey === key && o.status === 'delivered',
  ).length;

  /*
   * Both baskets, because the badge is about the tab and there are two carts
   * behind it.
   *
   * `useCart` is the kitchen basket — dishes, cash on delivery. The shelf
   * basket is Commerce's, wallet-paid and held on the server, and the cart
   * screen already shows the two as separate sections. The badge read only
   * the first, so a customer with three jars of pickle in their basket saw a
   * bare cart icon and no reason to think anything was in it.
   */
  /* How many different things are in the basket, not how many plates. A
     basket of ten of one pickle is one item to look at, and a badge reading
     "10" for it is a number the customer never chose. Both baskets count:
     the kitchen cart lives on the device, the shelf cart on the server. */
  const shelfCount = commerce.priceCart(key).lines.length;
  const cartCount = lineCount + shelfCount;

  /* The pill itself lives in `NavPill`, shared with `AppFooter` — the same
     bar has to appear on screens this navigator does not own, and drawing it
     twice is how the two would drift apart. This half is only the adapter:
     it turns tab state into items and a press into `navigation.navigate`. */
  const items = state.routes
    .map((route, i) => {
      const meta = TABS.find((tab) => tab.name === route.name);
      if (!meta) return null;

      const focused = state.index === i;
      const { options } = descriptors[route.key];
      /* The two tabs whose contents change behind your back: what is in the
         basket, and what has been delivered and is waiting on you to say so —
         until you do, your money is held and the cook is not paid. */
      const badge =
        meta.name === 'cart' ? cartCount : meta.name === 'meals' ? toConfirm : 0;
      const title = t(options.title ?? meta.label);

      return {
        key: route.key,
        icon: meta.icon,
        label: options.title ?? meta.label,
        active: focused,
        badge,
        accessibilityLabel: !badge
          ? title
          : `${title}, ${
              meta.name === 'meals'
                ? t('{n} to confirm', { n: num(badge) })
                : t(badge === 1 ? '{n} item' : '{n} items', { n: num(badge) })
            }`,
        onPress: () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            Haptics.selectionAsync().catch(() => {});
            navigation.navigate(route.name);
          }
        },
      };
    })
    .filter(Boolean);

  return <NavPill items={items} accent={colors.primary} accentSoft={colors.primary50} />;
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
      /*
       * The bar, and the order strip that rides above it.
       *
       * Both are absolutely positioned and both belong to the foot of the
       * screen, so they are drawn by the same callback — that way the strip
       * cannot drift away from the bar when the safe-area inset changes.
       * BAR_HEIGHT is the pill's own height plus the 12 it floats at.
       */
      tabBar={(props) => (
        <>
          <LiveOrderStrip bottom={BAR_HEIGHT + 8} />
          <AppBar {...props} />
        </>
      )}
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
