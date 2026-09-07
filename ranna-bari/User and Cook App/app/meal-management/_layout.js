import React from 'react';
import { Stack } from 'expo-router';

import { MealManagementProvider } from '../../src/features/meal-management/store';

/**
 * The meal-management stack.
 *
 * The provider is mounted *here* rather than in the app's root layout, which
 * is the whole isolation story in one line: the feature's state exists only
 * while somebody is inside it, makes no requests when they are not, and is
 * torn down on the way out. Nothing in the rest of the app can reach it, and
 * it adds nothing to the app's start-up.
 */
export default function MealManagementLayout() {
  return (
    <MealManagementProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="meals" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="summary" />
        <Stack.Screen name="rate" />
        <Stack.Screen name="expenses" />
        <Stack.Screen name="planner" />
        <Stack.Screen name="preferences" />
        <Stack.Screen name="recommendations" />
        <Stack.Screen name="forecast" />
        <Stack.Screen name="settings" />
      </Stack>
    </MealManagementProvider>
  );
}
