import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import { Body } from '../../src/components/Typography';
import { useAlert } from '../../src/components/Alert';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font } from '../../src/theme/tokens';
import { useSession } from '../../src/store/SessionContext';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  Chip,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
} from '../../src/features/meal-plan/components';
import { DishSheet, Explainer, PlanDayTapRow } from '../../src/features/meal-plan/editor';
import {
  clearMyPlan,
  fetchMyDishes,
  fetchMyPlan,
  saveMyPlan,
} from '../../src/features/meal-plan/api';
import {
  countMeals,
  currentMonth,
  daysByDate,
  monthLabel,
  spreadMonth,
  todayKey,
} from '../../src/features/meal-plan/format';

/**
 * The cook's monthly calendar.
 *
 * Three things the specification asks for, and they are the same screen rather
 * than three: cook the platform's plan as it stands, change some of it, or
 * write the whole month yourself. The difference between them is only how many
 * days you touch, so making them three flows would invent a decision the cook
 * does not actually have to make up front.
 *
 * ## Filling it has to be cheap
 *
 * Thirty days by three sittings is ninety decisions, and the first version
 * asked for all ninety as free text. Three things make that survivable now, and
 * all three exist because a real menu is a weekly rotation rather than ninety
 * separate ideas: tapping a sitting offers this cook's own dishes, a day can be
 * copied down the rest of the month, and one week can be repeated across it.
 *
 * ## What an untouched day means
 *
 * The platform's dish, shown through in muted type. Saving copies it into the
 * cook's own month — `resolvePlan` does not merge the two calendars, so a
 * published plan that named only one Tuesday would have cancelled the other
 * thirty days without saying so.
 */
