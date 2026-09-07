import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import FloatLabelInput, { FormNote } from '../../src/components/FloatLabelInput';
import { Body, Heading } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';
import { useSession } from '../../src/store/SessionContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Divider,
  GroupLabel,
  Loading,
  Panel,
  Row,
  SlotToggle,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import { fetchRecipes } from '../../src/features/meal-management/api';
import { SLOTS, rateText } from '../../src/features/meal-management/format';

const PROTEINS = [
  { key: 'chicken', label: 'Chicken' },
  { key: 'fish', label: 'Fish' },
  { key: 'beef', label: 'Beef' },
  { key: 'egg', label: 'Egg' },
  { key: 'dal', label: 'Dal' },
  { key: 'veg', label: 'Vegetable' },
];

const LEVELS = [
  { key: 'high', label: 'Often' },
  { key: 'medium', label: 'Sometimes' },
  { key: 'low', label: 'Rarely' },
];

/**
 * Schedule, target and taste — everything the planner reads.
 *
 * The screen keeps the schedule and the preferences visibly apart because they
 * do different jobs: the schedule decides how many meals a plan covers, the
 * preferences decide what goes in them. Neither has any bearing on what a month
 * actually cost, and the note at the top says so — this is the screen where
 * somebody is most likely to assume otherwise.
 */
