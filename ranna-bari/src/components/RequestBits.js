/**
 * The pieces the bidding and negotiation screens draw with.
 *
 * The negotiation thread is the important one. A price that moved four times
 * is a conversation, and showing only the current number turns it into a
 * demand -- so it reads as a thread, both sides aligned to their own edge,
 * with every figure either of them named still on it.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import Icon from './Icon';
import { Price } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, tracking, type } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';
import { formatDistance } from '../lib/geo';
import { OFFER_STATUS, REQUEST_STATUS, standing, turnOf } from '../lib/requestLogic';

/* ------------------------------------------------------------------ *
 * status
 * ------------------------------------------------------------------ */

export function requestStatusMeta(status, colors) {
  return {
    [REQUEST_STATUS.OPEN]: {
      label: 'Taking offers', icon: 'sparkles', fg: colors.primary, bg: colors.primary50,
    },
    [REQUEST_STATUS.SELECTED]: {
      label: 'Negotiating', icon: 'banknote', fg: colors.saffron, bg: colors.saffron50,
    },
    [REQUEST_STATUS.AGREED]: {
      label: 'Pay to confirm', icon: 'lock', fg: colors.saffron, bg: colors.saffron50,
    },
    [REQUEST_STATUS.ORDERED]: {
      label: 'Ordered', icon: 'shieldCheck', fg: colors.sage, bg: colors.sage50,
    },
    [REQUEST_STATUS.CANCELLED]: {
      label: 'Withdrawn', icon: 'x', fg: colors.textMuted, bg: colors.sunken,
    },
  }[status] ?? { label: 'Taking offers', icon: 'sparkles', fg: colors.primary, bg: colors.primary50 };
}

export function offerStatusMeta(status, colors) {
  return {
    [OFFER_STATUS.INTERESTED]: {
      label: 'Interested', icon: 'sparkles', fg: colors.primary, bg: colors.primary50,
    },
    [OFFER_STATUS.PRICED]: {
      label: 'Price submitted', icon: 'banknote', fg: colors.primary, bg: colors.primary50,
    },
    [OFFER_STATUS.NEGOTIATING]: {
      label: 'Negotiating', icon: 'banknote', fg: colors.saffron, bg: colors.saffron50,
    },
    [OFFER_STATUS.AGREED]: {
      label: 'Agreed', icon: 'check', fg: colors.sage, bg: colors.sage50,
    },
    [OFFER_STATUS.NOT_SELECTED]: {
      label: 'Not selected', icon: 'x', fg: colors.textMuted, bg: colors.sunken,
    },
    [OFFER_STATUS.WITHDRAWN]: {
      label: 'Withdrawn', icon: 'x', fg: colors.textMuted, bg: colors.sunken,
    },
  }[status] ?? { label: 'Interested', icon: 'sparkles', fg: colors.primary, bg: colors.primary50 };
}

function Pill({ meta, style }) {
  const { t } = useLang();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
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
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: meta.fg,
        }}
      >
        {t(meta.label)}
      </Text>
    </View>
  );
}

export function RequestStatusPill({ status, style }) {
  const { colors } = useTheme();
  return <Pill meta={requestStatusMeta(status, colors)} style={style} />;
}

export function OfferStatusPill({ status, style }) {
  const { colors } = useTheme();
  return <Pill meta={offerStatusMeta(status, colors)} style={style} />;
}

/* ------------------------------------------------------------------ *
 * the request
 * ------------------------------------------------------------------ */

/** What was asked for, in one block. */
export function RequestSummary({ request, category, compact }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  const facts = [
    request.quantity > 1 ? t('{n} portions', { n: n(request.quantity) }) : null,
    category ? `${category.emoji ? `${category.emoji} ` : ''}${category.label}` : null,
    request.wantedDate ? request.wantedDate : null,
    request.budget ? t('around ৳{n}', { n: n(request.budget) }) : null,
  ].filter(Boolean);

  return (
    <View style={{ gap: 8 }}>
      <Text
        numberOfLines={compact ? 1 : 3}
        style={{
          fontFamily: font.displayBold,
          fontSize: compact ? 17 : 22,
          lineHeight: compact ? 22 : 28,
          letterSpacing: -0.2,
          color: colors.text,
        }}
      >
        {request.title}
      </Text>

      {facts.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {facts.map((f) => (
            <Text
              key={f}
              style={{
                fontFamily: font.uiSemi,
                fontSize: type.xs,
                color: colors.textMuted,
              }}
            >
              {f}
            </Text>
          ))}
        </View>
      ) : null}

      {!compact && request.details ? (
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm + 1,
            lineHeight: (type.sm + 1) * 1.55,
            color: colors.textMuted,
          }}
        >
          {request.details}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * offers
 * ------------------------------------------------------------------ */

/**
 * One cook's bid, as the customer compares them.
 *
 * The cheapest is marked, but not sorted to the top on its own: the point of
 * a comparison screen is that price is one column of several, and a cook two
 * streets away with four hundred reviews may be worth two hundred taka.
 */
export function OfferCard({ offer, km, cheapest, selected, onPress, action }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const away = formatDistance(km, t, n);

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${offer.cookName}, ৳${n(offer.price ?? 0)}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        {
          gap: 12,
          padding: 14,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: selected
            ? colors.sage
            : pressed
              ? colors.primary200
              : colors.line,
          opacity: offer.status === OFFER_STATUS.NOT_SELECTED ? 0.6 : 1,
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image
          source={{ uri: offer.cookAvatar }}
          contentFit="cover"
          transition={200}
          style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.sunken }}
        />

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.displayBold,
              fontSize: 17,
              letterSpacing: -0.18,
              color: colors.text,
            }}
          >
            {offer.cookName}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {offer.reviewCount ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="star" size={11} color={colors.saffron} fill={colors.saffron} />
                <Text
                  style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.textMuted }}
                >
                  {n(offer.rating)} ({n(offer.reviewCount)})
                </Text>
              </View>
            ) : null}
            {offer.area ? (
              <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
                {offer.area}
              </Text>
            ) : null}
            {away ? (
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 10,
                  color: colors.sage,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {away}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {offer.price != null ? (
            <Price size={19}>৳{n(offer.price)}</Price>
          ) : (
            <Text
              style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
            >
              {t('no price yet')}
            </Text>
          )}
          {cheapest && offer.price != null ? (
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 9,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: colors.sage,
              }}
            >
              {t('Lowest')}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <OfferStatusPill status={offer.status} />
        {offer.prepTime ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="clock" size={11} color={colors.textLight} />
            <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
              {offer.prepTime}
            </Text>
          </View>
        ) : null}
      </View>

      {offer.note ? (
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: type.sm * 1.5,
            color: colors.textMuted,
          }}
        >
          “{offer.note}”
        </Text>
      ) : null}

      {action}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * negotiation
 * ------------------------------------------------------------------ */

