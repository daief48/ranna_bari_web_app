import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import Icon from './Icon';
import Button from './Button';
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
    /* The customer confirming it arrived. Not a step on the rail — it is the
       rail finished — so without a case of its own it fell to the default,
       looked up index -1, and told the cook a closed order was "In progress". */
    case 'completed':
      return {
        label: 'Confirmed',
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
/**
 * A row that opens something — or explains why it will not.
 *
 * `locked` is for the actions an unapproved kitchen cannot take. The backend
 * already refuses them; without this the button looked identical to a working
 * one and the only feedback was an error after the tap. A held control that
 * says it is held is kinder than one that pretends and then fails.
 *
 * Still rendered, not hidden. A cook should be able to see what approval will
 * give them.
 */
export function ActionRow({ icon, title, sub, tone = 'sage', onPress, locked = false, style }) {
  const { colors, shadow } = useTheme();

  const tint = {
    sage: { bg: colors.sage50, fg: colors.sage, edge: colors.sage100 },
    saffron: { bg: colors.saffron50, fg: colors.saffron, edge: colors.saffron100 },
    primary: { bg: colors.primary50, fg: colors.primary, edge: colors.primary100 },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      onPress={locked ? undefined : onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed && !locked ? tint.edge : colors.line,
          transform: [{ scale: pressed && !locked ? 0.99 : 1 }],
          /* Legible, not invisible: the row is still readable so a cook can
             see what approval unlocks. */
          opacity: locked ? 0.55 : 1,
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
        <Icon name={locked ? 'lock' : icon} size={22} color={locked ? colors.textLight : tint.fg} />
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
            /* Two lines on a narrow screen, one wherever it fits. After a
               48px icon, the gaps and a chevron, this column is about 200px
               on a 320px phone — not enough for a sentence at 14px, and the
               half that got cut was usually the half that explained the row. */
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

      <Icon name="chevronRight" size={17} color={colors.textLight} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * How far a kitchen — or a shop — will travel, as a drag.
 *
 * A slider rather than a number field because the value is a judgement about
 * a neighbourhood, not a figure anybody knows to the half-kilometre; the
 * readout beside it is what makes the judgement precise once it is made.
 *
 * Lived in the kitchen-details screen until the shop needed one too.
 */
export function RadiusSlider({ value, onChange }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const [width, setWidth] = useState(0);

  const MIN = 1;
  const MAX = 12;
  const pct = (value - MIN) / (MAX - MIN);

  const setFromX = (x) => {
    if (!width) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    // step: 0.5
    onChange(Math.round((MIN + ratio * (MAX - MIN)) * 2) / 2);
  };

  return (
    <View style={{ marginBottom: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: type.micro,
            letterSpacing: type.micro * tracking.label,
            textTransform: 'uppercase',
            color: colors.textMuted,
          }}
        >
          {t('Delivery radius')}
        </Text>
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: 15,
            color: colors.sage,
            fontVariant: ['tabular-nums'],
          }}
        >
          {n(value.toFixed(1))} km
        </Text>
      </View>

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setFromX(e.nativeEvent.locationX)}
        onResponderMove={(e) => setFromX(e.nativeEvent.locationX)}
        style={{ paddingVertical: 12 }}
        accessibilityRole="adjustable"
        accessibilityLabel={t('Delivery radius')}
        accessibilityValue={{ min: MIN, max: MAX, now: value }}
      >
        <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.line }}>
          <View
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              borderRadius: 999,
              backgroundColor: colors.sage,
            }}
          />
          <View
            style={[
              {
                position: 'absolute',
                top: -8,
                left: `${pct * 100}%`,
                marginLeft: -11,
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: colors.raised,
                borderWidth: 3,
                borderColor: colors.sage,
              },
              shadow.sm,
            ]}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Where a cook's verification stands.
 *
 * The platform decides this — an operator approves or rejects a kitchen in
 * the KYC queue, and rejecting requires them to write a reason. None of that
 * reached the cook. `kycStatus` was on the wire and no screen read it, so a
 * kitchen could sit pending for a week, or be turned down for a fixable
 * reason, and the only thing its owner saw was a missing badge they had never
 * been told to expect.
 *
 * Approved renders nothing. A permanent green bar saying everything is fine
 * is noise on a screen a cook opens every day, and the badge on the listing
 * already says it. This speaks when there is something to say.
 */
