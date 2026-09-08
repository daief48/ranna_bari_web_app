import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import Icon from '../../components/Icon';
import { Body, Heading } from '../../components/Typography';
import { useTheme } from '../../theme/ThemeProvider';
import { font, radius, tracking, type } from '../../theme/tokens';
import { useLang } from '../../i18n/LanguageContext';

import {
  STATUS_TEXT,
  STATUS_TONE,
  dayLabel,
  dayNumber,
  daysBetween,
  mealText,
  monthLabel,
  monthOfDay,
  monthRange,
  rateText,
  shiftDay,
  shiftMonth,
  shortDayLabel,
  takaText,
  todayKey,
} from './format';

/**
 * The module's own small parts.
 *
 * Kept here rather than in `src/components` because nothing outside meal
 * management uses them, and putting them in the shared folder would make this
 * feature look like part of the app's design system when it is a guest in it.
 * They are built from the app's primitives — same theme tokens, same
 * typography, same radii — so the feature looks native without being wired in.
 */

/** Resolve the module's four tones to the app's palette, in one place. */
const toneColour = (colors, tone) =>
  tone === 'good'
    ? colors.sage
    : tone === 'warn'
      ? colors.saffron
      : tone === 'bad'
        ? colors.primary
        : colors.text;

/**
 * The mess world's own accent.
 *
 * Vermilion is the shop and sage is the kitchen, so saffron is this — the one
 * full ramp in the palette no world had claimed. Everything neutral but
 * emphatic in here takes it: a selected chip, the primary button, a focused
 * field, today on the calendar, the tab you are on.
 *
 * Using the app's `primary` for those was what made the feature read as a
 * screen of the shop rather than a place of its own — the colour was saying
 * "you are still in the marketplace" underneath every word saying otherwise.
 *
 * The four *tones* above are deliberately untouched. A due balance is
 * vermilion in every world, because there it means danger rather than brand.
 */
export const accentOf = (colors) => colors.saffron;

/** The washed version, for a pressed state or a selected pill's ground. */
export const accentSoftOf = (colors) => colors.saffron50;

/* ------------------------------------------------------------------ *
 * chrome
 * ------------------------------------------------------------------ */

/** An uppercase section label, the app's house style for a group heading. */
export function GroupLabel({ text, style, right }) {
  const { colors } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.sm,
          letterSpacing: type.sm * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {text}
      </Text>
      {right}
    </View>
  );
}

/** The module's surface: one bordered block that everything sits inside. */
export function Panel({ children, style, tone }) {
  const { colors, shadow } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surfaceSolid,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tone ? toneColour(colors, tone) : colors.line,
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

/** A figure with its name under it. The dashboard is a grid of these. */
export function StatTile({ value, label, tone, hint, style, onPress }) {
  const { colors } = useTheme();

  const inner = (
    <>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.displayBold,
          fontSize: 22,
          color: toneColour(colors, tone),
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Text
        numberOfLines={2}
        style={{
          marginTop: 2,
          fontFamily: font.ui,
          fontSize: type.xs,
          lineHeight: type.xs * 1.35,
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
      {hint ? (
        <Text style={{ marginTop: 3, fontFamily: font.ui, fontSize: type.xs - 1, color: colors.textMuted }}>
          {hint}
        </Text>
      ) : null}
    </>
  );

  const box = {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.sunken,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
  };

  if (!onPress) return <View style={[box, style]}>{inner}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [box, { opacity: pressed ? 0.7 : 1 }, style]}
    >
      {inner}
    </Pressable>
  );
}

/** A tappable row that leads somewhere — the module's menu shape. */
export function NavRow({ icon, title, sub, onPress, tone, badge, right, disabled }) {
  const { colors } = useTheme();
  const accent = tone ? toneColour(colors, tone) : accentOf(colors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceSolid,
        borderWidth: 1,
        borderColor: colors.line,
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      {icon ? (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.sunken,
          }}
        >
          <Icon name={icon} size={19} color={accent} />
        </View>
      ) : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
        >
          {title}
        </Text>
        {sub ? (
          <Text
            numberOfLines={2}
            style={{ marginTop: 2, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
          >
            {sub}
          </Text>
        ) : null}
      </View>

      {badge ? <Badge count={badge} /> : null}
      {right ?? <Icon name="chevronRight" size={16} color={colors.textMuted} />}
    </Pressable>
  );
}

/** A count that wants attention — pending approvals, unread notices. */
export function Badge({ count, tone = 'bad' }) {
  const { colors } = useTheme();
  if (!count) return null;

  return (
    <View
      style={{
        minWidth: 22,
        height: 22,
        paddingHorizontal: 7,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: toneColour(colors, tone),
      }}
    >
      <Text style={{ fontFamily: font.uiBold, fontSize: type.xs - 1, color: '#FFFFFF' }}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

/** A label and a figure on one line — the shape a breakdown is made of. */
export function Row({ label, value, tone, strong, onPress }) {
  const { colors } = useTheme();

  const inner = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 9,
      }}
    >
      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          fontFamily: strong ? font.uiSemi : font.ui,
          fontSize: type.sm,
          color: strong ? colors.text : colors.textMuted,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: strong ? font.uiBold : font.uiSemi,
          fontSize: type.sm,
          color: toneColour(colors, tone),
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );

  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {inner}
    </Pressable>
  );
}