/**
 * Every price either side has named, oldest first.
 *
 * Never collapsed to "current offer": the shape of a negotiation -- who moved
 * how far, and how many times -- is most of what tells you whether the number
 * on the table is a good one.
 */
export function NegotiationThread({ offer, cookName }) {
  const { colors } = useTheme();
  const { t, n, lang } = useLang();

  if (!offer?.history?.length) return null;

  return (
    <View style={{ gap: 10 }}>
      {offer.history.map((entry, i) => {
        const mine = entry.by === 'customer';
        return (
          <View
            key={`${entry.at}-${i}`}
            style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              maxWidth: '82%',
              alignItems: mine ? 'flex-end' : 'flex-start',
              gap: 3,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: radius.md,
                backgroundColor: entry.accepted
                  ? colors.sage50
                  : mine
                    ? colors.primary50
                    : colors.surfaceSolid,
                borderWidth: 1,
                borderColor: entry.accepted
                  ? colors.sage100
                  : mine
                    ? colors.primary200
                    : colors.line,
              }}
            >
              {entry.accepted ? (
                <Icon name="check" size={14} color={colors.sage} strokeWidth={2.4} />
              ) : null}
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.md,
                  color: entry.accepted ? colors.sage : colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                ৳{n(entry.amount)}
              </Text>
            </View>

            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 10,
                color: colors.textLight,
              }}
            >
              {entry.accepted
                ? t('{who} agreed', { who: mine ? t('You') : cookName })
                : mine
                  ? t('You offered')
                  : t('{who} offered', { who: cookName })}
              {' · '}
              {new Date(entry.at).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Whose move it is, said in words.
 *
 * A negotiation stalls when neither side knows they are the one being waited
 * on, and "the ball is with them" is the single most useful sentence on this
 * screen.
 */
export function TurnBanner({ offer, side, cookName }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  if (!offer) return null;
  const last = standing(offer);
  const turn = turnOf(offer);

  if (offer.status === OFFER_STATUS.AGREED) {
    return (
      <Banner
        tone="sage"
        icon="check"
        title={t('Agreed at ৳{n}', { n: n(offer.agreedPrice) })}
        body={
          side === 'customer'
            ? t('Pay to confirm the order. Nothing is charged until you do.')
            : t('Waiting for the customer to pay.')
        }
      />
    );
  }

  const yours = turn === side;
  return (
    <Banner
      tone={yours ? 'saffron' : 'primary'}
      icon={yours ? 'banknote' : 'clock'}
      title={
        yours
          ? t('৳{n} is on the table', { n: n(last?.amount ?? 0) })
          : t('Waiting on {who}', { who: side === 'customer' ? cookName : t('the customer') })
      }
      body={
        yours
          ? t('Accept it, or name a different price.')
          : t('They have your ৳{n}. You will be told when they answer.', {
              n: n(last?.amount ?? 0),
            })
      }
    />
  );
}

export function Banner({ tone, icon, title, body }) {
  const { colors } = useTheme();
  const map = {
    sage: [colors.sage, colors.sage50, colors.sage100],
    saffron: [colors.saffron, colors.saffron50, colors.saffron100],
    primary: [colors.primary, colors.primary50, colors.primary200],
  };
  const [fg, bg, line] = map[tone] ?? map.primary;

  return (
    <View
      style={{
        gap: 6,
        padding: 16,
        borderRadius: radius.sm,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={icon} size={16} color={fg} />
        <Text
          style={{ flex: 1, fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}
        >
          {title}
        </Text>
      </View>
      {body ? (
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: type.sm * 1.55,
            color: colors.textMuted,
          }}
        >
          {body}
        </Text>
      ) : null}
    </View>
  );
}

/** The uppercase label above a block. */
export function Label({ text, right, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
        style,
      ]}
    >
      <Text
        style={{
          flex: 1,
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