export function KycBanner({ status, note, onContact, style }) {
  const { colors } = useTheme();
  const { t } = useLang();

  if (status !== 'pending' && status !== 'rejected') return null;

  const rejected = status === 'rejected';
  const tone = rejected
    ? { fg: colors.primary, bg: colors.primary50, edge: colors.primary100, icon: 'alertCircle' }
    : { fg: colors.sage, bg: colors.sage50, edge: colors.sage100, icon: 'clock' };

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 13,
          padding: 15,
          borderRadius: radius.md,
          backgroundColor: tone.bg,
          borderWidth: 1,
          borderColor: tone.edge,
        },
        style,
      ]}
    >
      <Icon name={tone.icon} size={19} color={tone.fg} strokeWidth={2} />

      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: type.sm,
            color: tone.fg,
          }}
        >
          {rejected ? t('Verification needs your attention') : t('Verification in progress')}
        </Text>

        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.xs + 1,
            lineHeight: (type.xs + 1) * 1.55,
            color: colors.textMuted,
          }}
        >
          {rejected
            ? note ||
              t('We could not verify your kitchen. Message us and we will sort it out.')
            : t(
                'You can take orders now. The verified badge appears on your listing once we have checked your details.',
              )}
        </Text>

        {/* Only when there is something to do about it. A pending cook has
            nothing to act on and a button would imply otherwise. */}
        {rejected && onContact ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Message support')}
            onPress={onContact}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: type.xs + 1,
                color: tone.fg,
              }}
            >
              {t('Message support')}
            </Text>
            <Icon name="arrowRight" size={14} color={tone.fg} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The whole cook dashboard, held until an operator approves the kitchen.
 *
 * The panel used to open and explain itself in a banner, with the actions that
 * needed approval locked one by one. That was the wrong shape. A dashboard
 * whose every meaningful control is disabled is not a dashboard — it is a
 * waiting room wearing one, and it invites a cook to keep pressing things to
 * find out which of them work.
 *
 * So the panel does not open at all. This says why, says what happens next,
 * and keeps open the one door that is still useful: the kitchen details, where
 * a cook can add the photograph and description an operator needs in order to
 * say yes.
 *
 * Rejected is a different screen from pending, not a redder version of it.
 * Pending is "wait"; rejected is "here is what was wrong, and you can fix it",
 * so it leads with the reason an operator wrote.
 */