export default function CookMealPlan() {
  const router = useRouter();
  const { token } = useSession();
  const { colors } = useTheme();
  const { t, n } = useLang();
  const alert = useAlert();

  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState([]);
  const [systemDays, setSystemDays] = useState([]);
  const [status, setStatus] = useState(null);
  const [categoryKey, setCategoryKey] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [dishes, setDishes] = useState({ system: [], mine: [] });
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [plan, library] = await Promise.all([fetchMyPlan(token, month), fetchMyDishes(token)]);

    if (plan.ok) {
      const { cookPlan, systemPlan, categoryKey: key } = plan.result;
      setCategoryKey(key);
      setStatus(cookPlan?.status ?? null);
      setSystemDays(systemPlan?.days ?? []);
      setDays(spreadMonth(month, cookPlan?.days ?? []));
      setDirty(false);
    }
    if (library.ok) setDishes({ system: library.result.system ?? [], mine: library.result.mine ?? [] });
    setLoading(false);
  }, [token, month]);

  useEffect(() => {
    load();
  }, [load]);

  const systemBy = useMemo(() => daysByDate(systemDays), [systemDays]);

  /* What the sheet offers for a sitting: this cook's own dishes first, then
     the platform's, then anything already written elsewhere in this month —
     a name typed on the 3rd is the likeliest answer again on the 10th. */
  const suggestionsFor = useCallback(
    (slot) => {
      const mine = dishes.mine.filter((d) => d.type === slot).map((d) => d.name);
      const system = dishes.system.filter((d) => d.type === slot).map((d) => d.name);
      const used = days.map((d) => String(d[slot] ?? '').trim()).filter(Boolean);
      return [...mine, ...system, ...used];
    },
    [dishes, days],
  );

  const setSlot = (date, slot, value) => {
    setDays((rows) => rows.map((row) => (row.date === date ? { ...row, [slot]: value } : row)));
    setDirty(true);
  };

  /** This day's three sittings, onto every date after it. */
  const copyDown = (from) => {
    setDays((rows) => {
      const source = rows.find((r) => r.date === from);
      if (!source) return rows;
      let reached = false;
      return rows.map((row) => {
        if (row.date === from) {
          reached = true;
          return row;
        }
        if (!reached) return row;
        return { ...row, breakfast: source.breakfast, lunch: source.lunch, dinner: source.dinner };
      });
    });
    setDirty(true);
    alert.success(t('Copied down to the end of the month.'));
  };

  /**
   * The first seven days, repeated to the end.
   *
   * By position rather than by weekday: a cook filling "week one" fills the
   * first seven rows they see, and matching those to the 8th, 15th and 22nd is
   * what they mean by repeating it.
   */
  const repeatWeek = () => {
    setDays((rows) => {
      const week = rows.slice(0, 7);
      if (!week.length) return rows;
      return rows.map((row, i) => {
        if (i < 7) return row;
        const source = week[i % 7];
        return { ...row, breakfast: source.breakfast, lunch: source.lunch, dinner: source.dinner };
      });
    });
    setDirty(true);
    alert.success(t('The first week now repeats across the month.'));
  };

  const save = async (publish) => {
    setBusy(true);

    /* Blanks filled from the platform's month before this is sent, so the
       stored month is exactly what the cook was looking at. A copy taken now
       rather than a live link — which is the honest reading of publishing your
       own month, and the only reading `resolvePlan` supports. */
    const filled = days.map((day) => {
      const base = systemBy.get(day.date) ?? {};
      return {
        date: day.date,
        breakfast: day.breakfast.trim() || base.breakfast || '',
        lunch: day.lunch.trim() || base.lunch || '',
        dinner: day.dinner.trim() || base.dinner || '',
      };
    });

    const written = filled.filter((d) => d.breakfast || d.lunch || d.dinner);
    const out = await saveMyPlan(token, { month, days: written, publish });
    setBusy(false);

    if (!out.ok) {
      alert.error(out.message ?? t('That did not work.'), t('Not saved'));
      return;
    }
    setDirty(false);
    setStatus(publish ? 'published' : 'draft');
    alert.success(
      publish
        ? t('Customers booking this month will see your menu.')
        : t('Saved. Publish it when the month is ready.'),
      publish ? t('{month} published', { month: monthLabel(month) }) : t('Draft saved'),
    );
  };

  const revert = () => {
    alert.confirm({
      title: t('Cook the platform’s plan for {month}?', { month: monthLabel(month) }),
      body: t(
        'Your own menu for this month is removed, and your kitchen follows the platform again — including changes it makes later. Months already booked keep what was agreed.',
      ),
      confirmLabel: t('Use the platform plan'),
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        const out = await clearMyPlan(token, month);
        setBusy(false);
        if (!out.ok) {
          alert.error(out.message ?? t('That did not work.'), t('Not changed'));
          return;
        }
        await load();
        alert.success(t('Your kitchen follows the platform for this month.'));
      },
    });
  };

  const typed = countMeals(days);
  const offering = countMeals(
    days.map((day) => {
      const base = systemBy.get(day.date) ?? {};
      return {
        breakfast: day.breakfast.trim() || base.breakfast || '',
        lunch: day.lunch.trim() || base.lunch || '',
        dinner: day.dinner.trim() || base.dinner || '',
      };
    }),
  );
  const hasOwn = status != null;
  const today = todayKey();

  /* One sentence, where three counters used to be. What a cook needs to know
     on arriving is whose menu is live, not the arithmetic behind it. */
  const standing = !hasOwn
    ? t('Cooking the platform’s menu this month.')
    : status === 'published'
      ? t('Your own menu is live for this month.')
      : t('Your own menu is saved as a draft — customers still see the platform’s.');

  /*
   * Save, pinned — the same fix the customer's calendar needed.
   *
   * Both buttons sat under thirty days of rows, so a cook who tapped three
   * dishes had to scroll past twenty-seven untouched ones to commit them. The
   * work is the scroll; the commit should not be at the end of it.
   */
  const saveBar =
    loading || !categoryKey ? null : (
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: 24,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          backgroundColor: colors.surfaceSolid,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: font.uiBold, fontSize: 13, color: colors.text }}>
            {dirty
              ? t('{n} days changed', { n: n(typed) })
              : status === 'published'
                ? t('Published')
                : hasOwn
                  ? t('Saved as a draft')
                  : t('Following the platform')}
          </Text>
          <Text style={{ fontFamily: font.ui, fontSize: 11.5, color: colors.textMuted }}>
            {t('{n} meals on offer', { n: n(offering) })}
          </Text>
        </View>

        <Button
          label={busy ? t('Saving…') : t('Save')}
          variant="glass"
          disabled={busy}
          onPress={() => save(false)}
        />
        <Button
          label={busy ? t('Publishing…') : t('Publish')}
          disabled={busy || offering === 0}
          onPress={() => save(true)}
        />
      </View>
    );

  return (
    <Screen footer={saveBar} contentStyle={{ paddingBottom: 210 }}>
      <Container>
        <SectionHeader
          lead={t('MONTHLY')}
          accent={t('MENU')}
          subtitle={t('What you cook each day, and what a customer picks from.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <MonthPicker month={month} onChange={setMonth} disabled={busy} />
        </View>

        {loading ? (
          <Loading label={t('Reading the month…')} />
        ) : !categoryKey ? (
          <Panel style={{ marginTop: 22 }}>
            <Body>{t('You have not started a meal service yet.')}</Body>
            <Body muted style={{ marginTop: 6, lineHeight: 19 }}>
              {t('A calendar belongs to a category, and the category is part of your service.')}
            </Body>
            <Button
              label={t('Set up my meal service')}
              block
              style={{ marginTop: 14 }}
              onPress={() => router.push('/cook/meal-service')}
            />
          </Panel>
        ) : (
          <>
            <Reveal delay={1}>
              <Panel style={{ marginTop: 18 }} tone={status === 'published' ? 'good' : undefined}>
                <Text style={{ fontFamily: font.uiBold, fontSize: 14.5, color: colors.text }}>
                  {standing}
                </Text>
                <Body muted style={{ marginTop: 4, fontSize: 12.5 }}>
                  {t('{n} meals on offer', { n: n(offering) })}
                  {typed > 0 ? t(' · {n} changed by you', { n: n(typed) }) : ''}
                </Body>
                {dirty ? (
                  <Body style={{ marginTop: 8, color: colors.saffron, fontSize: 12.5 }}>
                    {t('Unsaved changes.')}
                  </Body>
                ) : null}
              </Panel>
            </Reveal>

            <Reveal delay={2}>
              <GroupLabel text={t('Fill it quickly')} style={{ marginTop: 26 }} />
              {/* Wrapped, not scrolled. A horizontal rail cut the second
                  action off mid-word at the screen edge with nothing to say it
                  scrolled, which reads as a rendering fault. */}
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}
              >
                <Chip label={t('Repeat the first week')} onPress={repeatWeek} disabled={busy} />
                <Chip
                  label={t('Start from the platform’s month')}
                  onPress={() => {
                    setDays(spreadMonth(month, systemDays));
                    setDirty(true);
                  }}
                  disabled={busy || systemDays.length === 0}
                />
              </View>
              <Explainer summary={t('Tap any sitting to pick a dish. How this works →')}>
                {t('An untouched day shows the platform’s dish in grey and is copied into your month when you save. Publishing replaces the platform’s calendar for your kitchen, so anything blank on both sides is a meal you are not offering. The arrow beside a day copies it down the rest of the month.')}
              </Explainer>
            </Reveal>

            <Reveal delay={3}>
              <GroupLabel text={monthLabel(month)} style={{ marginTop: 24 }} />
              <View style={{ marginTop: 10 }}>
                {days.map((day) => (
                  <PlanDayTapRow
                    key={day.date}
                    day={day}
                    placeholders={systemBy.get(day.date)}
                    onOpen={(date, slot) => setEditing({ date, slot })}
                    onCopyDown={copyDown}
                    disabled={busy}
                    dim={day.date < today}
                    t={t}
                  />
                ))}
              </View>
            </Reveal>

            {offering === 0 ? (
              <Body muted style={{ marginTop: 16, fontSize: 12.5, lineHeight: 18 }}>
                {t('Nothing to publish yet — a published month with no meals in it shows a customer an empty calendar.')}
              </Body>
            ) : null}

            {hasOwn ? (
              <Button
                label={t('Cook the platform’s plan instead')}
                variant="glass"
                block
                disabled={busy}
                style={{ marginTop: 16, marginBottom: 26 }}
                onPress={revert}
              />
            ) : (
              <View style={{ height: 26 }} />
            )}
          </>
        )}
      </Container>

      <DishSheet
        open={!!editing}
        slot={editing?.slot}
        date={editing?.date}
        value={editing ? days.find((d) => d.date === editing.date)?.[editing.slot] : ''}
        suggestions={editing ? suggestionsFor(editing.slot) : []}
        fallback={editing ? systemBy.get(editing.date)?.[editing.slot] : ''}
        onPick={(value) => setSlot(editing.date, editing.slot, value)}
        onClose={() => setEditing(null)}
        t={t}
      />
    </Screen>
  );
}
