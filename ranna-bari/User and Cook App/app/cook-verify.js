import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Button from '../src/components/Button';
import FloatLabelInput, { FormNote } from '../src/components/FloatLabelInput';
import { IconTile } from '../src/components/Surfaces';
import { Heading } from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useSession } from '../src/store/SessionContext';
import { useAlert } from '../src/components/Alert';
import { useLang } from '../src/i18n/LanguageContext';
import {
  cookForgotPassword,
  cookResendOtp,
  cookResetPassword,
  cookVerifyEmail,
} from '../src/lib/cookAuth';

/**
 * The emailed code — and, on the reset flow, the whole password recovery.
 *
 * One screen serving two flows, because they are the same exchange: an
 * address, a code that proves it, and something granted afterwards. Register
 * arrives here from the signup form with the code already sent; reset starts
 * at the address and ends at a new password. The cooldown is the shared
 * spine — the backend refuses a second code inside sixty seconds, and the
 * resend button counts that refusal down rather than pretending it did not
 * happen.
 */

/** "alamhpl11@gmail.com" → "a•••@gmail.com" — enough to recognise, not to steal. */
const maskEmail = (email) => {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  return `${email[0]}•••${email.slice(at)}`;
};

export default function CookVerifyScreen() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t, n } = useLang();
  const alert = useAlert();
  const { adoptSession } = useSession();
  const { signIn } = useAuth();

  const flow = params.flow === 'reset' ? 'reset' : 'register';
  const paramEmail = typeof params.email === 'string' ? params.email.trim() : '';
  const paramCooldown = Number(params.cooldown) || 0;

  /* Reset starts at the address — nobody is emailed a code they did not ask
     for — while register arrives with one already on its way. */
  const [stage, setStage] = useState(flow === 'reset' ? 'email' : 'code'); // 'email' | 'code' | 'new'
  const [email, setEmail] = useState(paramEmail);
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const purpose = flow === 'reset' ? 'reset' : 'register';

  /* The countdown, seeded from wherever a server answer named one: the
     register form hands its refused-send window over as a param, every send
     answers with `cooldownSeconds`, and a refused resend answers with
     `retryAfterSeconds`. One state, three sources, one rule — no code leaves
     through a button that the server has already closed. */
  const [left, setLeft] = useState(paramCooldown);
  const leftRef = useRef(paramCooldown);
  useEffect(() => {
    const timer = setInterval(() => {
      if (leftRef.current <= 0) return;
      leftRef.current -= 1;
      setLeft(leftRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const startCooldown = useCallback((seconds) => {
    const next = Math.max(0, Number(seconds) || 0);
    leftRef.current = next;
    setLeft(next);
  }, []);

  const applySend = (out) => {
    if (!out.ok) {
      /* The one refusal that is not an error but a wait: show it where the
         button is, with the window, rather than as an alert over the screen. */
      if (out.error === 'otp-cooldown' || out.error === 'otp-rate-limited') {
        startCooldown(out.retryAfterSeconds ?? 60);
        setNote(out.message ?? t('Please wait a minute before asking for another code.'));
        return;
      }
      if (out.error === 'already-verified') {
        alert.error(t('That email is already verified. Sign in instead.'));
        return;
      }
      alert.error(out.message ?? t('We could not send the email right now.'));
      return;
    }
    setNote('');
    startCooldown(out.result?.cooldownSeconds ?? 60);
    if (out.result?.devCode) setCode(String(out.result.devCode));
  };

  const sendCode = async () => {
    if (!email.trim()) {
      setNote(t('Enter your email address.'));
      return;
    }
    setBusy(true);
    try {
      const out = await cookForgotPassword(email.trim());
      applySend(out);
      if (out.ok) setStage('code');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      applySend(await cookResendOtp(email.trim(), purpose));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!code.trim()) {
      setNote(t('Enter the six-digit code.'));
      return;
    }
    setBusy(true);
    try {
      if (flow === 'reset') {
        setNote('');
        setStage('new');
        return;
      }

      const out = await cookVerifyEmail({
        email: email.trim(),
        code: code.trim(),
        device: { name: 'RannaBari', platform: 'expo' },
      });

      if (!out.ok) {
        setNote(out.message ?? t('That code did not work.'));
        return;
      }

      /* Signed in the moment the code is spent — the documents step that
         follows is a write, and a write needs a token. The same two writes
         the phone path makes: the server session, then the local profile. */
      await adoptSession(out.result.token, out.result.account);
      await signIn({
        role: 'cook',
        accountId: out.result.account.accountId,
        kitchenId: out.result.account.kitchenId,
        kitchen: out.result.account.kitchenName ?? '',
        name: out.result.account.name ?? '',
        phone: out.result.account.phone,
      });

      /* Replaced, not pushed: back must not land on a screen whose code has
         already been spent. */
      router.replace('/cook-documents');
    } catch (error) {
      alert.error(error?.message ?? t('That code did not work.'));
    } finally {
      setBusy(false);
    }
  };

  const finishReset = async () => {
    if (newPw.length < 8) {
      setNote(t('Use at least 8 characters for your password.'));
      return;
    }
    setBusy(true);
    try {
      const out = await cookResetPassword({
        email: email.trim(),
        code: code.trim(),
        newPassword: newPw,
      });
      if (!out.ok) {
        setNote(out.message ?? t('That code did not work.'));
        return;
      }
      alert.success(t('Password updated. Sign in with your new password.'));
      router.replace('/auth');
    } finally {
      setBusy(false);
    }
  };

  if (flow === 'register' && !paramEmail) {
    return <Redirect href="/auth" />;
  }

  return (
    <Screen>
      <Container style={{ maxWidth: 460, paddingTop: 32 }}>
        <IconTile
          name="shieldCheck"
          variant="sage"
          style={{ width: 52, height: 52, borderRadius: 17, marginBottom: 14 }}
        />
        <Heading style={{ marginBottom: 6 }}>
          {flow === 'reset'
            ? stage === 'new'
              ? t('Set a new password')
              : t('Forgot your password?')
            : t('Check your email.')}
        </Heading>
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: 14.5,
            lineHeight: 22,
            color: colors.textMuted,
            marginBottom: 18,
          }}
        >
          {flow === 'reset'
            ? stage === 'email'
              ? t('Enter the email you registered with and we will send a code.')
              : stage === 'code'
                ? t('We sent a code to {email}. It expires in five minutes.', {
                    email: maskEmail(email),
                  })
                : t('Choose something at least 8 characters long.')
            : t('We sent a six-digit code to {email}. It expires in five minutes.', {
                email: maskEmail(email),
              })}
        </Text>

        <View style={[{ padding: 18, borderRadius: radius.md, backgroundColor: colors.surfaceSolid, borderWidth: 1, borderColor: colors.line, gap: 14 }, shadow.sm]}>
          <FormNote text={note} />

          {stage === 'email' ? (
            <>
              <FloatLabelInput
                label={t('Email')}
                value={email}
                onChangeText={setEmail}
                placeholder={t('you@example.com')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                style={{ marginBottom: 4 }}
              />
              <Button
                label={busy ? t('Just a moment…') : t('Send code')}
                icon="arrowRight"
                block
                disabled={busy}
                onPress={sendCode}
              />
            </>
          ) : null}

          {stage === 'code' ? (
            <>
              <FloatLabelInput
                label={t('Six-digit code')}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                style={{ marginBottom: 4 }}
              />
              <Button
                label={busy ? t('Just a moment…') : t('Verify')}
                icon="arrowRight"
                block
                disabled={busy}
                onPress={verify}
              />
              <ResendRow
                left={left}
                busy={busy}
                label={(seconds) =>
                  seconds > 0
                    ? t('Resend code in {s}s', { s: n(seconds) })
                    : t('Resend code')
                }
                onPress={resend}
              />
            </>
          ) : null}

          {stage === 'new' ? (
            <>
              <FloatLabelInput
                label={t('New password')}
                value={newPw}
                onChangeText={setNewPw}
                placeholder={t('At least 8 characters')}
                secureTextEntry
                autoComplete="new-password"
                style={{ marginBottom: 4 }}
              />
              <Button
                label={busy ? t('Just a moment…') : t('Save new password')}
                icon="check"
                block
                disabled={busy}
                onPress={finishReset}
              />
            </>
          ) : null}
        </View>

        {/* Back is a way to correct a mistyped address, not a way out — a code
            already sent stays valid in the inbox whether this screen is open
            or not. */}
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            flow === 'reset' && stage !== 'email'
              ? setStage('email')
              : router.canGoBack()
                ? router.back()
                : router.replace('/auth')
          }
          style={{ marginTop: 16, alignSelf: 'center' }}
        >
          <Text style={{ fontFamily: font.uiSemi, fontSize: 13.5, color: colors.textMuted }}>
            {flow === 'reset' && stage !== 'email'
              ? t('Use a different email')
              : t('Back to RannaBari')}
          </Text>
        </Pressable>
      </Container>
    </Screen>
  );
}

function ResendRow({ left, busy, label, onPress }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: left > 0 || busy }}
      onPress={left > 0 || busy ? undefined : onPress}
      disabled={left > 0 || busy}
      style={({ pressed }) => ({
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: radius.sm,
        opacity: left > 0 ? 0.55 : pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: 13.5,
          color: left > 0 ? colors.textMuted : colors.primary,
          fontVariant: left > 0 ? ['tabular-nums'] : undefined,
        }}
      >
        {label(left)}
      </Text>
    </Pressable>
  );
}
