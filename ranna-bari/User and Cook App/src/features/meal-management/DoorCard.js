import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import Icon from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { useLang } from '../../i18n/LanguageContext';
import { font, radius } from '../../theme/tokens';

import { MessMark } from './components';
import { wasInside } from './visit';

/**
 * The door into the mess, as it appears on the Profile screen.
 *
 * Everything else on that page is a *setting* — an address, a saved shop, a
 * payment method. This is not one, and drawing it as one was the whole reason
 * a person could use the app for a month without noticing that a complete
 * second application lived behind it.
 *
 * So it is a door and looks like one: taller than the rows around it, in the
 * mess's own saffron rather than the shop's vermilion, carrying the sub-brand
 * and a line about what is on the other side, with the threshold spelled out
 * along the bottom edge.
 *
 * The Resume chip is the one piece of state it holds. It appears only when
 * somebody was inside and the app closed on them rather than them leaving —
 * see `visit.js` for why that is a flag and not a mode.
 */
export default function MessDoorCard({ style }) {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t } = useLang();

  const [resume, setResume] = useState(false);

  /* Checked on focus rather than on mount: somebody who walks out of the mess
     lands back here, and the chip has to be gone by the time they look. */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      wasInside().then((inside) => {
        if (alive) setResume(inside);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const open = () => {
    Haptics.selectionAsync().catch(() => {});
    router.push('/meal-management');
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        resume
          ? t('Resume meal management. Mess meals, bazar, rate and settlement.')
          : t('Open meal management. Mess meals, bazar, rate and settlement.')
      }
      onPress={open}
      style={({ pressed }) => [
        {
          borderRadius: radius.lg,
          padding: 16,
          gap: 14,
          backgroundColor: colors.saffron50,
          borderWidth: 1,
          borderColor: pressed ? colors.saffron : colors.saffron100,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        shadow.sm,
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <MessMark size={48} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.displayBold,
              fontSize: 17,
              letterSpacing: -0.17,
              color: colors.text,
            }}
          >
            {t('Meal management')}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              fontFamily: font.uiBold,
              fontSize: 9,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              color: colors.saffron,
            }}
          >
            {t('RannaBari Mess')}
          </Text>
        </View>

        {resume ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.saffron100,
            }}
          >
            <Icon name="clock" size={13} color={colors.saffron} strokeWidth={2} />
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 9.5,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: colors.saffron,
              }}
            >
              {t('Resume')}
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={{
          fontFamily: font.ui,
          fontSize: 13.5,
          lineHeight: 20,
          color: colors.textMuted,
        }}
      >
        {t(
          'A separate app inside this one — mess meals, bazar, expenses, deposits and the monthly rate, kept apart from the shop.',
        )}
      </Text>

      {/* The threshold, drawn. This is the line that says the tap goes
          somewhere else rather than one screen deeper. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.saffron100,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: font.uiSemi,
            fontSize: 13,
            color: colors.saffron,
          }}
        >
          {resume ? t('Pick up where you left off') : t('Enter meal management')}
        </Text>
        <Icon name="arrowRight" size={16} color={colors.saffron} strokeWidth={2} />
      </View>
    </Pressable>
  );
}
