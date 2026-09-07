import React, { useCallback, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import FloatLabelInput, { FormNote } from '../../src/components/FloatLabelInput';
import { Body, Heading } from '../../src/components/Typography';
import { useAlert } from '../../src/components/Alert';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Divider,
  Empty,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
  Row,
  StatTile,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import {
  dayLabel,
  monthLabel,
  takaText,
  todayKey,
} from '../../src/features/meal-management/format';

const CATEGORIES = [
  { key: 'bazar', label: 'Food / Bazar' },
  { key: 'gas', label: 'Gas / Kitchen' },
  { key: 'utility', label: 'Utility' },
  { key: 'rent', label: 'Rent' },
  { key: 'other', label: 'Other' },
];

const METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'bkash', label: 'bKash' },
  { key: 'card', label: 'Card' },
  { key: 'other', label: 'Other' },
];

/**
 * What the mess spent.
 *
 * Each row says whether it counts toward the rate, because that is the only
 * property of an expense a person needs to reason about here — rent is real
 * money and still not part of what a meal cost, and a list that hid the
 * distinction would make the rate look wrong.
 */
export default function Expenses() {
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const alert = useAlert();
  const run = useMealAction();

  const { month, expenses, loadExpenses, deleteExpense, changeMonth } = useMealManagement();
  const [addOpen, setAddOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadExpenses(month);
    }, [loadExpenses, month]),
  );

  const closed = !!expenses?.closed;
  const rows = expenses?.expenses ?? [];
  const totals = expenses?.totals ?? { total: 0, applicable: 0 };

  const confirmRemove = (row) => {
    alert.confirm({
      title: t('Remove this expense?'),
      body: t('৳{n} will come out of this month, and the meal rate will change.', {
        n: n(takaText(row.amount)),
      }),
      confirmLabel: t('Remove'),
      onConfirm: () => run(() => deleteExpense(row.id), t('Removed.')),
    });
  };

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('MESS')}
          accent={t('EXPENSES')}
          subtitle={monthLabel(month, lang)}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <MonthPicker month={month} onChange={changeMonth} />
        </View>

        {!expenses ? (
          <Loading />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <StatTile
                value={`৳${n(takaText(totals.applicable))}`}
                label={t('Counted in the rate')}
                tone="good"
              />
              <StatTile value={`৳${n(takaText(totals.total))}`} label={t('Spent altogether')} />
            </View>

            {!closed ? (
              <Button
                label={t('Add an expense')}
                icon="plus"
                block
                style={{ marginTop: 16 }}
                onPress={() => setAddOpen(true)}
              />
            ) : (
              <Panel tone="warn" style={{ marginTop: 16 }}>
                <Body>{t('This month is settled, so its costs are frozen.')}</Body>
              </Panel>
            )}

            <GroupLabel text={t('This month')} style={{ marginTop: 26 }} />

            {!rows.length ? (
              <View style={{ marginTop: 12 }}>
                <Empty
                  icon="box"
                  title={t('Nothing spent yet')}
                  hint={t('Add what the mess bought and the meal rate works itself out.')}
                />
              </View>
            ) : (
              <View style={{ gap: 10, marginTop: 12, marginBottom: 12 }}>
                {rows.map((r, i) => (
                  <Reveal key={r.id} delay={(i % 5) + 1}>
                    <Panel>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Heading size={16}>
                            {t(CATEGORIES.find((c) => c.key === r.category)?.label ?? r.category)}
                          </Heading>
                          <Body muted style={{ marginTop: 2, fontSize: 12.5 }}>
                            {dayLabel(r.date, lang)}
                            {r.vendor ? ` · ${r.vendor}` : ''}
                          </Body>
                          {r.note ? (
                            <Body muted style={{ marginTop: 4, fontSize: 12.5 }}>
                              {r.note}
                            </Body>
                          ) : null}
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={{
                              fontFamily: font.displayBold,
                              fontSize: 18,
                              color: colors.text,
                              fontVariant: ['tabular-nums'],
                            }}
                          >
                            ৳{n(takaText(r.amount))}
                          </Text>
                          <Text
                            style={{
                              marginTop: 2,
                              fontFamily: font.ui,
                              fontSize: 11.5,
                              color:
                                (expenses.totals?.byCategory ?? []).find(
                                  (c) => c.category === r.category,
                                )?.applicable
                                  ? colors.sage
                                  : colors.textLight,
                            }}
                          >
                            {(expenses.totals?.byCategory ?? []).find(
                              (c) => c.category === r.category,
                            )?.applicable
                              ? t('Counted')
                              : t('Not counted')}
                          </Text>
                        </View>
                      </View>

                      {!closed ? (
                        <>
                          <Divider />
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => confirmRemove(r)}
                            style={({ pressed }) => ({
                              paddingTop: 10,
                              opacity: pressed ? 0.6 : 1,
                            })}
                          >
                            <Text
                              style={{
                                fontFamily: font.uiBold,
                                fontSize: type.sm,
                                color: colors.primary,
                              }}
                            >
                              {t('Remove')}
                            </Text>
                          </Pressable>
                        </>
                      ) : null}
                    </Panel>
                  </Reveal>
                ))}
              </View>
            )}
          </>
        )}
      </Container>

      <AddExpense open={addOpen} onClose={() => setAddOpen(false)} month={month} />
    </Screen>
  );
}

