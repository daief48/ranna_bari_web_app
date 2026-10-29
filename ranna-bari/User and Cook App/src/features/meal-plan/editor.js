import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import Icon from '../../components/Icon';
import Button from '../../components/Button';
import { Label } from '../../components/Typography';
import { useTheme } from '../../theme/ThemeProvider';
import { font, radius } from '../../theme/tokens';

import { SLOTS, SLOT_LABEL, dateLabel, dayParts } from './format';

/**
 * The parts that make a month fillable on a phone.
 *
 * Kept apart from `components.js` because these are not chrome — they are the
 * answer to the one thing that made the cook's calendar unusable: thirty days
 * times three sittings, every one of them a blank text box, on the smallest
 * screen in the system and belonging to the least technical person in it.
 */

/**
 * The dishes for one sitting, as something to tap.
 *
 * The dish library already existed and told cooks it would "show up as
 * suggestions while you fill in a month". It did not — this is it showing up.
 *
 * Free text stays at the top rather than being replaced by the list: a cook
 * cooking something new should not have to file it in a library first. And
 * the platform's dish for that day is its own row, because "whatever would
 * have been served anyway" is the commonest answer and was previously only
 * reachable by leaving the box empty and hoping.
 */
export function DishSheet({ open, slot, date, value, suggestions, fallback, onPick, onClose, t }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open) setDraft(value ?? '');
  }, [open, value]);

  if (!open) return null;

  const say = t ?? ((s) => s);
  const commit = (text) => {
    onPick(String(text ?? '').trim());
    onClose();
  };

  const rows = [...new Set((suggestions ?? []).filter(Boolean))];

  const row = ({ pressed }) => ({
    paddingVertical: 11,
    opacity: pressed ? 0.7 : 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  });

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={say('Close')}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: `rgba(${colors.scrim}, 0.45)` }}
      />
      <View
        style={{
          backgroundColor: colors.surfaceSolid,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          paddingHorizontal: 18,
          paddingTop: 16,
          paddingBottom: 30,
          maxHeight: '74%',
        }}
      >
        <Text style={{ fontFamily: font.displayBold, fontSize: 17, color: colors.text }}>
          {say(SLOT_LABEL[slot] ?? slot)}
        </Text>
        <Text
          style={{ fontFamily: font.ui, fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}
        >
          {date ? dateLabel(date) : ''}
        </Text>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={fallback || say('What are you cooking?')}
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          onSubmitEditing={() => commit(draft)}
          style={{
            marginTop: 14,
            paddingHorizontal: 12,
            paddingVertical: 11,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.sunken,
            fontFamily: font.ui,
            fontSize: 15,
            color: colors.text,
          }}
        />

        <ScrollView style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled">
          {fallback ? (
            <Pressable accessibilityRole="button" onPress={() => commit('')} style={row}>
              <Text style={{ fontFamily: font.ui, fontSize: 14.5, color: colors.text }}>
                {fallback}
              </Text>
              <Text style={{ fontFamily: font.ui, fontSize: 11.5, color: colors.textMuted }}>
                {say('What the platform serves — leave this day to them')}
              </Text>
            </Pressable>
          ) : null}

          {rows.map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              onPress={() => commit(name)}
              style={row}
            >
              <Text style={{ fontFamily: font.ui, fontSize: 14.5, color: colors.text }}>{name}</Text>
            </Pressable>
          ))}

          {rows.length === 0 && !fallback ? (
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 13,
                lineHeight: 19,
                color: colors.textMuted,
                paddingVertical: 14,
              }}
            >
              {say('No saved dishes for this sitting yet. Type one above — it is offered on every day after this.')}
            </Text>
          ) : null}
        </ScrollView>

        <Button label={say('Set it')} block style={{ marginTop: 12 }} onPress={() => commit(draft)} />
      </View>
    </Modal>
  );
}

/**
 * One day, as three things to tap rather than three to type.
 *
 * A dish the cook chose is drawn in ink on a sage ground; the platform's shows
 * through muted, so at a glance down the month it is obvious which days have
 * been touched. The copy-down arrow is the admin editor's, ported — a menu is
 * a rotation, and whether the second week has to be typed at all is the
 * difference between filling a month and abandoning it.
 */
