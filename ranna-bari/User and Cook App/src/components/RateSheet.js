/**
 * Five stars and an optional sentence.
 *
 * The stars are the whole control: a rating nobody can give in one tap is one
 * most people will not give at all. The text is there for the minority with
 * something specific to say, and it is never required.
 *
 * "Not now" is a real button rather than a dismissal gesture, because a
 * dialog that can only be escaped by rating collects ratings about the dialog.
 *
 * It lives here rather than inside a screen because both order trackers ask
 * the same question at the same moment — the escrow one and the cash one —
 * and two copies of a ratings prompt would drift into asking it two ways.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';

import Icon from './Icon';
import Button from './Button';
import { Body, Heading } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';

export default function RateSheet({ open, cook, onClose, onSubmit }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /* A fresh sheet each time it opens, so a previous order's stars never
     appear against a new one. */
  useEffect(() => {
    if (open) {
      setStars(0);
      setNote('');
      setBusy(false);
    }
  }, [open]);

  const send = async () => {
    if (!stars || busy) return;
    setBusy(true);
    await onSubmit(stars, note.trim());
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 20,
          backgroundColor: 'rgba(20, 16, 14, 0.5)',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              padding: 22,
              gap: 14,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
            },
            shadow.lg,
          ]}
        >
          <Heading size={19}>{t('How was it?')}</Heading>
          <Body muted size={14}>
            {cook
              ? t('Your rating tells the next customer what to expect from {cook}.', { cook })
              : t('Your rating tells the next customer what to expect.')}
          </Body>

          <View
            style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 4 }}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={t('{n} of 5', { n: value })}
                onPress={() => setStars(value)}
                hitSlop={6}
                style={{ padding: 4 }}
              >
                <Icon
                  name="star"
                  size={30}
                  color={value <= stars ? colors.saffron : colors.line}
                  strokeWidth={value <= stars ? 2 : 1.6}
                />
              </Pressable>
            ))}
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('Anything you want to add? (optional)')}
            placeholderTextColor={colors.textLight}
            multiline
            maxLength={1000}
            style={{
              minHeight: 66,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.sunken,
              paddingHorizontal: 14,
              paddingVertical: 11,
              textAlignVertical: 'top',
              fontFamily: font.ui,
              fontSize: type.sm,
              color: colors.text,
            }}
          />

          <Button
            label={busy ? t('Sending…') : t('Send rating')}
            icon="star"
            block
            disabled={!stars || busy}
            onPress={send}
          />
          <Button label={t('Not now')} variant="ghost" block onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
