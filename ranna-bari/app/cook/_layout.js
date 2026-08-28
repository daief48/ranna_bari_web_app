import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/store/AuthContext';

/**
 * The cook panel's own stack, a peer of the customer one.
 *
 * The tab group sits one level down so the two detail screens -- an order
 * and a dish editor -- can push over the tab bar instead of becoming tabs
 * themselves, exactly the way `app/(tabs)` and `app/order/[id]` relate.
 */
export default function CookLayout() {
  const { colors } = useTheme();
  const { isCookMode, hydrated } = useAuth();

  /* Nobody reaches the kitchen by typing the URL. The customer tabs bounce a
     cook in here; this bounces everyone else back out. */
  if (hydrated && !isCookMode) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(panel)" options={{ animation: 'fade' }} />
      <Stack.Screen name="order/[id]" />
      <Stack.Screen name="dish/[id]" />
      <Stack.Screen name="meal/new" />
      <Stack.Screen name="meal/[id]" />
      {/* The shop is a hub with its own children rather than a seventh tab:
          six destinations is already the most a phone bar can carry. */}
      <Stack.Screen name="store/index" />
      <Stack.Screen name="store/settings" />
      <Stack.Screen name="store/categories" />
      <Stack.Screen name="store/products" />
      <Stack.Screen name="store/product/[id]" />
      <Stack.Screen name="store/orders" />
      <Stack.Screen name="store/preorders" />
      <Stack.Screen name="requests/index" />
      <Stack.Screen name="requests/[id]" />
    </Stack>
  );
}
