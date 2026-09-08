import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Icon from '../../src/components/Icon';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Empty,
  Field,
  GroupLabel,
  Loading,
  MiniButton,
  Panel,
  Sheet,
} from '../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import { agoLabel, dayLabel, todayKey } from '../../src/features/meal-management/format';

/**
 * The menu. §4.13.
 *
 * What is being cooked, what people thought of it, and what they would rather
 * have. This is the module that turns the product from an accounting app into
 * §4.13's own phrase — a complete meal-management platform — and it touches no
 * money at all.
 *
 * A rating is one tap of five stars. Anything longer and nobody rates
 * anything, and an unrated menu tells the cook nothing.
 */
export default function Menu() {
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { mealTypes, can, saveMenu, rateMenu, removeMenu, addSuggestion, backSuggestion, load } =
    useMealManagement();

  const { data, loading } = useSlice('menu');
  const suggestions = useSlice('suggestions');

  const [tab, setTab] = useState('week');
  const [editing, setEditing] = useState(null);
  const [suggesting, setSuggesting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load.menu({ force: true });
      load.suggestions({ force: true });
    }, [load]),
  );

  const manage = can('manage_menu');
  const days = data?.days ?? [];

  return (
    <Screen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('THE')}
          accent={t('MENU')}
          subtitle={t('What is being cooked, and what people thought of it.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <ChipRow>
            <Chip label={t('This week')} active={tab === 'week'} onPress={() => setTab('week')} />
            <Chip
              label={t('Suggestions')}
              active={tab === 'suggestions'}
              onPress={() => setTab('suggestions')}
            />
          </ChipRow>
        </View>

        {loading && !data ? (
          <Loading />
        ) : tab === 'week' ? (
          <View style={{ marginTop: 18, gap: 12, marginBottom: 8 }}>
            {days.map((day) => (
              <Panel key={day.date} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: font.uiSemi,
                      fontSize: type.sm + 1,
                      color: day.date === todayKey() ? colors.primary : colors.text,
                    }}
                  >
                    {dayLabel(day.date, lang)}
                    {day.date === todayKey() ? ` · ${t('today')}` : ''}
                  </Text>
                </View>

                {mealTypes.map((type_) => {
                  const menu = day.menus.find((row) => row.mealType === type_.key);
                  return (
                    <Pressable
                      key={type_.key}
                      accessibilityRole={manage ? 'button' : undefined}
                      onPress={
                        manage
                          ? () =>
                              setEditing({
                                date: day.date,
                                mealType: type_.key,
                                label: type_.label,
                                items: menu?.items ?? [],
                                special: menu?.special ?? false,
                                note: menu?.note ?? '',
                              })
                          : undefined
                      }
                      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: 10,
                          paddingVertical: 7,
                        }}
                      >
                        <Text
                          style={{
                            width: 74,
                            fontFamily: font.uiSemi,
                            fontSize: type.xs + 1,
                            color: colors.textMuted,
                          }}
                        >
                          {t(type_.label)}
                        </Text>

                        <View style={{ flex: 1, gap: 5 }}>
                          <Text
                            style={{
                              fontFamily: font.ui,
                              fontSize: type.sm,
                              color: menu?.items?.length ? colors.text : colors.textMuted,
                            }}
                          >
                            {menu?.items?.length ? menu.items.join(', ') : t('not set')}
                          </Text>

                          {menu?.id ? (
                            <Stars
                              value={menu.myRating}
                              average={menu.rating}
                              count={menu.ratingCount}
                              onRate={(rating) => run(() => rateMenu(menu.id, rating), t('Thanks.'))}
                            />
                          ) : null}
                        </View>

                        {menu?.special ? (
                          <Icon name="star" size={15} color={colors.saffron} />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </Panel>
            ))}

            {!manage ? (
              <Body muted style={{ fontSize: type.xs }}>
                {t('An admin sets the menu. You can rate it, and suggest what to cook next.')}
              </Body>
            ) : null}
          </View>
        ) : (
          <View style={{ marginTop: 18, gap: 12, marginBottom: 8 }}>
            <MiniButton
              label={t('Suggest a dish')}
              icon="plus"
              onPress={() => setSuggesting(true)}
            />

            {suggestions.data?.suggestions?.length ? (
              suggestions.data.suggestions.map((row) => (
                <Panel key={row.id} style={{ gap: 8 }}>
                  <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
                    {row.text}
                  </Text>
                  <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
                    {row.author} · {agoLabel(row.at, t)}
                  </Text>
                  <Chip
                    label={
                      row.votes
                        ? t('{n} want this', { n: n(row.votes) })
                        : t('Back this')
                    }
                    icon={row.voted ? 'check' : 'plus'}
                    active={row.voted}
                    tone="good"
                    onPress={() => run(() => backSuggestion(row.id))}
                  />
                </Panel>
              ))
            ) : (
              <Empty
                icon="salad"
                title={t('No suggestions yet')}
                hint={t('Anybody can ask for a dish, and anybody can back it.')}
              />
            )}
          </View>
        )}
      </Container>

      <MenuSheet
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={async (body) => {
          const out = await run(() => saveMenu(body), t('Menu saved.'));
          if (out?.ok) setEditing(null);
          return out;
        }}
      />

      <SuggestSheet
        open={suggesting}
        onClose={() => setSuggesting(false)}
        mealTypes={mealTypes}
        onSubmit={async (body) => {
          const out = await run(() => addSuggestion(body), t('Suggested.'));
          if (out?.ok) setSuggesting(false);
          return out;
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * §4.13's food rating
 * ------------------------------------------------------------------ */

function Stars({ value, average, count, onRate }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          accessibilityRole="button"
          accessibilityLabel={t('Rate {n}', { n: star })}
          onPress={() => onRate(star)}
          hitSlop={4}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Icon
            name="star"
            size={14}
            color={star <= (value ?? 0) ? colors.saffron : colors.line}
          />
        </Pressable>
      ))}

      {count ? (
        <Text style={{ marginLeft: 5, fontFamily: font.ui, fontSize: type.xs - 1, color: colors.textMuted }}>
          {n(average)} · {t('{n} rated', { n: n(count) })}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * sheets
 * ------------------------------------------------------------------ */

function MenuSheet({ entry, onClose, onSave }) {
  const { t } = useLang();

  const [items, setItems] = useState('');
  const [special, setSpecial] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setItems((entry?.items ?? []).join(', '));
    setSpecial(!!entry?.special);
    setNote(entry?.note ?? '');
  }, [entry]);

  if (!entry) return null;

  const save = async () => {
    setBusy(true);
    await onSave({
      date: entry.date,
      mealType: entry.mealType,
      items: items
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      special,
      note: note.trim() || undefined,
    });
    setBusy(false);
  };

  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title={t('{meal} on {date}', { meal: t(entry.label), date: entry.date })}
      footer={<Button label={t('Save the menu')} onPress={save} disabled={busy} block />}
    >
      <Field
        label={t('Dishes')}
        value={items}
        onChangeText={setItems}
        placeholder={t('e.g. Rice, Dal, Chicken curry')}
        hint={t('Separate them with commas.')}
        multiline
        maxLength={500}
      />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Special meal')} />
        <ChipRow>
          <Chip label={t('Yes')} active={special} tone="good" onPress={() => setSpecial(true)} />
          <Chip label={t('Ordinary')} active={!special} onPress={() => setSpecial(false)} />
        </ChipRow>
      </View>

      <Field
        label={t('Note (optional)')}
        value={note}
        onChangeText={setNote}
        maxLength={500}
      />
    </Sheet>
  );
}

function SuggestSheet({ open, onClose, mealTypes, onSubmit }) {
  const { t } = useLang();

  const [text, setText] = useState('');
  const [mealType, setMealType] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onSubmit({ text: text.trim(), mealType: mealType || undefined });
    setBusy(false);
    setText('');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Suggest a dish')}
      footer={<Button label={t('Suggest it')} onPress={submit} disabled={busy || !text.trim()} block />}
    >
      <Field
        label={t('What should we cook?')}
        value={text}
        onChangeText={setText}
        placeholder={t('e.g. Beef tehari on Friday')}
        maxLength={200}
      />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('For which sitting')} />
        <ChipRow>
          <Chip label={t('Any')} active={!mealType} onPress={() => setMealType('')} />
          {mealTypes.map((type_) => (
            <Chip
              key={type_.key}
              label={t(type_.label)}
              active={mealType === type_.key}
              onPress={() => setMealType(type_.key)}
            />
          ))}
        </ChipRow>
      </View>
    </Sheet>
  );
}
