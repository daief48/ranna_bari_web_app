import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import Icon from '../../components/Icon';
import { Body, Label } from '../../components/Typography';
import { useTheme } from '../../theme/ThemeProvider';
import { font, radius, tracking, type } from '../../theme/tokens';

import { SLOTS, SLOT_LABEL, dayParts, monthLabel, shiftMonth } from './format';

/**
 * The meal system's own small parts.
 *
 * Local rather than shared for the same reason the mess module's are: nothing
 * outside this feature uses them, and moving them into `src/components` would
 * make them look like design-system pieces when they are one screen's
 * furniture. Built from the app's primitives, so they read as native.
 */

/* ------------------------------------------------------------------ *
 * chrome
 * ------------------------------------------------------------------ */

export function GroupLabel({ text, style }) {
  const { colors } = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: font.uiBold,
          fontSize: type.sm,
          letterSpacing: type.sm * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        },
        style,
      ]}
    >
      {text}
    </Text>
  );
}

export function Panel({ children, style, tone }) {
  const { colors, shadow } = useTheme();
  const border =
    tone === 'good'
      ? colors.sage
      : tone === 'warn'
        ? colors.saffron
        : tone === 'bad'
          ? colors.primary
          : colors.line;

  return (
    <View
      style={[
        {
          backgroundColor: colors.surfaceSolid,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: border,
          padding: 16,
        },
        shadow.sm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Row({ label, value, tone, strong }) {
  const { colors } = useTheme();
  const accent =
    tone === 'good'
      ? colors.sage
      : tone === 'warn'
        ? colors.saffron
        : tone === 'bad'
          ? colors.primary
          : colors.text;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 4,
      }}
    >
      <Body muted style={{ flexShrink: 1 }}>
        {label}
      </Body>
      <Text
        style={{
          fontFamily: strong ? font.uiBold : font.ui,
          fontSize: strong ? 15 : 14,
          color: accent,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 8 }} />;
}

export function Loading({ label }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 34, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Body muted>{label}</Body> : null}
    </View>
  );
}

export function Empty({ title, hint }) {
  const { colors } = useTheme();
  return (
    <Panel style={{ alignItems: 'center', paddingVertical: 28, gap: 6 }}>
      <Icon name="pot" size={26} color={colors.textMuted} />
      <Text style={{ fontFamily: font.uiBold, fontSize: 15, color: colors.text }}>{title}</Text>
      {hint ? (
        <Body muted style={{ textAlign: 'center', lineHeight: 19 }}>
          {hint}
        </Body>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * pickers
 * ------------------------------------------------------------------ */

export function Chip({ label, active, onPress, disabled }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.line,
        backgroundColor: active ? colors.primary50 : 'transparent',
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: active ? font.uiBold : font.ui,
          fontSize: 13,
          color: active ? colors.primary : colors.textMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingRight: 8 }}
    >
      {children}
    </ScrollView>
  );
}

export function MonthPicker({ month, onChange, disabled }) {
  const { colors } = useTheme();

  const Arrow = ({ dir, name }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? 'Previous month' : 'Next month'}
      onPress={disabled ? undefined : () => onChange(shiftMonth(month, dir))}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.sunken,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={name} size={16} color={colors.text} strokeWidth={2} />
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Arrow dir={-1} name="arrowLeft" />
      <Text
        style={{
          flex: 1,
          textAlign: 'center',
          fontFamily: font.displayBold,
          fontSize: 17,
          color: colors.text,
        }}
      >
        {monthLabel(month)}
      </Text>
      <Arrow dir={1} name="arrowRight" />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * the calendar
 * ------------------------------------------------------------------ */

/**
 * One day of the cook's calendar: three slots, editable.
 *
 * `placeholder` carries the platform's dish for that slot rather than a dash,
 * so a cook writing over the system plan can see what they are replacing while
 * the field is still empty — and an empty field genuinely means "serve what
 * the platform said", which is the difference the override is about.
 */
export function PlanDayRow({ day, placeholders, onChange, disabled }) {
  const { colors } = useTheme();
  const parts = dayParts(day.date);

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <View style={{ width: 42, paddingTop: 6 }}>
        <Text
          style={{
            fontFamily: font.displayBold,
            fontSize: 17,
            color: parts.weekend ? colors.primary : colors.text,
          }}
        >
          {parts.day}
        </Text>
        <Label style={{ color: colors.textMuted }}>{parts.weekday}</Label>
      </View>

      <View style={{ flex: 1, gap: 6 }}>
        {SLOTS.map((slot) => (
          <View key={slot} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                width: 62,
                fontFamily: font.ui,
                fontSize: 11.5,
                color: colors.textMuted,
              }}
            >
              {SLOT_LABEL[slot]}
            </Text>
            <TextInput
              value={day[slot]}
              onChangeText={(text) => onChange(day.date, slot, text)}
              editable={!disabled}
              placeholder={placeholders?.[slot] || '—'}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={`${SLOT_LABEL[slot]} on ${day.date}`}
              style={{
                flex: 1,
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.sunken,
                fontFamily: font.ui,
                fontSize: 13,
                color: colors.text,
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

/** One day, read-only, as a customer or a cook reviewing a month sees it. */
export function PlanDayCard({ day, right }) {
  const { colors } = useTheme();
  const parts = dayParts(day.date);

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <View style={{ width: 42 }}>
        <Text
          style={{
            fontFamily: font.displayBold,
            fontSize: 17,
            color: parts.weekend ? colors.primary : colors.text,
          }}
        >
          {parts.day}
        </Text>
        <Label style={{ color: colors.textMuted }}>{parts.weekday}</Label>
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        {SLOTS.map((slot) =>
          day[slot] ? (
            <View key={slot} style={{ flexDirection: 'row', gap: 8 }}>
              <Text
                style={{
                  width: 62,
                  fontFamily: font.ui,
                  fontSize: 11.5,
                  color: colors.textMuted,
                }}
              >
                {SLOT_LABEL[slot]}
              </Text>
              <Body style={{ flex: 1 }}>{day[slot]}</Body>
            </View>
          ) : null,
        )}
        {!day.breakfast && !day.lunch && !day.dinner ? (
          <Body muted style={{ fontSize: 12.5 }}>
            Nothing planned
          </Body>
        ) : null}
      </View>

      {right ? <View style={{ justifyContent: 'center' }}>{right}</View> : null}
    </View>
  );
}
