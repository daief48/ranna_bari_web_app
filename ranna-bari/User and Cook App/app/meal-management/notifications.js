import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import MessScreen, { Container } from '../../src/features/meal-management/MessScreen';
import SectionHeader from '../../src/components/SectionHeader';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Empty,
  GroupLabel,
  Loading,
  Panel,
} from '../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../src/features/meal-management/store';
import { agoLabel } from '../../src/features/meal-management/format';

/**
 * The mess's own inbox. §4.10.
 *
 * Deliberately not the app's notification screen. A bazar waiting for
 * approval is this world's business, and putting it in the marketplace's
 * inbox would mean a badge on the shop's bell for something that happens
 * entirely in here — which is the same mistake as showing the shop's navbar
 * on a mess screen, one layer down.
 *
 * Opening the screen marks everything read. There is no "mark all read"
 * button because there is nothing else you would come here to do.
 */

/** Which colour a notification's kind earns. */
const TONE = {
  'bazar-approved': 'good',
  'expense-approved': 'good',
  'deposit-approved': 'good',
  'correction-approved': 'good',
  'bazar-rejected': 'bad',
  'expense-rejected': 'bad',
  'deposit-rejected': 'bad',
  'correction-rejected': 'bad',
  'bazar-added': 'warn',
  'expense-added': 'warn',
  'deposit-added': 'warn',
  'correction-raised': 'warn',
  'join-request': 'warn',
  'duty-assigned': 'warn',
  'month-closed': 'good',
};

export default function Notifications() {
  const router = useRouter();
  const { t, n } = useLang();
  const { colors } = useTheme();

  const { readNotifications, load } = useMealManagement();
  const { data, loading } = useSlice('notifications');

  /* Reading them is the visit. Fetch first, then clear — the other order
     would mark them read and then show them already read, which makes the
     screen look like it never had anything on it. */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      load.notifications({ force: true }).then(() => {
        if (alive) readNotifications();
      });
      return () => {
        alive = false;
      };
    }, [load, readNotifications]),
  );

  const rows = data?.notifications ?? [];

  const tint = (kind) => {
    const tone = TONE[kind];
    return tone === 'good'
      ? colors.sage
      : tone === 'bad'
        ? colors.primary
        : tone === 'warn'
          ? colors.saffron
          : colors.textMuted;
  };

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management" />

        <SectionHeader
          lead={t('MESS')}
          accent={t('INBOX')}
          subtitle={t('What happened in the mess while you were away.')}
          style={{ marginTop: 16 }}
        />

        {loading && !data ? (
          <Loading />
        ) : !rows.length ? (
          <View style={{ marginTop: 18 }}>
            <Empty
              icon="bell"
              title={t('Nothing here yet')}
              hint={t(
                'Approvals, corrections, bazar duty and settlement all leave a note here — and nowhere else.',
              )}
            />
          </View>
        ) : (
          <View style={{ marginTop: 18, gap: 9, marginBottom: 8 }}>
            <GroupLabel text={t('{n} recent', { n: n(rows.length) })} />

            {rows.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole={row.link ? 'link' : undefined}
                onPress={row.link ? () => router.push(row.link) : undefined}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <Panel style={{ gap: 6, padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        marginTop: 6,
                        backgroundColor: row.read ? colors.line : tint(row.kind),
                      }}
                    />

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: row.read ? font.uiSemi : font.uiBold,
                          fontSize: type.sm + 1,
                          color: colors.text,
                        }}
                      >
                        {row.title}
                      </Text>

                      {row.body ? (
                        <Body muted style={{ marginTop: 3, fontSize: type.xs }}>
                          {row.body}
                        </Body>
                      ) : null}

                      <Text
                        style={{
                          marginTop: 5,
                          fontFamily: font.ui,
                          fontSize: type.xs - 1,
                          color: colors.textMuted,
                        }}
                      >
                        {agoLabel(row.at, t)}
                      </Text>
                    </View>
                  </View>
                </Panel>
              </Pressable>
            ))}

            <Body muted style={{ fontSize: type.xs }}>
              {t('These stay inside meal management — the shop’s notifications never mix with them.')}
            </Body>
          </View>
        )}
      </Container>
    </MessScreen>
  );
}
