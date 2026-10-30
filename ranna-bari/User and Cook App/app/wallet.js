import React, { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Button from '../src/components/Button';
import SectionHeader from '../src/components/SectionHeader';
import {
  EmptyState,
  LedgerRow,
  WalletCard,
  errorText,
} from '../src/components/MealBits';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useCommerce } from '../src/store/CommerceContext';
import { useConfig } from '../src/store/ConfigContext';
import { formatOrderDate } from '../src/store/OrdersContext';
import { foldDigits } from '../src/lib/format';
import { useLang } from '../src/i18n/LanguageContext';
import { useAlert } from '../src/components/Alert';

/** Round numbers people actually top up with. */
const PRESETS = [200, 500, 1000, 2000];

export default function WalletScreen() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const alert = useAlert();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const meals = useCommerce();
  const { flags } = useConfig();

  /*
   * Whether there is any point drawing the top-up form.
   *
   * There is no payment gateway behind `/wallet/topup`: outside development
   * the server answers `topup-unavailable` (403) to every amount, and an
   * operator can switch the whole feature off with the `system.topup` flag.
   * The form used to be drawn regardless and every tap on ৳500 became an
   * error dialog. Two signals close it: the flag, when `/config` has said
   * it is off (an unspoken flag keeps the form, because "the server has not
   * answered yet" is not "top-ups are shut"), and the refusal itself, the
   * first time it comes back — after which the panel below stands in for
   * the form until the screen is next opened.
   */
  const [shut, setShut] = useState(false);
  const topUpsOpen = flags?.['system.topup'] !== false && !shut;

  /* Checkout sends the shortfall (`?need=`) when the wallet could not cover an
     order, so the amount box opens already holding what is missing. */
  const { need } = useLocalSearchParams();
  const [amount, setAmount] = useState(() => {
    const short = Math.ceil(Number(Array.isArray(need) ? need[0] : need));
    return Number.isFinite(short) && short > 0 ? String(short) : '';
  });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  /* If the server returned real ledger entries, show those (authoritative).
     Otherwise fall back to the local ledger filter. Server entries are stored
     in `wallet.serverEntries` by CommerceContext when a session is active. */
  const rows = useMemo(() => {
    const serverEntries = meals.wallet?.serverEntries;
    if (serverEntries && serverEntries.length > 0) {
      return [...serverEntries].reverse();
    }
    return meals.ledger
      .filter((tx) => tx.from === 'customer' || tx.to === 'customer')
      .slice()
      .reverse();
  }, [meals.ledger, meals.wallet]);


  const titleFor = (tx) => {
    const order = meals.orders.find((o) => o.id === tx.orderId);
    /* The order's title only. `tx.mealId` is a legacy field naming a row in
       the per-plate board, and that collection is gone — a meal's money is
       attached to its order now, and the order is what carries the name. */
    const name = order?.title;
    if (tx.kind === 'topup') return t('Wallet top up');
    if (tx.kind === 'hold') return name ? t('Held for {title}', { title: name }) : t('Payment held');
    if (tx.kind === 'refund') return name ? t('Refund · {title}', { title: name }) : t('Refund');
    return t('Transaction');
  };

  const toppingUp = useRef(false);

  const topUp = async (value) => {
    /*
     * A number, not whatever the field held.
     *
     * The preset buttons pass numbers and worked; the text field holds a
     * string, and the API takes a strict `z.number()`, so a typed amount came
     * back "amount-invalid" every time. Checked here as well so an empty or
     * nonsense box is answered on the spot instead of after a round trip.
     */
    const taka = Number(foldDigits(value));
    /* Whole taka only: money here is never a fraction, and 12.5 would be
       rounded by the server into an amount the customer did not type. */
    if (!Number.isInteger(taka) || taka <= 0) {
      return alert.error(t('Enter a valid amount.'));
    }

    /* Every top-up is a credit, and nothing identifies one as a repeat of the
       last — so a double tap was two credits. One at a time, closed in the
       same frame (a ref, not state, which only closes after a render). */
    if (toppingUp.current) return;
    toppingUp.current = true;
    try {
      const out = await meals.topUp(taka, 'bKash');
      if (!out.ok) {
        /* The door is shut, not the amount wrong: swap the form for the
           panel so the next tap is not the same dialog again. */
        if (out.error === 'topup-unavailable' || out.error === 'feature-off') setShut(true);
        alert.error(errorText(out.error, t, n, out));
        return;
      }
      setAmount('');
      alert.success(t('৳{n} added to your wallet.', { n: n(out.result) }));
    } finally {
      toppingUp.current = false;
    }
  };

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.primary} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.primary,
            }}
          >
            {t('Back')}
          </Text>
        </Pressable>

        <SectionHeader
          lead={t('YOUR')}
          accent={t('WALLET')}
          subtitle={t('Meals are paid for from here, and held until the food arrives.')}
          style={{ marginBottom: 22 }}
        />

        <WalletCard
          label={t('Available balance')}
          amount={meals.wallet.customer}
          sub={meals.wallet.held || null}
          subLabel={t('Held for meals in progress')}
        />

        {/* ---- top up ---- */}
        <View style={{ marginTop: 26 }}>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.sm,
              letterSpacing: type.sm * tracking.label,
              textTransform: 'uppercase',
              color: colors.textMuted,
              marginBottom: 14,
            }}
          >
            {t('Top up')}
          </Text>

          {!topUpsOpen ? (
            <View
              style={[
                {
                  gap: 8,
                  padding: 16,
                  borderRadius: radius.md,
                  backgroundColor: colors.saffron50,
                  borderWidth: 1,
                  borderColor: colors.saffron100,
                },
                shadow.xs,
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="clock" size={16} color={colors.saffron} />
                <Text style={{ flex: 1, fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}>
                  {t('Top-ups are coming soon')}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: type.sm,
                  lineHeight: type.sm * 1.55,
                  color: colors.textMuted,
                }}
              >
                {t('Top-ups are not open yet. Your balance grows from refunds for now — contact support if you need help.')}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, display: topUpsOpen ? 'flex' : 'none' }}>
            {PRESETS.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                onPress={() => topUp(value)}
                style={({ pressed }) => [
                  {
                    flexGrow: 1,
                    minWidth: 78,
                    alignItems: 'center',
                    paddingVertical: 14,
                    borderRadius: radius.sm,
                    backgroundColor: pressed ? colors.primary50 : colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.xs,
                ]}
              >
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: type.body,
                    color: colors.text,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  ৳{n(value)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, display: topUpsOpen ? 'flex' : 'none' }}>
            <View
              style={[
                {
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  height: 52,
                  paddingHorizontal: 16,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
                shadow.sm,
              ]}
            >
              <Text
                style={{ fontFamily: font.uiBold, fontSize: 17, color: colors.textMuted }}
              >
                ৳
              </Text>
              <TextInput
                value={amount}
                onChangeText={(v) => setAmount(foldDigits(v).replace(/[^0-9]/g, ''))}
                placeholder={t('Other amount')}
                placeholderTextColor={colors.textLight}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={() => amount && topUp(amount)}
                style={[
                  {
                    flex: 1,
                    minWidth: 0,
                    fontFamily: font.ui,
                    fontSize: 16,
                    color: colors.text,
                  },
                  Platform.OS === 'web' ? { outlineStyle: 'none' } : null,
                ]}
              />
            </View>
            <Button
              label={t('Add')}
              disabled={!amount}
              onPress={() => topUp(amount)}
            />
          </View>

          {topUpsOpen ? (
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.xs,
                lineHeight: type.xs * 1.6,
                color: colors.textLight,
                marginTop: 12,
              }}
            >
              {t('Demo top-up: no payment gateway is connected, so the balance is added straight away.')}
            </Text>
          ) : null}

          {error ? <Flash tone="primary" icon="alertCircle" text={error} /> : null}
          {done ? <Flash tone="sage" icon="check" text={done} /> : null}
        </View>

        {/* ---- history ---- */}
        <View style={{ marginTop: 30 }}>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.sm,
              letterSpacing: type.sm * tracking.label,
              textTransform: 'uppercase',
              color: colors.textMuted,
              marginBottom: 6,
            }}
          >
            {t('Transaction history')}
          </Text>

          {rows.length ? (
            rows.map((tx) => (
              <LedgerRow
                key={tx.id}
                tx={tx}
                title={titleFor(tx)}
                when={formatOrderDate(tx.at, lang)}
              />
            ))
          ) : (
            <EmptyState
              icon="receipt"
              title={t('No transactions yet')}
              body={
                isSignedIn
                  ? t('Top up your wallet to book tomorrow’s meals.')
                  : t('Sign in to book a meal and use your wallet.')
              }
              action={
                isSignedIn ? null : (
                  <Button label={t('Sign in')} onPress={() => router.push('/auth')} />
                )
              }
            />
          )}
        </View>
      </Container>
    </Screen>
  );
}

function Flash({ tone, icon, text }) {
  const { colors } = useTheme();
  const fg = tone === 'sage' ? colors.sage : colors.primary;
  const bg = tone === 'sage' ? colors.sage50 : colors.primary50;
  const line = tone === 'sage' ? colors.sage100 : colors.primary200;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        marginTop: 14,
        borderRadius: radius.sm,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: line,
      }}
    >
      <Icon name={icon} size={16} color={fg} />
      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: type.sm,
          lineHeight: type.sm * 1.5,
          color: colors.text,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