/**
 * Each sitting's own colour and mark — a morning, a table, an evening.
 *
 * Three identical grey bars per day, thirty days down, read as one wall of
 * boxes; a cook looking for "Thursday's dinner" had to read every label. A
 * colour and an icon per sitting turn the column into three lanes the eye can
 * run down without reading, which is the whole job of a month view.
 */
const SLOT_LOOK = {
  breakfast: { icon: 'sun', tone: 'saffron' },
  lunch: { icon: 'utensils', tone: 'sage' },
  dinner: { icon: 'moon', tone: 'primary' },
};

export function PlanDayTapRow({ day, placeholders, onOpen, onCopyDown, disabled, dim, isToday, t }) {
  const { colors, shadow } = useTheme();
  const parts = dayParts(day.date);
  const say = t ?? ((s) => s);

  /* The date block says what kind of day it is: today is filled, the weekend
     is tinted in the accent, an ordinary day in the calm green. */
  const badgeBg = isToday ? colors.primary : parts.weekend ? colors.primary50 : colors.sage50;
  const badgeInk = isToday ? '#FFFFFF' : parts.weekend ? colors.primary : colors.text;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 12,
          padding: 12,
          marginBottom: 10,
          borderRadius: 22,
          backgroundColor: colors.surfaceSolid,
          borderWidth: isToday ? 1.5 : 1,
          borderColor: isToday ? colors.primary : colors.line,
          opacity: dim ? 0.5 : 1,
        },
        isToday ? shadow.md : shadow.xs,
      ]}
    >
      <View style={{ width: 54, alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 54,
            paddingVertical: 9,
            borderRadius: 17,
            alignItems: 'center',
            backgroundColor: badgeBg,
          }}
        >
          <Text
            style={{
              fontFamily: font.displayExtra,
              fontSize: 23,
              lineHeight: 26,
              color: badgeInk,
              fontVariant: ['tabular-nums'],
            }}
          >
            {parts.day}
          </Text>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: 9.5,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: isToday ? 'rgba(255, 255, 255, 0.85)' : colors.textMuted,
            }}
          >
            {isToday ? say('Today') : parts.weekday}
          </Text>
        </View>

        {!disabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={say('Copy this day down the month')}
            onPress={() => onCopyDown(day.date)}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: pressed ? colors.sage50 : colors.sunken,
            })}
          >
            <Icon name="copy" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        {SLOTS.map((slot) => {
          const mine = String(day[slot] ?? '').trim();
          const theirs = String(placeholders?.[slot] ?? '').trim();
          const shown = mine || theirs;
          const look = SLOT_LOOK[slot];
          const tint = colors[look.tone];
          const tintSoft = colors[`${look.tone}50`];

          return (
            <Pressable
              key={slot}
              accessibilityRole="button"
              accessibilityLabel={`${say(SLOT_LABEL[slot])} · ${day.date}`}
              onPress={disabled ? undefined : () => onOpen(day.date, slot)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingLeft: 6,
                paddingRight: 10,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: mine ? colors.sage50 : colors.sunken,
                borderWidth: 1,
                borderColor: mine ? colors.sage100 : 'transparent',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tintSoft,
                }}
              >
                <Icon name={look.icon} size={15} color={tint} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 9,
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    color: tint,
                  }}
                >
                  {say(SLOT_LABEL[slot])}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: mine ? font.uiSemi : font.ui,
                    fontSize: 13.5,
                    color: mine ? colors.text : colors.textMuted,
                  }}
                >
                  {shown || '—'}
                </Text>
              </View>
              {/* A dish the cook chose themselves carries a dot — down a month
                  of rows, the touched days are the ones worth finding. */}
              {mine ? (
                <View
                  style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.sage }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A short explanation that is not in the way.
 *
 * The rules of an override calendar matter once and then never again, but they
 * were six lines standing between the cook and the work, every visit.
 */
export function Explainer({ summary, children }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ marginTop: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ flex: 1, fontFamily: font.ui, fontSize: 12.5, color: colors.textMuted }}>
          {summary}
        </Text>
        <Icon name="chevronDown" size={14} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <Text
          style={{
            marginTop: 8,
            fontFamily: font.ui,
            fontSize: 12.5,
            lineHeight: 19,
            color: colors.textMuted,
          }}
        >
          {children}
        </Text>
      ) : null}
    </View>
  );
}
