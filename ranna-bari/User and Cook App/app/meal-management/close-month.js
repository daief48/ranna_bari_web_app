import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import MessScreen, { Container } from '../../src/features/meal-management/MessScreen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Icon from '../../src/components/Icon';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Divider,
  ErrorState,
  Field,
  GroupLabel,
  Loading,
  MemberRow,
  MiniButton,
  MonthPicker,
  Panel,
  RateCard,
  Row,
  Sheet,
  StatTile,
  TileGrid,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { mealErrorText, useMealAction } from '../../src/features/meal-management/errors';
import {
  balanceText,
  balanceTone,
  mealText,
  monthLabel,
  takaText,
} from '../../src/features/meal-management/format';

/**
 * Settling the month. §4.8.
 *
 * The most consequential button in the module, so the screen is built to be
 * read before it is pressed: the review comes first, the warnings are listed
 * rather than blocking, and the settlement is shown in full underneath.
 *
 * Only the empty-month case actually stops anybody. §4.8's own step list has
 * "review pending approvals and anomalies" as a step, not a gate — a mess
 * that wants to settle with one bazar still unapproved is allowed to, and is
 * told exactly what it is leaving behind.
 */
export default function CloseMonth() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { month, changeMonth, getClosingReview, closeMonth, postAdjustment } =
    useMealManagement();

  const [review, setReview] = useState(null);
  const [failure, setFailure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [adjusting, setAdjusting] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const out = await getClosingReview(month);
    if (out.ok) {
      setReview(out.result);
      setFailure(null);
    } else {
      setFailure(out);
      setReview(null);
    }
    setLoading(false);
  }, [getClosingReview, month]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const settle = async () => {
    setBusy(true);
    const out = await run(
      () => closeMonth(month),
      t('{month} is settled.', { month: monthLabel(month, lang) }),
    );
    setBusy(false);
    setConfirming(false);
    if (out?.ok) router.replace(`/meal-management/reports/settlement`);
  };

  const statement = review?.statement;
  const warnings = review?.warnings ?? {};
  const waiting =
    (warnings.pendingBazar ?? 0) +
    (warnings.pendingExpenses ?? 0) +
    (warnings.pendingDeposits ?? 0) +
    (warnings.pendingCorrections ?? 0);

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('SETTLE')}
          accent={t('THE MONTH')}
          subtitle={t('Freeze the figures and produce every bill.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

        {loading ? (
          <Loading />
        ) : failure ? (
          <View style={{ marginTop: 18 }}>
            <ErrorState message={mealErrorText(failure, t, n)} onRetry={fetch} />
          </View>
        ) : !review ? null : (
          <>
            {/* ---- what would be frozen ---- */}
            <View style={{ marginTop: 18 }}>
              <RateCard
                mealRate={statement.mealRate}
                foodCost={statement.foodCost}
                totalMeals={statement.totalMeals}
              />
            </View>

            <View style={{ marginTop: 16 }}>
              <TileGrid>
                <StatTile value={n(mealText(statement.totalMeals))} label={t('Total meals')} />
                <StatTile value={`৳${n(takaText(statement.totalCost))}`} label={t('Total cost')} />
                <StatTile
                  value={`৳${n(takaText(statement.totalDeposits))}`}
                  label={t('Deposits')}
                  tone="good"
                />
                <StatTile value={n(statement.members.length)} label={t('Members billed')} />
              </TileGrid>
            </View>

            {/* ---- §4.8's review step ---- */}
            <View style={{ marginTop: 20, gap: 10 }}>
              <GroupLabel text={t('Before you settle')} />

              {review.blockers?.empty ? (
                <Panel tone="bad" style={{ gap: 5 }}>
                  <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.primary }}>
                    {t('There is nothing to settle')}
                  </Text>
                  <Body muted style={{ fontSize: type.xs }}>
                    {t('No meals and no costs were recorded in this month.')}
                  </Body>
                </Panel>
              ) : null}

              {waiting ? (
                <Panel tone="warn" style={{ gap: 8 }}>
                  <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.saffron }}>
                    {t('{n} records are still waiting', { n: n(waiting) })}
                  </Text>
                  {warnings.pendingBazar ? (
                    <Row label={t('Bazar entries')} value={n(warnings.pendingBazar)} tone="warn" />
                  ) : null}
                  {warnings.pendingExpenses ? (
                    <Row label={t('Expenses')} value={n(warnings.pendingExpenses)} tone="warn" />
                  ) : null}
                  {warnings.pendingDeposits ? (
                    <Row label={t('Deposits')} value={n(warnings.pendingDeposits)} tone="warn" />
                  ) : null}
                  {warnings.pendingCorrections ? (
                    <Row label={t('Meal corrections')} value={n(warnings.pendingCorrections)} tone="warn" />
                  ) : null}
                  <Body muted style={{ fontSize: type.xs }}>
                    {t(
                      'Anything not approved is left out of the settlement, and cannot be approved afterwards. Decide them first if they belong in this month.',
                    )}
                  </Body>
                </Panel>
              ) : (
                <Panel tone="good" style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="check" size={18} color={colors.sage} />
                  <Text style={{ flex: 1, fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
                    {t('Everything has been decided')}
                  </Text>
                </Panel>
              )}

              {warnings.residual ? (
                <Panel tone="warn" style={{ gap: 5 }}>
                  <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.saffron }}>
                    {t('৳{n} will not divide evenly', { n: n(takaText(warnings.residual)) })}
                  </Text>
                  <Body muted style={{ fontSize: type.xs }}>
                    {t('Rounding the meal rate leaves this over. It is recorded rather than hidden.')}
                  </Body>
                </Panel>
              ) : null}
            </View>

            {/* ---- the settlement itself ---- */}
            <View style={{ marginTop: 20, gap: 10 }}>
              <GroupLabel text={t('What each member ends up with')} />

              <Panel style={{ gap: 2 }}>
                {statement.members.map((row) => (
                  <MemberRow
                    key={row.memberId}
                    name={row.name}
                    sub={t('{meals} meals · ৳{charge} charged', {
                      meals: n(mealText(row.meals)),
                      charge: n(takaText(row.totalCharge)),
                    })}
                    value={balanceText(row.balance, t)}
                    tone={balanceTone(row.balance)}
                    onPress={() => setAdjusting(row)}
                  />
                ))}
              </Panel>

              {review.settlement?.due?.length ? (
                <Panel style={{ gap: 2 }}>
                  <GroupLabel text={t('To collect')} />
                  {review.settlement.due.map((row) => (
                    <Row key={row.memberId} label={row.name} value={`৳${n(takaText(row.amount))}`} tone="bad" />
                  ))}
                </Panel>
              ) : null}

              {review.settlement?.refund?.length ? (
                <Panel style={{ gap: 2 }}>
                  <GroupLabel text={t('To refund')} />
                  {review.settlement.refund.map((row) => (
                    <Row key={row.memberId} label={row.name} value={`৳${n(takaText(row.amount))}`} tone="good" />
                  ))}
                </Panel>
              ) : null}
            </View>

            {/* ---- the button ---- */}
            <View style={{ marginTop: 22, gap: 10, marginBottom: 8 }}>
              <Panel style={{ gap: 6 }}>
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
                  {t('What settling does')}
                </Text>
                <Body muted style={{ fontSize: type.xs }}>
                  {t(
                    'The figures above are written down and never recalculated. Meals, expenses and deposits in this month can no longer be changed. Balances carry into next month, and a mistake found later becomes an adjustment rather than an edit.',
                  )}
                </Body>
              </Panel>

              <Button
                label={t('Settle {month}', { month: monthLabel(month, lang) })}
                onPress={() => setConfirming(true)}
                disabled={busy || !!review.blockers?.empty}
                block
              />
            </View>
          </>
        )}
      </Container>

      {/* ---- confirmation, because this cannot be undone ---- */}
      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('Settle {month}?', { month: monthLabel(month, lang) })}
        footer={
          <View style={{ gap: 9 }}>
            <Button label={t('Yes, settle it')} onPress={settle} disabled={busy} block />
            <MiniButton label={t('Not yet')} tone="plain" onPress={() => setConfirming(false)} />
          </View>
        }
      >
        <Panel tone="warn" style={{ gap: 6 }}>
          <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.saffron }}>
            {t('This cannot be undone')}
          </Text>
          <Body muted style={{ fontSize: type.xs }}>
            {t('There is no reopening a settled month. Corrections afterwards are adjustments, which everybody can see.')}
          </Body>
        </Panel>

        {statement ? (
          <>
            <Row label={t('Meal rate')} value={`৳${n(takaText(statement.mealRate))}`} strong />
            <Row label={t('Total meals')} value={n(mealText(statement.totalMeals))} />
            <Row label={t('Total cost')} value={`৳${n(takaText(statement.totalCost))}`} />
            <Divider />
            <Row label={t('Members billed')} value={n(statement.members.length)} />
            {waiting ? (
              <Row label={t('Records left waiting')} value={n(waiting)} tone="warn" strong />
            ) : null}
          </>
        ) : null}
      </Sheet>

      <AdjustSheet
        member={adjusting}
        month={month}
        onClose={() => setAdjusting(null)}
        onSubmit={async (body) => {
          const out = await run(() => postAdjustment(body), t('Adjustment recorded.'));
          if (out?.ok) {
            setAdjusting(null);
            await fetch();
          }
          return out;
        }}
      />
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * §4.8's controlled adjustment
 * ------------------------------------------------------------------ */

function AdjustSheet({ member, month, onClose, onSubmit }) {
  const { t } = useLang();

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!member) return null;

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      month,
      memberId: member.memberId,
      amount: Number(amount) || 0,
      reason: reason.trim(),
    });
    setBusy(false);
    setAmount('');
    setReason('');
  };

  return (
    <Sheet
      open={!!member}
      onClose={onClose}
      title={t('Adjust {name}', { name: member.name })}
      footer={
        <Button
          label={t('Record the adjustment')}
          onPress={submit}
          disabled={busy || !Number(amount) || !reason.trim()}
          block
        />
      }
    >
      <Field
        label={t('Amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numbers-and-punctuation"
        suffix="৳"
        placeholder="0"
        hint={t('Positive credits them, negative charges them.')}
      />

      <Field
        label={t('Why')}
        value={reason}
        onChangeText={setReason}
        placeholder={t('e.g. double-counted a guest meal')}
        multiline
        maxLength={500}
      />

      <Body muted style={{ fontSize: 12 }}>
        {t(
          'An adjustment does not change the month’s figures. It is its own line on the member’s statement, with your name and this reason on it.',
        )}
      </Body>
    </Sheet>
  );
}