export function Divider({ style }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.line, marginVertical: 4 }, style]} />;
}

/* ------------------------------------------------------------------ *
 * states
 * ------------------------------------------------------------------ */

export function Loading({ label }) {
  const { colors } = useTheme();
  const { t } = useLang();
  return (
    <View style={{ paddingVertical: 44, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator color={accentOf(colors)} />
      <Body muted>{label ?? t('Loading…')}</Body>
    </View>
  );
}

export function Empty({ icon = 'pot', title, hint, action, actionLabel }) {
  const { colors } = useTheme();
  return (
    <Panel style={{ alignItems: 'center', paddingVertical: 30, gap: 10 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.sunken,
        }}
      >
        <Icon name={icon} size={24} color={colors.textMuted} />
      </View>
      <Text
        style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text, textAlign: 'center' }}
      >
        {title}
      </Text>
      {hint ? (
        <Body muted style={{ textAlign: 'center', maxWidth: 300 }}>
          {hint}
        </Body>
      ) : null}
      {action && actionLabel ? (
        <MiniButton label={actionLabel} onPress={action} style={{ marginTop: 6 }} />
      ) : null}
    </Panel>
  );
}

export function ErrorState({ message, onRetry }) {
  const { colors } = useTheme();
  const { t } = useLang();
  return (
    <Panel tone="bad" style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Icon name="alertCircle" size={18} color={colors.primary} />
        <Text style={{ flex: 1, fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
          {message}
        </Text>
      </View>
      {onRetry ? <MiniButton label={t('Try again')} onPress={onRetry} /> : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * controls
 * ------------------------------------------------------------------ */

export function Chip({ label, active, onPress, disabled, tone = 'primary', style, icon }) {
  const { colors } = useTheme();
  const accent = tone === 'primary' ? accentOf(colors) : toneColour(colors, tone);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 13,
          borderRadius: radius.pill ?? 999,
          borderWidth: 1,
          borderColor: active ? accent : colors.line,
          backgroundColor: active ? `${accent}1A` : colors.surfaceSolid,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={active ? accent : colors.textMuted} /> : null}
      <Text
        style={{
          fontFamily: active ? font.uiSemi : font.ui,
          fontSize: type.xs + 1,
          color: active ? accent : colors.textMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children, style }) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>{children}</View>
  );
}

/** A compact button for inside a panel, where the app's Button is too large. */
export function MiniButton({ label, onPress, tone = 'primary', disabled, icon, style }) {
  const { colors } = useTheme();
  const accent =
    tone === 'plain' ? colors.line : tone === 'primary' ? accentOf(colors) : toneColour(colors, tone);
  const background =
    tone === 'plain' ? colors.sunken : tone === 'primary' ? accentOf(colors) : `${accent}1A`;
  const label_colour = tone === 'primary' ? '#FFFFFF' : tone === 'plain' ? colors.text : accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: radius.md,
          backgroundColor: background,
          borderWidth: tone === 'primary' ? 0 : 1,
          borderColor: tone === 'plain' ? colors.line : accent,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={15} color={label_colour} /> : null}
      <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs + 1, color: label_colour }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A labelled text field, styled to the module's surfaces. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  hint,
  suffix,
  disabled,
  style,
  autoCapitalize,
  maxLength,
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={style}>
      {label ? (
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: type.xs + 1,
            color: colors.textMuted,
            marginBottom: 6,
          }}
        >
          {label}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: focused ? accentOf(colors) : colors.line,
          backgroundColor: disabled ? colors.sunken : colors.surfaceSolid,
          paddingHorizontal: 13,
        }}
      >
        <TextInput
          value={value === null || value === undefined ? '' : String(value)}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          multiline={multiline}
          editable={!disabled}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            paddingVertical: multiline ? 12 : 12,
            minHeight: multiline ? 84 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
            fontFamily: font.ui,
            fontSize: type.sm + 1,
            color: colors.text,
          }}
        />
        {suffix ? (
          <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.textMuted }}>
            {suffix}
          </Text>
        ) : null}
      </View>

      {hint ? (
        <Text
          style={{ marginTop: 5, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A row of mutually exclusive options — a filter, a mode, a method. */
export function Segmented({ options, value, onChange, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: colors.sunken,
          borderRadius: radius.md,
          padding: 3,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              paddingVertical: 9,
              alignItems: 'center',
              borderRadius: radius.sm ?? 8,
              backgroundColor: active ? colors.surfaceSolid : 'transparent',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: active ? font.uiSemi : font.ui,
                fontSize: type.xs + 1,
                color: active ? colors.text : colors.textMuted,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A number with − and + on either side — guests, quantities, ratings. */
export function Stepper({ value, onChange, min = 0, max = 99, step = 1, disabled }) {
  const { colors } = useTheme();
  const n = Number(value) || 0;

  const button = (icon, to, enabled) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      onPress={enabled ? () => onChange(to) : undefined}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: radius.sm ?? 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.sunken,
        opacity: enabled ? (pressed ? 0.7 : 1) : 0.35,
      })}
    >
      <Icon name={icon} size={15} color={colors.text} />
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {button('minus', Math.max(min, n - step), !disabled && n > min)}
      <Text
        style={{
          minWidth: 26,
          textAlign: 'center',
          fontFamily: font.uiBold,
          fontSize: type.sm + 2,
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {mealText(n)}
      </Text>
      {button('plus', Math.min(max, n + step), !disabled && n < max)}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * the module's own vocabulary, drawn
 * ------------------------------------------------------------------ */

/** An approval state, as a small coloured word. */
export function StatusPill({ status, style }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const tone = STATUS_TONE[status];
  const accent = tone ? toneColour(colors, tone) : colors.textMuted;

  return (
    <View
      style={[
        {
          paddingVertical: 4,
          paddingHorizontal: 9,
          borderRadius: 999,
          backgroundColor: `${accent}1A`,
          borderWidth: 1,
          borderColor: `${accent}44`,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs - 1, color: accent }}>
        {t(STATUS_TEXT[status] ?? status)}
      </Text>
    </View>
  );
}

/**
 * One sitting, on or off, with the value the mess allows.
 *
 * Tapping the row toggles it; the values appear only when the mess permits
 * more than a plain 1, because a picker with one option in it is a control
 * that exists to be ignored.
 */
export function MealToggle({
  label,
  value,
  guests,
  allowedValues = [1],
  locked,
  onSet,
  onGuests,
  menu,
}) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  const taken = Number(value) > 0;
  const options = allowedValues.filter((v) => Number(v) > 0);
  const showValues = taken && options.length > 1 && !locked;

  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: taken ? colors.sage : colors.line,
        backgroundColor: colors.surfaceSolid,
        padding: 14,
        gap: showValues || onGuests ? 12 : 0,
        opacity: locked ? 0.62 : 1,
      }}
    >
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: taken, disabled: !!locked }}
        accessibilityLabel={label}
        onPress={locked ? undefined : () => onSet(taken ? 0 : options[0] ?? 1)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: taken ? colors.sage : colors.line,
            backgroundColor: taken ? colors.sage : 'transparent',
          }}
        >
          {taken ? <Icon name="check" size={15} color="#FFFFFF" /> : null}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
            {label}
          </Text>
          {menu?.length ? (
            <Text
              numberOfLines={1}
              style={{ marginTop: 2, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
            >
              {menu.join(', ')}
            </Text>
          ) : null}
        </View>

        {locked ? (
          <Icon name="lock" size={15} color={colors.textMuted} />
        ) : taken ? (
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.sm + 1,
              color: colors.sage,
              fontVariant: ['tabular-nums'],
            }}
          >
            {mealText(value)}
          </Text>
        ) : null}
      </Pressable>

      {showValues ? (
        <ChipRow>
          {options.map((option) => (
            <Chip
              key={option}
              label={mealText(option)}
              active={Number(value) === Number(option)}
              onPress={() => onSet(option)}
              tone="good"
            />
          ))}
        </ChipRow>
      ) : null}

      {onGuests && !locked ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: font.ui, fontSize: type.xs + 1, color: colors.textMuted }}>
            {t('Guest plates')}
          </Text>
          <Stepper value={guests ?? 0} onChange={onGuests} max={10} />
        </View>
      ) : guests ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
          {t('{n} guest plates', { n: n(guests) })}
        </Text>
      ) : null}
    </View>
  );
}

