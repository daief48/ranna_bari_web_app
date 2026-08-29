import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

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
import { formatOrderDate } from '../src/store/OrdersContext';
import { useLang } from '../src/i18n/LanguageContext';
import { DEMO_TOPUP } from '../src/lib/demoData';

/** Round numbers people actually top up with. */
const PRESETS = [200, 500, 1000, 2000];

export default function WalletScreen() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const meals = useCommerce();

  const [amount, setAmount] = useState(DEMO_TOPUP.amount);
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
    const meal = meals.mealById(tx.mealId);
    const name = order?.title ?? meal?.title;
    if (tx.kind === 'topup') return t('Wallet top up');
    if (tx.kind === 'hold') return name ? t('Held for {title}', { title: name }) : t('Payment held');
    if (tx.kind === 'refund') return name ? t('Refund · {title}', { title: name }) : t('Refund');
    return t('Transaction');
  };

  const topUp = (value) => {
    setError(null);
    setDone(null);
    const out = meals.topUp(value, 'bKash');
    if (!out.ok) {
      setError(errorText(out.error, t, n, out));
      return;
    }
    setAmount('');
    setDone(t('৳{n} added to your wallet.', { n: n(out.result) }));
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

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
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
                    fontSize: type.md,
                    color: colors.text,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  ৳{n(value)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
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
                onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
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
