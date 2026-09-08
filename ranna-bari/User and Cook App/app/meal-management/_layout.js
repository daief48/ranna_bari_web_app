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
 *
 * The stack has no declared children on purpose. Expo Router discovers every
 * file in this directory, and the module has enough screens that listing them
 * would be a second place to keep in step with the first.
 */
export default function MealManagementLayout() {
  return (
    <MealManagementProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </MealManagementProvider>
  );
}
