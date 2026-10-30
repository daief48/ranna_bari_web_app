import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import Button from './Button';
import FloatLabelInput from './FloatLabelInput';
import Icon from './Icon';
import { FieldError } from './CookBits';
import { useAlert } from './Alert';
import { errorText } from '../lib/errors';
import { call } from '../lib/server';
import { foldDigits } from '../lib/format';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';
import { useAuth } from '../store/AuthContext';
import { useSession } from '../store/SessionContext';
import { useCommerce } from '../store/CommerceContext';
import { formatOrderDate } from '../store/OrdersContext';

/**
 * Fund the wallet by paying the platform, then telling us about it.
 *
 * There is no payment gateway, and the server will not credit a wallet from
 * a request body. So the flow is the honest manual one: the customer sends
 * money to RannaBari's bKash or Nagad number from their own phone, then files
 * the amount, the provider's transaction id and the number they sent from.
 * That is a *request*. It adds nothing to the balance; a person at RannaBari
 * checks the payment arrived and approves it, and only then does the wallet
 * rise. The screen says so plainly, and lists the customer's requests with
 * their state so "where is my money" has an answer here.
 *
 * Where to send comes from the server (`/wallet/topup-info`), never from this
 * bundle: it is the platform's receiving number, and it has to be changeable
 * without a release. Until an operator sets one, `configured` is false and the
 * screen says top-up is not set up rather than showing a form that cannot work.
 */

const PRESETS = [200, 500, 1000, 2000];

const STATUS = {
  pending: { label: 'Waiting', icon: 'clock' },
  approved: { label: 'Added', icon: 'check' },
  rejected: { label: 'Declined', icon: 'alertCircle' },
};

