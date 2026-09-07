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

import {
  Divider,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
  PlanDayRow,
  Row,
} from '../../src/features/meal-plan/components';
import { clearMyPlan, fetchMyPlan, saveMyPlan } from '../../src/features/meal-plan/api';
import {
  countMeals,
  currentMonth,
  daysByDate,
  monthLabel,
  spreadMonth,
} from '../../src/features/meal-plan/format';

/**
 * The cook's monthly calendar.
 *
 * Three things the specification asks for, and they are the same screen rather
 * than three: cook the platform's plan as it stands, change some of it, or
 * write the whole month yourself. The difference between them is only how many
 * fields you fill in, so making them three flows would be inventing a decision
 * the cook does not actually have to make up front.
 *
 * An empty field means "serve what the platform serves that day", which is why
 * the platform's dish is the placeholder rather than a dash: a cook can see
 * what they are replacing while the box is still empty, and clearing a box is
 * how you go back to it for one slot.
 *
 * Saving writes a document of the cook's own. The platform's calendar is never
 * touched by anything here — that is the whole point of the copy — and
 * "Cook the platform's plan" deletes the copy rather than blanking it, so the
 * kitchen follows the platform again including changes made later.
 */
export default function CookMealPlan() {
  const router = useRouter();
  const { token } = useSession();
  const { colors } = useTheme();
  const alert = useAlert();

  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState([]);
  const [systemDays, setSystemDays] = useState([]);
  const [status, setStatus] = useState(null);
  const [categoryKey, setCategoryKey] = useState(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const out = await fetchMyPlan(token, month);
    if (out.ok) {
      const { cookPlan, systemPlan, categoryKey: key } = out.result;
      setCategoryKey(key);
      setStatus(cookPlan?.status ?? null);
      setSystemDays(systemPlan?.days ?? []);
      setDays(spreadMonth(month, cookPlan?.days ?? []));
      setDirty(false);
    }
    setLoading(false);
  }, [token, month]);

  useEffect(() => {
    load();
  }, [load]);

  const systemBy = useMemo(() => daysByDate(systemDays), [systemDays]);

  const change = (date, slot, value) => {
    setDays((rows) => rows.map((row) => (row.date === date ? { ...row, [slot]: value } : row)));
    setDirty(true);
  };

  /** Start from the platform's month, then edit it — the common way in. */
  const copySystem = () => {
    setDays(spreadMonth(month, systemDays));
    setDirty(true);
  };

  const save = async (publish) => {
    setBusy(true);

    /*
     * Blanks filled from the platform's month before this is sent.
     *
     * `resolvePlan` on the server does not merge the two calendars — a
     * published cook plan wins for the whole month, and whatever it does not
     * name is simply not on offer. So a cook who changed one Tuesday dinner
     * and pressed Publish would have cancelled the other thirty days without
     * being told, which is the opposite of what the empty boxes on this screen
     * promise.
     *
     * Filling them here makes the promise literal: the stored month is exactly
     * what the cook was looking at. It is a copy taken now rather than a live
     * link, which is the honest reading of "publish my own month" — a later
     * platform edit does not reach through it.
     */
    const filled = days.map((day) => {
      const base = systemBy.get(day.date) ?? {};
      return {
        date: day.date,
        breakfast: day.breakfast.trim() || base.breakfast || '',
        lunch: day.lunch.trim() || base.lunch || '',
        dinner: day.dinner.trim() || base.dinner || '',
      };
    });

    /* Days with nothing on them from either side are dropped: a month of
       blanks is a month with no override in it, and storing thirty-one empty
       rows would make "I have my own plan" true of a cook who wrote nothing. */
    const written = filled.filter((d) => d.breakfast || d.lunch || d.dinner);
    const out = await saveMyPlan(token, { month, days: written, publish });
    setBusy(false);

    if (!out.ok) {
      alert.error(out.message ?? 'That did not work.', 'Not saved');
      return;
    }
    setDirty(false);
    setStatus(publish ? 'published' : 'draft');
    alert.success(
      publish
        ? 'Customers booking this month will see your menu.'
        : 'Saved. Publish it when the month is ready.',
      publish ? `${monthLabel(month)} published` : 'Draft saved',
    );
  };

  const revert = () => {
    alert.confirm({
      title: `Cook the platform's plan for ${monthLabel(month)}?`,
      body: 'Your own menu for this month is removed, and your kitchen follows the platform again — including any changes it makes later. Months already booked keep what was agreed.',
      confirmLabel: 'Use the platform plan',
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        const out = await clearMyPlan(token, month);
        setBusy(false);
        if (!out.ok) {
          alert.error(out.message ?? 'That did not work.', 'Not changed');
          return;
        }
        await load();
        alert.success('Your kitchen follows the platform for this month.');
      },
    });
  };

  /* Two different questions, and the second is the one that matters before
     publishing: how many meals this kitchen would actually be offering, which
     is what the cook typed plus what the platform fills in behind it. */
  const typed = countMeals(days);
  const platform = countMeals(spreadMonth(month, systemDays));
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

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead="MY"
          accent="CALENDAR"
          subtitle="What you cook each day, and what a customer picks from."
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <MonthPicker month={month} onChange={setMonth} disabled={busy} />
        </View>

        {loading ? (
          <Loading label="Reading the month…" />
        ) : !categoryKey ? (
          <Panel style={{ marginTop: 22 }}>
            <Body>You have not started a meal service yet.</Body>
            <Body muted style={{ marginTop: 6, lineHeight: 19 }}>
              A calendar belongs to a category, and the category is part of your
              service. Set that up and this month opens for editing.
            </Body>
            <Button
              label="Set up my meal service"
              block
              style={{ marginTop: 14 }}
              onPress={() => router.push('/cook/meal-service')}
            />
          </Panel>
        ) : (
          <>
            <Reveal delay={1}>
              <Panel style={{ marginTop: 18 }} tone={status === 'published' ? 'good' : undefined}>
                <Row
                  label="This month you are cooking"
                  value={hasOwn ? 'your own menu' : "the platform's"}
                  strong
                  tone={hasOwn ? 'good' : undefined}
                />
                <Row label="Meals you would be offering" value={String(offering)} strong />
                <Row label="Of those, changed by you" value={String(typed)} />
                <Row label="Meals the platform publishes" value={String(platform)} />
                {hasOwn ? (
                  <>
                    <Divider />
                    <Row
                      label="Your menu is"
                      value={status === 'published' ? 'published' : 'a draft'}
                      tone={status === 'published' ? 'good' : 'warn'}
                    />
                  </>
                ) : null}
                {dirty ? (
                  <Body style={{ marginTop: 8, color: colors.saffron, fontSize: 12.5 }}>
                    Unsaved changes.
                  </Body>
                ) : null}
              </Panel>
            </Reveal>

            {platform === 0 ? (
              <Body muted style={{ marginTop: 12, fontSize: 12.5, lineHeight: 18 }}>
                The platform has not published a calendar for this month, so there is
                nothing underneath yours. Anything you leave blank has no meal on it.
              </Body>
            ) : (
              <Button
                label="Start from the platform's month"
                variant="glass"
                block
                disabled={busy}
                style={{ marginTop: 12 }}
                onPress={copySystem}
              />
            )}

            <Reveal delay={2}>
              <GroupLabel text={monthLabel(month)} style={{ marginTop: 26 }} />
              <Body muted style={{ marginTop: 6, fontSize: 12.5, lineHeight: 18 }}>
                Leave a box empty to serve what the platform serves that day — the
                faint text is what that is, and it is copied into your month when you
                save. Publishing replaces the platform&rsquo;s calendar for your
                kitchen, so anything blank on both sides is a meal you are not
                offering.
              </Body>

              <View style={{ marginTop: 10 }}>
                {days.map((day) => (
                  <PlanDayRow
                    key={day.date}
                    day={day}
                    placeholders={systemBy.get(day.date)}
                    onChange={change}
                    disabled={busy}
                  />
                ))}
              </View>
            </Reveal>

            <Button
              label={busy ? 'Saving…' : 'Save draft'}
              variant="glass"
              block
              disabled={busy}
              style={{ marginTop: 18 }}
              onPress={() => save(false)}
            />
            <Button
              label={busy ? 'Publishing…' : 'Publish this month'}
              block
              disabled={busy || offering === 0}
              style={{ marginTop: 10 }}
              onPress={() => save(true)}
            />

            {offering === 0 ? (
              <Body muted style={{ marginTop: 8, fontSize: 12.5 }}>
                Nothing to publish yet — a published month with no meals in it would
                show a customer an empty calendar.
              </Body>
            ) : null}

            {hasOwn ? (
              <Button
                label="Cook the platform's plan instead"
                variant="glass"
                block
                disabled={busy}
                style={{ marginTop: 10, marginBottom: 8 }}
                onPress={revert}
              />
            ) : null}

            <Text
              style={{
                marginTop: 14,
                marginBottom: 26,
                fontFamily: font.ui,
                fontSize: 12,
                lineHeight: 18,
                color: colors.textMuted,
              }}
            >
              Editing here never changes the platform&rsquo;s calendar — yours is a
              separate copy. A month somebody has already booked keeps the menu and the
              price it was booked at, whatever you change afterwards.
            </Text>
          </>
        )}
      </Container>
    </Screen>
  );
}
