import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BackLink,
  Divider,
  Empty,
  GroupLabel,
  Loading,
  MemberRow,
  MonthPicker,
  Panel,
  Row,
  StatTile,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { rateText, takaText } from '../../../src/features/meal-management/format';

/**
 * Settlement. §4.9.
 *
 * The month reduced to two lists — who pays in and who gets money back. It is
 * the last screen of §4.8's workflow and the one that gets screenshotted into
 * a group chat, so it is deliberately the plainest thing in the module.
 *
 * The residual is shown rather than hidden. Under a rounded meal rate the mess
 * collects a little more or less than it spent, and §9 asks for that to be
 * accounted for openly instead of quietly becoming somebody's problem.
 */
export default function Settlement() {
  const { t, n } = useLang();
  const { colors } = useTheme();

  const { month, changeMonth, load } = useMealManagement();
  const { data, loading } = useSlice('settlement');

  useFocusEffect(
    useCallback(() => {
      load.settlement({ force: true });
    }, [load]),
  );

  const due = data?.due ?? [];
  const refund = data?.refund ?? [];

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/reports" />

        <SectionHeader
          lead={t('THE')}
          accent={t('SETTLEMENT')}
          subtitle={t('Who pays in, and who gets money back.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} closed={!!data?.closed} />
        </View>

        {loading && !data ? (
          <Loading />
        ) : (
          <>
            {!data?.closed ? (
              <Panel tone="warn" style={{ marginTop: 16, gap: 5 }}>
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.saffron }}>
                  {t('This month is not settled yet')}
                </Text>
                <Body muted style={{ fontSize: type.xs }}>
                  {t('These figures still move as meals and expenses are recorded.')}
                </Body>
              </Panel>
            ) : null}

            <View style={{ marginTop: 16 }}>
              <TileGrid>
                <StatTile
                  value={data?.mealRate > 0 ? `৳${n(rateText(data.mealRate))}` : '—'}
                  label={t('Meal rate')}
                />
                <StatTile value={`৳${n(takaText(data?.totalCost))}`} label={t('Total cost')} />
                <StatTile
                  value={`৳${n(takaText(data?.totalDue))}`}
                  label={t('To be collected')}
                  tone={data?.totalDue ? 'bad' : undefined}
                />
                <StatTile
                  value={`৳${n(takaText(data?.totalRefund))}`}
                  label={t('To be refunded')}
                  tone={data?.totalRefund ? 'good' : undefined}
                />
              </TileGrid>
            </View>

            <View style={{ marginTop: 20, gap: 10 }}>
              <GroupLabel text={t('Owes the mess')} />
              {due.length ? (
                <Panel style={{ gap: 2 }}>
                  {due.map((row) => (
                    <MemberRow
                      key={row.memberId}
                      name={row.name}
                      value={`৳${n(takaText(row.amount))}`}
                      tone="bad"
                    />
                  ))}
                  <Divider />
                  <Row label={t('Total')} value={`৳${n(takaText(data.totalDue))}`} tone="bad" strong />
                </Panel>
              ) : (
                <Empty icon="check" title={t('Nobody owes anything')} />
              )}
            </View>

            <View style={{ marginTop: 20, gap: 10 }}>
              <GroupLabel text={t('The mess owes')} />
              {refund.length ? (
                <Panel style={{ gap: 2 }}>
                  {refund.map((row) => (
                    <MemberRow
                      key={row.memberId}
                      name={row.name}
                      value={`৳${n(takaText(row.amount))}`}
                      tone="good"
                    />
                  ))}
                  <Divider />
                  <Row
                    label={t('Total')}
                    value={`৳${n(takaText(data.totalRefund))}`}
                    tone="good"
                    strong
                  />
                </Panel>
              ) : (
                <Empty icon="check" title={t('Nobody is owed a refund')} />
              )}
            </View>

            {data?.residual ? (
              <Panel tone="warn" style={{ marginTop: 20, gap: 5, marginBottom: 8 }}>
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.saffron }}>
                  {t('৳{n} left over', { n: n(takaText(data.residual)) })}
                </Text>
                <Body muted style={{ fontSize: type.xs }}>
                  {t(
                    'The gap between what the mess spent and what it charged. It comes from rounding the meal rate, and it stays visible rather than being absorbed into somebody’s bill.',
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
