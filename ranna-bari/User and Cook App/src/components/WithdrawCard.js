import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import Button from './Button';
import FloatLabelInput from './FloatLabelInput';
import Icon from './Icon';
import { BentoBox } from './Surfaces';
import { FieldError, RowHeading } from './CookBits';
import { useAction } from './Alert';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';
import { formatOrderDate } from '../store/OrdersContext';
import { useWithdrawals } from '../data/withdrawals';

/**
 * Ask to be paid now, instead of waiting for the next payout run.
 *
 * What the card promises is what the server does: a request *reserves* the
 * money (it stays in the cook's balance, but a payout run can no longer take
 * it) until an operator sends it and marks it paid. So the figure at the top
 * is `available` — balance minus anything already requested — straight from
 * the server, and a pending request shows beside it rather than being quietly
 * subtracted.
 *
 * One request at a time. While one is waiting the form gives way to that
 * request and a Cancel; that is the server's rule too (`withdrawal-open`), so
 * the screen never offers what the server will refuse.
 *
 * The destination is read-only here. It is copied onto the request by the
 * server at request time, so editing it later cannot redirect a request
 * already in; the Edit link goes to the profile, where the editor lives.
 */

const taka = (v, n) => `৳${n((Math.round(Number(v) || 0)).toLocaleString('en-US'))}`;

const STATUS = {
  requested: { label: 'Waiting', tone: 'saffron', icon: 'clock' },
  paid: { label: 'Paid', tone: 'sage', icon: 'check' },
  rejected: { label: 'Declined', tone: 'primary', icon: 'alertCircle' },
  cancelled: { label: 'Cancelled', tone: 'muted', icon: 'x' },
};

export default function WithdrawCard() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const router = useRouter();
  const run = useAction();
  const w = useWithdrawals();

  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const open = w.withdrawals.find((row) => row.status === 'requested');
  const hasDestination = (w.method === 'bkash' || w.method === 'bank') && !!w.account;
  const value = Math.round(Number(String(amount).replace(/[^\d]/g, '')) || 0);

  const destination = hasDestination
    ? t('{method} · ····{last4}', {
        method: w.method === 'bkash' ? t('bKash') : t('Bank'),
        last4: String(w.account).slice(-4),
      })
    : t('Not set');

  const send = async () => {
    /* Same rules the server applies, said before the round trip. The server
       still decides: these only spare a cook a dialog for a typo. */
    if (!hasDestination) {
      router.push('/cook/profile');
      return;
    }
    if (value < w.minimum) {
      setError(t('The smallest withdrawal is ৳{n}.', { n: n(w.minimum) }));
      return;
    }
    if (value > w.available) {
      setError(t('You only have ৳{n} available to withdraw.', { n: n(w.available) }));
      return;
    }

    setError('');
    setSending(true);
    try {
      const out = await run(() => w.request(value), t('Withdrawal requested.'));
      if (out?.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setAmount('');
      }
    } finally {
      setSending(false);
    }
  };

  const chip = (row) => {
    const s = STATUS[row.status] ?? STATUS.requested;
    const fg =
      s.tone === 'sage' ? colors.sage : s.tone === 'primary' ? colors.primary : colors.textMuted;
    return { s, fg };
  };

  return (
    <View style={{ marginTop: 4, marginBottom: 28 }}>
      <RowHeading icon="banknote" title={t('Withdraw money')} />

      <BentoBox style={{ padding: 20, gap: 14 }}>
        <View>
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: type.micro,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: colors.textMuted,
            }}
          >
            {t('Available to withdraw')}
          </Text>
          <Text
            accessibilityLabel={t('Available to withdraw')}
            style={{
              marginTop: 4,
              fontFamily: font.uiBold,
              fontSize: 36,
              lineHeight: 42,
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {taka(w.available, n)}
          </Text>
          {w.reserved > 0 ? (
            <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
              {t('৳{n} is already requested and waiting for payment.', { n: n(w.reserved) })}
            </Text>
          ) : null}
        </View>

        {/* Destination, read-only. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: radius.md,
            backgroundColor: colors.sunken,
          }}
        >
          <Icon name="banknote" size={16} color={colors.textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
              {t('Sent to')}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}
            >
              {destination}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasDestination ? t('Edit') : t('Add where to send your money')}
            onPress={() => router.push('/cook/profile')}
            hitSlop={8}
          >
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.sage }}>
              {hasDestination ? t('Edit') : t('Add')}
            </Text>
          </Pressable>
        </View>

        {open ? (
          <View style={{ gap: 10 }}>
            <Text style={{ fontFamily: font.ui, fontSize: type.sm, color: colors.text }}>
              {t('Your request for ৳{n} is waiting. We will send it to {to} and tell you here.', {
                n: n(open.amount),
                to: destination,
              })}
            </Text>
            <Button
              variant="ghost"
              small
              label={t('Cancel request')}
              onPress={() => run(() => w.cancel(open.id), t('Request cancelled.'))}
            />
          </View>
        ) : (
          <View>
            <FloatLabelInput
              label={t('Amount (৳)')}
              value={amount}
              onChangeText={(v) => {
                setAmount(v.replace(/[^\d]/g, ''));
                setError('');
              }}
              keyboardType="number-pad"
              error={!!error}
            />
            <FieldError text={error} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                disabled={w.available <= 0}
                onPress={() => {
                  setAmount(String(w.available));
                  setError('');
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill ?? 999,
                  borderWidth: 1,
                  borderColor: colors.line,
                  opacity: w.available > 0 ? 1 : 0.4,
                }}
              >
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
                  {t('Withdraw all')}
                </Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Button
                  label={hasDestination ? t('Withdraw') : t('Add payout method')}
                  onPress={send}
                  disabled={sending || (hasDestination && !value)}
                  block
                />
              </View>
            </View>
            <Text
              style={{
                marginTop: 10,
                fontFamily: font.ui,
                fontSize: type.xs,
                color: colors.textMuted,
              }}
            >
              {t('Minimum withdrawal ৳{n}. We send it by hand, usually within a day.', {
                n: n(w.minimum),
              })}
            </Text>
          </View>
        )}
      </BentoBox>

      {w.withdrawals.length ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          {w.withdrawals.slice(0, 5).map((row) => {
            const { s, fg } = chip(row);
            return (
              <View
                key={row.id}
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.sm,
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: font.uiSemi, fontSize: 15, color: colors.text }}>
                    ৳{n(row.amount)}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                  >
                    {formatOrderDate(row.requestedAt, lang)} · {row.code}
                    {row.status === 'rejected' && row.note ? ` · ${row.note}` : ''}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: fg,
                  }}
                >
                  <Icon name={s.icon} size={12} color={fg} strokeWidth={2.2} />
                  <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: fg }}>
                    {t(s.label)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