/** A member, with their role and whatever figure the screen cares about. */
export function MemberRow({ name, role, sub, value, tone, onPress, right, ghost }) {
  const { colors } = useTheme();
  const initial = String(name ?? '?').trim().charAt(0).toUpperCase();

  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.sunken,
          borderWidth: ghost ? 1 : 0,
          borderColor: colors.line,
          borderStyle: ghost ? 'dashed' : 'solid',
        }}
      >
        <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.textMuted }}>
          {initial}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
          {name}
        </Text>
        {role || sub ? (
          <Text
            numberOfLines={1}
            style={{ marginTop: 1, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
          >
            {[role, sub].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>

      {value !== undefined && value !== null ? (
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: type.sm,
            color: toneColour(colors, tone),
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
      ) : null}

      {right}
    </View>
  );

  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {inner}
    </Pressable>
  );
}

/** Approve / Reject, the pair that appears on every waiting record. */
export function ApprovalActions({ onApprove, onReject, busy, style }) {
  const { t } = useLang();
  return (
    <View style={[{ flexDirection: 'row', gap: 9 }, style]}>
      <MiniButton
        label={t('Approve')}
        icon="check"
        tone="good"
        onPress={onApprove}
        disabled={busy}
        style={{ flex: 1 }}
      />
      <MiniButton
        label={t('Reject')}
        icon="x"
        tone="bad"
        onPress={onReject}
        disabled={busy}
        style={{ flex: 1 }}
      />
    </View>
  );
}

/**
 * A proportion, drawn.
 *
 * Used for a member's share of the mess's meals and for a category's share of
 * its spending — both cases where the number alone does not land.
 */
export function Meter({ value, max, tone, style }) {
  const { colors } = useTheme();
  const fraction = max > 0 ? Math.max(0, Math.min(1, Number(value) / Number(max))) : 0;

  return (
    <View
      style={[
        { height: 6, borderRadius: 3, backgroundColor: colors.sunken, overflow: 'hidden' },
        style,
      ]}
    >
      <View
        style={{
          width: `${fraction * 100}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: toneColour(colors, tone ?? 'good'),
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * navigation
 * ------------------------------------------------------------------ */

export function BackLink({ fallback = '/meal-management', label }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLang();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        paddingVertical: 6,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name="arrowLeft" size={16} color={colors.textMuted} />
      <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.textMuted }}>
        {label ?? t('Back')}
      </Text>
    </Pressable>
  );
}

/**
 * §6's primary navigation.
 *
 * The specification asks for a five-item bottom bar. The feature lives inside
 * the app's own stack rather than its tabs, so this is drawn as a footer on
 * the five primary screens instead of being a real tab navigator — which also
 * keeps the app's own bottom navigation from being replaced underneath
 * somebody who is only visiting.
 */
export const PRIMARY_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home', href: '/meal-management' },
  { key: 'meals', label: 'Meals', icon: 'utensils', href: '/meal-management/meals' },
  { key: 'bazar', label: 'Bazar', icon: 'cart', href: '/meal-management/bazar' },
  { key: 'money', label: 'Money', icon: 'banknote', href: '/meal-management/money' },
  { key: 'more', label: 'More', icon: 'sliders', href: '/meal-management/more' },
];

export function BottomNav({ active, badges = {} }) {
  const router = useRouter();
  const { colors, shadow, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, n } = useLang();

  return (
    <View
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12 + insets.bottom,
          borderRadius: radius.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.line,
        },
        shadow.lg,
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'android' ? 40 : 26}
        tint={isDark ? 'dark' : 'light'}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 8,
            backgroundColor: isDark
              ? `rgba(${colors.rgbRaised}, 0.88)`
              : 'rgba(250, 247, 240, 0.85)',
          }}
        >
          {PRIMARY_NAV.map((item) => {
            const on = item.key === active;
            const badge = badges[item.key] ?? 0;

            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={
                  badge
                    ? `${t(item.label)}, ${t('{n} waiting', { n: n(badge) })}`
                    : t(item.label)
                }
                onPress={() => {
                  if (on) return;
                  Haptics.selectionAsync().catch(() => {});
                  router.replace(item.href);
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 8,
                  borderRadius: 16,
                  backgroundColor: on ? colors.saffron50 : 'transparent',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <View>
                  <Icon
                    name={item.icon}
                    size={20}
                    color={on ? colors.saffron : colors.textMuted}
                    strokeWidth={on ? 2.1 : 1.75}
                  />
                  {badge > 0 ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -5,
                        right: -9,
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: 4,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.saffron,
                        borderWidth: 1.5,
                        borderColor: colors.canvas,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 9,
                          lineHeight: 11,
                          color: '#FFFFFF',
                        }}
                      >
                        {n(badge)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text
                  /* Capped rather than disabled, the same compromise the app's
                     own bar makes: a large system font is an accessibility
                     setting and content must honour it, but five labels in a
                     50px cell have nowhere to grow. */
                  maxFontSizeMultiplier={1.2}
                  numberOfLines={1}
                  style={{
                    fontFamily: on ? font.uiSemi : font.ui,
                    fontSize: 9,
                    letterSpacing: 0.1,
                    color: on ? colors.saffron : colors.textMuted,
                  }}
                >
                  {t(item.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

/** Step a month back and forward, with its name between. */
export function MonthPicker({ month, onChange, disabled, closed }) {
  const { colors } = useTheme();
  const { lang, t } = useLang();

  const arrow = (icon, to) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === 'arrowLeft' ? t('Previous month') : t('Next month')}
      onPress={disabled ? undefined : () => onChange(to)}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.sunken,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={16} color={colors.text} />
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {arrow('arrowLeft', shiftMonth(month, -1))}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontFamily: font.displayBold, fontSize: type.h3, color: colors.text }}>
          {monthLabel(month, lang)}
        </Text>
        {closed ? (
          <Text style={{ marginTop: 1, fontFamily: font.uiSemi, fontSize: type.xs - 1, color: colors.saffron }}>
            {t('Settled')}
          </Text>
        ) : null}
      </View>
      {arrow('arrowRight', shiftMonth(month, 1))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * sheets
 * ------------------------------------------------------------------ */

/**
 * A modal that slides up over the screen.
 *
 * The module has a lot of small forms — add an expense, record a deposit,
 * assign a duty — and each of them being its own route would make the back
 * stack nonsense. They are sheets over the list they belong to instead.
 */
export function Sheet({ open, onClose, title, children, footer }) {
  const { colors } = useTheme();

  return (
    <Modal visible={!!open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
      />
      <View
        style={{
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.xl ?? 24,
          borderTopRightRadius: radius.xl ?? 24,
          paddingTop: 10,
          maxHeight: '88%',
        }}
      >
        <View style={{ alignItems: 'center', paddingBottom: 6 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
        </View>

        {title ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 18,
              paddingBottom: 10,
            }}
          >
            <Heading style={{ fontSize: type.h3 }}>{title}</Heading>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Icon name="x" size={19} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 20, gap: 14 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>

        {footer ? (
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: 22,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            }}
          >
            {footer}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * the two figures every money screen shows
 * ------------------------------------------------------------------ */

/**
 * The rate, and the sum it came from. §4.6 asks the system to *show* it.
 *
 * The arithmetic is spelled out rather than just the answer, because §13's
 * whole point is that a member should be able to check a figure rather than
 * accept it.
 */
export function RateCard({ mealRate, foodCost, totalMeals, formula, style }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  const meals = Number(totalMeals) || 0;
  const cost = Number(foodCost) || 0;

  /*
   * The empty month, said properly.
   *
   * A new mess showed "৳0 per meal" over "৳0 ÷ 0 = ৳0", which is not a rate of
   * zero — it is the absence of one, and printing it as a figure teaches
   * somebody that the feature is broken before they have used it. So the card
   * names which of the two halves is missing and what would fill it.
   */
  if (!meals || !cost) {
    return (
      <Panel style={[{ gap: 9 }, style]}>
        <GroupLabel text={t('Meal rate')} />
        <Text style={{ fontFamily: font.displayBold, fontSize: 26, color: colors.textMuted }}>
          {t('Not yet')}
        </Text>

        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: type.sm * 1.5,
            color: colors.textMuted,
          }}
        >
          {!meals && !cost
            ? t('A rate needs two things: meals eaten, and money spent on food. Neither has been recorded this month yet.')
            : !cost
              ? t('{n} meals recorded, but no food cost yet. Add a bazar or an expense and the rate appears.', {
                  n: n(mealText(meals)),
                })
              : t('৳{n} of food cost, but no meals recorded yet. Once somebody eats, it has something to divide by.', {
                  n: n(takaText(cost)),
                })}
        </Text>

        <View style={{ backgroundColor: colors.sunken, borderRadius: radius.md, padding: 11 }}>
          <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
            {formula ?? t('Meal rate = total approved food expense ÷ total meals')}
          </Text>
        </View>
      </Panel>
    );
  }

  return (
    <Panel style={[{ gap: 10 }, style]}>
      <GroupLabel text={t('Meal rate')} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={{ fontFamily: font.displayBold, fontSize: 34, color: colors.text }}>
          ৳{n(rateText(mealRate))}
        </Text>
        <Text style={{ fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}>
          {t('per meal')}
        </Text>
      </View>

      <View
        style={{
          backgroundColor: colors.sunken,
          borderRadius: radius.md,
          padding: 11,
          gap: 3,
        }}
      >
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
          {formula ?? t('Meal rate = total approved food expense ÷ total meals')}
        </Text>
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: type.xs + 1,
            color: colors.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          ৳{n(takaText(cost))} ÷ {n(mealText(meals))} = ৳{n(rateText(mealRate))}
        </Text>
      </View>
    </Panel>
  );
}

/** A four-tile grid that wraps, for a dashboard's figures. */
export function TileGrid({ children, style }) {
  const kids = React.Children.toArray(children);
  const rows = useMemo(() => {
    const out = [];
    for (let i = 0; i < kids.length; i += 2) out.push(kids.slice(i, i + 2));
    return out;
  }, [kids]);

  return (
    <View style={[{ gap: 10 }, style]}>
      {rows.map((row, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={index} style={{ flexDirection: 'row', gap: 10 }}>
          {row}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * the mark
 * ------------------------------------------------------------------ */

/**
 * The mess's own mark — a saffron squircle with a calendar in it.
 *
 * Deliberately *not* the RannaBari logo. Inside here the brand is the mess,
 * and a lockup that said RannaBari on every screen would keep insisting you
 * were still in the shop.
 */
export function MessMark({ size = 34 }) {
  const { colors, shadow } = useTheme();

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.saffron50,
          borderWidth: 1,
          borderColor: colors.saffron100,
        },
        shadow.xs,
      ]}
    >
      <Icon name="calendar" size={Math.round(size * 0.52)} color={colors.saffron} strokeWidth={2} />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * dates, without typing
 * ------------------------------------------------------------------ */

/** How far either side of today a picker lets somebody reach. */
const BACK_DAYS = 45;
const FORWARD_DAYS = 21;
/** Width of one day cell, including its gap — used to scroll to the selection. */
const CELL = 52;

/**
 * Pick a day.
 *
 * This replaces a text field that expected somebody to type `2026-09-01` by
 * hand. That field was the single worst thing in the feature: it demanded a
 * format nobody was told, it accepted `1/9/26` and then refused it on the
 * server, and it made recording yesterday's bazar a spelling test.
 *
 * The chips carry the three days almost every entry actually uses, and the
 * strip carries the rest. Nothing here can produce an invalid date, so the
 * "that date is not valid" refusal becomes unreachable from the app — which
 * is the right way to remove an error message.
 */
export function DatePicker({ value, onChange, label, hint, back = BACK_DAYS, forward = FORWARD_DAYS }) {
  const { colors } = useTheme();
  const { t, n, lang } = useLang();
  const strip = useRef(null);

  const today = todayKey();

  const days = useMemo(() => {
    /* Always wide enough to contain the day already chosen. Editing a bazar
       from three months ago would otherwise open a strip with nothing
       selected in it, which reads as the date having been lost. */
    let first = -back;
    let last = forward;
    if (value) {
      const away = daysBetween(today, value);
      if (away < first) first = away;
      if (away > last) last = away;
    }

    const out = [];
    for (let i = first; i <= last; i += 1) out.push(shiftDay(today, i));
    return out;
  }, [today, back, forward, value]);

  const index = days.indexOf(value);

  /* Open on the chosen day rather than at the far past. Laid out on a fixed
     cell width so this is arithmetic instead of a measurement pass. */
  useEffect(() => {
    if (index < 0) return;
    const to = Math.max(0, index * CELL - CELL * 2);
    const id = setTimeout(() => strip.current?.scrollTo({ x: to, animated: false }), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quick = [
    { key: shiftDay(today, -1), label: t('Yesterday') },
    { key: today, label: t('Today') },
    { key: shiftDay(today, 1), label: t('Tomorrow') },
  ].filter((row) => days.includes(row.key));

  return (
    <View style={{ gap: 9 }}>
      {label ? (
        <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs + 1, color: colors.textMuted }}>
          {label}
        </Text>
      ) : null}

      <ChipRow>
        {quick.map((row) => (
          <Chip
            key={row.key}
            label={row.label}
            active={value === row.key}
            onPress={() => onChange(row.key)}
          />
        ))}
      </ChipRow>

      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
      >
        {days.map((day) => {
          const on = day === value;
          const isToday = day === today;

          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={dayLabel(day, lang)}
              onPress={() => onChange(day)}
              style={({ pressed }) => ({
                width: CELL - 6,
                paddingVertical: 8,
                alignItems: 'center',
                gap: 2,
                borderRadius: radius.sm,
                backgroundColor: on ? accentSoftOf(colors) : colors.sunken,
                borderWidth: 1,
                borderColor: on ? colors.saffron : isToday ? colors.line : 'transparent',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: type.xs - 2,
                  textTransform: 'uppercase',
                  color: on ? colors.saffron : colors.textMuted,
                }}
              >
                {shortDayLabel(day, lang).split(' ')[0]}
              </Text>
              <Text
                style={{
                  fontFamily: on ? font.uiBold : font.uiSemi,
                  fontSize: type.sm,
                  color: on ? colors.saffron : colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {n(dayNumber(day))}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* The chosen day, spelled out — the strip shows a number, and a number
          on its own is not a date somebody can check. */}
      <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs + 1, color: colors.text }}>
        {dayLabel(value, lang)}
        {value === today ? ` · ${t('today')}` : ''}
      </Text>

      {hint ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * Pick a stretch of days.
 *
 * Presets first, because almost every real range is one of four — the rest of
 * this month, the next week, and so on. The two pickers underneath are for
 * the times it is not, and they stay collapsed until somebody asks for them:
 * two full day strips open at once is a lot of screen for a control most
 * people will never touch.
 */
export function RangePicker({ from, to, onChange, presets = true }) {
  const { colors } = useTheme();
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);

  const today = todayKey();

  const options = [
    { key: 'week', label: t('Next 7 days'), from: today, to: shiftDay(today, 6) },
    { key: 'fortnight', label: t('Next 14 days'), from: today, to: shiftDay(today, 13) },
    { key: 'past-week', label: t('Last 7 days'), from: shiftDay(today, -6), to: today },
    { key: 'month', label: t('Rest of the month'), from: today, to: monthRange(monthOfDay(today)).to },
  ];

  const matched = options.find((option) => option.from === from && option.to === to);

  return (
    <View style={{ gap: 10 }}>
      {presets ? (
        <ChipRow>
          {options.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              active={matched?.key === option.key}
              onPress={() => onChange(option.from, option.to)}
            />
          ))}
          <Chip
            label={t('Pick days')}
            icon="calendar"
            active={open || !matched}
            onPress={() => setOpen((was) => !was)}
          />
        </ChipRow>
      ) : null}

      {!presets || open || !matched ? (
        <View style={{ gap: 14 }}>
          <DatePicker label={t('From')} value={from} onChange={(day) => onChange(day, day > to ? day : to)} />
          <DatePicker label={t('To')} value={to} onChange={(day) => onChange(day < from ? day : from, day)} />
        </View>
      ) : (
        <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs + 1, color: colors.text }}>
          {t('{from} to {to}', { from: dayLabel(from, lang), to: dayLabel(to, lang) })}
        </Text>
      )}
    </View>
  );
}

/**
 * A day, or no day at all.
 *
 * For the two fields where "never" is a real answer — when a notice drops off
 * the board, when a poll stops taking votes. A plain `DatePicker` always has a
 * value selected, which would quietly turn "no expiry" into "expires today".
 */
export function OptionalDatePicker({ value, onChange, label, emptyLabel, hint }) {
  const { colors } = useTheme();
  const { t } = useLang();

  const today = todayKey();

  return (
    <View style={{ gap: 9 }}>
      {label ? (
        <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs + 1, color: colors.textMuted }}>
          {label}
        </Text>
      ) : null}

      <ChipRow>
        <Chip label={emptyLabel ?? t('Never')} active={!value} onPress={() => onChange('')} />
        <Chip
          label={t('Pick a day')}
          icon="calendar"
          active={!!value}
          onPress={() => onChange(value || shiftDay(today, 7))}
        />
      </ChipRow>

      {value ? <DatePicker value={value} onChange={onChange} back={0} forward={90} /> : null}

      {hint ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>{hint}</Text>
      ) : null}
    </View>
  );
}
