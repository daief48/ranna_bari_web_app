import React from 'react';
import { Modal, Pressable, View } from 'react-native';

import Button from './Button';
import { Body, Heading } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { radius } from '../theme/tokens';

/**
 * A yes/no the user has to mean.
 *
 * Lifted out of `OrderTracker` so the things that ask before doing something
 * that cannot be taken back — closing an order, cancelling one — ask the same
 * way wherever they are.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {string} props.body
 * @param {string} props.confirmLabel
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onClose
 */
export default function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

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
          <Heading size={19}>{title}</Heading>
          <Body muted size={14}>
            {body}
          </Body>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="glass" label={t('Never mind')} onPress={onClose} style={{ flex: 1 }} />
            <Button label={confirmLabel} onPress={onConfirm} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
