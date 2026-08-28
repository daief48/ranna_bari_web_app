import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { ORDER_STEPS, stepIndex } from '../store/OrdersContext';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, tracking, type } from '../theme/tokens';

/**
 * Small parts shared across the cook panel. They live here rather than in a
 * route file because expo-router treats every export of a route as routing
 * metadata, and a stray named export is a warning waiting to happen.
 */

/**
 * How one order reads at a glance.
 *
 * The customer surfaces label a status with what has happened ("Kitchen
 * accepted"). A cook needs the opposite: what is still owed. `action` is that
 * verb, and it is what the advance button says.
 */
export function statusMeta(status, colors) {
  switch (status) {
    case 'placed':
      return {
        label: 'New',
        bg: colors.primary50,
        fg: colors.primary,
        icon: 'alertCircle',
        action: 'Accept order',
      };
    case 'accepted':
      return {
        label: 'Accepted',
        bg: colors.saffron50,
        fg: colors.saffron,
        icon: 'chefHat',
        action: 'Start cooking',
      };
    case 'cooking':
      return {
        label: 'Cooking',
        bg: colors.saffron50,
        fg: colors.saffron,
        icon: 'pot',
        action: 'Hand to rider',
      };
    case 'on_the_way':
      return {
        label: 'On the way',
        bg: colors.sage50,
        fg: colors.sage,
        icon: 'delivery',
        action: 'Mark delivered',
      };
    case 'delivered':
      return {
        label: 'Delivered',
        bg: colors.sage50,
        fg: colors.sage,
        icon: 'shieldCheck',
        action: null,
      };
    case 'rejected':
      return {
        label: 'Rejected',
        bg: colors.sunken,
        fg: colors.textLight,
        icon: 'x',
        action: null,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        bg: colors.sunken,
        fg: colors.textLight,
        icon: 'x',
        action: null,
      };
    default: {
      const step = ORDER_STEPS[stepIndex(status)];
      return {
        label: step?.label ?? 'In progress',
        bg: colors.sunken,
        fg: colors.textMuted,
        icon: 'clock',
        action: null,
      };
    }
  }
}

/** The status chip, sized to sit on a card header row. */
export function StatusPill({ status, style }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const meta = statusMeta(status, colors);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: radius.pill,
          backgroundColor: meta.bg,
        },
        style,
      ]}
    >
      <Icon name={meta.icon} size={11} color={meta.fg} />
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: 9.5,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          color: meta.fg,
        }}
      >
        {t(meta.label)}
      </Text>
    </View>
  );
}

/** A section heading with an optional link on the right. */
export function RowHeading({ icon, title, action, onAction, style }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={17} color={colors.sage} /> : null}
      <Text
        style={{
          flex: 1,
          fontFamily: font.displayBold,
          fontSize: 17,
          letterSpacing: -0.17,
          color: colors.text,
        }}
      >
        {title}
      </Text>
      {action ? (
        <Pressable accessibilityRole="link" onPress={onAction} hitSlop={8}>
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: type.micro,
              letterSpacing: type.micro * tracking.label,
              textTransform: 'uppercase',
              color: colors.sage,
            }}
          >
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** One number and its label, in a bordered tile. */
export function StatTile({ icon, value, label, variant = 'sage', style }) {
  const { colors, shadow } = useTheme();

  const tint = {
    sage: { bg: colors.sage50, fg: colors.sage },
    saffron: { bg: colors.saffron50, fg: colors.saffron },
    primary: { bg: colors.primary50, fg: colors.primary },
  }[variant];

  return (
    <View
      style={[
        {
          flex: 1,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.line,
        },
        shadow.sm,
        style,
      ]}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint.bg,
          marginBottom: 12,
        }}
      >
        <Icon name={icon} size={17} color={tint.fg} />
      </View>

      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontFamily: font.displayExtra,
          fontSize: 26,
          lineHeight: 30,
          letterSpacing: -0.6,
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 1,
          fontFamily: font.uiSemi,
          fontSize: type.micro,
          letterSpacing: type.micro * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** The navigation row used for the panel's quick actions. */
export function ActionRow({ icon, title, sub, tone = 'sage', onPress, style }) {
  const { colors, shadow } = useTheme();

  const tint = {
    sage: { bg: colors.sage50, fg: colors.sage, edge: colors.sage100 },
    saffron: { bg: colors.saffron50, fg: colors.saffron, edge: colors.saffron100 },
    primary: { bg: colors.primary50, fg: colors.primary, edge: colors.primary100 },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? tint.edge : colors.line,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        shadow.sm,
        style,
      ]}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint.bg,
          borderWidth: 1,
          borderColor: colors.line2,
        }}
      >
        <Icon name={icon} size={22} color={tint.fg} />
      </View>

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
          {title}
        </Text>
        {sub ? (
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}
          >
            {sub}
          </Text>
        ) : null}
      </View>

      <Icon name="chevronRight" size={17} color={colors.textLight} strokeWidth={2} />
    </Pressable>
  );
}
