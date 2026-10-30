import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Button from '../src/components/Button';
import ManualTopUp from '../src/components/ManualTopUp';
import SectionHeader from '../src/components/SectionHeader';
import {
  EmptyState,
  LedgerRow,
  WalletCard,
} from '../src/components/MealBits';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useCommerce } from '../src/store/CommerceContext';
import { formatOrderDate } from '../src/store/OrdersContext';
import { safeNext } from '../src/lib/safePath';
import { useLang } from '../src/i18n/LanguageContext';

export default function WalletScreen() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const meals = useCommerce();

  /* Checkout sends the shortfall (`?need=`) when the wallet could not cover an
     order, so the amount box opens already holding what is missing. */
  const { need, next: nextParam } = useLocalSearchParams();
  /* Where to go once the money is in. A food request sends the customer here
     to cover a shortfall with `next=/requests/<id>`; without a way back they
     would top up and be left on the wallet, hunting for the request. The
     value comes from a URL, so it is validated as an in-app path first. */
  const next = safeNext(nextParam);

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

        {next ? (
          <Button
            variant="glass"
            label={t('Continue where you left off')}
            icon="arrowRight"
            block
            onPress={() => router.replace(next)}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <WalletCard
          label={t('Available balance')}
          amount={meals.wallet.customer}
          sub={meals.wallet.held || null}
          subLabel={t('Held for meals in progress')}
        />

        {/* ---- top up ----
            Manual: pay the platform's bKash/Nagad number, then file the
            transaction id for review. The old instant form credited a balance
            from a request body, which the server refuses outside development,
            so it is gone rather than hidden. */}
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

          {isSignedIn ? (
            <ManualTopUp need={Array.isArray(need) ? need[0] : need} />
          ) : (
            <Button label={t('Sign in')} onPress={() => router.push('/auth')} />
          )}
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
