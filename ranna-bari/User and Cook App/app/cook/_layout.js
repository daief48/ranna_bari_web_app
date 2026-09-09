import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/store/AuthContext';
import { useSession } from '../../src/store/SessionContext';
import { accessSettled, isVerifiedCook } from '../../src/lib/access';

/**
 * The cook panel's own stack, a peer of the customer one.
 *
 * The tab group sits one level down so the two detail screens -- an order
 * and a dish editor -- can push over the tab bar instead of becoming tabs
 * themselves, exactly the way `app/(tabs)` and `app/order/[id]` relate.
 */
export default function CookLayout() {
  const { colors } = useTheme();
  const auth = useAuth();
  const session = useSession();

  /*
   * The door to the kitchen, and the only one.
   *
   * This used to ask `isCookMode`, which is `role === 'cook'` on the account
   * cached in AsyncStorage, and'd on with a `viewMode` string the app writes
   * itself. Neither is a credential. The cached role outlives the thing that
   * granted it — a kitchen suspended or deleted on the server leaves the
   * device still believing — and the view mode is a preference that anything
   * able to write storage can set.
   *
   * It asks the server now: a cook is somebody `/auth/me` calls a cook, which
   * the backend only says when a live kitchen belongs to their account.
   *
   * Rendering nothing until both stores have settled is the other half. The
   * old guard was `hydrated && !isCookMode`, so before hydration it fell
   * through and mounted the panel — a frame of somebody else's kitchen for
   * anyone who opened the URL, and a redirect cannot be taken back.
   */
  if (!accessSettled(auth, session)) return null;
  if (!isVerifiedCook(session)) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(panel)" options={{ animation: 'fade' }} />
      {/* A page of its own rather than a block on the kitchen screen: a cook
          reading a bad review is doing one thing, and it is not editing their
          cover photograph. */}
      <Stack.Screen name="reviews" />
      <Stack.Screen name="order/[id]" />
      <Stack.Screen name="dish/[id]" />
      {/* The monthly meal system: what this kitchen serves, the calendar it
          serves from, and the dish names that fill it. `meal/new` and
          `meal/[id]` stood here for the per-plate board that this replaced. */}
      <Stack.Screen name="meal-service" />
      <Stack.Screen name="meal-plan" />
      <Stack.Screen name="meal-dishes" />
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
