import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

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
  Empty,
  GroupLabel,
  Loading,
  Panel,
} from '../../../src/features/meal-management/components';
import { useMealManagement } from '../../../src/features/meal-management/store';
import { agoLabel } from '../../../src/features/meal-management/format';

/**
 * The audit trail. §4.17, §12.
 *
 * §12's last acceptance criterion is that every important financial
 * modification can be traced, and this is where that promise is kept. Each row
 * is a sentence written when the thing happened, so reading the log needs no
 * knowledge of the schema underneath it.
 *
 * A member sees their own actions; the mess's whole history is an approver's
 * view, the same as its reports.
 */
const FILTERS = [
  { key: '', label: 'Everything' },
  { key: 'meal', label: 'Meals' },
  { key: 'bazar', label: 'Bazar' },
  { key: 'expense', label: 'Expenses' },
  { key: 'deposit', label: 'Deposits' },
  { key: 'member', label: 'Members' },
  { key: 'month', label: 'Settlement' },
];

/** Which colour a row's verb earns. */
const toneOf = (action) => {
  if (action.includes('.approve') || action.includes('.create') || action.includes('.close')) return 'good';
  if (action.includes('.reject') || action.includes('.delete') || action.includes('.withdraw')) return 'bad';
  if (action.includes('.override') || action.includes('adjustment')) return 'warn';
  return undefined;
};

export default function ActivityLog() {
  const { t } = useLang();
  const { colors } = useTheme();

  const { getActivity } = useMealManagement();

  const [filter, setFilter] = useState('');
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(
    async (action) => {
      setLoading(true);
      const out = await getActivity({ action: action || undefined, limit: 200 });
      setEntries(out.ok ? out.result.entries : []);
      setLoading(false);
    },
    [getActivity],
  );

  useEffect(() => {
    fetch(filter);
  }, [fetch, filter]);

  const tone = (action) => {
    const key = toneOf(action);
    return key === 'good' ? colors.sage : key === 'bad' ? colors.primary : key === 'warn' ? colors.saffron : colors.textMuted;
  };

  return (
    <Screen>
      <Container>
        <BackLink fallback="/meal-management/reports" />

        <SectionHeader
          lead={t('ACTIVITY')}
          accent={t('LOG')}
          subtitle={t('Every financial change, and who made it.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <ChipRow>
            {FILTERS.map((row) => (
              <Chip
                key={row.key || 'all'}
                label={t(row.label)}
                active={filter === row.key}
                onPress={() => setFilter(row.key)}
              />
            ))}
          </ChipRow>
        </View>

        {loading ? (
          <Loading />
        ) : !entries?.length ? (
          <View style={{ marginTop: 18 }}>
            <Empty
              icon="clock"
              title={t('Nothing recorded yet')}
              hint={t('Every meal, bazar, expense and settlement writes a line here.')}
            />
          </View>
        ) : (
          <View style={{ marginTop: 18, gap: 8, marginBottom: 8 }}>
            <GroupLabel text={t('{n} entries', { n: entries.length })} />

            {entries.map((entry) => (
              <Panel key={entry.id} style={{ gap: 5, padding: 13 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: tone(entry.action),
                    }}
                  />
                  <Text
                    numberOfLines={2}
                    style={{ flex: 1, fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}
                  >
                    {entry.summary || entry.action}
                  </Text>
                </View>

                <Text
                  style={{
                    marginLeft: 15,
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    color: colors.textMuted,
                  }}
                >
                  {entry.actor || t('Somebody')} · {agoLabel(entry.at, t)}
                </Text>
              </Panel>
            ))}

            <Body muted style={{ fontSize: type.xs }}>
              {t('Nothing here is ever edited or removed. A correction adds a line rather than changing one.')}
            </Body>
          </View>
        )}
      </Container>
    </Screen>
  );
}
