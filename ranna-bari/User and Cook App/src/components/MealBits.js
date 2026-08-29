/**
 * The pieces both halves of the meal system draw with.
 *
 * A meal is read by two people who want different things from it -- a
 * customer asking "can I eat this tomorrow" and a cook asking "how many do I
 * cook" -- so the card takes what to emphasise rather than guessing from
 * which screen mounted it.
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
import { slotMeta, todayKey, tomorrowKey } from '../store/CommerceContext';

/* ------------------------------------------------------------------ *
 * status
 * ------------------------------------------------------------------ */

/**
 * How each stage reads.
 *
 * `delivered` is saffron rather than green: it is the one state that is
 * waiting on the person looking at it, and a finished-looking colour there
 * would stop them doing the thing that pays the cook.
 */
export function mealStatusMeta(status, colors) {
  const map = {
    confirmed: { label: 'Confirmed', icon: 'receipt', fg: colors.primary, bg: colors.primary50 },
    preparing: { label: 'Preparing', icon: 'pot', fg: colors.saffron, bg: colors.saffron50 },
    ready: { label: 'Ready', icon: 'chefHat', fg: colors.saffron, bg: colors.saffron50 },
    delivering: { label: 'On the way', icon: 'delivery', fg: colors.primary, bg: colors.primary50 },
    delivered: { label: 'Confirm receipt', icon: 'box', fg: colors.saffron, bg: colors.saffron50 },
    completed: { label: 'Completed', icon: 'shieldCheck', fg: colors.sage, bg: colors.sage50 },
    cancelled: { label: 'Cancelled', icon: 'x', fg: colors.textMuted, bg: colors.sunken },
  };
  return map[status] ?? map.confirmed;
}

export function MealStatusPill({ status, style }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const meta = mealStatusMeta(status, colors);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderRadius: radius.pill,
          backgroundColor: meta.bg,
        },
        style,
      ]}
    >
      <Icon name={meta.icon} size={12} color={meta.fg} />
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: meta.fg,
        }}
      >
        {t(meta.label)}
      </Text>
    </View>
  );
}

/** Where the money for one order currently sits. */
export function PaymentPill({ payment, style }) {
  const { colors } = useTheme();
  const { t } = useLang();

  const meta = {
    held: { label: 'Payment held', icon: 'lock', fg: colors.saffron, bg: colors.saffron50 },
    released: { label: 'Paid out', icon: 'banknote', fg: colors.sage, bg: colors.sage50 },
    refunded: { label: 'Refunded', icon: 'arrowLeft', fg: colors.textMuted, bg: colors.sunken },
  }[payment];
  if (!meta) return null;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
          paddingVertical: 5,
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
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: meta.fg,
        }}
      >
        {t(meta.label)}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * dates
 * ------------------------------------------------------------------ */

/**
 * "Tomorrow, lunch" beats a date nobody has to decode.
 *
 * Anything further out gets the actual date, because "in 3 days" stops being
 * useful the moment you are planning around a particular one.
 */
