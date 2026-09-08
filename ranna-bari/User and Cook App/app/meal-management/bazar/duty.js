import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import Button from '../../../src/components/Button';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  DatePicker,
  Empty,
  Field,
  GroupLabel,
  Loading,
  MiniButton,
  Panel,
  RangePicker,
  Sheet,
  StatusPill,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import { dayLabel, shiftDay, todayKey } from '../../../src/features/meal-management/format';

/**
 * Whose turn it is to shop. §4.3's duty schedule and rotation.
 *
 * The rota is generated round-robin rather than assigned day by day, because
 * a mess that has to assign thirty days by hand assigns four and then stops.
 * The generator picks up from whoever had it last, so regenerating mid-month
 * does not reset everybody to the same person.
 */
export default function BazarDuty() {
  const { t, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { can, assignDuty, rotateDuty, updateDuty, removeDuty, load, slice, keys } =
    useMealManagement();
  const { data, loading } = useSlice('duties');
  const members = slice(keys.members)?.members ?? [];

  const [rotating, setRotating] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load.duties({ force: true });
      load.members();
    }, [load]),
  );

  const duties = data?.duties ?? [];
  const today = data?.today ?? todayKey();
  const canManage = can('manage_duty');

  const upcoming = duties.filter((duty) => duty.date >= today);
  const past = duties.filter((duty) => duty.date < today).reverse();

  const mark = (duty, status) =>
    run(() => updateDuty(duty.id, { status }), t('Duty updated.'));

  const card = (duty) => (
    <Panel key={duty.id} tone={duty.mine && duty.date === today ? 'warn' : undefined} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
            {dayLabel(duty.date, lang)}
            {duty.date === today ? ` · ${t('today')}` : ''}
          </Text>
          <Text style={{ marginTop: 2, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
            {duty.mine ? t('Your turn') : duty.memberName}
          </Text>
        </View>
        <StatusPill status={duty.status === 'done' ? 'approved' : duty.status === 'skipped' ? 'rejected' : 'pending'} />
      </View>

      {duty.note ? (
        <Body muted style={{ fontSize: type.xs }}>
          {duty.note}
        </Body>
      ) : null}

      {(duty.mine || canManage) && duty.status === 'assigned' && duty.date <= today ? (
        <ChipRow>
          <Chip label={t('Done')} tone="good" onPress={() => mark(duty, 'done')} />
          <Chip label={t('Skipped')} tone="bad" onPress={() => mark(duty, 'skipped')} />
          {canManage ? (
            <Chip
              label={t('Remove')}
              onPress={() => run(() => removeDuty(duty.id), t('Removed.'))}
            />
          ) : null}
        </ChipRow>
      ) : null}
    </Panel>
  );

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/bazar" />

        <SectionHeader
          lead={t('BAZAR')}
          accent={t('DUTY')}
          subtitle={t('Whose turn it is to do the shopping.')}
          style={{ marginTop: 16 }}
        />

        {canManage ? (
          <View style={{ marginTop: 18, gap: 10 }}>
            <Button label={t('Generate a rota')} icon="route" onPress={() => setRotating(true)} block />
            <MiniButton label={t('Assign one day')} icon="plus" tone="plain" onPress={() => setAssigning(true)} />
          </View>
        ) : null}

        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <View style={{ marginTop: 20, gap: 10 }}>
              <GroupLabel text={t('Coming up')} />
              {upcoming.length ? (
                upcoming.map(card)
              ) : (
                <Empty
                  icon="calendar"
                  title={t('No duty scheduled')}
                  hint={
                    canManage
                      ? t('Generate a rota and everybody takes a turn in order.')
                      : t('An admin sets the rota.')
                  }
                  action={canManage ? () => setRotating(true) : undefined}
                  actionLabel={t('Generate a rota')}
                />
              )}
            </View>

            {past.length ? (
              <View style={{ marginTop: 22, gap: 10, marginBottom: 8 }}>
                <GroupLabel text={t('Recently')} />
                {past.slice(0, 10).map(card)}
              </View>
            ) : null}
          </>
        )}
      </Container>

      <RotateSheet
        open={rotating}
        onClose={() => setRotating(false)}
        members={members.filter((m) => m.status === 'active')}
        onSubmit={async (body) => {
          const out = await run(() => rotateDuty(body), t('Rota set.'));
          if (out?.ok) setRotating(false);
          return out;
        }}
      />

      <AssignSheet
        open={assigning}
        onClose={() => setAssigning(false)}
        members={members.filter((m) => m.status === 'active')}
        onSubmit={async (body) => {
          const out = await run(() => assignDuty(body), t('Duty assigned.'));
          if (out?.ok) setAssigning(false);
          return out;
        }}
      />
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * sheets
 * ------------------------------------------------------------------ */

function RotateSheet({ open, onClose, members, onSubmit }) {
  const { t } = useLang();

  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(shiftDay(todayKey(), 29));
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState(false);

  const toggle = (memberId) =>
    setChosen((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );

  const submit = async () => {
    setBusy(true);
    await onSubmit({ from, to, memberIds: chosen.length ? chosen : undefined });
    setBusy(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Generate a rota')}
      footer={<Button label={t('Set the rota')} onPress={submit} disabled={busy} block />}
    >
      <RangePicker
        from={from}
        to={to}
        onChange={(start, end) => {
          setFrom(start);
          setTo(end);
        }}
      />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Who takes a turn')} />
        <ChipRow>
          {members.map((member) => (
            <Chip
              key={member.memberId}
              label={member.name}
              active={!chosen.length || chosen.includes(member.memberId)}
              onPress={() => toggle(member.memberId)}
            />
          ))}
        </ChipRow>
        <Body muted style={{ fontSize: 12 }}>
          {t('Nobody picked means everybody. Days already assigned are left alone.')}
        </Body>
      </View>
    </Sheet>
  );
}

function AssignSheet({ open, onClose, members, onSubmit }) {
  const { t } = useLang();

  const [date, setDate] = useState(todayKey());
  const [memberId, setMemberId] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onSubmit({ date, memberId, note: note.trim() || undefined });
    setBusy(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Assign one day')}
      footer={<Button label={t('Assign')} onPress={submit} disabled={busy || !memberId} block />}
    >
      <DatePicker label={t('Which day')} value={date} onChange={setDate} />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Who')} />
        <ChipRow>
          {members.map((member) => (
            <Chip
              key={member.memberId}
              label={member.name}
              active={memberId === member.memberId}
              onPress={() => setMemberId(member.memberId)}
            />
          ))}
        </ChipRow>
      </View>

      <Field
        label={t('Note (optional)')}
        value={note}
        onChangeText={setNote}
        placeholder={t('e.g. buy fish this time')}
        maxLength={200}
      />
    </Sheet>
  );
}
