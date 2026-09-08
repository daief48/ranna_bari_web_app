import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';
import { useSession } from '../../src/store/SessionContext';

import {
  Badge,
  BottomNav,
  Chip,
  Divider,
  Empty,
  ErrorState,
  GroupLabel,
  Loading,
  MealToggle,
  MemberRow,
  Meter,
  MonthPicker,
  NavRow,
  Panel,
  Row,
  StatTile,
  TileGrid,
} from '../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import {
  balanceText,
  balanceTone,
  clockLabel,
  dayLabel,
  mealText,
  rateText,
  takaText,
  untilLabel,
} from '../../src/features/meal-management/format';

/**
 * The dashboard. §4.7.
 *
 * The specification splits this into an admin list and a member list, and
 * about half of each is the same figure. So the screen draws one page and lets
 * the permission set decide what appears: a member sees their own standing and
 * the shared figures behind it, an admin sees the mess's totals underneath.
 * There is no separate admin screen to keep in step.
 *
 * The most-used control on the whole feature sits at the top — today's meals,
 * one tap each — because that is what somebody opens this for on twenty-eight
 * days out of thirty.
 */
export default function MealDashboard() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const { token } = useSession();
  const run = useMealAction();

  const {
    booting,
    messes,
    mess,
    month,
    changeMonth,
    today,
    dashboard,
    mealTypes,
    can,
    setMeal,
    load,
  } = useMealManagement();

  const { data, loading, error, reload } = useSlice('dashboard');

  useFocusEffect(
    useCallback(() => {
      load.dashboard({ force: true });
    }, [load]),
  );

  /* ---- the states before there is a mess to show ---- */

  if (!token) {
    return (
      <Screen>
        <Container>
          <SectionHeader
            lead={t('MEAL')}
            accent={t('MANAGEMENT')}
            subtitle={t('Track meals, bazar, expenses and the monthly rate.')}
            style={{ marginTop: 16 }}
          />
          <Empty
            icon="user"
            title={t('Sign in to use meal management')}
            hint={t('Your mess, your meals and your balance all live with your account.')}
            action={() => router.push('/auth')}
            actionLabel={t('Sign in')}
          />
        </Container>
      </Screen>
    );
  }

  if (booting || messes === null) {
    return (
      <Screen>
        <Container>
          <Loading label={t('Opening your mess…')} />
        </Container>
      </Screen>
    );
  }

  const active = messes.filter((m) => m.status === 'active');

  if (!active.length) {
    return (
      <Screen>
        <Container>
          <SectionHeader
            lead={t('MEAL')}
            accent={t('MANAGEMENT')}
            subtitle={t('Track meals, bazar, expenses and the monthly rate.')}
            style={{ marginTop: 16 }}
          />

          {messes.some((m) => m.status === 'pending') ? (
            <Panel tone="warn" style={{ gap: 6, marginTop: 18 }}>
              <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.saffron }}>
                {t('Your join request is waiting')}
              </Text>
              <Body muted>{t('An admin of that mess has to approve you before you can start.')}</Body>
            </Panel>
          ) : null}

          <View style={{ marginTop: 18 }}>
            <Empty
              icon="home"
              title={t('You are not in a mess yet')}
              hint={t('Create one for your flat or hostel, or join an existing one with its code.')}
              action={() => router.push('/meal-management/onboard')}
              actionLabel={t('Create or join a mess')}
            />
          </View>
        </Container>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Container>
          <ErrorState message={t('This mess could not be opened.')} onRetry={reload} />
        </Container>
      </Screen>
    );
  }

  if (loading || !data) {
    return (
      <Screen footer={<BottomNav active="dashboard" />}>
        <Container>
          <Loading label={t('Loading your mess…')} />
        </Container>
      </Screen>
    );
  }

  /* ---- the dashboard proper ---- */

  const me = data.me ?? {};
  const totals = data.mess_totals;
  const pending = data.pendingApprovals ?? {};
  const closed = !!data.closed;
  const isToday = data.today === today;

  const menuFor = (key) => data.menu?.find((row) => row.mealType === key)?.items ?? [];
  const lockedToday = closed ? mealTypes.map((type_) => type_.key) : [];

  const toggle = (key, value) => run(() => setMeal(data.today, { values: { [key]: value } }));
  const guests = (key, value) => run(() => setMeal(data.today, { guests: { [key]: value } }));

  return (
    <Screen footer={<BottomNav active="dashboard" badges={{ money: pending.total || 0 }} />}>
      <Container>
        <SectionHeader
          lead={mess?.name?.split(' ')[0]?.toUpperCase() ?? t('MY')}
          accent={t('MESS')}
          subtitle={t('{role} · {name}', {
            role: t(data.mess?.role === 'admin' ? 'Admin' : data.mess?.role === 'coadmin' ? 'Co-admin' : 'Member'),
            name: mess?.name ?? '',
          })}
          style={{ marginTop: 16 }}
          right={
            active.length > 1 ? (
              <Chip
                label={t('Switch')}
                icon="home"
                onPress={() => router.push('/meal-management/onboard')}
              />
            ) : null
          }
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} closed={closed} />
        </View>

        {/* ---- today's meals: the reason most people opened this ---- */}
        {isToday ? (
          <View style={{ marginTop: 20, gap: 10 }}>
            <GroupLabel
              text={t('Today · {day}', { day: dayLabel(data.today, lang) })}
              right={
                data.nextCutoff ? (
                  <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.saffron }}>
                    {t('{meal} closes {when}', {
                      meal: mealTypes.find((m) => m.key === data.nextCutoff.key)?.label ?? '',
                      when: untilLabel(data.nextCutoff.minutesAway, t),
                    })}
                  </Text>
                ) : null
              }
            />

            {closed ? (
              <Panel tone="warn" style={{ gap: 4 }}>
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.saffron }}>
                  {t('This month is settled')}
                </Text>
                <Body muted>{t('Its meals are frozen, so the final rate cannot move.')}</Body>
              </Panel>
            ) : null}

            {mealTypes.map((type_) => (
              <MealToggle
                key={type_.key}
                label={t(type_.label)}
                value={me.todayValues?.[type_.key] ?? 0}
                guests={me.todayGuests?.[type_.key] ?? 0}
                allowedValues={data.allowedValues ?? [1]}
                menu={menuFor(type_.key)}
                locked={lockedToday.includes(type_.key) || (data.locked ?? []).includes(type_.key)}
                onSet={(value) => toggle(type_.key, value)}
                onGuests={(value) => guests(type_.key, value)}
              />
            ))}
          </View>
        ) : null}

        {/* ---- my standing ---- */}
        <View style={{ marginTop: 22, gap: 10 }}>
          <GroupLabel text={t('My month')} />

          <TileGrid>
            <StatTile value={n(mealText(me.meals ?? 0))} label={t('Meals taken')} />
            <StatTile
              value={`৳${n(rateText(data.mealRate))}`}
              label={t('Meal rate')}
              hint={t('per meal')}
            />
            <StatTile value={`৳${n(takaText(me.totalCharge ?? 0))}`} label={t('Charged to me')} />
            <StatTile
              value={`৳${n(takaText(me.deposits ?? 0))}`}
              label={t('Deposited')}
              onPress={() => router.push('/meal-management/money/deposits')}
            />
          </TileGrid>

          <Panel tone={balanceTone(me.balance)} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
                {t('Where I stand')}
              </Text>
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: type.h3,
                  color:
                    (me.balance ?? 0) >= 0 ? colors.sage : colors.primary,
                }}
              >
                {balanceText(me.balance, t)}
              </Text>
            </View>
            <Body muted>
              {t('৳{charge} charged against ৳{deposit} deposited.', {
                charge: n(takaText(me.totalCharge ?? 0)),
                deposit: n(takaText(me.deposits ?? 0)),
              })}
            </Body>
            <Divider />
            <Row label={t('Food cost')} value={`৳${n(takaText(me.foodCost ?? 0))}`} />
            {me.otherCost ? (
              <Row label={t('Share of other costs')} value={`৳${n(takaText(me.otherCost))}`} />
            ) : null}
            {me.guestMeals ? (
              <Row label={t('Guest meals')} value={n(mealText(me.guestMeals))} />
            ) : null}
          </Panel>
        </View>

        {/* ---- what needs somebody ---- */}
        {pending.total ? (
          <View style={{ marginTop: 22, gap: 10 }}>
            <GroupLabel
              text={t('Waiting for a decision')}
              right={<Badge count={pending.total} />}
            />
            {pending.bazar ? (
              <NavRow
                icon="cart"
                title={t('Bazar entries')}
                sub={t('{n} waiting for approval', { n: n(pending.bazar) })}
                badge={pending.bazar}
                tone="warn"
                onPress={() => router.push('/meal-management/bazar?status=submitted')}
              />
            ) : null}
            {pending.expenses ? (
              <NavRow
                icon="receipt"
                title={t('Expenses')}
                sub={t('{n} waiting for approval', { n: n(pending.expenses) })}
                badge={pending.expenses}
                tone="warn"
                onPress={() => router.push('/meal-management/money/expenses?status=submitted')}
              />
            ) : null}
            {pending.deposits ? (
              <NavRow
                icon="banknote"
                title={t('Deposits')}
                sub={t('{n} waiting for approval', { n: n(pending.deposits) })}
                badge={pending.deposits}
                tone="warn"
                onPress={() => router.push('/meal-management/money/deposits?status=submitted')}
              />
            ) : null}
            {pending.corrections ? (
              <NavRow
                icon="clock"
                title={t('Meal corrections')}
                sub={t('{n} waiting', { n: n(pending.corrections) })}
                badge={pending.corrections}
                tone="warn"
                onPress={() => router.push('/meal-management/meals/requests')}
              />
            ) : null}
          </View>
        ) : null}

        {/* ---- today's mess ---- */}
        <View style={{ marginTop: 22, gap: 10 }}>
          <GroupLabel text={t('The mess today')} />

          <Panel style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
                {t('Plates to cook')}
              </Text>
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: type.h3,
                  color: colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {n(mealText(data.todayMeals?.total ?? 0))}
              </Text>
            </View>

            {mealTypes.map((type_) => (
              <Row
                key={type_.key}
                label={t(type_.label)}
                value={n(mealText(data.todayMeals?.byType?.[type_.key] ?? 0))}
              />
            ))}

            {data.nextCutoff ? (
              <>
                <Divider />
                <Row
                  label={t('Next cutoff')}
                  value={`${mealTypes.find((m) => m.key === data.nextCutoff.key)?.label ?? ''} · ${clockLabel(data.nextCutoff.cutoff)}`}
                  tone="warn"
                />
              </>
            ) : null}
          </Panel>

          {data.todayDuty ? (
            <Panel tone={data.todayDuty.mine ? 'warn' : undefined} style={{ gap: 4 }}>
              <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
                {data.todayDuty.mine ? t('You have bazar duty today') : t('Bazar duty today')}
              </Text>
              <Body muted>{data.todayDuty.name}</Body>
            </Panel>
          ) : null}
        </View>

        {/* ---- the mess's own figures, for whoever may see them ---- */}
        {totals ? (
          <View style={{ marginTop: 22, gap: 10 }}>
            <GroupLabel
              text={t('The mess this month')}
              right={
                <Chip
                  label={t('Reports')}
                  icon="receipt"
                  onPress={() => router.push('/meal-management/reports')}
                />
              }
            />

            <TileGrid>
              <StatTile value={n(totals.members)} label={t('Members')} />
              <StatTile value={n(mealText(data.totalMeals))} label={t('Total meals')} />
              <StatTile value={`৳${n(takaText(data.totalCost))}`} label={t('Total cost')} />
              <StatTile
                value={`৳${n(takaText(totals.totalDeposits))}`}
                label={t('Total deposits')}
                tone="good"
              />
            </TileGrid>

            <Panel style={{ gap: 4 }}>
              <GroupLabel text={t('Balances')} />
              {totals.memberBalances.slice(0, 6).map((row) => (
                <MemberRow
                  key={row.memberId}
                  name={row.name}
                  sub={t('{n} meals', { n: n(mealText(row.meals)) })}
                  value={balanceText(row.balance, t)}
                  tone={balanceTone(row.balance)}
                />
              ))}
              {totals.memberBalances.length > 6 ? (
                <Row
                  label={t('See every member')}
                  value=""
                  onPress={() => router.push('/meal-management/reports/bills')}
                />
              ) : null}
            </Panel>

            {totals.categories?.length ? (
              <Panel style={{ gap: 10 }}>
                <GroupLabel text={t('Where the money went')} />
                {totals.categories.slice(0, 5).map((category) => (
                  <View key={category.key} style={{ gap: 5 }}>
                    <Row
                      label={category.label}
                      value={`৳${n(takaText(category.amount))}`}
                      tone={category.foodCost ? 'good' : undefined}
                    />
                    <Meter
                      value={category.amount}
                      max={totals.categories[0].amount}
                      tone={category.foodCost ? 'good' : 'warn'}
                    />
                  </View>
                ))}
                <Body muted style={{ fontSize: type.xs }}>
                  {t('Green counts toward the meal rate. The rest is split its own way.')}
                </Body>
              </Panel>
            ) : null}
          </View>
        ) : null}

        {/* ---- quick ways on ---- */}
        <View style={{ marginTop: 22, gap: 10, marginBottom: 8 }}>
          <GroupLabel text={t('Go to')} />

          <NavRow
            icon="calendar"
            title={t('Meal calendar')}
            sub={t('Every day of the month, and what you took')}
            onPress={() => router.push('/meal-management/meals/calendar')}
          />
          <NavRow
            icon="bell"
            title={t('Notice board')}
            sub={t('Announcements from the mess')}
            badge={data.unreadNotices}
            onPress={() => router.push('/meal-management/board/notices')}
          />
          <NavRow
            icon="sparkles"
            title={t('Ask the assistant')}
            sub={t('“Turn my dinner off tomorrow”')}
            onPress={() => router.push('/meal-management/assistant')}
          />
          {can('close_month') && !closed ? (
            <NavRow
              icon="shieldCheck"
              title={t('Settle this month')}
              sub={t('Freeze the figures and produce every bill')}
              tone="good"
              onPress={() => router.push('/meal-management/close-month')}
            />
          ) : null}
        </View>
      </Container>
    </Screen>
  );
}
