import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Icon from '../../components/Icon';
import { Body, Heading, Label } from '../../components/Typography';
import { useTheme } from '../../theme/ThemeProvider';
import { font, radius, tracking, type } from '../../theme/tokens';
import { useLang } from '../../i18n/LanguageContext';

import { STATUS_TEXT, STATUS_TONE, monthLabel, rateText, shiftMonth } from './format';

/**
 * The module's own small parts.
 *
 * Kept here rather than in `src/components` because nothing outside meal
 * management uses them, and putting them in the shared folder would make this
 * feature look like part of the app's design system when it is a guest in it.
 * They are built from the app's primitives — same theme tokens, same
 * typography, same radii — so the feature looks native without being wired in.
 */

/* ------------------------------------------------------------------ *
 * chrome
 * ------------------------------------------------------------------ */

/** An uppercase section label, the app's house style for a group heading. */
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

/** The module's surface: one bordered block that everything sits inside. */
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

/** A figure with its name under it. The dashboard is a grid of these. */
export function StatTile({ value, label, tone, style }) {
  const { colors } = useTheme();
  const colour =
    tone === 'good'
      ? colors.sage
      : tone === 'warn'
        ? colors.saffron
        : tone === 'bad'
          ? colors.primary
          : colors.text;

  return (
    <View
      style={[
        {
          flex: 1,
          minWidth: 0,
          backgroundColor: colors.sunken,
          borderRadius: radius.md,
          paddingVertical: 14,
          paddingHorizontal: 12,
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.displayBold,
          fontSize: 22,
          color: colour,
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
    </View>
  );
}

/** A tappable row that leads somewhere — the module's menu shape. */
export function NavRow({ icon, title, sub, onPress, tone }) {
  const { colors } = useTheme();
  const accent =
    tone === 'good' ? colors.sage : tone === 'warn' ? colors.saffron : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceSolid,
        borderWidth: 1,
        borderColor: pressed ? colors.primary200 : colors.line,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${accent}1A`,
        }}
      >
        <Icon name={icon} size={19} color={accent} strokeWidth={2} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.displayBold, fontSize: 16, color: colors.text }}
        >
          {title}
        </Text>
        {sub ? (
          <Text
            numberOfLines={2}
            style={{
              fontFamily: font.ui,
              fontSize: type.sm,
              lineHeight: type.sm * 1.35,
              color: colors.textMuted,
            }}
          >
            {sub}
          </Text>
        ) : null}
      </View>

      <Icon name="chevronRight" size={16} color={colors.textLight} strokeWidth={2} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * controls
 * ------------------------------------------------------------------ */

/** A pill. The app has no checkbox or switch, so selection is a filled pill. */
export function Chip({ label, active, onPress, disabled, tone = 'primary', style }) {
  const { colors } = useTheme();
  const accent = tone === 'sage' ? colors.sage : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: active ? accent : colors.line,
          backgroundColor: active ? accent : colors.surfaceSolid,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.sm,
          color: active ? '#fff' : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One sitting on one day: its name, what is planned, and whether it was taken.
 *
 * The tick is the whole interaction — the specification asks for a one-click
 * toggle, so the entire row is the target rather than a small box beside it.
 */
export function SlotToggle({ label, food, taken, onToggle, disabled }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!taken, disabled: !!disabled }}
      accessibilityLabel={food ? `${label}, ${food}` : label}
      onPress={disabled ? undefined : onToggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: radius.md,
        backgroundColor: taken ? `${colors.sage}14` : colors.sunken,
        borderWidth: 1,
        borderColor: taken ? colors.sage : 'transparent',
        opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: taken ? colors.sage : colors.line,
          backgroundColor: taken ? colors.sage : 'transparent',
        }}
      >
        {taken ? <Icon name="check" size={14} color="#fff" strokeWidth={3} /> : null}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
          {label}
        </Text>
        {food ? (
          <Text numberOfLines={1} style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
            {food}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Month back / month forward, with the month between them. */
export function MonthPicker({ month, onChange, disabled }) {
  const { colors } = useTheme();
  const { lang } = useLang();

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
        {monthLabel(month, lang)}
      </Text>
      <Arrow dir={1} name="arrowRight" />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * verdicts
 * ------------------------------------------------------------------ */

/**
 * Where a projection sits against a target.
 *
 * Colour alone would leave a colour-blind reader with three identical bars, so
 * the words carry the verdict and the colour agrees with them.
 */
export function BudgetStatus({ status, projected, target, note }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const tone = STATUS_TONE[status] ?? 'neutral';
  const accent =
    tone === 'good' ? colors.sage : tone === 'warn' ? colors.saffron : colors.primary;

  return (
    <Panel tone={tone}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: accent,
          }}
        />
        <Text style={{ fontFamily: font.displayBold, fontSize: 16, color: accent }}>
          {t(STATUS_TEXT[status] ?? 'No target set')}
        </Text>
      </View>

      {projected !== null && projected !== undefined ? (
        <Text
          style={{
            marginTop: 8,
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: type.sm * 1.45,
            color: colors.textMuted,
          }}
        >
          {target
            ? t('Projected ৳{p} a meal against your ৳{t} target.', {
                p: n(rateText(projected)),
                t: n(rateText(target)),
              })
            : t('Projected ৳{p} a meal.', { p: n(rateText(projected)) })}
        </Text>
      ) : null}

      {note ? (
        <Text
          style={{
            marginTop: 8,
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: type.sm * 1.45,
            color: colors.textMuted,
          }}
        >
          {note}
        </Text>
      ) : null}
    </Panel>
  );
}

/** A recommendation, as a card. Tone comes from the backend's own verdict. */
export function InsightCard({ title, body, tone, action, actionLabel }) {
  const { colors } = useTheme();
  const accent =
    tone === 'good'
      ? colors.sage
      : tone === 'warn'
        ? colors.saffron
        : tone === 'bad'
          ? colors.primary
          : colors.textMuted;

  return (
    <Panel>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${accent}1A`,
          }}
        >
          <Icon name="sparkles" size={17} color={accent} strokeWidth={2} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: font.displayBold, fontSize: 15.5, color: colors.text }}>
            {title}
          </Text>
          {body ? (
            <Text
              style={{
                marginTop: 4,
                fontFamily: font.ui,
                fontSize: type.sm,
                lineHeight: type.sm * 1.45,
                color: colors.textMuted,
              }}
            >
              {body}
            </Text>
          ) : null}

          {action ? (
            <Pressable
              accessibilityRole="button"
              onPress={action}
              style={({ pressed }) => ({ marginTop: 10, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: accent }}>
                {actionLabel} →
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * states
 * ------------------------------------------------------------------ */

export function Loading({ label }) {
  const { colors } = useTheme();
  const { t } = useLang();
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator color={colors.primary} />
      <Body muted>{label ?? t('Loading…')}</Body>
    </View>
  );
}

/** Nothing here yet — and what to do about it, which is the important half. */
export function Empty({ icon = 'pot', title, hint, action, actionLabel }) {
  const { colors } = useTheme();
  return (
    <Panel style={{ alignItems: 'center', paddingVertical: 30 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.sunken,
        }}
      >
        <Icon name={icon} size={24} color={colors.textLight} strokeWidth={1.8} />
      </View>
      <Heading size={17} style={{ marginTop: 14, textAlign: 'center' }}>
        {title}
      </Heading>
      {hint ? (
        <Body muted style={{ marginTop: 6, textAlign: 'center' }}>
          {hint}
        </Body>
      ) : null}
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action}
          style={({ pressed }) => ({ marginTop: 14, opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.primary }}>
            {actionLabel} →
          </Text>
        </Pressable>
      ) : null}
    </Panel>
  );
}