export function serviceLabel(meal, t, lang = 'en') {
  const slot = t(slotMeta(meal.slot).label);
  if (meal.serveDate === todayKey()) return `${t('Today')} · ${slot}`;
  if (meal.serveDate === tomorrowKey()) return `${t('Tomorrow')} · ${slot}`;

  const [y, m, d] = String(meal.serveDate).split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const text = date.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${text} · ${slot}`;
}

/**
 * How long is left to order.
 *
 * Rounded up, not down: a deadline shown as "0 min left" while the button
 * still works is worse than one minute of imprecision.
 */
export function deadlineLabel(deadline, t, n) {
  if (!deadline) return null;
  const left = new Date(deadline).getTime() - Date.now();
  if (left <= 0) return t('Orders closed');

  const mins = Math.ceil(left / 60_000);
  if (mins < 60) return t('{n} min left', { n: n(mins) });
  const hrs = Math.ceil(mins / 60);
  if (hrs < 24) return t('{n} hr left', { n: n(hrs) });
  return t('{n} days left', { n: n(Math.ceil(hrs / 24)) });
}

/* ------------------------------------------------------------------ *
 * cards
 * ------------------------------------------------------------------ */

/**
 * One meal, as a customer sees it.
 *
 * The two numbers that decide whether to act are how far away it is and how
 * many portions are left, so both sit on the card rather than one tap in.
 */
export function MealCard({ meal, km, remaining, interested, onPress, wide }) {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();

  const away = formatDistance(km, t, n);
  const closing = deadlineLabel(meal.deadline, t, n);
  const soldOut = remaining != null && remaining <= 0;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${meal.title}, ৳${n(meal.price)}, ${meal.cookName}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: wide ? 260 : undefined,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? colors.primary200 : colors.line,
          overflow: 'hidden',
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        shadow.sm,
      ]}
    >
      <View>
        <Image
          source={{ uri: meal.image }}
          contentFit="cover"
          transition={200}
          style={{ width: '100%', height: 132, backgroundColor: colors.sunken }}
        />

        {/* When it is eaten — the first thing that decides relevance. */}
        <View
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: radius.pill,
            backgroundColor: 'rgba(20, 16, 14, 0.62)',
          }}
        >
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: 10,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: '#FFFFFF',
            }}
          >
            {serviceLabel(meal, t, lang)}
          </Text>
        </View>

        {soldOut ? (
          <View
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              paddingVertical: 5,
              paddingHorizontal: 10,
              borderRadius: radius.pill,
              backgroundColor: colors.saffron,
            }}
          >
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 10,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: '#FFFFFF',
              }}
            >
              {t('Sold out')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: font.displayBold,
              fontSize: 17,
              letterSpacing: -0.2,
              color: colors.text,
            }}
          >
            {meal.title}
          </Text>
          <Price size={17}>৳{n(meal.price)}</Price>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="chefHat" size={12} color={colors.primary} />
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontFamily: font.uiSemi,
              fontSize: type.xs,
              color: colors.primary,
            }}
          >
            {meal.cookName}
          </Text>
          {away ? (
            <>
              <View
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: colors.textLight,
                }}
              />
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
            </>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {remaining != null ? (
            <MiniStat
              icon="box"
              text={t('{n} left', { n: n(remaining) })}
              tone={remaining <= 3 ? colors.saffron : colors.textMuted}
            />
          ) : null}
          {interested ? (
            <MiniStat
              icon="sparkles"
              text={t('{n} interested', { n: n(interested) })}
              tone={colors.textMuted}
            />
          ) : null}
          {closing ? (
            <MiniStat icon="clock" text={closing} tone={colors.textMuted} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function MiniStat({ icon, text, tone }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={11} color={tone ?? colors.textMuted} />
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.xs,
          color: tone ?? colors.textMuted,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * wallet
 * ------------------------------------------------------------------ */

/**
 * A balance, and the thing standing next to it that is not spendable yet.
 *
 * Showing only one number is how people end up surprised: a cook with ৳900
 * of held orders and ৳0 released needs to see both, or the wallet looks
 * broken on the day they cook the most.
 */
export function WalletCard({ label, amount, sub, subLabel, tone = 'primary', action }) {
  const { colors, shadow } = useTheme();
  const { n } = useLang();

  const accent = tone === 'sage' ? colors.sage : colors.primary;
  const wash = tone === 'sage' ? colors.sage50 : colors.primary50;

  return (
    <View
      style={[
        {
          padding: 20,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.line,
          gap: 14,
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: wash,
          }}
        >
          <Icon name="banknote" size={17} color={accent} />
        </View>
        <Text
          style={{
            flex: 1,
            fontFamily: font.uiBold,
            fontSize: type.xs + 1,
            letterSpacing: (type.xs + 1) * tracking.label,
            textTransform: 'uppercase',
            color: colors.textMuted,
          }}
        >
          {label}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: font.displayExtra,
          fontSize: 38,
          lineHeight: 42,
          letterSpacing: -1,
          color: colors.text,
        }}
      >
        ৳{n(amount)}
      </Text>

      {sub != null ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.line2,
          }}
        >
          <Icon name="lock" size={13} color={colors.saffron} />
          <Text
            style={{
              flex: 1,
              fontFamily: font.ui,
              fontSize: type.xs + 1,
              color: colors.textMuted,
            }}
          >
            {subLabel}
          </Text>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.sm + 1,
              color: colors.saffron,
              fontVariant: ['tabular-nums'],
            }}
          >
            ৳{n(sub)}
          </Text>
        </View>
      ) : null}

      {action}
    </View>
  );
}

/** One line of the ledger. */
export function LedgerRow({ tx, title, when }) {
  const { colors } = useTheme();
  const { n } = useLang();

  /* Sign from the wallet's point of view, which is the only one the person
     reading it has: a hold is money gone even though the platform still has
     it, and a release is money arriving even though it was theirs all along. */
  const incoming = tx.to === 'customer' || tx.to === 'cook';
  const meta = {
    topup: { icon: 'plus', tone: colors.sage },
    hold: { icon: 'lock', tone: colors.saffron },
    release: { icon: 'shieldCheck', tone: colors.sage },
    refund: { icon: 'arrowLeft', tone: colors.primary },
  }[tx.kind] ?? { icon: 'receipt', tone: colors.textMuted };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.line2,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.sunken,
        }}
      >
        <Icon name={meta.icon} size={15} color={meta.tone} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
        >
          {title}
        </Text>
        <Text
          style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textLight }}
        >
          {when}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.sm + 2,
          color: incoming ? colors.sage : colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {incoming ? '+' : '−'}৳{n(tx.amount)}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * misc
 * ------------------------------------------------------------------ */

/**
 * Turn a refusal code into a sentence.
 *
 * The rules return codes so they stay language-free; this is the one place
 * that decides how each one reads, so the same failure says the same thing
 * on the customer screen and the cook's, and in the store as well as in the
 * meal system.
 */
export function errorText(error, t, n, extra = {}) {
  switch (error) {
    case 'meal-missing':
      return t('That meal is no longer listed.');
    case 'meal-closed':
      return t('This meal is no longer taking orders.');
    case 'meal-deadline-passed':
      return t('Orders for this meal have closed.');
    case 'meal-sold-out':
      return t('This meal is sold out.');
    case 'meal-already-ordered':
      return t('You have already booked this meal.');
    case 'wallet-low-balance':
      return t('Insufficient balance. Top up ৳{n} to confirm this meal.', {
        n: n(extra.short ?? 0),
      });
    case 'order-missing':
      return t('That order no longer exists.');
    case 'order-wrong-state':
      return t('That cannot be done at this stage of the order.');
    case 'order-already-settled':
      return t('This order has already been settled.');
    case 'amount-invalid':
      return t('Enter a valid amount.');

    /* ---- cook stores ---- */
    case 'store-missing':
      return t('That shop is no longer listed.');
    case 'store-closed':
      return t('This shop is closed right now.');
    case 'product-missing':
      return t('That product is no longer listed.');
    case 'product-unavailable':
      return t('{name} is not on sale right now.', { name: extra.productName ?? '' });
    case 'product-out-of-stock':
      return t('{name} is out of stock.', { name: extra.productName ?? '' });
    case 'product-not-enough-stock':
      return t('Only {n} left of {name}.', {
        n: n(extra.stock ?? 0),
        name: extra.productName ?? '',
      });
    case 'product-below-minimum':
      return t('The kitchen sells this in larger quantities.');
    case 'product-above-maximum':
      return t('You can order at most {n} of this.', { n: n(extra.max ?? 0) });
    case 'cart-empty':
      return t('Your basket is empty.');
    case 'category-in-use':
      return t('Move or delete its {n} products first.', { n: n(extra.count ?? 0) });
    case 'name-required':
      return t('Give it a name.');

    /* ---- food requests and bidding ---- */
    case 'request-missing':
      return t('That request no longer exists.');
    case 'request-closed':
      return t('This request is no longer taking offers.');
    case 'request-not-eligible':
      return t('You were not asked for this one.');
    case 'offer-missing':
      return t('That offer no longer stands.');
    case 'offer-closed':
      return t('This offer is closed.');
    case 'offer-no-price':
      return t('That cook has not named a price yet.');
    case 'offer-not-your-turn':
      return t('It is the other side’s turn.');
    case 'offer-not-agreed':
      return t('Agree a price first.');

    /* ---- refusals only a server can make ----
       The transitions these come from used to run on the device, where there
       was no network to drop, no session to expire and no kitchen the app had
       not heard of. Now that they run on the server, all three are things a
       customer can actually hit, and each needs its own sentence: "something
       went wrong" tells somebody with no signal to try again forever. */
    case 'network':
      return t('We could not reach the server. Check your connection.');
    case 'unauthenticated':
      return t('Sign in to do that.');
    case 'kitchen-missing':
      return t('That kitchen is no longer listed.');
    case 'duplicate-request':
      return t('You have already sent that.');
    case 'bad-json':
      return t('Something went wrong. Try again.');

    default:
      return t('Something went wrong. Try again.');
  }
}

/**
 * Fill a notification's template from whatever it points at.
 *
 * The rules store the sentence with `{title}` and `{amount}` still in it and
 * nothing else -- a notification written when an order was confirmed must
 * still read correctly a week later, after the price changed or the meal was
 * renamed, and looking the values up on read is what makes that true.
 */
export function notificationText(nt, { mealById, orders, t, n }) {
  const order = nt.orderId ? orders.find((o) => o.id === nt.orderId) : null;
  const meal = nt.mealId ? mealById(nt.mealId) : null;

  const vars = {
    title: order?.title ?? meal?.title ?? t('a meal'),
    cook: order?.cookName ?? meal?.cookName ?? '',
    customer: order?.customerName || t('A customer'),
    price: n(meal?.price ?? order?.price ?? 0),
    amount: n(order?.amount ?? meal?.price ?? 0),
    // `n` means different things to the two sides: how many are interested,
    // or how many portions the cook now has to cook.
    n: n(
      nt.kind === 'interest'
        ? (meal?.interestCount ?? 0)
        : orders.filter((o) => o.mealId === nt.mealId && o.status !== 'cancelled').length,
    ),
  };

  return { title: t(nt.title), body: t(nt.body ?? '', vars) };
}

export function EmptyState({ icon = 'pot', title, body, action }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 44 }}>
      <Icon name={icon} size={30} color={colors.textLight} />
      <Text
        style={{
          fontFamily: font.displayBold,
          fontSize: 17,
          textAlign: 'center',
          color: colors.text,
        }}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm + 1,
            lineHeight: (type.sm + 1) * 1.5,
            textAlign: 'center',
            color: colors.textMuted,
            maxWidth: 300,
          }}
        >
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

/** The counters a cook plans against. */
export function CountTile({ value, label, tone = 'sage', big }) {
  const { colors } = useTheme();
  const accent =
    tone === 'primary' ? colors.primary : tone === 'saffron' ? colors.saffron : colors.sage;
  const wash =
    tone === 'primary' ? colors.primary50 : tone === 'saffron' ? colors.saffron50 : colors.sage50;

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingVertical: big ? 20 : 14,
        borderRadius: radius.sm,
        backgroundColor: wash,
      }}
    >
      <Text
        style={{
          fontFamily: font.displayExtra,
          fontSize: big ? 34 : 24,
          lineHeight: big ? 38 : 28,
          letterSpacing: -0.6,
          color: accent,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          textAlign: 'center',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
