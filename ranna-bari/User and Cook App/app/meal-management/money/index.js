import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BottomNav,
  Divider,
  GroupLabel,
  Loading,
  MemberRow,
  Meter,
  MonthPicker,
  NavRow,
  Panel,
  RateCard,
  Row,
  StatTile,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import {
  balanceText,
  balanceTone,
  dayLabel,
  mealText,
  METHOD_TEXT,
  takaText,
} from '../../../src/features/meal-management/format';

/**
 * Money. §6's Money tab, over §4.4, §4.5 and §4.6.
 *
 * The landing screen answers the one question a member actually has — *what do
 * I owe?* — and shows the arithmetic that produced it directly underneath.
 * §13 asks that every amount be traceable to meals, approved expenses,
 * deposits and explicit rules, so the rate card is not an extra: it is the
 * working that makes the balance above it checkable.
 */
export default function Money() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();

  const { month, changeMonth, dashboard, load } = useMealManagement();
  const { data, loading } = useSlice('balance');
  const summary = useSlice('summary');

  useFocusEffect(
    useCallback(() => {
      load.balance({ force: true });
      load.summary({ force: true });
    }, [load]),
  );

  const me = data?.me ?? null;
  const mess = data?.mess ?? null;
  const stmt = summary.data;
  const closed = !!stmt?.closed;
  const pending = dashboard?.pendingApprovals ?? {};

  return (
    <MessScreen footer={<BottomNav active="money" badges={{ money: pending.total || 0 }} />}>
      <Container>
        <SectionHeader
          lead={t('THE')}
          accent={t('MONEY')}
          subtitle={t('What was spent, what was paid, and where you stand.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} closed={closed} />
        </View>

        {loading && !data ? (
          <Loading />
        ) : (
          <>
            {/* ---- my balance ---- */}
            <Panel
              tone={balanceTone(me?.balance)}
              style={{ marginTop: 18, gap: 10 }}
            >
              <GroupLabel text={t('Where I stand')} />
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: 32,
                  color: (me?.balance ?? 0) >= 0 ? colors.sage : colors.primary,
                }}
              >
                {balanceText(me?.balance, t)}
              </Text>

              <Divider />

              <Row label={t('Meals taken')} value={n(mealText(me?.meals ?? 0))} />
              <Row label={t('Food cost')} value={`৳${n(takaText(me?.foodCost ?? 0))}`} />
              {me?.otherCost ? (
                <Row label={t('Share of other costs')} value={`৳${n(takaText(me.otherCost))}`} />
              ) : null}
              <Row label={t('Total charged')} value={`৳${n(takaText(me?.totalCharge ?? 0))}`} strong />
              <Row label={t('Deposited')} value={`৳${n(takaText(me?.deposits ?? 0))}`} tone="good" />
              {me?.carriedIn ? (
                <Row
                  label={t('Carried in from last month')}
                  value={`৳${n(takaText(me.carriedIn))}`}
                  tone={me.carriedIn >= 0 ? 'good' : 'bad'}
                />
              ) : null}
              {me?.adjustments ? (
                <Row label={t('Adjustments')} value={`৳${n(takaText(me.adjustments))}`} tone="warn" />
              ) : null}
            </Panel>

            {/* ---- the rate that produced it ---- */}
            {stmt ? (
              <View style={{ marginTop: 16 }}>
                <RateCard
                  mealRate={stmt.mealRate}
                  foodCost={stmt.foodCost}
                  totalMeals={stmt.totalMeals}
                  formula={stmt.formula}
                />
              </View>
            ) : null}

            {/* ---- ways in ---- */}
            <View style={{ marginTop: 20, gap: 10 }}>
              <NavRow
                icon="receipt"
                title={t('Expenses')}
                sub={t('Bazar, gas, rent and everything else')}
                badge={pending.expenses}
                onPress={() => router.push('/meal-management/money/expenses')}
              />
              <NavRow
                icon="banknote"
                title={t('Deposits')}
                sub={t('Money members have put in')}
                badge={pending.deposits}
                onPress={() => router.push('/meal-management/money/deposits')}
              />
              <NavRow
                icon="cart"
                title={t('Bazar')}
                sub={t('Shopping trips and their receipts')}
                badge={pending.bazar}
                onPress={() => router.push('/meal-management/bazar')}
              />
            </View>

            {/* ---- my recent payments ---- */}
            {data?.recentDeposits?.length ? (
              <View style={{ marginTop: 22, gap: 10 }}>
                <GroupLabel text={t('My recent payments')} />
                <Panel style={{ gap: 0 }}>
                  {data.recentDeposits.map((deposit) => (
                    <Row
                      key={deposit.id}
                      label={`${dayLabel(deposit.date, lang)} · ${t(METHOD_TEXT[deposit.method] ?? deposit.method)}`}
                      value={`৳${n(takaText(deposit.amount))}`}
                      tone="good"
                    />
                  ))}
                </Panel>
              </View>
            ) : null}

            {/* ---- the mess's books, for whoever may see them ---- */}
            {mess ? (
              <View style={{ marginTop: 22, gap: 10 }}>
                <GroupLabel text={t('The mess this month')} />

                <TileGrid>
                  <StatTile value={`৳${n(takaText(stmt?.totalCost ?? 0))}`} label={t('Total cost')} />
                  <StatTile
                    value={`৳${n(takaText(mess.totalDeposits))}`}
                    label={t('Total deposits')}
                    tone="good"
                  />
                  <StatTile value={`৳${n(takaText(mess.totalCharged))}`} label={t('Total charged')} />
                  <StatTile
                    value={`৳${n(takaText(mess.balance))}`}
                    label={t('Held by the mess')}
                    tone={mess.balance >= 0 ? 'good' : 'bad'}
                  />
                </TileGrid>

                {stmt?.categories?.length ? (
                  <Panel style={{ gap: 10 }}>
                    <GroupLabel text={t('Where the money went')} />
                    {stmt.categories.map((category) => (
                      <View key={category.key} style={{ gap: 5 }}>
                        <Row
                          label={category.label}
                          value={`৳${n(takaText(category.amount))}`}
                          tone={category.foodCost ? 'good' : undefined}
                        />
                        <Meter
                          value={category.amount}
                          max={stmt.categories[0].amount}
                          tone={category.foodCost ? 'good' : 'warn'}
                        />
                      </View>
                    ))}
                    <Body muted style={{ fontSize: type.xs }}>
                      {t(
                        'Green counts toward the meal rate, so it falls on whoever ate. The rest is split its own way.',
                      )}
                    </Body>
                  </Panel>
                ) : null}

                {stmt?.members?.length ? (
                  <Panel style={{ gap: 2 }}>
                    <GroupLabel text={t('Every member')} />
                    {stmt.members.map((row) => (
                      <MemberRow
                        key={row.memberId}
                        name={row.name}
                        sub={t('{meals} meals · ৳{charged} charged', {
                          meals: n(mealText(row.meals)),
                          charged: n(takaText(row.totalCharge)),
                        })}
                        value={balanceText(row.balance, t)}
                        tone={balanceTone(row.balance)}
                      />
                    ))}
                  </Panel>
                ) : null}
              </View>
            ) : null}

            {stmt?.residual ? (
              <Panel tone="warn" style={{ marginTop: 16, gap: 5, marginBottom: 8 }}>
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.saffron }}>
                  {t('৳{n} unaccounted', { n: n(takaText(stmt.residual)) })}
                </Text>
                <Body muted style={{ fontSize: type.xs }}>
                  {t(
                    'The difference between what the mess spent and what it charged. Rounding the meal rate leaves a little over or under.',
                  )}
                </Body>
              </Panel>
            ) : (
              <View style={{ marginBottom: 8 }} />
            )}
          </>
        )}
      </Container>
    </MessScreen>
  );
}
