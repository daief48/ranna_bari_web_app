import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import Icon from '../../components/Icon';
import { Body, Heading } from '../../components/Typography';
import { useTheme } from '../../theme/ThemeProvider';
import { font, radius, tracking, type } from '../../theme/tokens';
import { useLang } from '../../i18n/LanguageContext';

import {
  STATUS_TEXT,
  STATUS_TONE,
  mealText,
  monthLabel,
  rateText,
  shiftMonth,
  takaText,
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
  const accent = tone ? toneColour(colors, tone) : colors.primary;

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
      <ActivityIndicator color={colors.primary} />
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
  const accent = tone === 'primary' ? colors.primary : toneColour(colors, tone);

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
  const accent = tone === 'plain' ? colors.line : toneColour(colors, tone === 'primary' ? undefined : tone);
  const background = tone === 'plain' ? colors.sunken : tone === 'primary' ? colors.primary : `${accent}1A`;
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
          borderColor: focused ? colors.primary : colors.line,
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
  const { colors } = useTheme();
  const { t } = useLang();

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.surfaceSolid,
        paddingTop: 8,
        paddingBottom: 10,
        paddingHorizontal: 6,
      }}
    >
      {PRIMARY_NAV.map((item) => {
        const on = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(item.label)}
            onPress={() => (on ? null : router.replace(item.href))}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              gap: 3,
              paddingVertical: 4,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View>
              <Icon name={item.icon} size={20} color={on ? colors.primary : colors.textMuted} />
              {badges[item.key] ? (
                <View style={{ position: 'absolute', top: -5, right: -9 }}>
                  <Badge count={badges[item.key]} />
                </View>
              ) : null}
            </View>
            <Text
              style={{
                fontFamily: on ? font.uiSemi : font.ui,
                fontSize: type.xs - 1,
                color: on ? colors.primary : colors.textMuted,
              }}
            >
              {t(item.label)}
            </Text>
          </Pressable>
        );
      })}
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
          {formula ?? t('Meal rate = total approved food expense ÷ total weighted meals')}
        </Text>
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: type.xs + 1,
            color: colors.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          ৳{n(takaText(foodCost))} ÷ {n(mealText(totalMeals))} = ৳{n(rateText(mealRate))}
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
