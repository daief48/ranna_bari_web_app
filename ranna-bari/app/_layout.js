import React, { useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

/* Deep imports, not the package barrels. Each barrel `require()`s all 18
   weights of its family, so importing five names off it still ships ~10MB of
   TTFs nobody renders. These pull only the twelve faces the app uses. */
import Fraunces_400Regular from '@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf';
import Fraunces_600SemiBold from '@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf';
import Fraunces_700Bold from '@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf';
import Fraunces_800ExtraBold from '@expo-google-fonts/fraunces/800ExtraBold/Fraunces_800ExtraBold.ttf';
import Fraunces_900Black from '@expo-google-fonts/fraunces/900Black/Fraunces_900Black.ttf';
import Fraunces_800ExtraBold_Italic from '@expo-google-fonts/fraunces/800ExtraBold_Italic/Fraunces_800ExtraBold_Italic.ttf';
import Inter_300Light from '@expo-google-fonts/inter/300Light/Inter_300Light.ttf';
import Inter_400Regular from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
import Inter_500Medium from '@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf';
import Inter_600SemiBold from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf';
import Inter_700Bold from '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf';
import NotoSansBengali_500Medium from '@expo-google-fonts/noto-sans-bengali/500Medium/NotoSansBengali_500Medium.ttf';
import NotoSansBengali_700Bold from '@expo-google-fonts/noto-sans-bengali/700Bold/NotoSansBengali_700Bold.ttf';

import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { CartProvider } from '../src/store/CartContext';
import { AuthProvider, useAuth } from '../src/store/AuthContext';
import { OrdersProvider, useOrders } from '../src/store/OrdersContext';
import { KitchenProvider, useKitchen } from '../src/store/KitchenContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Keeps the local kitchen in step with the account.
 *
 * A cook's kitchen is derived state -- signing up as a cook implies one, and
 * nothing else in the app is in a position to create it. This is the one
 * place that watches for that, so no screen has to remember to.
 *
 * It deliberately does not tear the kitchen down on sign-out: a listed
 * kitchen does not stop existing because its cook closed the app, and a menu
 * built over several sessions should survive one.
 */
function KitchenSync() {
  const { account, hydrated: authReady } = useAuth();
  const { kitchen, hydrated: kitchenReady, ensureKitchen } = useKitchen();
  const { seedKitchenOrders, hydrated: ordersReady } = useOrders();

  useEffect(() => {
    if (!authReady || !kitchenReady) return;
    if (account?.role !== 'cook' || kitchen) return;
    ensureKitchen(account);
  }, [authReady, kitchenReady, account, kitchen, ensureKitchen]);

  useEffect(() => {
    if (!ordersReady || !kitchen) return;
    seedKitchenOrders(kitchen);
  }, [ordersReady, kitchen, seedKitchenOrders]);

  return null;
}

/**
 * Fraunces is the display voice -- expressive optical-size serif, artisanal
 * and specific. Inter keeps every control and body run neutral and legible.
 * Noto Sans Bengali is loaded for one reason: the taka sign (৳, U+09F3) that
 * every price on every screen is prefixed with.
 */
function Root() {
  const { colors, mode } = useTheme();

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        {/* The cook panel is a peer of the customer tabs, not a screen inside
            them -- switching modes replaces the whole app, so it fades. */}
        <Stack.Screen name="cook" options={{ animation: 'fade' }} />
        <Stack.Screen name="chef/[id]" />
        <Stack.Screen name="cart" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="orders" />
        {/* Replacing the cart with the receipt is a one-way step: the back
            gesture should not walk into a checkout whose cart is now empty. */}
        <Stack.Screen name="order/[id]" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="become-cook" />
        <Stack.Screen name="edit-profile" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_800ExtraBold,
    Fraunces_900Black,
    // The auth banner's one <em> word is a real italic, not a synthesised one
    Fraunces_800ExtraBold_Italic,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    NotoSansBengali_500Medium,
    NotoSansBengali_700Bold,
  });

  // A font that fails to decode must not leave the app behind the splash
  // screen forever -- fall through to system faces instead.
  const ready = loaded || !!error;

  const onLayout = useCallback(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <OrdersProvider>
              <KitchenProvider>
                <CartProvider>
                  <KitchenSync />
                  <Root />
                </CartProvider>
              </KitchenProvider>
            </OrdersProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