/** The add form, as a sheet — every field the specification lists. */
function AddExpense({ open, onClose, month }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const run = useMealAction();
  const { createExpense } = useMealManagement();

  const [date, setDate] = useState(todayKey());
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('bazar');
  const [method, setMethod] = useState('cash');
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const amountNumber = Number(amount);
  const valid = Number.isFinite(amountNumber) && amountNumber > 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const out = await run(
      () =>
        createExpense({
          date,
          /* The route takes a number; the field holds a string. */
          amount: Math.round(amountNumber),
          category,
          method,
          vendor: vendor.trim(),
          note: note.trim(),
        }),
      t('Added.'),
    );
    setBusy(false);
    if (out?.ok !== false) {
      setAmount('');
      setVendor('');
      setNote('');
      onClose();
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.canvas,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: 20,
            maxHeight: '90%',
          }}
        >
          <Heading size={18}>{t('Add an expense')}</Heading>

          <FloatLabelInput
            label={t('Amount in taka')}
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            style={{ marginTop: 16 }}
          />

          <FloatLabelInput
            label={t('Date')}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            style={{ marginTop: 12 }}
          />

          <Body muted style={{ marginTop: 14, fontSize: 12.5 }}>
            {t('Category')}
          </Body>
          <View style={{ marginTop: 8 }}>
            <ChipRow>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.key}
                  label={t(c.label)}
                  active={category === c.key}
                  onPress={() => setCategory(c.key)}
                />
              ))}
            </ChipRow>
          </View>

          <Body muted style={{ marginTop: 14, fontSize: 12.5 }}>
            {t('Paid with')}
          </Body>
          <View style={{ marginTop: 8 }}>
            <ChipRow>
              {METHODS.map((m) => (
                <Chip
                  key={m.key}
                  label={t(m.label)}
                  active={method === m.key}
                  tone="sage"
                  onPress={() => setMethod(m.key)}
                />
              ))}
            </ChipRow>
          </View>

          <FloatLabelInput
            label={t('Shop or vendor (optional)')}
            value={vendor}
            onChangeText={setVendor}
            style={{ marginTop: 14 }}
          />

          <FloatLabelInput
            label={t('Note (optional)')}
            value={note}
            onChangeText={setNote}
            style={{ marginTop: 12 }}
          />

          {category === 'rent' ? (
            <FormNote
              tone="warn"
              text={t('Rent does not count toward your meal rate unless you change that in settings.')}
            />
          ) : null}

          <Button
            label={valid ? t('Add ৳{n}', { n: n(takaText(amountNumber)) }) : t('Add expense')}
            block
            disabled={!valid || busy}
            style={{ marginTop: 18 }}
            onPress={submit}
          />
          <Button variant="ghost" label={t('Cancel')} block style={{ marginTop: 8 }} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
