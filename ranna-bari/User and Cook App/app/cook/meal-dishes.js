import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
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
  Empty,
  GroupLabel,
  Loading,
  Panel,
} from '../../src/features/meal-plan/components';
import { addMyDish, fetchMyDishes, retireMyDish } from '../../src/features/meal-plan/api';
import { SLOTS, SLOT_LABEL } from '../../src/features/meal-plan/format';

/**
 * The cook's dish library.
 *
 * Names, not recipes — a dish here is the string that appears on a day of the
 * calendar, and the point of keeping a list is that a month is mostly a
 * rotation. Writing "Chicken Khichuri" once and picking it on nine days is the
 * difference between filling a month and giving up halfway through it.
 *
 * The platform's suggestions and the cook's own live in one list because a
 * picker offers both; the only difference between a row of each is who may
 * take it away. A cook's own can be retired, never deleted — a calendar that
 * already names it keeps meaning what it said.
 */
export default function CookMealDishes() {
  const router = useRouter();
  const { token } = useSession();
  const { colors } = useTheme();
  const alert = useAlert();

  const [loading, setLoading] = useState(true);
  const [system, setSystem] = useState([]);
  const [mine, setMine] = useState([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('lunch');
  const [busy, setBusy] = useState(false);
  const [noService, setNoService] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const out = await fetchMyDishes(token);
    if (out.ok) {
      setSystem(out.result.system ?? []);
      setMine(out.result.mine ?? []);
      /* The endpoint answers with two empty lists when there is no service,
         because there is no category to have dishes under. */
      setNoService((out.result.system ?? []).length === 0 && (out.result.mine ?? []).length === 0);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    const out = await addMyDish(token, { name: clean, type });
    setBusy(false);

    if (!out.ok) {
      alert.error(out.message ?? 'That did not work.', 'Not added');
      return;
    }
    setName('');
    setMine((rows) => [...rows, out.result.dish].sort((a, b) => a.name.localeCompare(b.name)));
    alert.success(`${clean} is in your ${SLOT_LABEL[type].toLowerCase()} list.`);
  };

  const retire = (dish) => {
    alert.confirm({
      title: `Remove ${dish.name}?`,
      body: 'It stops being offered when you fill in a calendar. Days that already name it are untouched.',
      confirmLabel: 'Remove it',
      danger: true,
      onConfirm: async () => {
        const out = await retireMyDish(token, dish.id);
        if (!out.ok) {
          alert.error(out.message ?? 'That did not work.', 'Not removed');
          return;
        }
        setMine((rows) => rows.filter((row) => row.id !== dish.id));
      },
    });
  };

  const byType = (rows, slot) => rows.filter((row) => row.type === slot);

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead="MY"
          accent="DISHES"
          subtitle="The meals you cook, ready to drop onto any day."
          style={{ marginTop: 16 }}
        />

        {loading ? (
          <Loading label="Reading your list…" />
        ) : noService ? (
          <Panel style={{ marginTop: 22 }}>
            <Body>You have not started a meal service yet.</Body>
            <Body muted style={{ marginTop: 6, lineHeight: 19 }}>
              A dish belongs to a category, and the category is part of your service.
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
              <GroupLabel text="Add a dish" style={{ marginTop: 26 }} />
              <Panel style={{ marginTop: 12 }}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Chicken Khichuri"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Dish name"
                  style={{
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.sunken,
                    borderRadius: radius.md,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontFamily: font.ui,
                    fontSize: 15,
                    color: colors.text,
                  }}
                />
                <View style={{ marginTop: 12 }}>
                  <ChipRow>
                    {SLOTS.map((slot) => (
                      <Chip
                        key={slot}
                        label={SLOT_LABEL[slot]}
                        active={slot === type}
                        onPress={() => setType(slot)}
                      />
                    ))}
                  </ChipRow>
                </View>
                <Button
                  label={busy ? 'Adding…' : 'Add to my list'}
                  block
                  disabled={busy || !name.trim()}
                  style={{ marginTop: 14 }}
                  onPress={add}
                />
              </Panel>
            </Reveal>

            <Reveal delay={2}>
              <GroupLabel text="Mine" style={{ marginTop: 30 }} />
              {mine.length === 0 ? (
                <View style={{ marginTop: 12 }}>
                  <Empty
                    title="Nothing of your own yet"
                    hint="Add the dishes you cook most. They show up as suggestions while you fill in a month."
                  />
                </View>
              ) : (
                SLOTS.map((slot) =>
                  byType(mine, slot).length ? (
                    <View key={slot} style={{ marginTop: 12 }}>
                      <Body muted style={{ fontSize: 12.5, marginBottom: 6 }}>
                        {SLOT_LABEL[slot]}
                      </Body>
                      <Panel style={{ gap: 2 }}>
                        {byType(mine, slot).map((dish) => (
                          <View
                            key={dish.id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                              paddingVertical: 6,
                            }}
                          >
                            <Text
                              style={{
                                flex: 1,
                                fontFamily: font.ui,
                                fontSize: 14,
                                color: colors.text,
                              }}
                            >
                              {dish.name}
                            </Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${dish.name}`}
                              onPress={() => retire(dish)}
                              hitSlop={8}
                            >
                              <Text
                                style={{
                                  fontFamily: font.ui,
                                  fontSize: 12.5,
                                  color: colors.primary,
                                }}
                              >
                                Remove
                              </Text>
                            </Pressable>
                          </View>
                        ))}
                      </Panel>
                    </View>
                  ) : null,
                )
              )}
            </Reveal>

            {system.length > 0 ? (
              <Reveal delay={3}>
                <GroupLabel text="From the platform" style={{ marginTop: 30 }} />
                <Body muted style={{ marginTop: 6, fontSize: 12.5, lineHeight: 18 }}>
                  Suggestions for your category. You can use any of them on a day
                  without adding them to your own list.
                </Body>
                {SLOTS.map((slot) =>
                  byType(system, slot).length ? (
                    <View key={slot} style={{ marginTop: 12 }}>
                      <Body muted style={{ fontSize: 12.5, marginBottom: 6 }}>
                        {SLOT_LABEL[slot]}
                      </Body>
                      <Panel style={{ gap: 4 }}>
                        {byType(system, slot).map((dish) => (
                          <Text
                            key={dish.id}
                            style={{ fontFamily: font.ui, fontSize: 14, color: colors.textMuted }}
                          >
                            {dish.name}
                          </Text>
                        ))}
                      </Panel>
                    </View>
                  ) : null,
                )}
              </Reveal>
            ) : null}

            <Button
              label="Open my calendar"
              variant="glass"
              block
              style={{ marginTop: 22, marginBottom: 26 }}
              onPress={() => router.push('/cook/meal-plan')}
            />
          </>
        )}
      </Container>
    </Screen>
  );
}
