import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import Button from '../../../src/components/Button';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BottomNav,
  Chip,
  ChipRow,
  Field,
  GroupLabel,
  Loading,
  MealToggle,
  MemberRow,
  MiniButton,
  NavRow,
  Panel,
  Sheet,
  StatTile,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import {
  dayLabel,
  mealText,
  shiftDay,
  todayKey,
  untilLabel,
} from '../../../src/features/meal-management/format';

/**
 * Today's meal. §4.2's first screen and §6's Meals tab.
 *
 * The specification's recommended workflow starts here: open Today's Meal,
 * pick your sittings, the system checks the cutoff. So this screen is one tap
 * per sitting and nothing else above the fold — the calendar, the history and
 * the corrections all live a tap further in.
 *
 * Somebody who can edit other people's meals gets the whole mess underneath,
 * because a manager filling in for four members who have no phones is the
 * other thing this screen is for.
 */
export default function TodayMeals() {
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { mealTypes, can, setMeal, setMealsBulk, addLeave, load, dashboard } = useMealManagement();
  const { data, loading, reload } = useSlice('today');

  const [date, setDate] = useState(todayKey());
  const [day, setDay] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  /* The slice is today; any other day is fetched on demand rather than cached,
     because stepping through days would otherwise fill the cache with a month
     of payloads nobody comes back to. */
  const { getDay } = useMealManagement();

  const showing = date === todayKey() ? data : day;

  useFocusEffect(
    useCallback(() => {
      if (date === todayKey()) {
        load.today({ force: true });
        setDay(null);
      } else {
        getDay(date).then((out) => setDay(out.ok ? out.result : null));
      }
    }, [load, getDay, date]),
  );

  const refresh = useCallback(async () => {
    if (date === todayKey()) {
      await reload();
    } else {
      const out = await getDay(date);
      setDay(out.ok ? out.result : null);
    }
  }, [date, reload, getDay]);

  const mine = showing?.rows?.find((row) => row.memberId === dashboard?.mess?.memberId) ?? null;
  const others = (showing?.rows ?? []).filter((row) => row.memberId !== dashboard?.mess?.memberId);
  const locked = showing?.locked ?? [];
  const closed = !!showing?.closed;

  const write = async (memberId, patch) => {
    await run(() => setMeal(date, { memberId, ...patch }));
    await refresh();
  };

  return (
    <MessScreen footer={<BottomNav active="meals" />}>
      <Container>
        <SectionHeader
          lead={t('TODAY’S')}
          accent={t('MEAL')}
          subtitle={t('Tap a sitting to turn it on or off.')}
          style={{ marginTop: 16 }}
        />

        {/* ---- which day ---- */}
        <View style={{ marginTop: 18 }}>
          <ChipRow>
            <Chip
              label={t('Yesterday')}
              active={date === shiftDay(todayKey(), -1)}
              onPress={() => setDate(shiftDay(todayKey(), -1))}
            />
            <Chip label={t('Today')} active={date === todayKey()} onPress={() => setDate(todayKey())} />
            <Chip
              label={t('Tomorrow')}
              active={date === shiftDay(todayKey(), 1)}
              onPress={() => setDate(shiftDay(todayKey(), 1))}
            />
            <Chip
              label={t('Calendar')}
              icon="calendar"
              onPress={() => router.push('/meal-management/meals/calendar')}
            />
          </ChipRow>
          <Text
            style={{
              marginTop: 10,
              fontFamily: font.uiSemi,
              fontSize: type.sm + 1,
              color: colors.text,
            }}
          >
            {dayLabel(date, lang)}
          </Text>
        </View>

        {loading && !showing ? (
          <Loading />
        ) : !showing ? (
          <Panel style={{ marginTop: 18 }}>
            <Body muted>{t('That day could not be loaded.')}</Body>
          </Panel>
        ) : (
          <>
            {closed ? (
              <Panel tone="warn" style={{ marginTop: 16, gap: 4 }}>
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.saffron }}>
                  {t('This month is settled')}
                </Text>
                <Body muted>{t('Its meals are frozen, so the final rate cannot move.')}</Body>
              </Panel>
            ) : null}

            {/* ---- my sittings ---- */}
            <View style={{ marginTop: 18, gap: 10 }}>
              <GroupLabel
                text={t('My meals')}
                right={
                  showing.nextCutoff ? (
                    <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.saffron }}>
                      {t('{meal} closes {when}', {
                        meal: mealTypes.find((m) => m.key === showing.nextCutoff.key)?.label ?? '',
                        when: untilLabel(showing.nextCutoff.minutesAway, t),
                      })}
                    </Text>
                  ) : null
                }
              />

              {mealTypes.map((type_) => (
                <MealToggle
                  key={type_.key}
                  label={t(type_.label)}
                  value={mine?.values?.[type_.key] ?? 0}
                  guests={mine?.guests?.[type_.key] ?? 0}
                  allowedValues={dashboard?.allowedValues ?? [1]}
                  locked={closed || locked.includes(type_.key)}
                  onSet={(value) => write(undefined, { values: { [type_.key]: value } })}
                  onGuests={(value) => write(undefined, { guests: { [type_.key]: value } })}
                />
              ))}

              {locked.length && !closed ? (
                <Panel tone="warn" style={{ gap: 6 }}>
                  <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.saffron }}>
                    {t('Some sittings are past their cutoff')}
                  </Text>
                  <Body muted style={{ fontSize: type.xs }}>
                    {t('Send a correction request and an admin can still change it.')}
                  </Body>
                  <MiniButton
                    label={t('Request a correction')}
                    tone="warn"
                    onPress={() =>
                      router.push(`/meal-management/meals/requests?date=${date}&new=1`)
                    }
                  />
                </Panel>
              ) : null}
            </View>

            {/* ---- ways to fill many days at once ---- */}
            {!closed ? (
              <View style={{ marginTop: 18, gap: 10 }}>
                <NavRow
                  icon="calendar"
                  title={t('Set a range of days')}
                  sub={t('Turn sittings on or off from one day to another')}
                  onPress={() => setBulkOpen(true)}
                  right={<View />}
                />
                <NavRow
                  icon="route"
                  title={t('I am away')}
                  sub={t('Turn every meal off across a stretch of days')}
                  onPress={() => setLeaveOpen(true)}
                  right={<View />}
                />
              </View>
            ) : null}

            {/* ---- the whole mess, for whoever may fill it in ---- */}
            {others.length ? (
              <View style={{ marginTop: 22, gap: 10 }}>
                <GroupLabel text={t('The mess on this day')} />

                <TileGrid>
                  {mealTypes.map((type_) => (
                    <StatTile
                      key={type_.key}
                      value={n(mealText(showing.totals?.[type_.key] ?? 0))}
                      label={t(type_.label)}
                    />
                  ))}
                </TileGrid>

                <Panel style={{ gap: 2 }}>
                  {others.map((row) => (
                    <MemberGrid
                      key={row.memberId}
                      row={row}
                      mealTypes={mealTypes}
                      locked={closed || locked.length === mealTypes.length}
                      editable={can('edit_others_meal') && !closed}
                      onSet={(key, value) => write(row.memberId, { values: { [key]: value } })}
                    />
                  ))}
                </Panel>
              </View>
            ) : null}

            <View style={{ marginTop: 20, marginBottom: 8, gap: 10 }}>
              <NavRow
                icon="clock"
                title={t('Correction requests')}
                sub={t('Ask for a locked day to be changed, or decide somebody else’s')}
                onPress={() => router.push('/meal-management/meals/requests')}
              />
              <NavRow
                icon="activity"
                title={t('My meal history')}
                sub={t('Any stretch of days, totalled')}
                onPress={() => router.push('/meal-management/meals/history')}
              />
            </View>
          </>
        )}
      </Container>

      <BulkSheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        mealTypes={mealTypes}
        allowedValues={dashboard?.allowedValues ?? [1]}
        onSubmit={async (body) => {
          const out = await run(() => setMealsBulk(body), t('Days updated.'));
          if (out?.ok) {
            setBulkOpen(false);
            await refresh();
          }
          return out;
        }}
      />

      <LeaveSheet
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onSubmit={async (body) => {
          const out = await run(() => addLeave(body), t('Your meals are off for those days.'));
          if (out?.ok) {
            setLeaveOpen(false);
            await refresh();
          }
          return out;
        }}
      />
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * one member's row in the mess grid
 * ------------------------------------------------------------------ */

