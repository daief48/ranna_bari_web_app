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
import { useLang } from '../../src/i18n/LanguageContext';

import { Chip, Empty, GroupLabel, Loading, Panel } from '../../src/features/meal-plan/components';
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
 * The platform's suggestions are tappable rather than read-only. They were a
 * wall of grey text next to a form, which is a strange thing to show somebody
 * and then not let them use.
 */
export default function CookMealDishes() {
  const router = useRouter();
  const { token } = useSession();
  const { colors } = useTheme();
  const { t, n } = useLang();
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
      /* Two empty lists is how the endpoint answers when there is no service,
         because there is no category for dishes to belong to. */
      setNoService((out.result.system ?? []).length === 0 && (out.result.mine ?? []).length === 0);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (dishName, dishType) => {
    const clean = String(dishName ?? '').trim();
    if (!clean) return;
    setBusy(true);
    const out = await addMyDish(token, { name: clean, type: dishType });
    setBusy(false);

    if (!out.ok) {
      alert.error(out.message ?? t('That did not work.'), t('Not added'));
      return;
    }
    setName('');
    setMine((rows) => [...rows, out.result.dish].sort((a, b) => a.name.localeCompare(b.name)));
    alert.success(
      t('{dish} is in your {slot} list.', {
        dish: clean,
        slot: t(SLOT_LABEL[dishType]).toLowerCase(),
      }),
    );
  };

  const retire = (dish) => {
    alert.confirm({
      title: t('Remove {dish}?', { dish: dish.name }),
      body: t('It stops being offered when you fill in a calendar. Days that already name it are untouched.'),
      confirmLabel: t('Remove it'),
      danger: true,
      onConfirm: async () => {
        const out = await retireMyDish(token, dish.id);
        if (!out.ok) {
          alert.error(out.message ?? t('That did not work.'), t('Not removed'));
          return;
        }
        setMine((rows) => rows.filter((row) => row.id !== dish.id));
      },
    });
  };

  const byType = (rows, slot) => rows.filter((row) => row.type === slot);
  const has = (dishName) => mine.some((d) => d.name === dishName);

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead={t('MY')}
          accent={t('DISHES')}
          subtitle={t('The meals you cook, ready to drop onto any day.')}
          style={{ marginTop: 16 }}
        />

        {loading ? (
          <Loading label={t('Reading your list…')} />
        ) : noService ? (
          <Panel style={{ marginTop: 22 }}>
            <Body>{t('You have not started a meal service yet.')}</Body>
            <Body muted style={{ marginTop: 6, lineHeight: 19 }}>
              {t('A dish belongs to a category, and the category is part of your service.')}
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
              <GroupLabel text={t('Add a dish')} style={{ marginTop: 26 }} />
              <Panel style={{ marginTop: 12 }}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t('e.g. Chicken Khichuri')}
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel={t('Dish name')}
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
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {SLOTS.map((slot) => (
                    <Chip
                      key={slot}
                      label={t(SLOT_LABEL[slot])}
                      active={slot === type}
                      onPress={() => setType(slot)}
                    />
                  ))}
                </View>
                <Button
                  label={busy ? t('Adding…') : t('Add to my list')}
                  block
                  disabled={busy || !name.trim()}
                  style={{ marginTop: 14 }}
                  onPress={() => add(name, type)}
                />
              </Panel>
            </Reveal>

            <Reveal delay={2}>
              <GroupLabel text={t('Mine')} style={{ marginTop: 30 }} />
              {mine.length === 0 ? (
                <View style={{ marginTop: 12 }}>
                  <Empty
                    title={t('Nothing of your own yet')}
                    hint={t('Add the dishes you cook most. They are offered whenever you tap a sitting on your calendar.')}
                  />
                </View>
              ) : (
                SLOTS.map((slot) =>
                  byType(mine, slot).length ? (
                    <View key={slot} style={{ marginTop: 12 }}>
                      <Body muted style={{ fontSize: 12.5, marginBottom: 6 }}>
                        {t(SLOT_LABEL[slot])}
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
                              accessibilityLabel={t('Remove {dish}', { dish: dish.name })}
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
                                {t('Remove')}
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
                <GroupLabel text={t('From the platform')} style={{ marginTop: 30 }} />
                <Body muted style={{ marginTop: 6, fontSize: 12.5, lineHeight: 18 }}>
                  {t('Suggestions for your category. Tap one to keep it in your own list — you can use any of them on a day either way.')}
                </Body>
                {SLOTS.map((slot) =>
                  byType(system, slot).length ? (
                    <View key={slot} style={{ marginTop: 12 }}>
                      <Body muted style={{ fontSize: 12.5, marginBottom: 6 }}>
                        {t(SLOT_LABEL[slot])}
                      </Body>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {byType(system, slot).map((dish) => (
                          <Chip
                            key={dish.id}
                            label={has(dish.name) ? `${dish.name} ✓` : dish.name}
                            active={has(dish.name)}
                            disabled={busy || has(dish.name)}
                            onPress={() => add(dish.name, slot)}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null,
                )}
              </Reveal>
            ) : null}

            <Button
              label={t('Open my calendar')}
              variant="glass"
              block
              style={{ marginTop: 24, marginBottom: 26 }}
              onPress={() => router.push('/cook/meal-plan')}
            />
          </>
        )}
      </Container>
    </Screen>
  );
}
