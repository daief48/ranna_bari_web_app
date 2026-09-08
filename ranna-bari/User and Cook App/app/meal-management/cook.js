import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Divider,
  Empty,
  Field,
  GroupLabel,
  Loading,
  MemberRow,
  MiniButton,
  MonthPicker,
  Panel,
  Row,
  Sheet,
  StatTile,
  TileGrid,
} from '../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import {
  COOK_DAY_TEXT,
  METHOD_TEXT,
  dayLabel,
  mealText,
  takaText,
  todayKey,
} from '../../src/features/meal-management/format';

/**
 * The cook. §4.14.
 *
 * Attendance and plates cooked sit side by side because that pair is what
 * makes a performance conversation possible — "present twenty-eight days,
 * cooked eight hundred plates" says something neither number does alone.
 *
 * Paying the cook writes an ordinary expense through the ordinary approval
 * path. A salary that skipped that would be money leaving the mess without
 * appearing in its books.
 */
export default function Cook() {
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { month, changeMonth, can, saveCook, recordCookDay, payCook, getCookMonth, load } =
    useMealManagement();

  const { data, loading } = useSlice('cooks');

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [recording, setRecording] = useState(false);
  const [paying, setPaying] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load.cooks({ force: true });
    }, [load]),
  );

  const cooks = data?.cooks ?? [];
  const manage = can('manage_cook');

  /* Open the first cook automatically — a mess almost always has one, and
     making somebody tap through a list of one is a step for nothing. */
  useEffect(() => {
    if (!selected && cooks.length) setSelected(cooks[0].id);
  }, [cooks, selected]);

  const fetchDetail = useCallback(async () => {
    if (!selected) return;
    const out = await getCookMonth(selected, month);
    setDetail(out.ok ? out.result : null);
  }, [getCookMonth, selected, month]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const summary = detail?.summary ?? {};

  return (
    <Screen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('THE')}
          accent={t('COOK')}
          subtitle={t('Salary, attendance, plates cooked and payments.')}
          style={{ marginTop: 16 }}
        />

        {loading && !data ? (
          <Loading />
        ) : !cooks.length ? (
          <View style={{ marginTop: 18 }}>
            <Empty
              icon="chefHat"
              title={t('No cook recorded')}
              hint={t('Add one and their salary flows into the mess accounts as an expense.')}
              action={manage ? () => setEditing({}) : undefined}
              actionLabel={t('Add a cook')}
            />
          </View>
        ) : (
          <>
            {cooks.length > 1 ? (
              <View style={{ marginTop: 18 }}>
                <ChipRow>
                  {cooks.map((cook) => (
                    <Chip
                      key={cook.id}
                      label={cook.name}
                      active={selected === cook.id}
                      onPress={() => setSelected(cook.id)}
                    />
                  ))}
                </ChipRow>
              </View>
            ) : null}

            <View style={{ marginTop: 18 }}>
              <MonthPicker month={month} onChange={changeMonth} />
            </View>

            {!detail ? (
              <Loading />
            ) : (
              <>
                <Panel style={{ marginTop: 18, gap: 8 }}>
                  <MemberRow
                    name={detail.cook.name}
                    sub={detail.cook.phone || detail.cook.schedule || undefined}
                    right={
                      manage ? (
                        <MiniButton
                          label={t('Edit')}
                          tone="plain"
                          onPress={() => setEditing(detail.cook)}
                        />
                      ) : null
                    }
                  />
                  <Divider />
                  <Row label={t('Monthly salary')} value={`৳${n(takaText(detail.cook.salary))}`} strong />
                  {detail.cook.schedule ? (
                    <Row label={t('Schedule')} value={detail.cook.schedule} />
                  ) : null}
                </Panel>

                <View style={{ marginTop: 16 }}>
                  <TileGrid>
                    <StatTile value={n(summary.present ?? 0)} label={t('Days present')} tone="good" />
                    <StatTile
                      value={n(summary.absent ?? 0)}
                      label={t('Days absent')}
                      tone={summary.absent ? 'bad' : undefined}
                    />
                    <StatTile value={n(summary.mealsCooked ?? 0)} label={t('Plates cooked')} />
                    <StatTile
                      value={n(mealText(summary.averagePerDay ?? 0))}
                      label={t('Average a day')}
                    />
                  </TileGrid>
                </View>

                {manage ? (
                  <View style={{ marginTop: 16, gap: 10 }}>
                    <Button
                      label={t('Record a day')}
                      icon="plus"
                      onPress={() => setRecording(true)}
                      block
                    />
                    <MiniButton
                      label={t('Pay the cook')}
                      icon="banknote"
                      tone="plain"
                      onPress={() => setPaying(true)}
                    />
                  </View>
                ) : null}

                {/* ---- attendance ---- */}
                <View style={{ marginTop: 20, gap: 10 }}>
                  <GroupLabel text={t('Attendance')} />
                  <Panel style={{ gap: 0 }}>
                    {detail.attendance.length ? (
                      detail.attendance.map((day) => (
                        <Row
                          key={day.id}
                          label={`${dayLabel(day.date, lang)}${day.replacementName ? ` · ${day.replacementName}` : ''}`}
                          value={
                            day.mealsCooked
                              ? t('{status} · {n} plates', {
                                  status: t(COOK_DAY_TEXT[day.status] ?? day.status),
                                  n: n(day.mealsCooked),
                                })
                              : t(COOK_DAY_TEXT[day.status] ?? day.status)
                          }
                          tone={
                            day.status === 'present' ? 'good' : day.status === 'absent' ? 'bad' : 'warn'
                          }
                        />
                      ))
                    ) : (
                      <Body muted style={{ paddingVertical: 12 }}>
                        {t('Nothing recorded this month.')}
                      </Body>
                    )}
                  </Panel>
                  <Body muted style={{ fontSize: type.xs }}>
                    {t('Plate counts also drive the food-waste estimate in analytics.')}
                  </Body>
                </View>

                {/* ---- payments ---- */}
                <View style={{ marginTop: 20, gap: 10, marginBottom: 8 }}>
                  <GroupLabel text={t('Payment history')} />
                  <Panel style={{ gap: 0 }}>
                    {detail.payments.length ? (
                      detail.payments.map((payment) => (
                        <Row
                          key={payment.id}
                          label={`${dayLabel(payment.date, lang)} · ${t(METHOD_TEXT[payment.method] ?? payment.method)}`}
                          value={`৳${n(takaText(payment.amount))}`}
                          tone="good"
                        />
                      ))
                    ) : (
                      <Body muted style={{ paddingVertical: 12 }}>
                        {t('No payments recorded.')}
                      </Body>
                    )}
                  </Panel>
                  <Body muted style={{ fontSize: type.xs }}>
                    {t('Each payment also becomes an expense, so the mess accounts and this list agree.')}
                  </Body>
                </View>
              </>
            )}
          </>
        )}
      </Container>

      <CookSheet
        cook={editing}
        onClose={() => setEditing(null)}
        onSave={async (body) => {
          const out = await run(() => saveCook(body), t('Saved.'));
          if (out?.ok) {
            setEditing(null);
            await fetchDetail();
          }
          return out;
        }}
      />

      <DaySheet
        open={recording}
        onClose={() => setRecording(false)}
        onSubmit={async (body) => {
          const out = await run(() => recordCookDay({ ...body, cookId: selected }), t('Recorded.'));
          if (out?.ok) {
            setRecording(false);
            await fetchDetail();
          }
          return out;
        }}
      />

      <PaySheet
        open={paying}
        salary={detail?.cook?.salary}
        onClose={() => setPaying(false)}
        onSubmit={async (body) => {
          const out = await run(() => payCook({ ...body, cookId: selected }), t('Paid.'));
          if (out?.ok) {
            setPaying(false);
            await fetchDetail();
          }
          return out;
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * sheets
 * ------------------------------------------------------------------ */

function CookSheet({ cook, onClose, onSave }) {
  const { t } = useLang();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('');
  const [schedule, setSchedule] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setName(cook?.name ?? '');
    setPhone(cook?.phone ?? '');
    setSalary(cook?.salary ? String(cook.salary) : '');
    setSchedule(cook?.schedule ?? '');
  }, [cook]);

  if (!cook) return null;

  const save = async () => {
    setBusy(true);
    await onSave({
      id: cook.id,
      name: name.trim(),
      phone: phone.trim() || undefined,
      salary: Number(salary) || 0,
      schedule: schedule.trim() || undefined,
    });
    setBusy(false);
  };

  return (
    <Sheet
      open={!!cook}
      onClose={onClose}
      title={cook.id ? t('Edit {name}', { name: cook.name }) : t('Add a cook')}
      footer={<Button label={t('Save')} onPress={save} disabled={busy || !name.trim()} block />}
    >
      <Field label={t('Name')} value={name} onChangeText={setName} maxLength={80} />
      <Field label={t('Phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={24} />
      <Field
        label={t('Monthly salary')}
        value={salary}
        onChangeText={setSalary}
        keyboardType="decimal-pad"
        suffix="৳"
        hint={t('Recorded here for reference. Paying it is a separate step that writes an expense.')}
      />
      <Field
        label={t('Schedule')}
        value={schedule}
        onChangeText={setSchedule}
        placeholder={t('e.g. 7am, 1pm and 8pm')}
        maxLength={200}
      />
    </Sheet>
  );
}

function DaySheet({ open, onClose, onSubmit }) {
  const { t } = useLang();

  const [date, setDate] = useState(todayKey());
  const [status, setStatus] = useState('present');
  const [plates, setPlates] = useState('');
  const [replacement, setReplacement] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      date,
      status,
      mealsCooked: Number(plates) || 0,
      replacementName: status === 'replaced' ? replacement.trim() : undefined,
    });
    setBusy(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Record a day')}
      footer={<Button label={t('Record it')} onPress={submit} disabled={busy} block />}
    >
      <Field label={t('Which day')} value={date} onChangeText={setDate} />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Status')} />
        <ChipRow>
          {Object.keys(COOK_DAY_TEXT).map((key) => (
            <Chip
              key={key}
              label={t(COOK_DAY_TEXT[key])}
              active={status === key}
              tone={key === 'present' ? 'good' : key === 'absent' ? 'bad' : 'warn'}
              onPress={() => setStatus(key)}
            />
          ))}
        </ChipRow>
      </View>

      {status === 'replaced' ? (
        <Field
          label={t('Who covered')}
          value={replacement}
          onChangeText={setReplacement}
          maxLength={80}
        />
      ) : null}

      <Field
        label={t('Plates cooked')}
        value={plates}
        onChangeText={setPlates}
        keyboardType="number-pad"
        hint={t('Comparing this against meals eaten is how the waste estimate is worked out.')}
      />
    </Sheet>
  );
}

function PaySheet({ open, salary, onClose, onSubmit }) {
  const { t } = useLang();

  const [date, setDate] = useState(todayKey());
  const [amount, setAmount] = useState(salary ? String(salary) : '');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (salary) setAmount(String(salary));
  }, [salary]);

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      date,
      amount: Number(amount) || 0,
      method,
      note: note.trim() || undefined,
    });
    setBusy(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Pay the cook')}
      footer={
        <Button label={t('Record the payment')} onPress={submit} disabled={busy || !(Number(amount) > 0)} block />
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
          style={{ flex: 1 }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('How')} />
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

      <Field label={t('Note (optional)')} value={note} onChangeText={setNote} maxLength={500} />

      <Body muted style={{ fontSize: 12 }}>
        {t(
          'This also writes a Cook Salary expense, which counts toward the meal rate — the labour of getting a meal onto a plate falls on whoever ate it.',
        )}
      </Body>
    </Sheet>
  );
}
