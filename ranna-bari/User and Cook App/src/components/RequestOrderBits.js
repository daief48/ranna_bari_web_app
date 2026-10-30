import React from 'react';
import { Text, View } from 'react-native';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';
import { cookBase } from '../lib/orderRails';

/**
 * The parts that say "this order began as a food request".
 *
 * A paid request order is an ordinary wallet order on the rail, but the cook
 * needs to know three more things than a menu dish tells them: that it is a
 * request (what was asked for is free text, not a listing), what exactly was
 * asked (description, portions, wanted-by date), and that the money is
 * already safe - held by the platform, not owed on the doorstep. These are
 * shared by the board card and the order screen so the two say it alike.
 */

/** The small "Food request" tag. */
export function FoodRequestTag({ style }) {
  const { colors } = useTheme();
  const { t } = useLang();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          paddingVertical: 3,
          paddingHorizontal: 8,
          borderRadius: radius.pill,
          backgroundColor: colors.saffron50,
          borderWidth: 1,
          borderColor: colors.saffron100,
        },
        style,
      ]}
    >
      <Icon name="chat" size={10} color={colors.saffron} strokeWidth={2.2} />
      <Text
        maxFontSizeMultiplier={1.2}
        style={{
          fontFamily: font.uiBold,
          fontSize: 9.5,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: colors.saffron,
        }}
      >
        {t('Food request')}
      </Text>
    </View>
  );
}

/** Whether the money is still the platform's to hold (nothing released or returned). */
export const requestMoneyHeld = (order) =>
  !['completed', 'cancelled', 'rejected'].includes(order?.status);

/**
 * "Paid from the customer's wallet - held by RannaBari until they confirm".
 * Drawn only while that is true; once the order is closed it would be a lie.
 */
export function WalletHeldLine({ order, style }) {
  const { colors } = useTheme();
  const { t } = useLang();
  if (!requestMoneyHeld(order)) return null;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, style]}>
      <Icon name="lock" size={13} color={colors.sage} />
      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: type.xs,
          lineHeight: type.xs * 1.5,
          color: colors.textMuted,
        }}
      >
        {t('Paid from the customer’s wallet — held by RannaBari until they confirm')}
      </Text>
    </View>
  );
}

/**
 * What was asked for and at what price: description, portions, wanted-by
 * date, and the agreed price. `request` may be null while it loads - the
 * order's own note and agreed price still show.
 *
 * @param {object} props
 * @param {object} props.order
 * @param {object|null} props.request
 * @param {boolean} [props.compact]  Board card: two lines of description.
 */
export function RequestOrderFacts({ order, request, compact }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  const facts = [
    request?.quantity > 1 ? t('{n} portions', { n: n(request.quantity) }) : null,
    request?.wantedDate ? t('Wanted by {date}', { date: request.wantedDate }) : null,
    t('Agreed price ৳{n}', { n: n(cookBase(order)) }),
  ].filter(Boolean);

  return (
    <View style={{ gap: 6 }}>
      {request?.details ? (
        <Text
          numberOfLines={compact ? 2 : undefined}
          style={{
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: type.sm * 1.5,
            color: colors.text,
          }}
        >
          {request.details}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 }}>
        {facts.map((f) => (
          <Text
            key={f}
            style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.textMuted }}
          >
            {f}
          </Text>
        ))}
      </View>
    </View>
  );
}
