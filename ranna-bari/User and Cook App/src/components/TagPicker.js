import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type, tracking } from '../theme/tokens';

/** Longest a single tag may be. The server trims to the same length. */
export const TAG_MAX_LENGTH = 24;

/**
 * Tags a cook can pick from a short list *and* write for themselves.
 *
 * The list is a head start, not a fence: a pickle shop that makes "Mango
 * achar" had nothing to tick, so the vocabulary the cook could use was the
 * vocabulary we had guessed. Typed tags join the same row of chips, selected,
 * with a cross to take them back out.
 *
 * Several can go in at once — a comma ends a tag, so "Jhal, Spicy, Fresh"
 * pasted or typed becomes three — and Enter adds without closing the keyboard,
 * because the next tag is usually already in the cook's head.
 *
 * Tags are compared without regard to case, so "achar" typed against the
 * ticked "Achar" is the same tag, not a second one.
 */
export default function TagPicker({ value, onChange, suggestions = [], max = 5, label }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');

  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const has = (list, tag) => list.some((x) => same(x, tag));

  /* The row: the suggestions in their order, then whatever the cook typed. */
  const custom = value.filter((tag) => !has(suggestions, tag));
  const chips = [...suggestions, ...custom];
  const full = value.length >= max;

  const toggle = (tag) => {
    setNote('');
    if (has(value, tag)) {
      onChange(value.filter((x) => !same(x, tag)));
    } else if (full) {
      setNote(t('You can have up to {max} tags. Remove one to add another.', { max: n(max) }));
    } else {
      onChange([...value, tag]);
    }
  };

  /* Take every finished piece of the draft. A piece that is already there is
     skipped silently; one that does not fit says so instead of vanishing. */
  const commit = (raw) => {
    const pieces = raw
      .split(/[,،]/)
      .map((p) => p.replace(/\s+/g, ' ').trim().slice(0, TAG_MAX_LENGTH))
      .filter(Boolean);
    if (!pieces.length) return;

    let next = [...value];
    let dropped = 0;
    for (const piece of pieces) {
      if (has(next, piece)) continue;
      if (next.length >= max) {
        dropped += 1;
        continue;
      }
      /* Typed in a different case from a suggestion → use the suggestion's
         spelling, so it ticks that chip rather than sitting beside it. */
      next.push(suggestions.find((s) => same(s, piece)) ?? piece);
    }
    onChange(next);
    setNote(
      dropped
        ? t('You can have up to {max} tags, so {over} were not added.', {
            max: n(max),
            over: n(dropped),
          })
        : '',
    );
  };

  const onChangeText = (text) => {
    /* A comma finishes whatever is before it; the rest stays in the box. */
    if (/[,،]/.test(text)) {
      const cut = Math.max(text.lastIndexOf(','), text.lastIndexOf('،'));
      commit(text.slice(0, cut));
      setDraft(text.slice(cut + 1).trimStart());
      return;
    }
    setDraft(text);
  };

  const add = () => {
    commit(draft);
    setDraft('');
  };

  return (
    <View style={{ marginBottom: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: type.micro,
            letterSpacing: type.micro * (tracking?.label ?? 0.09),
            textTransform: 'uppercase',
            color: colors.textMuted,
          }}
        >
          {label ?? t('Tags (up to 5)')}
        </Text>
        <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.textLight }}>
          {n(value.length)}/{n(max)}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {chips.map((tag) => {
          const on = has(value, tag);
          const typed = !has(suggestions, tag);
          return (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={typed ? t('Remove {tag}', { tag }) : tag}
              onPress={() => toggle(tag)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: radius.pill,
                backgroundColor: on ? colors.sage : colors.surfaceSolid,
                borderWidth: 1,
                borderColor: on ? colors.sage : colors.line,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Text
                style={{
                  fontFamily: on ? font.uiBold : font.uiSemi,
                  fontSize: 12,
                  color: on ? '#FFFFFF' : colors.textMuted,
                }}
              >
                {typed ? tag : t(tag)}
              </Text>
              {typed ? <Icon name="x" size={12} color="#FFFFFF" strokeWidth={2.6} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* ---- write your own ---- */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={draft}
          onChangeText={onChangeText}
          onSubmitEditing={add}
          blurOnSubmit={false}
          returnKeyType="done"
          maxLength={TAG_MAX_LENGTH + 40}
          editable={!full}
          placeholder={full ? t('Tags are full') : t('Add your own — separate with commas')}
          placeholderTextColor={colors.textLight}
          accessibilityLabel={t('Add your own tag')}
          style={{
            flex: 1,
            minWidth: 0,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.surfaceSolid,
            color: colors.text,
            fontFamily: font.ui,
            fontSize: 13,
            opacity: full ? 0.6 : 1,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Add tag')}
          disabled={full || !draft.trim()}
          onPress={add}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: radius.pill,
            backgroundColor: colors.sage,
            opacity: full || !draft.trim() ? 0.4 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Icon name="plus" size={14} color="#FFFFFF" strokeWidth={2.6} />
          <Text style={{ fontFamily: font.uiBold, fontSize: 12.5, color: '#FFFFFF' }}>
            {t('Add')}
          </Text>
        </Pressable>
      </View>

      {note ? (
        <Text
          style={{
            marginTop: 8,
            fontFamily: font.ui,
            fontSize: type.xs + 1,
            lineHeight: 18,
            color: colors.saffron,
          }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
