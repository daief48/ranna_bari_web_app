import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import Screen, { Container } from '../../../src/components/Screen';
import SectionHeader from '../../../src/components/SectionHeader';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BackLink,
  GroupLabel,
  Loading,
  Meter,
  MonthPicker,
  NavRow,
  Panel,
  RateCard,
  Row,
  Sheet,
  StatTile,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import { sharePdf, shareCsv } from '../../../src/features/meal-management/share';
import { monthLabel, rateText, takaText, mealText } from '../../../src/features/meal-management/format';

/**
 * Reports. §4.9.
 *
 * Ten reports, one month picker and two export buttons. Every figure here
 * comes out of the same calculation the bills do — §12 requires that reports
 * reconcile with the engine, and the way this module guarantees it is by not
 * having a second engine.
 *
 * The rate trend leads because a rate on its own says nothing: a mess only
 * learns anything from ৳62 by seeing that last month was ৳55.
 */
export default function Reports() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { month, changeMonth, getExport, getPrintable, load } = useMealManagement();
  const { data, loading } = useSlice('rateReport');
  const summary = useSlice('summary');

  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load.rateReport({ force: true });
      load.summary({ force: true });
    }, [load]),
  );

  const stmt = summary.data;
  const trend = data?.trend ?? [];
  const peak = Math.max(1, ...trend.map((row) => row.mealRate || 0));

  const doPrint = async () => {
    setBusy(true);
    const out = await getPrintable();
    if (out.ok) {
      const shared = await sharePdf(out.result.html, `mess-statement-${month}`);
      if (!shared.ok) run(() => Promise.resolve(shared));
    } else {
      run(() => Promise.resolve(out));
    }
    setBusy(false);
  };

  const doExport = async (kind) => {
    setBusy(true);
    const out = await getExport(kind);
    if (out.ok) {
      const shared = await shareCsv(out.result.csv, out.result.filename);
      if (shared.ok && shared.result?.copied) {
        run(() => Promise.resolve({ ok: true }), t('Copied to the clipboard.'));
      }
    } else {
      run(() => Promise.resolve(out));
    }
    setBusy(false);
    setExporting(false);
  };

  return (
    <Screen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('THE')}
          accent={t('REPORTS')}
          subtitle={t('Every figure, traced back to what produced it.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} closed={!!stmt?.closed} />
        </View>

        {loading && !data ? (
          <Loading />
        ) : (
          <>
            {stmt ? (
              <View style={{ marginTop: 18 }}>
                <RateCard
                  mealRate={stmt.mealRate}
                  foodCost={stmt.foodCost}
                  totalMeals={stmt.totalMeals}
                  formula={stmt.formula}
                />
              </View>
            ) : null}

            {/* ---- §4.9's meal rate report ---- */}
            {trend.length > 1 ? (
              <Panel style={{ marginTop: 16, gap: 12 }}>
                <GroupLabel
                  text={t('Meal rate over time')}
                  right={
                    data?.change !== null && data?.change !== undefined ? (
                      <Text
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: type.xs,
                          color: data.change > 0 ? colors.primary : colors.sage,
                        }}
                      >
                        {data.change > 0 ? '▲' : '▼'} {n(Math.abs(data.change))}%
                      </Text>
                    ) : null
                  }
                />

                {trend.map((row) => (
                  <View key={row.month} style={{ gap: 5 }}>
                    <Row
                      label={`${monthLabel(row.month, lang)}${row.closed ? '' : ` · ${t('open')}`}`}
                      value={`৳${n(rateText(row.mealRate))}`}
                      strong={row.month === month}
                      tone={row.month === month ? 'good' : undefined}
                    />
                    <Meter value={row.mealRate} max={peak} tone={row.month === month ? 'good' : 'warn'} />
                  </View>
                ))}

                <Body muted style={{ fontSize: type.xs }}>
                  {t('Settled months are frozen. Open ones move as meals and expenses are recorded.')}
                </Body>
              </Panel>
            ) : null}

            {/* ---- the month at a glance ---- */}
            {stmt ? (
              <View style={{ marginTop: 18 }}>
                <TileGrid>
                  <StatTile value={n(mealText(stmt.totalMeals))} label={t('Total meals')} />
                  <StatTile value={`৳${n(takaText(stmt.foodCost))}`} label={t('Food cost')} tone="good" />
                  <StatTile value={`৳${n(takaText(stmt.otherCost))}`} label={t('Other cost')} />
                  <StatTile
                    value={`৳${n(takaText(stmt.totalDeposits))}`}
                    label={t('Deposits')}
                    tone="good"
                  />
                </TileGrid>
              </View>
            ) : null}

            {/* ---- the reports themselves ---- */}
            <View style={{ marginTop: 22, gap: 10 }}>
              <GroupLabel text={t('Reports')} />

              <NavRow
                icon="user"
                title={t('Member bills')}
                sub={t('What each person owes, and why')}
                onPress={() => router.push('/meal-management/reports/bills')}
              />
              <NavRow
                icon="banknote"
                title={t('Settlement')}
                sub={t('Who pays in, who gets refunded')}
                onPress={() => router.push('/meal-management/reports/settlement')}
              />
              <NavRow
                icon="receipt"
                title={t('My statement')}
                sub={t('Every figure of mine, with the working')}
                onPress={() => router.push('/meal-management/reports/statement')}
              />
              <NavRow
                icon="clock"
                title={t('Activity log')}
                sub={t('Every financial change, and who made it')}
                onPress={() => router.push('/meal-management/reports/activity')}
              />
            </View>

            {/* ---- getting it off the phone ---- */}
            <View style={{ marginTop: 22, gap: 10, marginBottom: 8 }}>
              <GroupLabel text={t('Share')} />

              <NavRow
                icon="receipt"
                title={t('Monthly statement as PDF')}
                sub={t('Preview it, then send it to WhatsApp, Messenger or email')}
                onPress={doPrint}
                disabled={busy}
                right={<View />}
              />
              <NavRow
                icon="copy"
                title={t('Export a spreadsheet')}
                sub={t('Meals, expenses, bazar, deposits, bills or settlement')}
                onPress={() => setExporting(true)}
                disabled={busy}
                right={<View />}
              />
            </View>
          </>
        )}
      </Container>

      <Sheet open={exporting} onClose={() => setExporting(false)} title={t('Export a spreadsheet')}>
        {[
          { kind: 'meals', label: t('Meals'), hint: t('Every member, every sitting') },
          { kind: 'expenses', label: t('Expenses'), hint: t('Approved rows with their category') },
          { kind: 'bazar', label: t('Bazar'), hint: t('Approved trips and their totals') },
          { kind: 'deposits', label: t('Deposits'), hint: t('Approved payments and references') },
          { kind: 'bills', label: t('Member bills'), hint: t('Charges, deposits and balances') },
          { kind: 'settlement', label: t('Settlement'), hint: t('Who is due, who gets a refund') },
          { kind: 'activity', label: t('Activity log'), hint: t('Every change this month') },
        ].map((row) => (
          <NavRow
            key={row.kind}
            icon="copy"
            title={row.label}
            sub={row.hint}
            onPress={() => doExport(row.kind)}
            disabled={busy}
            right={<View />}
          />
        ))}

        <Body muted style={{ fontSize: 12 }}>
          {t('CSV opens in Excel, Google Sheets and everything else.')}
        </Body>
      </Sheet>
    </Screen>
  );
}
