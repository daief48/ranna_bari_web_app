import React, { useCallback, useEffect, useRef } from 'react';
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
/* Bengali carries the whole interface when the language is switched, not just
   the taka sign, so it needs the same range of weights the Latin faces do. */
import NotoSansBengali_400Regular from '@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf';
import NotoSansBengali_500Medium from '@expo-google-fonts/noto-sans-bengali/500Medium/NotoSansBengali_500Medium.ttf';
import NotoSansBengali_600SemiBold from '@expo-google-fonts/noto-sans-bengali/600SemiBold/NotoSansBengali_600SemiBold.ttf';
import NotoSansBengali_700Bold from '@expo-google-fonts/noto-sans-bengali/700Bold/NotoSansBengali_700Bold.ttf';
import NotoSansBengali_800ExtraBold from '@expo-google-fonts/noto-sans-bengali/800ExtraBold/NotoSansBengali_800ExtraBold.ttf';

import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { CartProvider } from '../src/store/CartContext';
import { AuthProvider, useAuth } from '../src/store/AuthContext';
import { OrdersProvider } from '../src/store/OrdersContext';
import { KitchenProvider, useKitchen } from '../src/store/KitchenContext';
import { CommerceProvider } from '../src/store/CommerceContext';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { SessionProvider, useSession } from '../src/store/SessionContext';
import { ChatProvider } from '../src/store/ChatContext';
import { SyncProvider } from '../src/store/SyncContext';
import { ConfigProvider } from '../src/store/ConfigContext';
import { LoadingProvider } from '../src/store/LoadingContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Keeps the cook's kitchen in step with the account.
 *
 * A cook's kitchen is derived state -- signing up as a cook implies one, and
 * nothing else in the app is in a position to create it. This is the one
 * place that watches for that, so no screen has to remember to.
 *
 * Registering it is a round trip now, so the guard is a ref rather than the
 * absence of a kitchen: `kitchen` stays null for as long as the request is in
 * flight, and re-running on that would file a second registration for every
 * render in between.
 *
 * It deliberately does not tear the kitchen down on sign-out. A listed
 * kitchen does not stop existing because its cook closed the app -- it is a
 * server row, and signing out only drops this device's cached copy of it.
 */
function KitchenSync() {
  const { account, hydrated: authReady } = useAuth();
  const { kitchen, hydrated: kitchenReady, loaded, ensureKitchen } = useKitchen();
  const { isVerified } = useSession();

  const asked = useRef(false);

  useEffect(() => {
    if (!authReady || !kitchenReady) return;
    /* Registering needs a token: the server decides which account the kitchen
       belongs to from it, and will not take the device's word for it. */
    if (!isVerified) return;
    /* And it needs the server's answer, not merely the absence of one. A cook
       signing in on a new device has no cached kitchen for as long as the
       first read takes, and registering into that gap would overwrite the
       real kitchen with a draft built from their profile. */
    if (!loaded) return;
    if (account?.role !== 'cook' || kitchen || asked.current) return;

    asked.current = true;
    ensureKitchen(account).catch(() => {
      // Let the next sign-in try again rather than wedging on a dead network.
      asked.current = false;
    });
  }, [authReady, kitchenReady, loaded, isVerified, account, kitchen, ensureKitchen]);

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
        <Stack.Screen name="dish/[id]" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="orders" />
        {/* Replacing the cart with the receipt is a one-way step: the back
            gesture should not walk into a checkout whose cart is now empty. */}
        <Stack.Screen name="order/[id]" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="become-cook" />
        <Stack.Screen name="edit-profile" />
        {/* ---- pre-booked meals ---- */}
        <Stack.Screen name="meals/[id]" />
        {/* Confirming replaces the meal with its receipt, the same one-way
            step checkout makes: back should not walk into a meal you have
            already paid for. */}
        <Stack.Screen name="meal-order/[id]" options={{ animation: 'fade' }} />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="notifications" />
        {/* ---- cook stores ---- */}
        <Stack.Screen name="stores/index" />
        <Stack.Screen name="stores/[id]" />
        <Stack.Screen name="product/[id]" />
        <Stack.Screen name="store-checkout" />
        {/* Paying replaces the basket with the receipt, the same one-way step
            the other checkouts make. */}
        <Stack.Screen name="store-order/[id]" options={{ animation: 'fade' }} />
        {/* ---- food requests and bidding ---- */}
        <Stack.Screen name="requests/index" />
        <Stack.Screen name="requests/new" />
        <Stack.Screen name="requests/[id]" />
        <Stack.Screen name="request-order/[id]" options={{ animation: 'fade' }} />
        {/* ---- live chat ---- */}
        <Stack.Screen name="chat/index" />
        <Stack.Screen name="chat/verify" />
        {/* A conversation draws its own header and pins its own composer, so
            it slides in over everything rather than sitting in the shell. */}
        <Stack.Screen name="chat/[id]" />
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
    NotoSansBengali_400Regular,
    NotoSansBengali_500Medium,
    NotoSansBengali_600SemiBold,
    NotoSansBengali_700Bold,
    NotoSansBengali_800ExtraBold,
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
        <LanguageProvider>
        <ThemeProvider>
          <ConfigProvider>
          <AuthProvider>
            {/* The nesting is the dependency graph, and it changed when the
                data moved to the server. `KitchenProvider` reads the session
                to know which kitchen is the caller's; `CommerceProvider`
                needs both; and `OrdersProvider` is now a projection over
                Commerce's single copy of `/orders` rather than a second list
                of its own, so it has to sit inside it. */}
            <SessionProvider>
              <KitchenProvider>
                <CommerceProvider>
                  <OrdersProvider>
                    <CartProvider>
                      <SyncProvider>
                      <ChatProvider>
                        <LoadingProvider>
                          <KitchenSync />
                          <Root />
                        </LoadingProvider>
                      </ChatProvider>
                      </SyncProvider>
                    </CartProvider>
                  </OrdersProvider>
                </CommerceProvider>
              </KitchenProvider>
            </SessionProvider>
          </AuthProvider>
          </ConfigProvider>
        </ThemeProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
