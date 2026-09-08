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
  DatePicker,
  Divider,
  Empty,
  Field,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
  Row,
  Sheet,
  StatTile,
  StatusPill,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import {
  ALLOCATION_HINT,
  ALLOCATION_TEXT,
  dayLabel,
  takaText,
  todayKey,
} from '../../../src/features/meal-management/format';

/**
 * Expenses. §4.4.
 *
 * The screen where §4.6's warning becomes visible: every row says whether it
 * counts toward the meal rate, because "rent went up" and "the meal rate went
 * up" are different sentences and a mess that cannot tell them apart argues
 * about the wrong one.
 *
 * The allocation mode is chosen when the expense is written, not at settlement
 * — "equally between the five of us" is a fact about the expense, and later
 * meals must not be able to change it.
 */
export default function Expenses() {
  const params = useLocalSearchParams();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const {
    month,
    changeMonth,
    can,
    createExpense,
    decideExpense,
    removeExpense,
    load,
    slice,
    keys,
  } = useMealManagement();

  const { data, loading } = useSlice('expenses');
  const categories = slice(keys.categories)?.categories ?? [];
  const members = slice(keys.members)?.members ?? [];

  const [status, setStatus] = useState(typeof params.status === 'string' ? params.status : 'all');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);

  useFocusEffect(
    useCallback(() => {
      load.expenses({ force: true });
      load.categories();
      load.members();
    }, [load]),
  );

  const all = data?.expenses ?? [];
  const shown = status === 'all' ? all : all.filter((row) => row.status === status);
  const totals = data?.totals ?? { approved: 0, pending: 0, food: 0, other: 0 };

  const decide = async (id, approve) => {
    setBusy(id);
    await run(
      () => decideExpense(id, approve),
      approve ? t('Expense approved.') : t('Expense rejected.'),
    );
    setBusy(null);
  };

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/money" />

        <SectionHeader
          lead={t('THE')}
          accent={t('EXPENSES')}
          subtitle={t('Everything the mess spent, and how each one is split.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

        <View style={{ marginTop: 18 }}>
          <TileGrid>
            <StatTile
              value={`৳${n(takaText(totals.food))}`}
              label={t('Counts in the meal rate')}
              tone="good"
            />
            <StatTile value={`৳${n(takaText(totals.other))}`} label={t('Split another way')} />
            <StatTile value={`৳${n(takaText(totals.approved))}`} label={t('Approved')} />
            <StatTile
              value={`৳${n(takaText(totals.pending))}`}
              label={t('Waiting')}
              tone={totals.pending ? 'warn' : undefined}
            />
          </TileGrid>
        </View>

        {can('add_expense') ? (
          <View style={{ marginTop: 16 }}>
            <Button label={t('Add an expense')} icon="plus" onPress={() => setAdding(true)} block />
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
            <Chip
              label={t('Rejected')}
              active={status === 'rejected'}
              tone="bad"
              onPress={() => setStatus('rejected')}
            />
          </ChipRow>

          {loading && !data ? (
            <Loading />
          ) : !shown.length ? (
            <Empty
              icon="receipt"
              title={t('No expenses here')}
              hint={t('Gas, rent, wifi, the cook’s salary — anything the mess pays for.')}
              action={can('add_expense') ? () => setAdding(true) : undefined}
              actionLabel={t('Add an expense')}
            />
          ) : (
            shown.map((expense) => (
              <Panel
                key={expense.id}
                tone={expense.status === 'submitted' ? 'warn' : undefined}
                style={{ gap: 9 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
                    >
                      {expense.categoryLabel}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ marginTop: 2, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                    >
                      {dayLabel(expense.date, lang)}
                      {expense.payerName ? ` · ${t('paid by {name}', { name: expense.payerName })}` : ''}
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
                    ৳{n(takaText(expense.amount))}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <StatusPill status={expense.status} />
                  <Chip
                    label={
                      expense.foodCost ? t('In the meal rate') : t(ALLOCATION_TEXT[expense.allocationMode] ?? '')
                    }
                    active
                    tone={expense.foodCost ? 'good' : 'warn'}
                    onPress={() => {}}
                  />
                </View>

                {expense.note ? (
                  <Body muted style={{ fontSize: type.xs }} numberOfLines={2}>
                    {expense.note}
                  </Body>
                ) : null}

                {expense.status === 'submitted' && data?.canApprove ? (
                  <ApprovalActions
                    busy={busy === expense.id}
                    onApprove={() => decide(expense.id, true)}
                    onReject={() => decide(expense.id, false)}
                  />
                ) : null}

                {expense.status === 'draft' ? (
                  <Chip
                    label={t('Delete this draft')}
                    tone="bad"
                    onPress={() => run(() => removeExpense(expense.id), t('Deleted.'))}
                  />
                ) : null}
              </Panel>
            ))
          )}
        </View>
      </Container>

      <ExpenseSheet
        open={adding}
        onClose={() => setAdding(false)}
        categories={categories.filter((c) => c.active)}
        members={members.filter((m) => m.status === 'active')}
        onSubmit={async (body) => {
          const out = await run(() => createExpense(body), t('Expense added.'));
          if (out?.ok) setAdding(false);
          return out;
        }}
      />
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * adding one
 * ------------------------------------------------------------------ */

function ExpenseSheet({ open, onClose, categories, members, onSubmit }) {
  const { t, n } = useLang();
  const { colors } = useTheme();

  const [date, setDate] = useState(todayKey());
  const [amount, setAmount] = useState('');
  const [categoryKey, setCategoryKey] = useState(null);
  const [mode, setMode] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [shares, setShares] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const category = categories.find((c) => c.key === categoryKey) ?? null;
  const effectiveMode = mode ?? category?.defaultAllocation ?? 'equal';

  const pick = (key) => {
    setCategoryKey(key);
    /* Following the category's own default is the right first guess, and the
       person can still say otherwise. */
    setMode(null);
  };

  const sharesTotal = Object.values(shares).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const balanced =
    effectiveMode !== 'custom' || Math.abs(sharesTotal - (Number(amount) || 0)) < 0.01;

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      date,
      amount: Number(amount) || 0,
      categoryKey,
      allocationMode: effectiveMode,
      memberIds: ['selected', 'individual'].includes(effectiveMode) ? chosen : undefined,
      shares:
        effectiveMode === 'custom'
          ? Object.fromEntries(
              Object.entries(shares)
                .map(([key, value]) => [key, Number(value) || 0])
                .filter(([, value]) => value !== 0),
            )
          : undefined,
      note: note.trim() || undefined,
    });
    setBusy(false);
  };

  const toggle = (memberId) =>
    setChosen((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Add an expense')}
      footer={
        <Button
          label={t('Add it')}
          onPress={submit}
          disabled={busy || !categoryKey || !(Number(amount) > 0) || !balanced}
          block
        />
      }
    >
      {/* Amount first: it is the one thing that is certainly not already
          right. The day defaults to today, which is what it is for most
          entries, so it sits underneath rather than beside. */}
      <Field
        label={t('How much')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        suffix="৳"
        placeholder="0"
      />

      <DatePicker label={t('Which day')} value={date} onChange={setDate} />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Category')} />
        <ChipRow>
          {categories.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              active={categoryKey === c.key}
              tone={c.foodCost ? 'good' : 'primary'}
              onPress={() => pick(c.key)}
            />
          ))}
        </ChipRow>
        {category ? (
          <Body muted style={{ fontSize: 12 }}>
            {category.foodCost
              ? t('This counts toward the meal rate, so it falls on whoever ate.')
              : t('This does not touch the meal rate — it is split on its own.')}
          </Body>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('How it splits')} />
        <ChipRow>
          {Object.keys(ALLOCATION_TEXT).map((key) => (
            <Chip
              key={key}
              label={t(ALLOCATION_TEXT[key])}
              active={effectiveMode === key}
              onPress={() => setMode(key)}
            />
          ))}
        </ChipRow>
        <Body muted style={{ fontSize: 12 }}>
          {t(ALLOCATION_HINT[effectiveMode] ?? '')}
        </Body>
      </View>

      {['selected', 'individual'].includes(effectiveMode) ? (
        <View style={{ gap: 8 }}>
          <GroupLabel text={effectiveMode === 'individual' ? t('Charged to') : t('Split between')} />
          <ChipRow>
            {members.map((member) => (
              <Chip
                key={member.memberId}
                label={member.name}
                active={chosen.includes(member.memberId)}
                onPress={() =>
                  effectiveMode === 'individual' ? setChosen([member.memberId]) : toggle(member.memberId)
                }
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      {effectiveMode === 'custom' ? (
        <View style={{ gap: 8 }}>
          <GroupLabel text={t('Each share')} />
          {members.map((member) => (
            <View
              key={member.memberId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Body style={{ flex: 1 }}>{member.name}</Body>
              <Field
                value={shares[member.memberId] ?? ''}
                onChangeText={(value) =>
                  setShares((prev) => ({ ...prev, [member.memberId]: value }))
                }
                keyboardType="decimal-pad"
                placeholder="0"
                suffix="৳"
                style={{ width: 120 }}
              />
            </View>
          ))}
          <Divider />
          <Row
            label={t('Shares add up to')}
            value={`৳${n(takaText(sharesTotal))}`}
            tone={balanced ? 'good' : 'bad'}
            strong
          />
          {!balanced ? (
            <Body muted style={{ fontSize: 12, color: colors.primary }}>
              {t('They have to add up to ৳{n}.', { n: n(takaText(Number(amount) || 0)) })}
            </Body>
          ) : null}
        </View>
      ) : null}

      <Field
        label={t('Note (optional)')}
        value={note}
        onChangeText={setNote}
        placeholder={t('e.g. September gas bill')}
        multiline
        maxLength={500}
      />
    </Sheet>
  );
}
