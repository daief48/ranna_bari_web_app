import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import SectionHeader from '../../../src/components/SectionHeader';
import { BentoBox, IconTile } from '../../../src/components/Surfaces';
import { RowHeading, StatTile } from '../../../src/components/CookBits';
import { LedgerRow, WalletCard } from '../../../src/components/MealBits';
import { Body, Heading, Price } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { cookPayout, formatOrderDate, useOrders } from '../../../src/store/OrdersContext';
import {
  cookBase,
  inFlight,
  moneyHeld,
  moneyReleased,
  payoutRateFor,
  settledAt,
} from '../../../src/lib/orderRails';
import { dayKeyOf, recentDayKeys } from '../../../src/features/meal-plan/format';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useCookPayouts } from '../../../src/data/cook';
import { useLang } from '../../../src/i18n/LanguageContext';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const taka = (v, num) => `৳${num((Number(v) || 0).toLocaleString('en-US'))}`;

export default function CookEarnings() {
  const { colors, shadow } = useTheme();
  const { kitchen } = useKitchen();
  const { ordersForKitchen, payoutRates } = useOrders();
  const meals = useCommerce();
  const { t, n: num, lang } = useLang();
  /* Runs an operator actually marked paid. Empty until there has been one,
     which is the honest state for a kitchen in its first week. */
  const { payouts } = useCookPayouts();

  /* The cook's half of the meal ledger: money that has actually landed, and
     the cook's share still held against orders nobody has confirmed
     receiving — the share, not the plate price, because the platform's cut
     comes off before anything is released. */
  const mealOrders = kitchen ? meals.ordersForKitchen(kitchen.id) : [];
  const pending = mealOrders
    .filter(moneyHeld)
    .reduce((sum, o) => sum + cookPayout(o, payoutRates), 0);
  const mealLedger = meals.ledger.filter((tx) => tx.to === 'cook').slice().reverse();

  /*
   * Three piles, by where the money is.
   *
   * This used to keep `status === 'delivered'` and call it paid — which
   * dropped every `completed` order (the customer's confirmation is what
   * releases wallet money, so the finished escrow orders fell *out* of the
   * total the moment they were actually paid) and counted a delivered wallet
   * parcel as earned while its money was still held. The rails module says
   * which is which: released is earned, delivered-but-unconfirmed is held,
   * and the rest is still being cooked.
   *
   * All three are over the orders the app holds — the newest fifty — not the
   * kitchen's lifetime, and the headings below say so. The wire carries no
   * lifetime figure yet; the payout runs further down are the lifetime truth.
   */
  const mine = useMemo(() => ordersForKitchen(kitchen?.id), [ordersForKitchen, kitchen?.id]);
  const earned = useMemo(
    () =>
      mine
        .filter(moneyReleased)
        .slice()
        .sort(
          (a, b) =>
            new Date(settledAt(b) ?? b.createdAt ?? 0) - new Date(settledAt(a) ?? a.createdAt ?? 0),
        ),
    [mine],
  );
  const held = useMemo(() => mine.filter(moneyHeld), [mine]);
  const moving = useMemo(
    () => mine.filter((o) => inFlight(o) && o.status !== 'rejected' && o.status !== 'cancelled'),
    [mine],
  );

  const totals = useMemo(() => {
    const sum = (rows, f) => rows.reduce((s, o) => s + (Number(f(o)) || 0), 0);
    const gross = sum(earned, cookBase);
    const net = sum(earned, (o) => cookPayout(o, payoutRates));
    const thisWeek = new Set(recentDayKeys(7));
    const week = earned.filter((o) => thisWeek.has(dayKeyOf(settledAt(o) ?? o.createdAt)));

    return {
      gross,
      net,
      fee: Math.max(0, gross - net),
      orders: earned.length,
      heldNet: sum(held, (o) => cookPayout(o, payoutRates)),
      heldOrders: held.length,
      pendingNet: sum(moving, (o) => cookPayout(o, payoutRates)),
      pendingOrders: moving.length,
      weekNet: sum(week, (o) => cookPayout(o, payoutRates)),
      weekOrders: week.length,
      average: earned.length ? Math.round(net / earned.length) : 0,
      window: mine.length,
    };
  }, [earned, held, moving, mine.length, payoutRates]);

  /* Seven buckets, oldest first, so the bars read left-to-right like a week.
     By the Dhaka day the money was released — the same basis the dashboard's
     week uses, so the two screens agree about every bar. */
  const week = useMemo(() => {
    const keys = recentDayKeys(7);
    const buckets = keys.map((key) => ({
      start: key,
      label: WEEKDAY[new Date(`${key}T00:00:00Z`).getUTCDay()],
      amount: 0,
    }));

    for (const o of earned) {
      const idx = keys.indexOf(dayKeyOf(settledAt(o) ?? o.createdAt));
      if (idx >= 0) buckets[idx].amount += cookPayout(o, payoutRates);
    }
    return buckets;
  }, [earned, payoutRates]);

  const peak = Math.max(...week.map((b) => b.amount), 1);
  const recent = earned.slice(0, 6);

  /* The headline rate is the cash one — "every dish you sell" has always
     meant the menu — read live from the platform rather than a constant. */
  const dishRate = payoutRateFor('cod', payoutRates);

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('YOUR')}
          accent={t('EARNINGS')}
          subtitle={t('You keep {pct}% of every dish you sell.', {
            pct: num(Math.round(dishRate * 100)),
          })}
        />

        {/* ---- Meal wallet ----
            Kept apart from the block below on purpose. That one is cash a
            rider hands over on delivery; this is money that moved inside the
            app and is already yours. Adding them into one figure would tell
            a cook they have been paid when half of it is still in a customer's
            pocket. */}
        <Reveal delay={1}>
          <RowHeading icon="banknote" title={t('Meal wallet')} />
          <WalletCard
            label={t('Released to you')}
            amount={meals.wallet.cook}
            sub={pending || null}
            subLabel={t('Held until customers confirm delivery')}
            tone="sage"
          />

          {mealLedger.length ? (
            <View style={{ marginTop: 6, marginBottom: 28 }}>
              {mealLedger.slice(0, 6).map((tx) => (
                <LedgerRow
                  key={tx.id}
                  tx={tx}
                  title={
                    mealOrders.find((o) => o.id === tx.orderId)?.title ??
                    t('Meal payment')
                  }
                  when={formatOrderDate(tx.at, lang)}
                />
              ))}
            </View>
          ) : (
            <Body muted size={14} style={{ marginTop: 12, marginBottom: 28 }}>
              {t('Nothing released yet. Payment lands here when a customer confirms they got their meal.')}
            </Body>
          )}
        </Reveal>

        {/* ---- Earned ----
            Over the orders the app holds, and named as such: these are the
            last fifty or so, not the lifetime, and a heading that implied
            otherwise would have a cook comparing it against a bank statement. */}
        <Reveal delay={2}>
          <RowHeading
            icon="delivery"
            title={t('Recent orders')}
            action={totals.window ? t('Last {n} orders', { n: num(totals.window) }) : null}
            style={{ marginTop: 4 }}
          />
        </Reveal>
        <Reveal delay={2}>
          <LinearGradient
            colors={[colors.sage, colors.sage]}
            style={[{ borderRadius: 28, padding: 22, overflow: 'hidden' }, shadow.md]}
          >
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: type.micro,
                letterSpacing: type.micro * tracking.label,
                textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.86)',
              }}
            >
              {t('Earned, recent orders')}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                marginTop: 6,
                fontFamily: font.uiBold,
                fontSize: 44,
                lineHeight: 50,
                letterSpacing: -1.2,
                color: '#FFFFFF',
                fontVariant: ['tabular-nums'],
              }}
            >
              {taka(totals.net, num)}
            </Text>
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.sm,
                lineHeight: 20,
                color: 'rgba(255, 255, 255, 0.9)',
              }}
            >
              {t(totals.orders === 1 ? 'From {n} delivered order' : 'From {n} delivered orders', { n: num(totals.orders) })}
            </Text>

            {/* What is not in that number, and why. Held is earned and
                waiting on a customer; pending is still being cooked. A cook
                who sees only the released figure assumes the rest is lost. */}
            {totals.heldOrders || totals.pendingOrders ? (
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: font.ui,
                  fontSize: type.xs,
                  lineHeight: 18,
                  color: 'rgba(255, 255, 255, 0.86)',
                }}
              >
                {[
                  totals.heldOrders
                    ? t('৳{n} held until customers confirm ({count} orders)', {
                        n: num(Math.round(totals.heldNet).toLocaleString('en-US')),
                        count: num(totals.heldOrders),
                      })
                    : null,
                  totals.pendingOrders
                    ? t('৳{n} still in the pass ({count} orders)', {
                        n: num(Math.round(totals.pendingNet).toLocaleString('en-US')),
                        count: num(totals.pendingOrders),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}

            {/* The arithmetic in full. A payout number without the deduction
                beside it is the thing cooks distrust most. */}
            <View
              style={{
                marginTop: 18,
                borderRadius: radius.md,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.2)',
                padding: 14,
                gap: 9,
              }}
            >
              <SplitRow label={t('Food sales')} value={taka(totals.gross, num)} />
              {/* The share as a figure, not a percentage: the orders here are
                  of several kinds and the platform takes a different cut of
                  each, so one percentage would be wrong for some of them. */}
              <SplitRow label={t('Platform share')} value={`− ${taka(totals.fee, num)}`} />
              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.22)' }} />
              <SplitRow label={t('Your payout')} value={taka(totals.net, num)} strong />
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 14,
              }}
            >
              <Icon name="clock" size={14} color="#FFFFFF" />
              <Text
                style={{
                  flex: 1,
                  fontFamily: font.ui,
                  fontSize: type.xs,
                  lineHeight: 18,
                  color: 'rgba(255, 255, 255, 0.88)',
                }}
              >
                {t('Payouts run every Sunday to your bank or bKash.')}
              </Text>
            </View>
          </LinearGradient>
        </Reveal>

        {/* ---- Two numbers ---- */}
        <Reveal delay={2}>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <StatTile icon="activity" value={taka(totals.weekNet, num)} label={t('Last 7 days')} />
            <StatTile
              icon="receipt"
              value={taka(totals.average, num)}
              label={t('Per order')}
              variant="saffron"
            />
          </View>
        </Reveal>

        {/* ---- The week ---- */}
        <Reveal delay={3}>
          <View style={{ marginTop: 28 }}>
            <RowHeading
              icon="activity"
              title={t('This week')}
              action={totals.weekOrders ? t('{n} orders', { n: num(totals.weekOrders) }) : null}
            />

            <BentoBox style={{ padding: 20 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  height: 132,
                  gap: 8,
                }}
              >
                {week.map((b, i) => {
                  const today = i === week.length - 1;
                  /* A zero day still gets a 3px stub so the axis reads as
                     seven days rather than a gap. */
                  const h = b.amount ? Math.max(10, (b.amount / peak) * 112) : 3;

                  return (
                    <View key={b.start} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: 9,
                          color: b.amount ? colors.text : 'transparent',
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {b.amount >= 1000 ? `${num((b.amount / 1000).toFixed(1))}k` : num(b.amount)}
                      </Text>
                      <View
                        style={{
                          width: '100%',
                          height: h,
                          borderRadius: 7,
                          backgroundColor: b.amount
                            ? today
                              ? colors.sage
                              : colors.sage100
                            : colors.line,
                        }}
                      />
                      <Text
                        style={{
                          fontFamily: today ? font.uiBold : font.ui,
                          fontSize: 10,
                          color: today ? colors.sage : colors.textLight,
                        }}
                      >
                        {t(b.label)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </BentoBox>
          </View>
        </Reveal>

        {/* ---- Money that actually left ----
            This section is new, and the one below it used to carry its name.
            "Recent payouts" was a list of delivered orders — the cook's
            *balance*, itemised, wearing the word payout. Nothing in the app
            knew about a run: an operator marks one paid in the console, the
            taka goes to a bKash account, and the only trace on this side was
            a notification that scrolls away. A cook checking whether Sunday's
            money arrived had to ask somebody. */}
        {payouts.length ? (
          <View style={{ marginTop: 28 }}>
            <RowHeading icon="banknote" title={t('Paid to you')} />
            <View style={{ gap: 10 }}>
              {payouts.map((payout, i) => (
                <Reveal key={payout.id} delay={(i % 5) + 1}>
                  <View
                    style={[
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        padding: 14,
                        borderRadius: radius.lg,
                        backgroundColor: colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: colors.line,
                      },
                      shadow.sm,
                    ]}
                  >
                    <IconTile
                      name="check"
                      variant="sage"
                      style={{ width: 42, height: 42, borderRadius: 14 }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontFamily: font.uiSemi, fontSize: 15, color: colors.text }}
                      >
                        {t('Sent via {method}', { method: payout.method })}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {formatOrderDate(payout.paidAt, lang)} · {payout.code}
                      </Text>
                    </View>
                    <Price size={17}>৳{num(payout.amount)}</Price>
                  </View>
                </Reveal>
              ))}
            </View>
          </View>
        ) : null}

        {/* ---- Where it came from ---- */}
        <View style={{ marginTop: 28 }}>
          {/* Named for what it is. These are delivered orders — what the
              platform owes, order by order — and calling them payouts was the
              reason a cook could not tell owed from paid. */}
          <RowHeading icon="receipt" title={t('What you have earned')} />

          {!recent.length ? (
            <BentoBox style={{ padding: 28, alignItems: 'center', gap: 14 }}>
              <IconTile name="banknote" variant="sage" large />
              <Heading size={18} style={{ textAlign: 'center' }}>
                {t('Nothing delivered yet')}
              </Heading>
              <Body muted size={14} style={{ textAlign: 'center' }}>
                {t('An order counts toward your payout the moment you mark it delivered.')}
              </Body>
            </BentoBox>
          ) : (
            <View style={{ gap: 10 }}>
              {recent.map((o, i) => (
                <Reveal key={o.id} delay={(i % 5) + 1}>
                  <View
                    style={[
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        padding: 14,
                        borderRadius: radius.lg,
                        backgroundColor: colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: colors.line,
                      },
                      shadow.sm,
                    ]}
                  >
                    <IconTile
                      name="shieldCheck"
                      variant="sage"
                      style={{ width: 42, height: 42, borderRadius: 14 }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: 15,
                          color: colors.text,
                        }}
                      >
                        {o.contact?.name ?? o.id}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {formatOrderDate(settledAt(o) ?? o.createdAt, lang)}
                      </Text>
                    </View>
                    <Price size={17}>৳{num(cookPayout(o, payoutRates))}</Price>
                  </View>
                </Reveal>
              ))}
            </View>
          )}
        </View>
      </Container>
    </CookScreen>
  );
}

function SplitRow({ label, value, strong }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text
        style={{
          flex: 1,
          fontFamily: strong ? font.uiSemi : font.ui,
          fontSize: type.sm,
          color: strong ? '#FFFFFF' : 'rgba(255, 255, 255, 0.88)',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: strong ? 16 : type.sm,
          color: '#FFFFFF',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}