export default function Preferences() {
  const { t, n } = useLang();
  const { colors } = useTheme();
  const { token } = useSession();
  const run = useMealAction();

  const { profile, loadProfile, updateProfile } = useMealManagement();

  const [draft, setDraft] = useState(null);
  const [target, setTarget] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  /* Seed the form once, when the record arrives. */
  useEffect(() => {
    if (profile && !draft) {
      setDraft(profile);
      setTarget(profile.targetRate ? String(profile.targetRate) : '');
    }
  }, [profile, draft]);

  useEffect(() => {
    if (token) fetchRecipes(token).then((out) => out.ok && setRecipes(out.result.recipes));
  }, [token]);

  if (!draft) {
    return (
      <Screen>
        <Container>
          <BackLink />
          <Loading />
        </Container>
      </Screen>
    );
  }

  const patch = (next) => setDraft((d) => ({ ...d, ...next }));

  const toggleAvoid = (key) =>
    patch({
      avoid: draft.avoid.includes(key)
        ? draft.avoid.filter((a) => a !== key)
        : [...draft.avoid, key],
    });

  const setLike = (food, level) => {
    const others = draft.likes.filter((l) => l.food !== food);
    const current = draft.likes.find((l) => l.food === food);
    patch({ likes: current?.level === level ? others : [...others, { food, level }] });
  };

  const setProtein = (food, perWeek) => {
    const others = draft.proteins.filter((p) => p.food !== food);
    const current = draft.proteins.find((p) => p.food === food);
    patch({
      proteins: current?.perWeek === perWeek ? others : [...others, { food, perWeek }],
    });
  };

  const save = async () => {
    const targetNumber = target.trim() ? Number(target) : null;
    setBusy(true);
    await run(
      () =>
        updateProfile({
          breakfast: draft.breakfast,
          lunch: draft.lunch,
          dinner: draft.dinner,
          targetRate: targetNumber,
          avoid: draft.avoid,
          likes: draft.likes,
          proteins: draft.proteins,
          breakfastPerWeek: draft.breakfastPerWeek,
          avoidRepeat: draft.avoidRepeat,
        }),
      t('Saved.'),
    );
    setBusy(false);
  };

  const perDay =
    (draft.breakfast ? 1 : 0) + (draft.lunch ? 1 : 0) + (draft.dinner ? 1 : 0);

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('MEAL')}
          accent={t('PREFERENCES')}
          subtitle={t('What the planner should aim for.')}
          style={{ marginTop: 16 }}
        />

        {/* Target. */}
        <Reveal delay={1}>
          <GroupLabel text={t('Target meal rate')} style={{ marginTop: 26 }} />
          <Panel style={{ marginTop: 12 }}>
            <FloatLabelInput
              label={t('Taka per meal')}
              value={target}
              onChangeText={(v) => setTarget(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
            <Body muted style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18 }}>
              {t('The planner builds a month that averages this. It does not change what your meals actually cost.')}
            </Body>
          </Panel>
        </Reveal>

        {/* Schedule. */}
        <Reveal delay={2}>
          <GroupLabel text={t('My meal schedule')} style={{ marginTop: 28 }} />
          <Panel style={{ marginTop: 12, gap: 8 }}>
            {SLOTS.map((s) => (
              <SlotToggle
                key={s.key}
                label={t(s.label)}
                taken={draft[s.key]}
                onToggle={() => patch({ [s.key]: !draft[s.key] })}
              />
            ))}
            <Divider />
            <Row
              label={t('Meals a day at most')}
              value={n(perDay)}
              strong
            />
          </Panel>
          <Body muted style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
            {t('This is what the planner expects. Your bill still counts only the meals you record.')}
          </Body>
        </Reveal>

        {/* How often breakfast. */}
        {draft.breakfast ? (
          <Reveal delay={3}>
            <GroupLabel text={t('Breakfasts a week')} style={{ marginTop: 28 }} />
            <View style={{ marginTop: 12 }}>
              <ChipRow>
                {[1, 2, 3, 4, 5, 6, 7].map((v) => (
                  <Chip
                    key={v}
                    label={n(v)}
                    active={draft.breakfastPerWeek === v}
                    tone="sage"
                    onPress={() => patch({ breakfastPerWeek: v })}
                  />
                ))}
              </ChipRow>
            </View>
          </Reveal>
        ) : null}

        {/* Protein frequency. */}
        <Reveal delay={4}>
          <GroupLabel text={t('Protein, days a week')} style={{ marginTop: 28 }} />
          <Panel style={{ marginTop: 12, gap: 14 }}>
            {PROTEINS.map((p) => {
              const current = draft.proteins.find((x) => x.food === p.key);
              return (
                <View key={p.key}>
                  <Text
                    style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
                  >
                    {t(p.label)}
                  </Text>
                  <View style={{ marginTop: 8 }}>
                    <ChipRow>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <Chip
                          key={v}
                          label={n(v)}
                          active={current?.perWeek === v}
                          tone="sage"
                          onPress={() => setProtein(p.key, v)}
                        />
                      ))}
                    </ChipRow>
                  </View>
                </View>
              );
            })}
          </Panel>
          <Body muted style={{ marginTop: 8, fontSize: 12.5 }}>
            {t('Leave blank for no limit. Tap the same number again to clear it.')}
          </Body>
        </Reveal>

        {/* Likes. */}
        <Reveal delay={5}>
          <GroupLabel text={t('What you like')} style={{ marginTop: 28 }} />
          <Panel style={{ marginTop: 12, gap: 14 }}>
            {PROTEINS.map((p) => {
              const current = draft.likes.find((l) => l.food === p.key);
              return (
                <View key={p.key}>
                  <Text
                    style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
                  >
                    {t(p.label)}
                  </Text>
                  <View style={{ marginTop: 8 }}>
                    <ChipRow>
                      {LEVELS.map((l) => (
                        <Chip
                          key={l.key}
                          label={t(l.label)}
                          active={current?.level === l.key}
                          onPress={() => setLike(p.key, l.key)}
                        />
                      ))}
                    </ChipRow>
                  </View>
                </View>
              );
            })}
          </Panel>
        </Reveal>

        {/* Avoid. */}
        <Reveal delay={6}>
          <GroupLabel text={t('Never plan these')} style={{ marginTop: 28 }} />
          <View style={{ marginTop: 12 }}>
            <ChipRow>
              {PROTEINS.map((p) => (
                <Chip
                  key={p.key}
                  label={t(p.label)}
                  active={draft.avoid.includes(p.key)}
                  onPress={() => toggleAvoid(p.key)}
                />
              ))}
            </ChipRow>
          </View>

          {recipes.length ? (
            <View style={{ marginTop: 10 }}>
              <ChipRow>
                {recipes.map((r) => (
                  <Chip
                    key={r.key}
                    label={r.name}
                    active={draft.avoid.includes(r.key)}
                    onPress={() => toggleAvoid(r.key)}
                  />
                ))}
              </ChipRow>
            </View>
          ) : null}
        </Reveal>

        {/* Variety. */}
        <Reveal delay={7}>
          <GroupLabel text={t('Variety')} style={{ marginTop: 28 }} />
          <Panel style={{ marginTop: 12 }}>
            <SlotToggle
              label={t('Never the same dish two days running')}
              taken={draft.avoidRepeat}
              onToggle={() => patch({ avoidRepeat: !draft.avoidRepeat })}
            />
          </Panel>
        </Reveal>

        <Button
          label={busy ? t('Saving…') : t('Save preferences')}
          block
          disabled={busy}
          style={{ marginTop: 24, marginBottom: 16 }}
          onPress={save}
        />
      </Container>
    </Screen>
  );
}
