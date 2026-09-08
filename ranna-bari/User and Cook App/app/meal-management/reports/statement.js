import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BackLink,
  Divider,
  ErrorState,
  GroupLabel,
  Loading,
  MiniButton,
  MonthPicker,
  Panel,
  Row,
} from '../../../src/features/meal-management/components';
import { useMealManagement } from '../../../src/features/meal-management/store';
import { mealErrorText, useMealAction } from '../../../src/features/meal-management/errors';
import { copyText } from '../../../src/features/meal-management/share';
import {
  METHOD_TEXT,
  balanceText,
  balanceTone,
  dayLabel,
  mealText,
  rateText,
  takaText,
} from '../../../src/features/meal-management/format';

/**
 * One member's statement. §4.9, and §13's whole argument.
 *
 * The `workings` block is the point of the screen: the same figures the bill
 * shows, written out as the sentences that produced them. §13 asks that every
 * amount shown be traceable to meals, approved expenses, deposits and explicit
 * rules — a member who can read the division cannot be argued out of it, and
 * neither can the mess.
 */
export default function Statement() {
  const params = useLocalSearchParams();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { month, changeMonth, mealTypes, getMemberStatement } = useMealManagement();

  const memberId = typeof params.memberId === 'string' ? params.memberId : undefined;

  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const out = await getMemberStatement(month, memberId);
    if (out.ok) {
      setData(out.result);
      setFailure(null);
    } else {
      setFailure(out);
      setData(null);
    }
    setLoading(false);
  }, [getMemberStatement, month, memberId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  /* `data.deposits` is the list of rows; the bill's own deposit figure is
     overwritten by it, so the total is summed here. */
  const depositTotal = (data?.deposits ?? []).reduce(
    (sum, deposit) => sum + (Number(deposit.amount) || 0),
    0,
  );

  const copy = async () => {
    if (!data) return;
    const lines = [
      `${data.name} — ${month}`,
      ...(data.workings ?? []),
    ].join('\n');
    await copyText(lines);
    run(() => Promise.resolve({ ok: true }), t('Statement copied.'));
  };

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/reports" />

        <SectionHeader
          lead={t('MY')}
          accent={t('STATEMENT')}
          subtitle={data?.name}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} closed={!!data?.closed} />
        </View>

        {loading ? (
          <Loading />
        ) : failure ? (
          <View style={{ marginTop: 18 }}>
            <ErrorState message={mealErrorText(failure, t, n)} onRetry={fetch} />
          </View>
        ) : !data ? null : (
          <>
            {/* ---- the answer ---- */}
            <Panel tone={balanceTone(data.balance)} style={{ marginTop: 18, gap: 8 }}>
              <GroupLabel text={t('Balance')} />
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: 32,
                  color: (data.balance ?? 0) >= 0 ? colors.sage : colors.primary,
                }}
              >
                {balanceText(data.balance, t)}
              </Text>
              {data.closed ? (
                <Body muted style={{ fontSize: type.xs }}>
                  {t('This month is settled, so this figure is final.')}
                </Body>
              ) : (
                <Body muted style={{ fontSize: type.xs }}>
                  {t('This month is still open, so this figure will move.')}
                </Body>
              )}
            </Panel>

            {/* ---- the working ---- */}
            <Panel style={{ marginTop: 16, gap: 8 }}>
              <GroupLabel text={t('How it was worked out')} />
              {(data.workings ?? []).map((line, index) => (
                <View
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}
                >
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: type.xs,
                      color: colors.textMuted,
                      minWidth: 16,
                    }}
                  >
                    {index + 1}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: index === (data.workings.length - 1) ? font.uiSemi : font.ui,
                      fontSize: type.sm,
                      lineHeight: type.sm * 1.5,
                      color: index === (data.workings.length - 1) ? colors.text : colors.textMuted,
                    }}
                  >
                    {line}
                  </Text>
                </View>
              ))}

              <MiniButton label={t('Copy this')} icon="copy" tone="plain" onPress={copy} />
            </Panel>

            {/* ---- the meals behind it ---- */}
            <Panel style={{ marginTop: 16, gap: 0 }}>
              <GroupLabel text={t('My meals')} style={{ marginBottom: 6 }} />
              {mealTypes.map((type_) =>
                data.byType?.[type_.key] ? (
                  <Row
                    key={type_.key}
                    label={t(type_.label)}
                    value={n(mealText(data.byType[type_.key]))}
                  />
                ) : null,
              )}
              {data.guestMeals ? (
                <Row label={t('Guest meals')} value={n(mealText(data.guestMeals))} />
              ) : null}
              <Divider />
              <Row label={t('Meals counted')} value={n(mealText(data.meals))} strong />
              <Row label={t('Meal rate')} value={`৳${n(rateText(data.mealRate))}`} />
              <Row label={t('Food cost')} value={`৳${n(takaText(data.foodCost))}`} strong />
            </Panel>

            {/* ---- money in ---- */}
            <Panel style={{ marginTop: 16, gap: 0 }}>
              <GroupLabel text={t('My deposits')} style={{ marginBottom: 6 }} />
              {data.deposits?.length ? (
                data.deposits.map((deposit, index) => (
                  <Row
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    label={`${dayLabel(deposit.date, lang)} · ${t(METHOD_TEXT[deposit.method] ?? deposit.method)}`}
                    value={`৳${n(takaText(deposit.amount))}`}
                    tone="good"
                  />
                ))
              ) : (
                <Body muted style={{ paddingVertical: 10 }}>
                  {t('No approved deposits this month.')}
                </Body>
              )}
              <Divider />
              {/* Summed from the rows shown rather than read off the bill, so
                  the total and the list it sits under can never disagree. */}
              <Row
                label={t('Total deposited')}
                value={`৳${n(takaText(depositTotal))}`}
                strong
                tone="good"
              />
            </Panel>

            {/* ---- corrections after settlement ---- */}
            {data.adjustments?.length ? (
              <Panel tone="warn" style={{ marginTop: 16, gap: 0, marginBottom: 8 }}>
                <GroupLabel text={t('Adjustments')} style={{ marginBottom: 6 }} />
                {data.adjustments.map((row) => (
                  <Row
                    key={row.id}
                    label={row.reason}
                    value={`৳${n(takaText(row.amount))}`}
                    tone={row.amount >= 0 ? 'good' : 'bad'}
                  />
                ))}
                <Body muted style={{ fontSize: type.xs, marginTop: 6 }}>
                  {t(
                    'A settled month cannot be edited. A mistake found afterwards becomes an adjustment, which shows here as its own line.',
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
