import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { MealManagementProvider } from '../../src/features/meal-management/store';
import Doorway from '../../src/features/meal-management/Doorway';
import { markInside } from '../../src/features/meal-management/visit';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * The mess world.
 *
 * Two things happen in this file, and both are what make the feature read as
 * a separate app rather than a corner of this one.
 *
 * The provider is mounted *here* rather than in the app's root layout, which
 * is the isolation story in one line: the feature's state exists only while
 * somebody is inside it, makes no requests when they are not, and is torn
 * down on the way out.
 *
 * The doorway is mounted here for the same structural reason. A layout is
 * created when you enter its group and destroyed when you leave, so hanging
 * the threshold off its lifetime means it plays on every entry and never in
 * the middle of one — no flag to keep, no route to bounce through, and no
 * back gesture that lands on an animation.
 *
 * The stack has no declared children on purpose. Expo Router discovers every
 * file in this directory, and the module has enough screens that listing them
 * would be a second place to keep in step with the first.
 */
export default function MealManagementLayout() {
  const { colors } = useTheme();
  const [crossed, setCrossed] = useState(false);

  /* Note that somebody is standing in here. The exit door clears it, so the
     flag only survives an app that was closed on them — which is exactly when
     Profile should offer to bring them back. */
  useEffect(() => {
    markInside();
  }, []);

  return (
    <MealManagementProvider>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
            animation: 'slide_from_right',
          }}
        />

        {/* Over the stack, so the dashboard is already mounted and painted
            behind it — the sheet lifts to reveal a finished page rather than
            a spinner. */}
        {crossed ? null : <Doorway onDone={() => setCrossed(true)} />}
      </View>
    </MealManagementProvider>
  );
}
