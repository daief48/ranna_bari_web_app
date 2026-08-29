import React, { useCallback, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useSession } from '../../src/store/SessionContext';
import { useAuth } from '../../src/store/AuthContext';
import { useLang } from '../../src/i18n/LanguageContext';

/**
 * Prove the phone is yours.
 *
 * The app's own sign-in never verified anything — it built an account out of
 * whatever string was typed and threw the password away. That was fine while
 * nothing left the device. Chat is the first thing that does, and a message
 * that can come from anybody claiming to be anybody is not a feature.
 *
 * One number, one code. No password: it is one more thing to lose, and the
 * account was already keyed on a phone number.
 */
export default function VerifyNumber() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t } = useLang();
  const { account } = useAuth();
  const { requestCode, verifyCode, checking } = useSession();

  const [phone, setPhone] = useState(account?.phone ?? '');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('phone'); // 'phone' | 'code'
  const [note, setNote] = useState(null);
  const [devCode, setDevCode] = useState(null);
  const [busy, setBusy] = useState(false);

  const codeRef = useRef(null);

  const ask = useCallback(async () => {
    setNote(null);
    setBusy(true);
    try {
      const out = await requestCode(phone);
      setStage('code');
      /* With no SMS provider wired in, the server hands the code back so the
         flow can be walked end to end. It refuses to do that once one is
         configured, so this cannot survive into production by accident.
         Auto-fill the field so the user does not have to copy it manually. */
      if (out.devCode) {
        setDevCode(out.devCode);
        setCode(String(out.devCode));
      }
      setTimeout(() => codeRef.current?.focus(), 250);
    } catch (error) {
      setNote(error?.message ?? t('Could not send a code.'));
    } finally {
      setBusy(false);
    }
  }, [phone, requestCode, t]);

  const confirm = useCallback(async () => {
    setNote(null);
    setBusy(true);
    try {
      await verifyCode(phone, code);
      router.replace('/chat');
    } catch (error) {
      setNote(error?.message ?? t('That code did not work.'));
    } finally {
      setBusy(false);
    }
  }, [phone, code, verifyCode, router, t]);

  const input = {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.raised,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.ui,
    fontSize: type.body,
    color: colors.ink,
  };

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead={stage === 'phone' ? t('VERIFY') : t('ENTER')}
          accent={stage === 'phone' ? t('YOUR NUMBER') : t('THE CODE')}
          style={{ marginBottom: 18 }}
        />

        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm,
            color: colors.ink2,
            lineHeight: 21,
            marginBottom: 20,
          }}
        >
          {stage === 'phone'
            ? t('Messages go to a real person — your cook, or our support desk. We need to know this number is yours.')
            : t('We sent a six-digit code to {phone}.', { phone })}
        </Text>

        {stage === 'phone' ? (
          <>
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.ink3, marginBottom: 6 }}>
              {t('Mobile number')}
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="01712 345678"
              placeholderTextColor={colors.ink3}
              keyboardType="phone-pad"
              autoFocus
              style={[input, { marginBottom: 16 }]}
            />
            <Button
              label={busy ? t('Sending…') : t('Send me a code')}
              icon="phone"
              block
              disabled={busy || phone.replace(/\D/g, '').length < 10}
              onPress={ask}
            />
          </>
        ) : (
          <>
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.ink3, marginBottom: 6 }}>
              {t('Six-digit code')}
            </Text>
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={colors.ink3}
              keyboardType="number-pad"
              maxLength={6}
              style={[
                input,
                { marginBottom: 16, letterSpacing: 8, fontFamily: font.uiSemi, fontSize: type.h3 },
              ]}
            />

            {devCode ? (
              <View
                style={{
                  backgroundColor: colors.saffron50,
                  borderWidth: 1,
                  borderColor: colors.saffron100,
                  borderRadius: radius.sm,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.ink2, lineHeight: 18 }}>
                  {t('No SMS provider is configured, so the code is')}{' '}
                  <Text style={{ fontFamily: font.uiBold, color: colors.saffron }}>{devCode}</Text>
                  {'. '}
                  {t('This only happens in development.')}
                </Text>
              </View>
            ) : null}

            <Button
              label={busy || checking ? t('Checking…') : t('Verify')}
              icon="check"
              block
              disabled={busy || checking || code.length !== 6}
              onPress={confirm}
            />

            <Pressable onPress={() => setStage('phone')} style={{ marginTop: 14 }} hitSlop={8}>
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: type.xs,
                  color: colors.primary,
                  textAlign: 'center',
                }}
              >
                {t('Use a different number')}
              </Text>
            </Pressable>
          </>
        )}

        {note ? (
          <Text
            style={{
              marginTop: 14,
              fontFamily: font.ui,
              fontSize: type.xs,
              color: colors.primary,
              textAlign: 'center',
            }}
          >
            {note}
          </Text>
        ) : null}
      </Container>
    </Screen>
  );
}
