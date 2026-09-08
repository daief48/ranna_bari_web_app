import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import MessScreen, { Container } from '../../src/features/meal-management/MessScreen';
import SectionHeader from '../../src/components/SectionHeader';
import { Body } from '../../src/components/Typography';
import { type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BottomNav,
  GroupLabel,
  NavRow,
  Panel,
} from '../../src/features/meal-management/components';
import { MessExitRow } from '../../src/features/meal-management/MessScreen';
import { useMealManagement, useSlice } from '../../src/features/meal-management/store';
import { ROLE_TEXT } from '../../src/features/meal-management/format';

/**
 * §6's More menu.
 *
 * The specification lists eight destinations behind it, and this screen is
 * exactly that list plus the two housekeeping rows — switching mess and
 * signing out of one — that have nowhere better to live.
 *
 * Rows a member has no permission for are still shown when they lead somewhere
 * readable, and hidden when they do not. Reports are readable by everybody
 * (their own figures, at least); settings are not.
 */
export default function More() {
  const router = useRouter();
  const { t } = useLang();

  const { mess, can, dashboard, load } = useMealManagement();
  const notices = useSlice('notices');

  useFocusEffect(
    useCallback(() => {
      load.dashboard();
      load.notices();
    }, [load]),
  );

  const pending = dashboard?.pendingApprovals ?? {};

  return (
    <MessScreen footer={<BottomNav active="more" badges={{ money: pending.total || 0 }} />}>
      <Container>
        <SectionHeader
          lead={t('EVERYTHING')}
          accent={t('ELSE')}
          subtitle={mess ? `${mess.name} · ${t(ROLE_TEXT[mess.role] ?? mess.role)}` : ''}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20, gap: 10 }}>
          <GroupLabel text={t('The books')} />

          <NavRow
            icon="receipt"
            title={t('Reports')}
            sub={t('Monthly report, meal rate, member bills, settlement')}
            onPress={() => router.push('/meal-management/reports')}
          />
          <NavRow
            icon="activity"
            title={t('Analytics')}
            sub={t('Trends, consumption, waste and budget against actual')}
            onPress={() => router.push('/meal-management/analytics')}
          />
          {can('close_month') ? (
            <NavRow
              icon="shieldCheck"
              title={t('Settle the month')}
              sub={t('Freeze the figures and produce every bill')}
              tone="good"
              onPress={() => router.push('/meal-management/close-month')}
            />
          ) : null}
        </View>

        <View style={{ marginTop: 22, gap: 10 }}>
          <GroupLabel text={t('The mess')} />

          <NavRow
            icon="user"
            title={t('Members')}
            sub={t('People, roles, invitations and history')}
            badge={dashboard?.pendingJoinRequests}
            onPress={() => router.push('/meal-management/members')}
          />
          <NavRow
            icon="bell"
            title={t('Notice board')}
            sub={t('Announcements everybody should see')}
            badge={notices.data?.unread}
            onPress={() => router.push('/meal-management/board/notices')}
          />
          <NavRow
            icon="check"
            title={t('Polls')}
            sub={t('Decide tomorrow’s menu, a new cook, the bazar budget')}
            onPress={() => router.push('/meal-management/board/polls')}
          />
          <NavRow
            icon="salad"
            title={t('Menu')}
            sub={t('What is being cooked, and what people thought of it')}
            onPress={() => router.push('/meal-management/menu')}
          />
          <NavRow
            icon="chefHat"
            title={t('Cook')}
            sub={t('Salary, attendance, plates cooked and payments')}
            onPress={() => router.push('/meal-management/cook')}
          />
        </View>

        <View style={{ marginTop: 22, gap: 10 }}>
          <GroupLabel text={t('Help and settings')} />

          <NavRow
            icon="sparkles"
            title={t('AI assistant')}
            sub={t('“Turn my dinner off tomorrow”')}
            onPress={() => router.push('/meal-management/assistant')}
          />
          <NavRow
            icon="sliders"
            title={t('Settings')}
            sub={
              can('mess_settings')
                ? t('Meal types, cutoffs, categories, approvals and rounding')
                : t('See how this mess is set up')
            }
            onPress={() => router.push('/meal-management/settings')}
          />
          <NavRow
            icon="home"
            title={t('Switch mess')}
            sub={t('Or create and join another one')}
            onPress={() => router.push('/meal-management/onboard')}
          />
          <NavRow
            icon="clock"
            title={t('Activity log')}
            sub={t('Every financial change, and who made it')}
            onPress={() => router.push('/meal-management/reports/activity')}
          />
        </View>

        <Panel style={{ marginTop: 22, gap: 5 }}>
          <GroupLabel text={t('How this mess bills')} />
          <Body muted style={{ fontSize: type.xs }}>
            {t(
              'Meal rate = total approved food expense ÷ total weighted meals. Only approved bazar, expenses and deposits count. A settled month is frozen and never recalculated.',
            )}
          </Body>
        </Panel>

        {/* The way out, said in full.
            The pill in the bar is reachable from every screen, but it is a
            nine-pixel word — this is the row that explains what leaving
            actually means, at the foot of the menu where somebody who has run
            out of things to do in here will find it. */}
        <View style={{ marginTop: 22, gap: 10, marginBottom: 8 }}>
          <GroupLabel text={t('Leave meal management')} />
          <MessExitRow />
          <Body muted style={{ fontSize: type.xs }}>
            {t('Your mess keeps everything as it is. Come back through Profile whenever you like.')}
          </Body>
        </View>
      </Container>
    </MessScreen>
  );
}
