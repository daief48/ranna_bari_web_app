import React from 'react';
import { usePathname, useRouter, useSegments } from 'expo-router';
import * as Haptics from 'expo-haptics';

import NavPill from './NavPill';
import { useCart } from '../store/CartContext';
import { useCommerce } from '../store/CommerceContext';
import { useAuth } from '../store/AuthContext';
import { customerKeyOf } from '../lib/ledger';
import { useSession } from '../store/SessionContext';
import { isSignedIn } from '../lib/access';
import { useLang } from '../i18n/LanguageContext';

/**
 * The bottom bar for screens that are not tabs.
 *
 * The customer bar lived inside `(tabs)/_layout.js` and therefore existed
 * only for the five tab screens. Everything else — an order, a dish, the
 * wallet, notifications, addresses, checkout — had no bottom navigation at
 * all, so reaching any of them meant losing the way to everywhere else until
 * you went back. On the web build, where there is no system back gesture,
 * that was a dead end.
 *
 * Same pill, same five destinations, driven by the pathname instead of by tab
 * state. `push` rather than `replace`: arriving here from a stack screen
 * should leave that screen behind you, so the back button still means what it
 * says.
 */

/** The five destinations, matching `TABS` in `app/(tabs)/_layout.js`. */
export const FOOTER_TABS = [
  { key: 'index', icon: 'home', label: 'Home', href: '/' },
  { key: 'browse', icon: 'search', label: 'Browse', href: '/browse' },
  { key: 'meals', icon: 'pot', label: 'Meals', href: '/meals' },
  { key: 'cart', icon: 'cart', label: 'Cart', href: '/cart' },
  { key: 'profile', icon: 'user', label: 'Profile', href: '/profile' },
];

/**
 * Whether the tab navigator is already drawing a bar for this screen.
 *
 * Asked of the route group rather than of a list of paths, and that is the
 * whole point. A list has to be kept in step with the navigator by hand, and
 * it will not be: the cook panel registers nine screens and only five are in
 * its bar, so a list written from the bar was short by four — and on those
 * four this component drew a second pill directly on top of the navigator's
 * own. Group membership is what the navigator itself goes by, so it cannot
 * fall out of step.
 */
export function useInTabGroup() {
  return useSegments().includes('(tabs)');
}

/**
 * Sections of the app with a bar of their own.
 *
 * The cook panel and the mess have their own navigation, and a cook halfway
 * through their menu should not be handed the customer's Home/Browse/Cart.
 * Their shells draw the right bar; this one stays out.
 */
function inAnotherSection(pathname) {
  const p = String(pathname ?? '');
  return p.startsWith('/cook') || p.startsWith('/meal-management');
}

export function shouldDrawAppFooter(pathname, inTabGroup) {
  return !inTabGroup && !inAnotherSection(pathname);
}

export default function AppFooter() {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { lineCount } = useCart();
  const { account } = useAuth();
  const commerce = useCommerce();
  const { t, n: num } = useLang();

  const key = customerKeyOf(account);

  /* How many different things are in the basket, not how many plates. A
     basket of ten of one pickle is one item to look at, and a badge reading
     "10" for it is a number the customer never chose. Both baskets count:
     the kitchen cart lives on the device, the shelf cart on the server. */
  const shelfCount = commerce.priceCart(key).lines.length;
  const cartCount = lineCount + shelfCount;

  const toConfirm = commerce.orders.filter(
    (o) => o.customerKey === key && o.status === 'delivered',
  ).length;

  const current = String(pathname ?? '').replace(/\/+$/, '') || '/';

  const items = FOOTER_TABS.map((tab) => {
    const badge = tab.key === 'cart' ? cartCount : tab.key === 'meals' ? toConfirm : 0;
    return {
      key: tab.key,
      icon: tab.icon,
      label: tab.label,
      active: current === tab.href,
      badge,
      accessibilityLabel: !badge
        ? t(tab.label)
        : `${t(tab.label)}, ${
            tab.key === 'meals'
              ? t('{n} to confirm', { n: num(badge) })
              : t(badge === 1 ? '{n} item' : '{n} items', { n: num(badge) })
          }`,
      onPress: () => {
        if (current === tab.href) return;
        Haptics.selectionAsync().catch(() => {});
        router.push(tab.href);
      },
    };
  });

  /* The same rule the tab bar follows, so the bar does not appear and
     disappear depending on which kind of screen a guest is standing on. */
  if (!isSignedIn(session)) return null;

  return <NavPill items={items} />;
}