export default function ManualTopUp({ need, onDone }) {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const alert = useAlert();
  const { account } = useAuth();
  const { token, getToken } = useSession();
  const shop = useCommerce();

  const [info, setInfo] = useState(null);
  const [requests, setRequests] = useState([]);
  const [method, setMethod] = useState('bkash');
  const [amount, setAmount] = useState(() => {
    const short = Math.ceil(Number(need));
    return Number.isFinite(short) && short > 0 ? String(short) : '';
  });
  const [txnId, setTxnId] = useState('');
  const [sender, setSender] = useState(account?.phone || '');
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const sendingRef = useRef(false);

  const load = useCallback(async () => {
    const bearer = getToken() || token;
    if (!bearer) return;
    const [i, r] = await Promise.all([
      call('/wallet/topup-info', { token: bearer }),
      call('/wallet/topup-requests', { token: bearer }),
    ]);
    if (i.ok) {
      setInfo(i.result);
      /* Open on a rail the operator actually set up. */
      if (!i.result.bkash && i.result.nagad) setMethod('nagad');
    }
    if (r.ok) setRequests(r.result.requests ?? []);
  }, [token, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const receiver = info ? info[method] : '';

  const submit = async () => {
    const value = Number(foldDigits(amount));
    const next = {};
    if (!Number.isInteger(value) || value < (info?.min ?? 1) || value > (info?.max ?? 50000)) {
      next.amount = t('Enter an amount between ৳{min} and ৳{max}.', {
        min: n(info?.min ?? 1),
        max: n(info?.max ?? 50000),
      });
    }
    const txn = foldDigits(txnId).trim();
    if (!/^[A-Za-z0-9]{6,24}$/.test(txn)) {
      next.txnId = t('Copy the transaction id from your payment message (letters and numbers only).');
    }
    if (!/^(\+?880|0)?1[3-9]\d{8}$/.test(foldDigits(sender).trim())) {
      next.sender = t('Enter the mobile number you sent the money from.');
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    /* One request at a time, closed in the same frame. Two taps would be two
       requests for one payment; the server refuses the second (same
       transaction id) but a dialog about it is noise. */
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const out = await call('/wallet/topup-requests', {
        method: 'POST',
        token: getToken() || token,
        body: { amount: value, method, txnId: txn, senderNumber: foldDigits(sender).trim() },
      });
      if (!out.ok) {
        alert.error(errorText(out.error, t, n, out));
        return;
      }
      setSent(true);
      setAmount('');
      setTxnId('');
      await load();
      shop.reloadWallet?.();
      onDone?.();
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  if (!info) return null;

  if (!info.configured) {
    return (
      <View
        style={[
          {
            gap: 8,
            padding: 16,
            borderRadius: radius.md,
            backgroundColor: colors.saffron50,
            borderWidth: 1,
            borderColor: colors.saffron100,
          },
          shadow.xs,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="clock" size={16} color={colors.saffron} />
          <Text style={{ flex: 1, fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}>
            {t('Top-up is not set up yet')}
          </Text>
        </View>
        <Text style={{ fontFamily: font.ui, fontSize: type.sm, lineHeight: type.sm * 1.55, color: colors.textMuted }}>
          {t('Wallet top-up is not set up yet. Please try again later.')}
        </Text>
      </View>
    );
  }

  const rails = ['bkash', 'nagad'].filter((m) => info[m]);

  return (
    <View style={{ gap: 14 }}>
      {/* Step 1: where to send. */}
      <View
        style={[
          {
            padding: 16,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
            gap: 10,
          },
          shadow.sm,
        ]}
      >
        <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.text }}>
          {t('1. Send the money')}
        </Text>
        {rails.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {rails.map((m) => (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === m }}
                onPress={() => setMethod(m)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  borderColor: method === m ? colors.primary : colors.line,
                  backgroundColor: method === m ? colors.primary50 : 'transparent',
                }}
              >
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
                  {m === 'bkash' ? t('bKash') : t('Nagad')}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={{ fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}>
          {t('Send Money to this {method} number:', { method: method === 'bkash' ? t('bKash') : t('Nagad') })}
        </Text>
        <Text
          selectable
          style={{
            fontFamily: font.uiBold,
            fontSize: 26,
            letterSpacing: 1,
            color: colors.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {receiver}
        </Text>
        {info.note ? (
          <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>{info.note}</Text>
        ) : null}
      </View>

      {/* Step 2: tell us about it. */}
      <View
        style={[
          {
            padding: 16,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
          },
          shadow.sm,
        ]}
      >
        <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.text, marginBottom: 12 }}>
          {t('2. Tell us what you sent')}
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {PRESETS.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => {
                setAmount(String(value));
                setErrors((e) => ({ ...e, amount: '' }));
              }}
              style={{
                paddingVertical: 9,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: String(value) === amount ? colors.primary : colors.line,
              }}
            >
              <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
                ৳{n(value)}
              </Text>
            </Pressable>
          ))}
        </View>

        <FloatLabelInput
          label={t('Amount (৳)')}
          value={amount}
          onChangeText={(v) => {
            setAmount(foldDigits(v).replace(/[^0-9]/g, ''));
            setErrors((e) => ({ ...e, amount: '' }));
          }}
          keyboardType="number-pad"
          error={!!errors.amount}
        />
        <FieldError text={errors.amount} />

        <FloatLabelInput
          label={t('Transaction id')}
          value={txnId}
          onChangeText={(v) => {
            setTxnId(v.replace(/\s/g, ''));
            setErrors((e) => ({ ...e, txnId: '' }));
          }}
          autoCapitalize="characters"
          error={!!errors.txnId}
        />
        <FieldError text={errors.txnId} />

        <FloatLabelInput
          label={t('Number you sent from')}
          value={sender}
          onChangeText={(v) => {
            setSender(v);
            setErrors((e) => ({ ...e, sender: '' }));
          }}
          keyboardType="phone-pad"
          error={!!errors.sender}
        />
        <FieldError text={errors.sender} />

        <Button label={sending ? t('Sending…') : t('Submit for review')} onPress={submit} disabled={sending} block />
        <Text
          style={{
            marginTop: 10,
            fontFamily: font.ui,
            fontSize: type.xs,
            lineHeight: type.xs * 1.6,
            color: colors.textLight,
          }}
        >
          {t('Your balance goes up once we confirm the payment, usually within a few hours.')}
        </Text>
        {sent ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              marginTop: 12,
              borderRadius: radius.sm,
              backgroundColor: colors.sage50,
              borderWidth: 1,
              borderColor: colors.sage100,
            }}
          >
            <Icon name="check" size={16} color={colors.sage} />
            <Text style={{ flex: 1, fontFamily: font.ui, fontSize: type.sm, color: colors.text }}>
              {t('Request sent. We will add it to your wallet once the payment is confirmed.')}
            </Text>
          </View>
        ) : null}
      </View>

      {requests.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.textMuted }}>
            {t('Your top-up requests')}
          </Text>
          {requests.slice(0, 6).map((row) => {
            const s = STATUS[row.status] ?? STATUS.pending;
            const fg =
              row.status === 'approved'
                ? colors.sage
                : row.status === 'rejected'
                  ? colors.primary
                  : colors.textMuted;
            return (
              <View
                key={row.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: font.uiSemi, fontSize: 15, color: colors.text }}>
                    ৳{n(row.amount)} · {row.method === 'nagad' ? t('Nagad') : t('bKash')}
                  </Text>
                  <Text numberOfLines={2} style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
                    {formatOrderDate(row.at, lang)} · {row.txnId}
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
                  <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: fg }}>{t(s.label)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
