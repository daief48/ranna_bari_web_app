import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import Screen, { Container } from '../../../src/components/Screen';
import SectionHeader from '../../../src/components/SectionHeader';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Divider,
  Empty,
  Loading,
  Meter,
  MonthPicker,
  Panel,
  Row,
  StatTile,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import {
  balanceText,
  balanceTone,
  mealText,
  rateText,
  takaText,
} from '../../../src/features/meal-management/format';

/**
 * Member-wise bills. §4.9.
 *
 * One row per member with the arithmetic opened up underneath it, because
 * §4.9's own requirement is a breakdown clear enough that a member can see
 * exactly how their amount was reached. A list of totals would meet the
 * letter of it and none of the point.
 */
export default function Bills() {
  const router = useRouter();
  const { t, n } = useLang();
  const { colors } = useTheme();

  const { month, changeMonth, mealTypes, load, dashboard } = useMealManagement();
  const { data, loading } = useSlice('bills');

  const [open, setOpen] = useState(null);
  const [sort, setSort] = useState('balance');

  useFocusEffect(
    useCallback(() => {
      load.bills({ force: true });
    }, [load]),
  );

  const members = [...(data?.members ?? [])].sort((a, b) => {
    if (sort === 'meals') return b.meals - a.meals;
    if (sort === 'name') return String(a.name).localeCompare(String(b.name));
    return a.balance - b.balance;
  });

  const peakMeals = Math.max(1, ...members.map((row) => row.meals || 0));
  const myId = dashboard?.mess?.memberId;

  return (
    <Screen>
      <Container>
        <BackLink fallback="/meal-management/reports" />

        <SectionHeader
          lead={t('MEMBER')}
          accent={t('BILLS')}
          subtitle={t('What each person owes, and the working behind it.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} closed={!!data?.closed} />
        </View>

        {loading && !data ? (
          <Loading />
        ) : !members.length ? (
          <View style={{ marginTop: 18 }}>
            <Empty icon="user" title={t('Nothing billed this month')} />
          </View>
        ) : (
          <>
            <View style={{ marginTop: 18 }}>
              <TileGrid>
                <StatTile value={`৳${n(rateText(data.mealRate))}`} label={t('Meal rate')} />
                <StatTile value={n(mealText(data.totalMeals))} label={t('Total meals')} />
                <StatTile value={`৳${n(takaText(data.totalCost))}`} label={t('Total cost')} />
                <StatTile value={n(members.length)} label={t('Members billed')} />
              </TileGrid>
            </View>

            <View style={{ marginTop: 18, gap: 10, marginBottom: 8 }}>
              <ChipRow>
                <Chip label={t('By balance')} active={sort === 'balance'} onPress={() => setSort('balance')} />
                <Chip label={t('By meals')} active={sort === 'meals'} onPress={() => setSort('meals')} />
                <Chip label={t('By name')} active={sort === 'name'} onPress={() => setSort('name')} />
              </ChipRow>

              {members.map((row) => {
                const expanded = open === row.memberId;
                return (
                  <Pressable
                    key={row.memberId}
                    accessibilityRole="button"
                    onPress={() => setOpen(expanded ? null : row.memberId)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                  >
                    <Panel
                      tone={row.memberId === myId ? 'good' : undefined}
                      style={{ gap: 9 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            numberOfLines={1}
                            style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
                          >
                            {row.name}
                            {row.memberId === myId ? ` · ${t('you')}` : ''}
                          </Text>
                          <Text
                            style={{
                              marginTop: 2,
                              fontFamily: font.ui,
                              fontSize: type.xs,
                              color: colors.textMuted,
                            }}
                          >
                            {t('{meals} meals · ৳{charge} charged', {
                              meals: n(mealText(row.meals)),
                              charge: n(takaText(row.totalCharge)),
                            })}
                          </Text>
                        </View>

                        <Text
                          style={{
                            fontFamily: font.uiBold,
                            fontSize: type.sm + 1,
                            color: row.balance >= 0 ? colors.sage : colors.primary,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {balanceText(row.balance, t)}
                        </Text>
                      </View>

                      <Meter value={row.meals} max={peakMeals} tone="good" />

                      {expanded ? (
                        <>
                          <Divider />
                          {mealTypes.map((type_) =>
                            row.byType?.[type_.key] ? (
                              <Row
                                key={type_.key}
                                label={t(type_.label)}
                                value={n(mealText(row.byType[type_.key]))}
                              />
                            ) : null,
                          )}
                          {row.guestMeals ? (
                            <Row label={t('Guest meals')} value={n(mealText(row.guestMeals))} />
                          ) : null}
                          <Divider />
                          <Row
                            label={t('{meals} × ৳{rate}', {
                              meals: n(mealText(row.meals)),
                              rate: n(rateText(data.mealRate)),
                            })}
                            value={`৳${n(takaText(row.foodCost))}`}
                          />
                          {row.otherCost ? (
                            <Row label={t('Share of other costs')} value={`৳${n(takaText(row.otherCost))}`} />
                          ) : null}
                          <Row label={t('Total charge')} value={`৳${n(takaText(row.totalCharge))}`} strong />
                          <Row label={t('Deposits')} value={`৳${n(takaText(row.deposits))}`} tone="good" />
                          {row.carriedIn ? (
                            <Row
                              label={t('Carried in')}
                              value={`৳${n(takaText(row.carriedIn))}`}
                              tone={row.carriedIn >= 0 ? 'good' : 'bad'}
                            />
                          ) : null}
                          {row.adjustments ? (
                            <Row label={t('Adjustments')} value={`৳${n(takaText(row.adjustments))}`} tone="warn" />
                          ) : null}
                          <Divider />
                          <Row
                            label={t('Balance')}
                            value={balanceText(row.balance, t)}
                            tone={balanceTone(row.balance)}
                            strong
                          />

                          <Chip
                            label={t('Full statement')}
                            icon="receipt"
                            onPress={() =>
                              router.push(`/meal-management/reports/statement?memberId=${row.memberId}`)
                            }
                          />
                        </>
                      ) : null}
                    </Panel>
                  </Pressable>
                );
              })}

              <Body muted style={{ fontSize: type.xs }}>
                {t('Tap a member to see how their amount was reached.')}
              </Body>
            </View>
          </>
        )}
      </Container>
    </Screen>
  );
}
