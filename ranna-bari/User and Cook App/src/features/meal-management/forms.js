import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Body } from '../../components/Typography';
import { useTheme } from '../../theme/ThemeProvider';
import { font, type } from '../../theme/tokens';
import { useLang } from '../../i18n/LanguageContext';

import {
  Chip,
  ChipRow,
  DatePicker,
  Field,
  GroupLabel,
  MiniButton,
  Panel,
  Row,
  Sheet,
} from './components';
import { takaText, todayKey } from './format';

/**
 * Forms that more than one screen opens.
 *
 * They live here rather than beside the list they usually belong to because a
 * screen file under `app/` is a *route*, and importing a component out of one
 * makes another route depend on a route. That works, but it makes the router's
 * view of the tree wrong in a way nothing warns about — so anything two
 * screens share comes out into the feature folder instead.
 */

const UNITS = ['kg', 'litre', 'piece', 'packet', 'dozen'];

const blankItem = () => ({ name: '', qty: '', unit: 'kg', unitPrice: '' });

/**
 * Record or edit a shopping trip. §4.3.
 *
 * The lines are entered in one sheet and sent in one request, because §4.3's
 * workflow has somebody standing over a receipt typing a list — a network hop
 * between each line is how half a bazar ends up saved.
 *
 * The total is never typed. It is the sum of the lines and updates as they are
 * entered, which is what makes an approver's job a comparison rather than an
 * act of faith.
 */
export function BazarSheet({ open, onClose, onSubmit, initial }) {
  const { t, n } = useLang();
  const { colors } = useTheme();

  const [date, setDate] = useState(initial?.date ?? todayKey());
  const [note, setNote] = useState(initial?.note ?? '');
  const [items, setItems] = useState(
    initial?.items?.length
      ? initial.items.map((item) => ({
          name: item.name,
          qty: String(item.qty ?? ''),
          unit: item.unit ?? 'kg',
          unitPrice: String(item.unitPrice ?? ''),
        }))
      : [blankItem()],
  );
  const [busy, setBusy] = useState(false);

  const update = (index, patch) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const total = items.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
    0,
  );

  const usable = items.filter((item) => item.name.trim() && Number(item.unitPrice) > 0);

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      date,
      note: note.trim() || undefined,
      items: usable.map((item) => ({
        name: item.name.trim(),
        qty: Number(item.qty) || 0,
        unit: item.unit,
        unitPrice: Number(item.unitPrice) || 0,
      })),
    });
    setBusy(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? t('Edit the bazar') : t('Record a bazar')}
      footer={
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.textMuted }}>
              {t('Total')}
            </Text>
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: type.h3,
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              ৳{n(takaText(total))}
            </Text>
          </View>
          <Button
            label={t('Save and submit')}
            onPress={submit}
            disabled={busy || !usable.length}
            block
          />
        </View>
      }
    >
      <DatePicker label={t('Which day')} value={date} onChange={setDate} />

      <View style={{ gap: 10 }}>
        <GroupLabel
          text={t('What was bought')}
          right={
            <MiniButton
              label={t('Add line')}
              icon="plus"
              tone="plain"
              onPress={() => setItems((prev) => [...prev, blankItem()])}
            />
          }
        />

        {items.map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Panel key={index} style={{ gap: 10, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Field
                value={item.name}
                onChangeText={(value) => update(index, { name: value })}
                placeholder={t('Item, e.g. Rice')}
                style={{ flex: 1 }}
                maxLength={80}
              />
              {items.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Remove line')}
                  onPress={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
                >
                  <Icon name="x" size={17} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field
                value={item.qty}
                onChangeText={(value) => update(index, { qty: value })}
                placeholder="0"
                keyboardType="decimal-pad"
                style={{ flex: 1 }}
              />
              <Field
                value={item.unitPrice}
                onChangeText={(value) => update(index, { unitPrice: value })}
                placeholder="0"
                keyboardType="decimal-pad"
                suffix="৳"
                style={{ flex: 1.2 }}
              />
            </View>

            <ChipRow>
              {UNITS.map((unit) => (
                <Chip
                  key={unit}
                  label={t(unit)}
                  active={item.unit === unit}
                  onPress={() => update(index, { unit })}
                />
              ))}
            </ChipRow>

            <Row
              label={t('Line total')}
              value={`৳${n(takaText((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)))}`}
            />
          </Panel>
        ))}
      </View>

      <Field
        label={t('Note (optional)')}
        value={note}
        onChangeText={setNote}
        placeholder={t('e.g. weekly bazar from Karwan Bazar')}
        multiline
        maxLength={500}
      />

      <Body muted style={{ fontSize: 12 }}>
        {t('The total is the sum of these lines. It reaches the meal rate once it is approved.')}
      </Body>
    </Sheet>
  );
}