function MemberGrid({ row, mealTypes, locked, editable, onSet }) {
  const { t, n } = useLang();
  const { colors } = useTheme();

  return (
    <View style={{ paddingVertical: 8, gap: 8 }}>
      <MemberRow name={row.name} value={n(mealText(row.total ?? 0))} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {mealTypes.map((type_) => {
          const taken = Number(row.values?.[type_.key]) > 0;
          return (
            <Chip
              key={type_.key}
              label={`${t(type_.label)}${taken ? ` · ${mealText(row.values[type_.key])}` : ''}`}
              active={taken}
              tone="good"
              disabled={!editable || locked}
              onPress={() => onSet(type_.key, taken ? 0 : 1)}
              style={{ flex: 1 }}
            />
          );
        })}
      </View>
      {row.guests && Object.keys(row.guests).length ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
          {t('Plus guest plates')}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * §4.2's date-range entry
 * ------------------------------------------------------------------ */

function BulkSheet({ open, onClose, mealTypes, allowedValues, onSubmit }) {
  const { t } = useLang();

  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(shiftDay(todayKey(), 6));
  const [chosen, setChosen] = useState(() => mealTypes.map((m) => m.key));
  const [value, setValue] = useState(1);
  const [busy, setBusy] = useState(false);

  const toggle = (key) =>
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const submit = async () => {
    setBusy(true);
    const values = {};
    for (const key of chosen) values[key] = value;
    await onSubmit({ from, to, values });
    setBusy(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Set a range of days')}
      footer={
        <Button
          label={value ? t('Turn on for these days') : t('Turn off for these days')}
          onPress={submit}
          disabled={busy || !chosen.length}
          block
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label={t('From')} value={from} onChangeText={setFrom} placeholder="2026-09-01" style={{ flex: 1 }} />
        <Field label={t('To')} value={to} onChangeText={setTo} placeholder="2026-09-30" style={{ flex: 1 }} />
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Which sittings')} />
        <ChipRow>
          {mealTypes.map((type_) => (
            <Chip
              key={type_.key}
              label={t(type_.label)}
              active={chosen.includes(type_.key)}
              onPress={() => toggle(type_.key)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Set them to')} />
        <ChipRow>
          <Chip label={t('Off')} active={value === 0} tone="bad" onPress={() => setValue(0)} />
          {allowedValues.map((option) => (
            <Chip
              key={option}
              label={mealText(option)}
              active={value === option}
              tone="good"
              onPress={() => setValue(option)}
            />
          ))}
        </ChipRow>
      </View>

      <Body muted style={{ fontSize: type.xs }}>
        {t('Days already past their cutoff are skipped, and you will be told how many.')}
      </Body>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ *
 * §4.2's leave / away mode
 * ------------------------------------------------------------------ */

function LeaveSheet({ open, onClose, onSubmit }) {
  const { t } = useLang();

  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(shiftDay(todayKey(), 2));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onSubmit({ from, to, note: note.trim() || undefined });
    setBusy(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('I am away')}
      footer={<Button label={t('Turn my meals off')} onPress={submit} disabled={busy} block />}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label={t('From')} value={from} onChangeText={setFrom} style={{ flex: 1 }} />
        <Field label={t('To')} value={to} onChangeText={setTo} style={{ flex: 1 }} />
      </View>

      <Field
        label={t('Note (optional)')}
        value={note}
        onChangeText={setNote}
        placeholder={t('e.g. going home for Eid')}
        maxLength={200}
      />

      <Body muted style={{ fontSize: type.xs }}>
        {t('This turns every sitting off across those days. Cancelling the leave later does not turn them back on.')}
      </Body>
    </Sheet>
  );
}