export function KitchenPending({ kitchen, onOpenDetails, onBack }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

  const rejected = kitchen?.kycStatus === 'rejected';
  const note = String(kitchen?.kycNote ?? '').trim();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View
        style={[
          {
            width: '100%',
            maxWidth: 420,
            padding: 26,
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
            alignItems: 'center',
            gap: 14,
          },
          shadow.md,
        ]}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: rejected ? colors.primary50 : colors.sage50,
            borderWidth: 1,
            borderColor: rejected ? colors.primary100 : colors.sage100,
          }}
        >
          <Icon
            name={rejected ? 'alertCircle' : 'clock'}
            size={28}
            color={rejected ? colors.primary : colors.sage}
            strokeWidth={1.8}
          />
        </View>

        <Text
          style={{
            fontFamily: font.displayExtra,
            fontSize: 22,
            lineHeight: 27,
            letterSpacing: -0.3,
            textAlign: 'center',
            color: colors.text,
          }}
        >
          {rejected
            ? t('Your kitchen was not approved')
            : t('Waiting for RannaBari to check your kitchen')}
        </Text>

        {/* The operator's own words come first on a rejection: everything else
            on this screen is generic, and that sentence is the only part that
            says what to do about it. */}
        {rejected && note ? (
          <View
            style={{
              alignSelf: 'stretch',
              padding: 13,
              borderRadius: radius.sm,
              backgroundColor: colors.primary50,
              borderWidth: 1,
              borderColor: colors.primary100,
            }}
          >
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 14,
                lineHeight: 21,
                color: colors.text,
              }}
            >
              {note}
            </Text>
          </View>
        ) : null}

        <Text
          style={{
            fontFamily: font.ui,
            fontSize: 14.5,
            lineHeight: 22,
            textAlign: 'center',
            color: colors.textMuted,
          }}
        >
          {rejected
            ? t(
                'Fix what is mentioned above and your kitchen goes back in the queue. Nobody can order from it until then.',
              )
            : t(
                'Somebody reads every kitchen before it goes live — it is what makes a RannaBari cook worth trusting. You cannot list food or take orders until that is done.',
              )}
        </Text>

        {/* The one thing still worth doing while waiting, and on a rejection
            the thing that fixes it. */}
        <Button
          label={t('Your kitchen details')}
          icon="chefHat"
          block
          onPress={onOpenDetails}
          style={{ marginTop: 4 }}
        />

        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8}>
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: 13.5,
              color: colors.textMuted,
            }}
          >
            {t('Back to RannaBari')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The panel, held shut because an operator suspended the kitchen.
 *
 * This is a different state from waiting for approval and it needed its own
 * screen, because until now it had none at all. `toIdentity` drops
 * `kitchenId` for a suspended kitchen, so every write a cook attempted came
 * back `no-kitchen` — but `GET /kitchens/mine` reads by account and answered
 * normally, so the panel opened, looked completely ordinary, and then refused
 * everything the cook touched. The reason an operator had to write when they
 * suspended it went nowhere.
 *
 * Unlike a rejection, there is nothing here a cook can edit their way out of.
 * A rejection points at the kitchen details; this points at a person.
 */
export function KitchenSuspended({ kitchen, onContact, onBack }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

  const reason = String(kitchen?.suspendedReason ?? '').trim();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View
        style={[
          {
            width: '100%',
            maxWidth: 420,
            padding: 26,
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
            alignItems: 'center',
            gap: 14,
          },
          shadow.md,
        ]}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary50,
            borderWidth: 1,
            borderColor: colors.primary100,
          }}
        >
          <Icon name="lock" size={28} color={colors.primary} strokeWidth={1.8} />
        </View>

        <Text
          style={{
            fontFamily: font.displayExtra,
            fontSize: 22,
            lineHeight: 27,
            letterSpacing: -0.3,
            textAlign: 'center',
            color: colors.text,
          }}
        >
          {t('Your kitchen is suspended')}
        </Text>

        {/* The operator's own words, when they left any. Everything else on
            this screen is generic; this is the only part that says why. */}
        {reason ? (
          <View
            style={{
              alignSelf: 'stretch',
              padding: 13,
              borderRadius: radius.sm,
              backgroundColor: colors.primary50,
              borderWidth: 1,
              borderColor: colors.primary100,
            }}
          >
            <Text style={{ fontFamily: font.ui, fontSize: 14, lineHeight: 21, color: colors.text }}>
              {reason}
            </Text>
          </View>
        ) : null}

        <Text
          style={{
            fontFamily: font.ui,
            fontSize: 14.5,
            lineHeight: 22,
            textAlign: 'center',
            color: colors.textMuted,
          }}
        >
          {t(
            'Nobody can order from your kitchen while this lasts, and you cannot list food or take orders. Money already held against your finished orders is safe and still yours.',
          )}
        </Text>

        {/* A suspension is not a form to correct, so the door is a person
            rather than the kitchen editor a rejection points at. */}
        <Button
          label={t('Message support')}
          icon="chat"
          block
          onPress={onContact}
          style={{ marginTop: 4 }}
        />

        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8}>
          <Text style={{ fontFamily: font.uiSemi, fontSize: 13.5, color: colors.textMuted }}>
            {t('Back to RannaBari')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