/** A request that did not arrive, with the one control that helps: try again. */
export function ErrorState({ message, onRetry }) {
  const { colors } = useTheme();
  const { t } = useLang();
  return (
    <Panel tone="bad" style={{ alignItems: 'center', paddingVertical: 26 }}>
      <Icon name="alertCircle" size={26} color={colors.primary} strokeWidth={1.8} />
      <Heading size={16} style={{ marginTop: 12, textAlign: 'center' }}>
        {message ?? t('That did not load.')}
      </Heading>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => ({ marginTop: 12, opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.primary }}>
            {t('Try again')}
          </Text>
        </Pressable>
      ) : null}
    </Panel>
  );
}

/** The back affordance every screen in this app uses. */
export function BackLink({ fallback = '/meal-management', label }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLang();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name="arrowLeft" size={16} color={colors.textMuted} strokeWidth={2.2} />
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.sm,
          letterSpacing: type.sm * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label ?? t('Back')}
      </Text>
    </Pressable>
  );
}

/** A horizontal row of chips that scrolls when it has to. */
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

/** A label/value line — the shape every summary table in this module uses. */
export function Row({ label, value, tone, strong }) {
  const { colors } = useTheme();
  const colour =
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
        gap: 16,
        paddingVertical: 9,
      }}
    >
      <Text style={{ flex: 1, fontFamily: font.ui, fontSize: type.sm + 1, color: colors.textMuted }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: strong ? font.displayBold : font.uiSemi,
          fontSize: strong ? 17 : type.sm + 1,
          color: colour,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** A hairline between rows. */
export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.line, opacity: 0.7 }} />;
}

export { GroupLabel as SectionLabel };
