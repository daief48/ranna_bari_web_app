import React, { useState } from 'react';
import { View } from 'react-native';

import Icon from './Icon';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import { Body, Heading } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { radius } from '../theme/tokens';

/**
 * "Did your food arrive?" — the one card that closes an order, wherever it
 * was bought.
 *
 * A shop order and a kitchen order are the same object once they have been
 * delivered: the same rail, the same last step, the same sentence from the
 * customer that ends it. They used to have two cards — a button called
 * "Food received" on one and "Yes, I got my order" on the other, one asking
 * "are you sure?" and one not — and two copies of anything that closes an
 * order drift. This is the single copy.
 *
 * It owns the question and the confirmation; what happens *after* "yes" is the
 * caller's (`onConfirm`), because the screens differ there on purpose — one
 * shows a thank-you, the other keeps the foreground clear for the rating
 * sheet.
 *
 * One confirmation at a time: the card closes its dialog and ignores further
 * taps until `onConfirm` settles, so a double tap cannot send the same word
 * twice.
 *
 * @param {object} props
 * @param {number} props.amount   What the order cost, whole taka.
 * @param {string} props.cook     Who is waiting to be paid.
 * @param {boolean} [props.cash]  Paid in cash at the door — nothing is held,
 *                                so the wording must not say it is.
 * @param {() => Promise<void> | void} props.onConfirm
 * @param {object} [props.style]
 */
export default function FoodReceivedCard({ amount, cook, cash = false, onConfirm, style }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setAsking(false);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View
        style={[
          {
            gap: 12,
            padding: 18,
            borderRadius: radius.md,
            backgroundColor: colors.saffron50,
            borderWidth: 1,
            borderColor: colors.saffron100,
          },
          style,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="box" size={18} color={colors.saffron} />
          <Heading size={17} style={{ flex: 1 }}>
            {t('Did your food arrive?')}
          </Heading>
        </View>
        <Body muted size={14}>
          {/* Where the money already is differs; what confirming does does not:
              on every rail it is what lets RannaBari settle the cook. */}
          {cash
            ? t(
                'You paid the rider at the door. Confirming closes this order and lets RannaBari settle {kitchen}.',
                { kitchen: cook },
              )
            : t(
                'Confirming closes this order. ৳{n} stays held until RannaBari releases it to {cook}.',
                { n: n(amount), cook },
              )}
        </Body>
        <Button
          label={t('Food received')}
          icon="check"
          iconPosition="left"
          block
          disabled={busy}
          onPress={() => setAsking(true)}
        />
      </View>

      <ConfirmDialog
        open={asking}
        title={t('Confirm you received the food?')}
        body={
          cash
            ? t(
                'This completes the order and cannot be undone. You paid the rider at the door; RannaBari settles {cook}.',
                { cook },
              )
            : t(
                'This completes the order and cannot be undone. ৳{n} stays held until RannaBari releases it to {cook}.',
                { n: n(amount), cook },
              )
        }
        confirmLabel={t('Yes, it arrived')}
        onConfirm={confirm}
        onClose={() => setAsking(false)}
      />
    </>
  );
}
