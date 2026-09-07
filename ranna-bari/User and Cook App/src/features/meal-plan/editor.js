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
export function PlanDayTapRow({ day, placeholders, onOpen, onCopyDown, disabled, dim, t }) {
  const { colors } = useTheme();
  const parts = dayParts(day.date);
  const say = t ?? ((s) => s);

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        opacity: dim ? 0.45 : 1,
      }}
    >
      <View style={{ width: 40, paddingTop: 5 }}>
        <Text
          style={{
            fontFamily: font.displayBold,
            fontSize: 17,
            color: parts.weekend ? colors.primary : colors.text,
          }}
        >
          {parts.day}
        </Text>
        <Label style={{ color: colors.textMuted }}>{parts.weekday}</Label>
      </View>

      <View style={{ flex: 1, gap: 6 }}>
        {SLOTS.map((slot) => {
          const mine = String(day[slot] ?? '').trim();
          const theirs = String(placeholders?.[slot] ?? '').trim();
          const shown = mine || theirs;

          return (
            <Pressable
              key={slot}
              accessibilityRole="button"
              accessibilityLabel={`${say(SLOT_LABEL[slot])} · ${day.date}`}
              onPress={disabled ? undefined : () => onOpen(day.date, slot)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: mine ? colors.sage : colors.line,
                backgroundColor: mine ? colors.sage50 : colors.sunken,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{ width: 58, fontFamily: font.ui, fontSize: 11.5, color: colors.textMuted }}
              >
                {say(SLOT_LABEL[slot])}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontFamily: font.ui,
                  fontSize: 13.5,
                  color: mine ? colors.text : colors.textMuted,
                }}
              >
                {shown || '—'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!disabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={say('Copy this day down the month')}
          onPress={() => onCopyDown(day.date)}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 26,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Icon name="chevronDown" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
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
