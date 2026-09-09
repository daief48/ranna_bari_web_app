import React from 'react';
import { usePathname, useRouter, useSegments } from 'expo-router';
import * as Haptics from 'expo-haptics';

import NavPill from './NavPill';
import { useTheme } from '../theme/ThemeProvider';
import { useKitchen } from '../store/KitchenContext';
import { useOrders } from '../store/OrdersContext';
import { useCommerce } from '../store/CommerceContext';
import { useLang } from '../i18n/LanguageContext';

/**
 * The cook's bottom bar, for the cook screens that are not panel tabs.
 *
 * Half the cook app lives outside `cook/(panel)` — reviews, the shop's
 * products and categories, a single order, a dish, kitchen details. Those had
 * no bar at all, so a cook who opened one had to walk back out the way they
 * came in before they could go anywhere else.
 *
 * Sage rather than vermilion, matching the panel's own bar: both panels ship
 * on one device and a cook moves between them, so colour is the signal that
 * says which side you are standing on.
 */

/** The five destinations, matching `TABS` in `app/cook/(panel)/_layout.js`. */
export const COOK_FOOTER_TABS = [
  { key: 'index', icon: 'activity', label: 'Today', href: '/cook' },
  { key: 'orders', icon: 'receipt', label: 'Orders', href: '/cook/orders' },
  { key: 'listings', icon: 'utensils', label: 'Listings', href: '/cook/listings' },
  { key: 'business', icon: 'banknote', label: 'Business', href: '/cook/business' },
  { key: 'kitchen', icon: 'user', label: 'Profile', href: '/cook/kitchen' },
];

/**
 * Whether the cook panel's own navigator is already drawing a bar here.
 *
 * The group registers nine screens and shows four in the bar — Kitchen, Menu,
 * Shop, Earnings and Meals are reachable but deliberately not tabs. They
 * still belong to the navigator, so it still draws its bar on them. Listing
 * the four visible ones and calling that "the tab routes" put a second pill
 * on top of the navigator's own across the other five, and the one at the
 * bottom of Kitchen that it covered was Log out.
 */
export function useInCookPanel() {
  return useSegments().includes('(panel)');
}

export default function CookFooter() {
  const pathname = usePathname();
  const router = useRouter();
  const { colors } = useTheme();
  const { kitchen } = useKitchen();
  const { ordersForKitchen } = useOrders();
  const { orders: mealOrders } = useCommerce();
  const { t, n: num } = useLang();

  /* The one number worth interrupting a cook for: orders nobody has looked at
     yet. It rides the Orders tab so it is visible from every screen. */
  const waiting = kitchen
    ? ordersForKitchen(kitchen.id).filter((o) => o.status === 'placed').length
    : 0;

  const current = String(pathname ?? '').replace(/\/+$/, '') || '/';

  const items = COOK_FOOTER_TABS.map((tab) => {
    const badge = tab.key === 'orders' ? waiting : 0;
    return {
      key: tab.key,
      icon: tab.icon,
      label: tab.label,
      active: current === tab.href,
      badge,
      accessibilityLabel: badge
        ? `${t(tab.label)}, ${t('{n} waiting', { n: num(badge) })}`
        : t(tab.label),
      onPress: () => {
        if (current === tab.href) return;
        Haptics.selectionAsync().catch(() => {});
        router.push(tab.href);
      },
    };
  });

  return <NavPill items={items} accent={colors.sage} accentSoft={colors.sage50} />;
}
