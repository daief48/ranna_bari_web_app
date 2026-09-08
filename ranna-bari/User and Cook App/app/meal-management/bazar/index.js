import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../../src/components/Screen';
import SectionHeader from '../../../src/components/SectionHeader';
import Button from '../../../src/components/Button';
import Icon from '../../../src/components/Icon';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BottomNav,
  Chip,
  ChipRow,
  Empty,
  GroupLabel,
  Loading,
  NavRow,
  Panel,
  StatTile,
  StatusPill,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { BazarSheet } from '../../../src/features/meal-management/forms';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import { dayLabel, takaText } from '../../../src/features/meal-management/format';

/**
 * Bazar. §4.3, and §6's Bazar tab.
 *
 * A list of shopping trips and a way to record one. The items are entered here
 * rather than on a second screen because §4.3's workflow has somebody standing
 * over a receipt typing a list — a network hop between each line is how half a
 * bazar ends up saved.
 *
 * The total is never typed. It is the sum of the lines, shown as they are
 * entered, which is what makes an approver's job a comparison rather than an
 * act of faith.
 */
export default function BazarList() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { month, can, createBazar, load } = useMealManagement();
  const { data, loading } = useSlice('bazars');

  const [status, setStatus] = useState(
    typeof params.status === 'string' ? params.status : 'all',
  );
  const [adding, setAdding] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load.bazars({ force: true });
    }, [load]),
  );

  const all = data?.bazars ?? [];
  const shown = status === 'all' ? all : all.filter((row) => row.status === status);
  const totals = data?.totals ?? { approved: 0, pending: 0 };

  return (
    <Screen footer={<BottomNav active="bazar" />}>
      <Container>
        <SectionHeader
          lead={t('THE')}
          accent={t('BAZAR')}
          subtitle={t('Every shopping trip, and what it cost.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <TileGrid>
            <StatTile
              value={`৳${n(takaText(totals.approved))}`}
              label={t('Approved this month')}
              tone="good"
            />
            <StatTile
              value={`৳${n(takaText(totals.pending))}`}
              label={t('Waiting for approval')}
              tone={totals.pending ? 'warn' : undefined}
            />
          </TileGrid>
        </View>

        <View style={{ marginTop: 16, gap: 10 }}>
          <NavRow
            icon="calendar"
            title={t('Bazar duty')}
            sub={t('Whose turn it is to shop')}
            onPress={() => router.push('/meal-management/bazar/duty')}
          />
          <NavRow
            icon="sparkles"
            title={t('What we usually buy')}
            sub={t('Suggested quantities from the last three months')}
            onPress={() => router.push('/meal-management/bazar/suggestions')}
          />
        </View>

        {can('add_bazar') ? (
          <View style={{ marginTop: 16 }}>
            <Button label={t('Record a bazar')} icon="plus" onPress={() => setAdding(true)} block />
          </View>
        ) : null}

        <View style={{ marginTop: 20, gap: 10, marginBottom: 8 }}>
          <GroupLabel text={t('This month')} />

          <ChipRow>
            <Chip label={t('All')} active={status === 'all'} onPress={() => setStatus('all')} />
            <Chip
              label={t('Waiting')}
              active={status === 'submitted'}
              tone="warn"
              onPress={() => setStatus('submitted')}
            />
            <Chip
              label={t('Approved')}
              active={status === 'approved'}
              tone="good"
              onPress={() => setStatus('approved')}
            />
            <Chip label={t('Drafts')} active={status === 'draft'} onPress={() => setStatus('draft')} />
          </ChipRow>

          {loading && !data ? (
            <Loading />
          ) : !shown.length ? (
            <Empty
              icon="cart"
              title={t('No bazar recorded')}
              hint={t('Every approved trip goes straight into the meal rate.')}
            />
          ) : (
            shown.map((bazar) => (
              <Pressable
                key={bazar.id}
                accessibilityRole="button"
                onPress={() => router.push(`/meal-management/bazar/${bazar.id}`)}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              >
                <Panel style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
                      >
                        {dayLabel(bazar.date, lang)}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{ marginTop: 2, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                      >
                        {bazar.buyerName}
                        {bazar.payerName && bazar.payerName !== bazar.buyerName
                          ? t(' · paid by {name}', { name: bazar.payerName })
                          : ''}
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: type.h3,
                        color: colors.text,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      ৳{n(takaText(bazar.total))}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <StatusPill status={bazar.status} />
                    {bazar.hasReceipt ? (
                      <Icon name="receipt" size={14} color={colors.textMuted} />
                    ) : null}
                    <View style={{ flex: 1 }} />
                    <Icon name="chevronRight" size={15} color={colors.textMuted} />
                  </View>

                  {bazar.note ? (
                    <Body muted style={{ fontSize: type.xs }} numberOfLines={2}>
                      {bazar.note}
                    </Body>
                  ) : null}
                </Panel>
              </Pressable>
            ))
          )}
        </View>
      </Container>

      <BazarSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={async (body) => {
          const out = await run(() => createBazar(body), t('Bazar recorded.'));
          if (out?.ok) setAdding(false);
          return out;
        }}
      />
    </Screen>
  );
}
