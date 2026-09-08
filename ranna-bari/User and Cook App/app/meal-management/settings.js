import React, { useCallback, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import MessScreen, { Container } from '../../src/features/meal-management/MessScreen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Divider,
  Field,
  GroupLabel,
  Loading,
  MiniButton,
  Panel,
  Row,
  Sheet,
} from '../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import { ALLOCATION_TEXT, clockLabel } from '../../src/features/meal-management/format';

/**
 * Mess settings. §4.1's last line, and §4.6's accounting policy.
 *
 * Every switch here changes what a member is billed, so each one carries the
 * sentence that says how. The two that matter most are the meal-rate policy —
 * §4.6's warning about rent — and the cutoffs, which decide when a meal stops
 * being a decision and becomes a request.
 *
 * A member without the permission still sees this screen, read-only. Knowing
 * the rules you are being billed under is not an admin privilege.
 */
export default function Settings() {
  const { t, n } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { can, saveSettings, saveMealType, saveCategory, removeCategory, archiveMess, load } =
    useMealManagement();

  const { data, loading } = useSlice('settings');
  const categories = useSlice('categories');

  const [editingType, setEditingType] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [tab, setTab] = useState('meals');

  useFocusEffect(
    useCallback(() => {
      load.settings({ force: true });
      load.categories({ force: true });
    }, [load]),
  );

  const manage = can('mess_settings');
  const settings = data?.settings ?? {};
  const mealTypes = data?.mealTypes ?? [];

  const toggle = (key, value) =>
    run(() => saveSettings({ settings: { [key]: value } }), t('Saved.'));

  const Toggle = ({ label, hint, field, invert }) => (
    <View style={{ gap: 5, paddingVertical: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
          {label}
        </Text>
        <Switch
          value={invert ? settings[field] === false : settings[field] !== false}
          onValueChange={(value) => toggle(field, invert ? !value : value)}
          disabled={!manage}
          trackColor={{ true: colors.sage, false: colors.line }}
        />
      </View>
      {hint ? (
        <Body muted style={{ fontSize: type.xs }}>
          {hint}
        </Body>
      ) : null}
    </View>
  );

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('MESS')}
          accent={t('SETTINGS')}
          subtitle={data?.mess?.name}
          style={{ marginTop: 16 }}
        />

        {!manage ? (
          <Panel style={{ marginTop: 16, gap: 5 }}>
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
              {t('Read only')}
            </Text>
            <Body muted style={{ fontSize: type.xs }}>
              {t('These are the rules you are billed under. Only an admin can change them.')}
            </Body>
          </Panel>
        ) : null}

        <View style={{ marginTop: 18 }}>
          <ChipRow>
            <Chip label={t('Meals')} active={tab === 'meals'} onPress={() => setTab('meals')} />
            <Chip label={t('Money')} active={tab === 'money'} onPress={() => setTab('money')} />
            <Chip
              label={t('Categories')}
              active={tab === 'categories'}
              onPress={() => setTab('categories')}
            />
            <Chip
              label={t('Approvals')}
              active={tab === 'approvals'}
              onPress={() => setTab('approvals')}
            />
          </ChipRow>
        </View>

        {loading && !data ? (
          <Loading />
        ) : tab === 'meals' ? (
          <View style={{ marginTop: 18, gap: 12, marginBottom: 8 }}>
            <GroupLabel text={t('Sittings and cutoffs')} />

            {mealTypes.map((type_) => (
              <Panel key={type_.key} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
                      {t(type_.label)}
                    </Text>
                    <Text
                      style={{ marginTop: 2, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                    >
                      {type_.cutoff
                        ? type_.cutoffDayOffset === -1
                          ? t('locks at {time} the night before', { time: clockLabel(type_.cutoff) })
                          : t('locks at {time} the same day', { time: clockLabel(type_.cutoff) })
                        : t('never locks')}
                    </Text>
                  </View>
                  {manage ? (
                    <MiniButton label={t('Edit')} tone="plain" onPress={() => setEditingType(type_)} />
                  ) : null}
                </View>

                {!type_.countsInRate ? (
                  <Body muted style={{ fontSize: type.xs }}>
                    {t('Does not count toward the meal rate.')}
                  </Body>
                ) : null}
                {!type_.active ? (
                  <Body muted style={{ fontSize: type.xs }}>
                    {t('Turned off — past meals still show, new ones cannot be recorded.')}
                  </Body>
                ) : null}
              </Panel>
            ))}

            <Panel style={{ gap: 10 }}>
              <GroupLabel text={t('Meal values')} />
              <Body muted style={{ fontSize: type.xs }}>
                {t('What a member may pick beyond simply on or off.')}
              </Body>
              <ChipRow>
                {(settings.allowedMealValues ?? [1]).map((value) => (
                  <Chip key={value} label={String(value)} active tone="good" onPress={() => {}} />
                ))}
              </ChipRow>
              {manage ? (
                <ChipRow>
                  {[
                    { label: t('Whole meals only'), values: [1] },
                    { label: t('Half meals'), values: [0.5, 1] },
                    { label: t('Half and double'), values: [0.5, 1, 1.5, 2] },
                  ].map((option) => (
                    <Chip
                      key={option.label}
                      label={option.label}
                      onPress={() => toggle('allowedMealValues', option.values)}
                    />
                  ))}
                </ChipRow>
              ) : null}
            </Panel>

            <Panel style={{ gap: 0 }}>
              <Toggle
                label={t('Co-admins can edit others’ meals')}
                hint={t('An admin always can. This decides whether a co-admin may too.')}
                field="coAdminCanEditOthersMeal"
              />
              <Divider />
              <Row label={t('Guest plates per sitting')} value={n(settings.maxGuestPerMeal ?? 10)} />
            </Panel>
          </View>
        ) : tab === 'money' ? (
          <View style={{ marginTop: 18, gap: 12, marginBottom: 8 }}>
            <Panel style={{ gap: 0 }}>
              <GroupLabel text={t('The accounting policy')} style={{ marginBottom: 4 }} />
              <Toggle
                label={t('Put every expense into the meal rate')}
                hint={t(
                  'Off — the recommendation — keeps rent, wifi and electricity out of the rate, so somebody who eats out all month is not charged for meals they did not take.',
                )}
                field="allExpensesInMealRate"
                invert
              />
            </Panel>

            <Panel style={{ gap: 10 }}>
              <GroupLabel text={t('Rounding')} />
              <Body muted style={{ fontSize: type.xs }}>
                {t('How the meal rate is rounded before anybody is billed with it.')}
              </Body>
              <ChipRow>
                {[
                  { key: 'none', label: t('Exact') },
                  { key: 'nearest', label: t('Nearest paisa') },
                  { key: 'up', label: t('Round up') },
                  { key: 'whole', label: t('Whole taka') },
                ].map((option) => (
                  <Chip
                    key={option.key}
                    label={option.label}
                    active={(settings.rounding ?? 'none') === option.key}
                    disabled={!manage}
                    onPress={() => toggle('rounding', option.key)}
                  />
                ))}
              </ChipRow>
              <Body muted style={{ fontSize: type.xs }}>
                {t('Anything but exact leaves a little over or under, which the settlement shows openly.')}
              </Body>
            </Panel>

            <Panel style={{ gap: 0 }}>
              <Toggle
                label={t('Carry balances into next month')}
                hint={t('Off means every month starts clean and the mess settles in cash.')}
                field="carryForwardBalances"
              />
              <Divider />
              <Toggle
                label={t('Members can see the whole mess’s reports')}
                hint={t('Off narrows a member to their own figures. They always see the rate.')}
                field="membersSeeFullReports"
              />
              <Divider />
              <Row label={t('Month starts on day')} value={n(settings.monthStartDay ?? 1)} />
              <Row label={t('Timezone')} value={settings.timezone ?? 'Asia/Dhaka'} />
            </Panel>
          </View>
        ) : tab === 'categories' ? (
          <View style={{ marginTop: 18, gap: 12, marginBottom: 8 }}>
            <GroupLabel
              text={t('Expense categories')}
              right={
                can('manage_categories') ? (
                  <MiniButton
                    label={t('Add')}
                    icon="plus"
                    tone="plain"
                    onPress={() => setEditingCategory({ key: '', label: '', foodCost: false })}
                  />
                ) : null
              }
            />

            <Body muted style={{ fontSize: type.xs }}>
              {t('A category marked green counts toward the meal rate. The rest split their own way.')}
            </Body>

            {(categories.data?.categories ?? []).map((category) => (
              <Panel
                key={category.key}
                tone={category.foodCost ? 'good' : undefined}
                style={{ gap: 6, opacity: category.active ? 1 : 0.55 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
                      {category.label}
                    </Text>
                    <Text
                      style={{ marginTop: 2, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                    >
                      {category.foodCost
                        ? t('counts toward the meal rate')
                        : t('splits by: {mode}', {
                            mode: t(ALLOCATION_TEXT[category.defaultAllocation] ?? category.defaultAllocation),
                          })}
                    </Text>
                  </View>
                  {can('manage_categories') ? (
                    <MiniButton
                      label={t('Edit')}
                      tone="plain"
                      onPress={() => setEditingCategory(category)}
                    />
                  ) : null}
                </View>
              </Panel>
            ))}
          </View>
        ) : (
          <View style={{ marginTop: 18, gap: 12, marginBottom: 8 }}>
            <Panel style={{ gap: 0 }}>
              <GroupLabel text={t('Which approvals this mess enforces')} style={{ marginBottom: 4 }} />
              <Toggle
                label={t('Bazar needs approval')}
                hint={t('Off means a recorded bazar goes straight into the meal rate.')}
                field="requireBazarApproval"
              />
              <Divider />
              <Toggle label={t('Expenses need approval')} field="requireExpenseApproval" />
              <Divider />
              <Toggle label={t('Deposits need approval')} field="requireDepositApproval" />
              <Divider />
              <Toggle
                label={t('New members need approval')}
                hint={t('Off means anybody with the code joins immediately.')}
                field="requireJoinApproval"
              />
            </Panel>

            <Body muted style={{ fontSize: type.xs }}>
              {t(
                'Turning an approval off does not change the arithmetic — only approved records ever count, and without the step they are approved as they are written.',
              )}
            </Body>

            {manage ? (
              <MiniButton
                label={t('Archive this mess')}
                icon="lock"
                tone="bad"
                onPress={() => run(() => archiveMess(), t('The mess is archived.'))}
              />
            ) : null}
          </View>
        )}
      </Container>

      <MealTypeSheet
        type_={editingType}
        onClose={() => setEditingType(null)}
        onSave={async (body) => {
          const out = await run(() => saveMealType(body), t('Saved.'));
          if (out?.ok) setEditingType(null);
          return out;
        }}
      />

      <CategorySheet
        category={editingCategory}
        onClose={() => setEditingCategory(null)}
        onSave={async (body) => {
          const out = await run(() => saveCategory(body), t('Saved.'));
          if (out?.ok) setEditingCategory(null);
          return out;
        }}
        onRemove={async (key) => {
          const out = await run(() => removeCategory(key), t('Turned off.'));
          if (out?.ok) setEditingCategory(null);
          return out;
        }}
      />
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * sheets
 * ------------------------------------------------------------------ */

function MealTypeSheet({ type_, onClose, onSave }) {
  const { t } = useLang();

  const [label, setLabel] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [offset, setOffset] = useState(0);
  const [countsInRate, setCounts] = useState(true);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setLabel(type_?.label ?? '');
    setCutoff(type_?.cutoff ?? '');
    setOffset(type_?.cutoffDayOffset ?? 0);
    setCounts(type_?.countsInRate !== false);
    setActive(type_?.active !== false);
  }, [type_]);

  if (!type_) return null;

  const save = async () => {
    setBusy(true);
    await onSave({
      key: type_.key,
      label: label.trim() || type_.key,
      cutoff: cutoff.trim(),
      cutoffDayOffset: offset,
      countsInRate,
      active,
    });
    setBusy(false);
  };

  return (
    <Sheet
      open={!!type_}
      onClose={onClose}
      title={t('Edit {name}', { name: type_.label })}
      footer={<Button label={t('Save')} onPress={save} disabled={busy} block />}
    >
      <Field label={t('Name')} value={label} onChangeText={setLabel} maxLength={40} />

      <Field
        label={t('Cutoff time')}
        value={cutoff}
        onChangeText={setCutoff}
        placeholder="09:00"
        hint={t('24-hour, like 09:00 or 21:00. Leave empty and it never locks.')}
        maxLength={5}
      />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('The cutoff is on')} />
        <ChipRow>
          <Chip label={t('The same day')} active={offset === 0} onPress={() => setOffset(0)} />
          <Chip label={t('The night before')} active={offset === -1} onPress={() => setOffset(-1)} />
        </ChipRow>
        <Body muted style={{ fontSize: 12 }}>
          {t('Breakfast usually locks the night before — by morning the eggs are already bought.')}
        </Body>
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Counts toward the meal rate')} />
        <ChipRow>
          <Chip label={t('Yes')} active={countsInRate} tone="good" onPress={() => setCounts(true)} />
          <Chip label={t('No')} active={!countsInRate} onPress={() => setCounts(false)} />
        </ChipRow>
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('In use')} />
        <ChipRow>
          <Chip label={t('Yes')} active={active} tone="good" onPress={() => setActive(true)} />
          <Chip label={t('Turned off')} active={!active} tone="bad" onPress={() => setActive(false)} />
        </ChipRow>
        <Body muted style={{ fontSize: 12 }}>
          {t('Turning a sitting off keeps every past meal readable — it just leaves tomorrow’s form.')}
        </Body>
      </View>
    </Sheet>
  );
}

function CategorySheet({ category, onClose, onSave, onRemove }) {
  const { t } = useLang();

  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [foodCost, setFoodCost] = useState(false);
  const [allocation, setAllocation] = useState('equal');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setKey(category?.key ?? '');
    setLabel(category?.label ?? '');
    setFoodCost(!!category?.foodCost);
    setAllocation(category?.defaultAllocation ?? 'equal');
  }, [category]);

  if (!category) return null;

  const isNew = !category.key;

  const save = async () => {
    setBusy(true);
    await onSave({
      key: isNew ? label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') : key,
      label: label.trim(),
      foodCost,
      defaultAllocation: foodCost ? 'meal' : allocation,
    });
    setBusy(false);
  };

  return (
    <Sheet
      open={!!category}
      onClose={onClose}
      title={isNew ? t('New category') : t('Edit {name}', { name: category.label })}
      footer={<Button label={t('Save')} onPress={save} disabled={busy || !label.trim()} block />}
    >
      <Field label={t('Name')} value={label} onChangeText={setLabel} maxLength={40} />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Does this count toward the meal rate?')} />
        <ChipRow>
          <Chip
            label={t('Yes — it is food')}
            active={foodCost}
            tone="good"
            onPress={() => setFoodCost(true)}
          />
          <Chip label={t('No')} active={!foodCost} onPress={() => setFoodCost(false)} />
        </ChipRow>
        <Body muted style={{ fontSize: 12 }}>
          {foodCost
            ? t('It will be divided by everyone’s meals, so it falls on whoever ate.')
            : t('It will be split the way you choose below, whatever anybody ate.')}
        </Body>
      </View>

      {!foodCost ? (
        <View style={{ gap: 8 }}>
          <GroupLabel text={t('How it usually splits')} />
          <ChipRow>
            {['equal', 'selected', 'custom', 'individual'].map((mode) => (
              <Chip
                key={mode}
                label={t(ALLOCATION_TEXT[mode])}
                active={allocation === mode}
                onPress={() => setAllocation(mode)}
              />
            ))}
          </ChipRow>
          <Body muted style={{ fontSize: 12 }}>
            {t('Whoever adds an expense can still choose otherwise.')}
          </Body>
        </View>
      ) : null}

      {!isNew && !category.system ? (
        <MiniButton
          label={t('Turn this category off')}
          icon="x"
          tone="bad"
          onPress={() => onRemove(category.key)}
        />
      ) : null}

      {category.system ? (
        <Body muted style={{ fontSize: 12 }}>
          {t('This is one of the built-in categories, so it cannot be removed — only renamed.')}
        </Body>
      ) : null}
    </Sheet>
  );
}
