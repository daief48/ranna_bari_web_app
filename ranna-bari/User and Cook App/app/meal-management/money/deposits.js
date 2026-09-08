import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import Button from '../../../src/components/Button';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  ApprovalActions,
  BackLink,
  Chip,
  ChipRow,
  Empty,
  Field,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
  Sheet,
  StatTile,
  StatusPill,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import {
  METHOD_TEXT,
  dayLabel,
  takaText,
  todayKey,
} from '../../../src/features/meal-management/format';

/**
 * Deposits. §4.5.
 *
 * Money coming in, and the approval that makes it count. §4.5's closing rule —
 * a balance is approved charges minus approved deposits — means a deposit
 * sitting at "waiting" changes nothing, and this screen says so on the row
 * rather than letting somebody assume it landed.
 */
export default function Deposits() {
  const params = useLocalSearchParams();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const {
    month,
    changeMonth,
    can,
    addDeposit,
    decideDeposit,
    removeDeposit,
    load,
    slice,
    keys,
    dashboard,
  } = useMealManagement();

  const { data, loading } = useSlice('deposits');
  const members = slice(keys.members)?.members ?? [];

  const [status, setStatus] = useState(typeof params.status === 'string' ? params.status : 'all');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);

  useFocusEffect(
    useCallback(() => {
      load.deposits({ force: true });
      load.members();
    }, [load]),
  );

  const all = data?.deposits ?? [];
  const shown = status === 'all' ? all : all.filter((row) => row.status === status);
  const totals = data?.totals ?? { approved: 0, pending: 0 };

  const decide = async (id, approve) => {
    setBusy(id);
    await run(
      () => decideDeposit(id, approve),
      approve ? t('Deposit approved.') : t('Deposit rejected.'),
    );
    setBusy(null);
  };

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/money" />

        <SectionHeader
          lead={t('THE')}
          accent={t('DEPOSITS')}
          subtitle={t('Money members have put into the mess.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

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

        {can('add_deposit') ? (
          <View style={{ marginTop: 16 }}>
            <Button label={t('Record a deposit')} icon="plus" onPress={() => setAdding(true)} block />
          </View>
        ) : null}

        <View style={{ marginTop: 20, gap: 10, marginBottom: 8 }}>
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
          </ChipRow>

          {loading && !data ? (
            <Loading />
          ) : !shown.length ? (
            <Empty
              icon="banknote"
              title={t('No deposits here')}
              hint={t('A deposit only counts toward a balance once it has been approved.')}
            />
          ) : (
            shown.map((deposit) => (
              <Panel
                key={deposit.id}
                tone={deposit.status === 'submitted' ? 'warn' : undefined}
                style={{ gap: 9 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
                    >
                      {deposit.memberName}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ marginTop: 2, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                    >
                      {dayLabel(deposit.date, lang)} · {t(METHOD_TEXT[deposit.method] ?? deposit.method)}
                      {deposit.reference ? ` · ${deposit.reference}` : ''}
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontFamily: font.displayBold,
                      fontSize: type.h3,
                      color: deposit.status === 'approved' ? colors.sage : colors.text,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    ৳{n(takaText(deposit.amount))}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <StatusPill status={deposit.status} />
                  {deposit.status === 'submitted' ? (
                    <Body muted style={{ fontSize: type.xs, flex: 1 }}>
                      {t('Not in the balance yet')}
                    </Body>
                  ) : null}
                </View>

                {deposit.note ? (
                  <Body muted style={{ fontSize: type.xs }}>
                    {deposit.note}
                  </Body>
                ) : null}

                {deposit.status === 'submitted' && data?.canApprove ? (
                  <ApprovalActions
                    busy={busy === deposit.id}
                    onApprove={() => decide(deposit.id, true)}
                    onReject={() => decide(deposit.id, false)}
                  />
                ) : null}

                {deposit.status === 'submitted' &&
                deposit.memberId === dashboard?.mess?.memberId &&
                !data?.canApprove ? (
                  <Chip
                    label={t('Withdraw this')}
                    tone="bad"
                    onPress={() => run(() => removeDeposit(deposit.id), t('Removed.'))}
                  />
                ) : null}
              </Panel>
            ))
          )}
        </View>
      </Container>

      <DepositSheet
        open={adding}
        onClose={() => setAdding(false)}
        members={members.filter((m) => m.status === 'active')}
        canRecordForOthers={can('approve_deposit')}
        myMemberId={dashboard?.mess?.memberId}
        onSubmit={async (body) => {
          const out = await run(() => addDeposit(body), t('Deposit recorded.'));
          if (out?.ok) setAdding(false);
          return out;
        }}
      />
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * recording one
 * ------------------------------------------------------------------ */

function DepositSheet({ open, onClose, members, canRecordForOthers, myMemberId, onSubmit }) {
  const { t } = useLang();

  const [date, setDate] = useState(todayKey());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [memberId, setMemberId] = useState(myMemberId ?? null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      date,
      amount: Number(amount) || 0,
      method,
      memberId: memberId && memberId !== myMemberId ? memberId : undefined,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    });
    setBusy(false);
  };

  const needsReference = method !== 'cash';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Record a deposit')}
      footer={
        <Button
          label={t('Record it')}
          onPress={submit}
          disabled={busy || !(Number(amount) > 0)}
          block
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label={t('Which day')} value={date} onChangeText={setDate} style={{ flex: 1.2 }} />
        <Field
          label={t('Amount')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          suffix="৳"
          placeholder="0"
          style={{ flex: 1 }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('How it was paid')} />
        <ChipRow>
          {Object.keys(METHOD_TEXT).map((key) => (
            <Chip
              key={key}
              label={t(METHOD_TEXT[key])}
              active={method === key}
              onPress={() => setMethod(key)}
            />
          ))}
        </ChipRow>
      </View>

      {needsReference ? (
        <Field
          label={t('Transaction reference')}
          value={reference}
          onChangeText={setReference}
          placeholder={t('e.g. bKash TrxID')}
          autoCapitalize="characters"
          maxLength={80}
        />
      ) : null}

      {canRecordForOthers ? (
        <View style={{ gap: 8 }}>
          <GroupLabel text={t('Who paid')} />
          <ChipRow>
            {members.map((member) => (
              <Chip
                key={member.memberId}
                label={member.memberId === myMemberId ? t('Me') : member.name}
                active={memberId === member.memberId}
                onPress={() => setMemberId(member.memberId)}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      <Field
        label={t('Note (optional)')}
        value={note}
        onChangeText={setNote}
        placeholder={t('e.g. September deposit')}
        maxLength={500}
      />

      <Body muted style={{ fontSize: 12 }}>
        {canRecordForOthers
          ? t('You can approve deposits, so this is recorded as approved.')
          : t('This waits for an admin to approve before it reaches your balance.')}
      </Body>
    </Sheet>
  );
}
