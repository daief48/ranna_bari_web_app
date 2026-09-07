import React, { useCallback, useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import { Body } from '../../src/components/Typography';
import { useAlert } from '../../src/components/Alert';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius } from '../../src/theme/tokens';
import { useSession } from '../../src/store/SessionContext';

import {
  Chip,
  ChipRow,
  Divider,
  GroupLabel,
  Loading,
  Panel,
  Row,
} from '../../src/features/meal-plan/components';
import { fetchMyService, saveMyService } from '../../src/features/meal-plan/api';

/**
 * The cook's meal service — what they serve, for how much, and how many.
 *
 * Four decisions, and they are not equal. The category decides which calendar
 * this kitchen cooks from and is the one thing that cannot be changed casually
 * once a month is booked against it. The rate is either the platform's or the
 * cook's, and those are different promises: taking the default means following
 * the platform when it moves, which is a choice and not an absence of one.
 * The range is the contract with the customer. And `active` is the switch —
 * separate from all of it, because setting a service up and offering it are
 * two decisions and only the second one needs the kitchen to be approved.
 */
export default function CookMealService() {
  const router = useRouter();
  const { token } = useSession();
  const { colors } = useTheme();
  const alert = useAlert();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoryKey, setCategoryKey] = useState('');
  const [ownRate, setOwnRate] = useState(false);
  const [rate, setRate] = useState('');
  const [minMeals, setMinMeals] = useState('3');
  const [maxMeals, setMaxMeals] = useState('7');
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const out = await fetchMyService(token);
    if (out.ok) {
      const { service, categories: list } = out.result;
      setCategories(list ?? []);
      if (service) {
        setExisting(service);
        setCategoryKey(service.categoryKey);
        setOwnRate(service.rate != null);
        setRate(service.rate != null ? String(service.rate) : '');
        setMinMeals(String(service.minMeals));
        setMaxMeals(String(service.maxMeals));
        setActive(!!service.active);
      } else if (list?.length) {
        setCategoryKey(list[0].key);
      }
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const category = categories.find((c) => c.key === categoryKey) ?? null;
  const effective = ownRate ? Number(rate) || 0 : (category?.rate ?? 0);
  const min = Number(minMeals);
  const max = Number(maxMeals);

  /* Every refusal the server would give, said before the request rather than
     after it — a cook fixing a number should not have to wait for a round
     trip to find out which one. */
  const problem = !categoryKey
    ? 'Pick a category first.'
    : ownRate && !(Number(rate) > 0)
      ? 'Your own rate has to be a number above zero.'
      : !(min >= 1)
        ? 'The minimum has to be at least one meal.'
        : !(max >= min)
          ? 'The maximum cannot be below the minimum.'
          : null;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    const out = await saveMyService(token, {
      categoryKey,
      rate: ownRate ? Number(rate) : null,
      minMeals: min,
      maxMeals: max,
      active,
    });
    setBusy(false);

    if (!out.ok) {
      alert.error(out.message ?? 'That did not work.', 'Not saved');
      return;
    }
    setExisting(out.result.service);
    alert.success(
      active
        ? 'Customers can book a month from your calendar now.'
        : 'Nobody can book it until you switch it on.',
      active ? 'Your meal service is live' : 'Saved',
    );
  };

  const field = {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.sunken,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: font.ui,
    fontSize: 15,
    color: colors.text,
  };

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead="MEAL"
          accent="SERVICE"
          subtitle="What you serve, for how much, and how many meals a customer must take."
          style={{ marginTop: 16 }}
        />

        {loading ? (
          <Loading label="Reading your service…" />
        ) : categories.length === 0 ? (
          <Panel style={{ marginTop: 24 }}>
            <Body>The platform is not offering any meal categories yet.</Body>
            <Body muted style={{ marginTop: 6 }}>
              A meal service belongs to a category, so there is nothing to start one
              under until an operator adds one.
            </Body>
          </Panel>
        ) : (
          <>
            {/* Category. */}
            <Reveal delay={1}>
              <GroupLabel text="Category" style={{ marginTop: 26 }} />
              <View style={{ marginTop: 12 }}>
                <ChipRow>
                  {categories.map((c) => (
                    <Chip
                      key={c.key}
                      label={`${c.label} · ৳${c.rate}`}
                      active={c.key === categoryKey}
                      onPress={() => setCategoryKey(c.key)}
                    />
                  ))}
                </ChipRow>
              </View>
              <Body muted style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
                The category decides which monthly calendar you cook from. Changing it
                after a month is booked does not move that booking — it stores what was
                agreed — but your calendar starts again from the new category&rsquo;s.
              </Body>
            </Reveal>

            {/* Rate. */}
            <Reveal delay={2}>
              <GroupLabel text="Your rate" style={{ marginTop: 30 }} />
              <Panel style={{ marginTop: 12 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.uiBold, fontSize: 14, color: colors.text }}>
                      Set my own price
                    </Text>
                    <Body muted style={{ fontSize: 12.5, marginTop: 2 }}>
                      {ownRate
                        ? 'Your number, fixed until you change it.'
                        : `Follow the category — ৳${category?.rate ?? 0} today, and whatever it becomes.`}
                    </Body>
                  </View>
                  <Switch
                    value={ownRate}
                    onValueChange={setOwnRate}
                    trackColor={{ true: colors.sage, false: colors.line2 }}
                  />
                </View>

                {ownRate ? (
                  <TextInput
                    value={rate}
                    onChangeText={setRate}
                    keyboardType="number-pad"
                    placeholder={String(category?.rate ?? '')}
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel="Your rate per meal"
                    style={[field, { marginTop: 12 }]}
                  />
                ) : null}

                <Divider />
                <Row label="Customers pay, per meal" value={`৳${effective}`} strong tone="good" />
              </Panel>
            </Reveal>

            {/* Range. */}
            <Reveal delay={3}>
              <GroupLabel text="Meals per month" style={{ marginTop: 30 }} />
              <Panel style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Body muted style={{ fontSize: 12.5, marginBottom: 6 }}>
                      Minimum
                    </Body>
                    <TextInput
                      value={minMeals}
                      onChangeText={setMinMeals}
                      keyboardType="number-pad"
                      accessibilityLabel="Minimum meals"
                      style={field}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body muted style={{ fontSize: 12.5, marginBottom: 6 }}>
                      Maximum
                    </Body>
                    <TextInput
                      value={maxMeals}
                      onChangeText={setMaxMeals}
                      keyboardType="number-pad"
                      accessibilityLabel="Maximum meals"
                      style={field}
                    />
                  </View>
                </View>

                <Divider />
                <Row
                  label="A customer must take"
                  value={
                    min && max && min === max
                      ? `exactly ${min} meals`
                      : min && max
                        ? `${min}–${max} meals`
                        : '—'
                  }
                  strong
                />
                {min && max && min > 0 && max >= min ? (
                  <Row
                    label="So a month is worth"
                    value={`৳${effective * min} – ৳${effective * max}`}
                    tone="good"
                  />
                ) : null}
              </Panel>
              <Body muted style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
                A customer picks any dates and any of breakfast, lunch or dinner — the
                only rule is that the total lands in this range. Setting both to the
                same number means they choose which meals, but not how many.
              </Body>
            </Reveal>

            {/* The switch. */}
            <Reveal delay={4}>
              <GroupLabel text="Offering it" style={{ marginTop: 30 }} />
              <Panel style={{ marginTop: 12 }} tone={active ? 'good' : undefined}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.uiBold, fontSize: 14, color: colors.text }}>
                      {active ? 'Open for bookings' : 'Not offered'}
                    </Text>
                    <Body muted style={{ fontSize: 12.5, marginTop: 2 }}>
                      {active
                        ? 'Customers can find your calendar and book a month.'
                        : 'Set everything up first, then switch it on.'}
                    </Body>
                  </View>
                  <Switch
                    value={active}
                    onValueChange={setActive}
                    trackColor={{ true: colors.sage, false: colors.line2 }}
                  />
                </View>
              </Panel>
            </Reveal>

            {problem ? (
              <Body style={{ marginTop: 14, color: colors.primary, fontSize: 12.5 }}>
                {problem}
              </Body>
            ) : null}

            <Button
              label={busy ? 'Saving…' : existing ? 'Save changes' : 'Start my meal service'}
              block
              disabled={busy || !!problem}
              style={{ marginTop: 18 }}
              onPress={save}
            />

            {existing ? (
              <Button
                label="Open my calendar"
                variant="glass"
                block
                style={{ marginTop: 10, marginBottom: 24 }}
                onPress={() => router.push('/cook/meal-plan')}
              />
            ) : (
              <Body muted style={{ marginTop: 10, marginBottom: 24, fontSize: 12.5 }}>
                Once this is saved you can write your monthly calendar, or cook from the
                platform&rsquo;s as it is.
              </Body>
            )}
          </>
        )}
      </Container>
    </Screen>
  );
}
