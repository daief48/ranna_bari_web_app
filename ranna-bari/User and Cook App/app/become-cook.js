import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Reveal from '../src/components/Reveal';
import Button from '../src/components/Button';
import FloatLabelInput, { FormNote } from '../src/components/FloatLabelInput';
import { BentoBox, IconTile } from '../src/components/Surfaces';
import {
  Body,
  Display,
  GradientText,
  Heading,
  displayStyle,
} from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import useResponsive from '../src/theme/useResponsive';
import { font, radius, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useLang } from '../src/i18n/LanguageContext';

const ZONES = [
  'Dhanmondi, Dhaka',
  'Mirpur, Dhaka',
  'Gulshan, Dhaka',
  'Uttara, Dhaka',
];

const PERKS = [
  {
    icon: 'gem',
    variant: 'primary',
    title: 'Keep 85%',
    body: 'Industry-leading payouts processed weekly directly to your bank or bKash.',
  },
  {
    icon: 'sliders',
    variant: 'sage',
    title: 'Full Control',
    body: "Set your own schedule. Accept orders when you want, pause when you don't.",
  },
  {
    icon: 'box',
    variant: 'saffron',
    title: 'Eco Packaging',
    body: 'We provide heavily discounted, sustainable packaging to all our verified partners.',
  },
];

/**
 * The pitch, and step 1 of the cook signup. It is for people who do not have
 * an account yet.
 *
 * Anyone already signed in must not come through here: this hands off to the
 * three-step signup, and finishing that calls signIn(), which replaces the
 * stored account instead of upgrading it -- an existing customer would come
 * out the other side with the form's default name, email, phone and address
 * in place of their own. Changing the role from the profile editor keeps the
 * account and just flips it, so that is where they go.
 */
export default function BecomeCookScreen() {
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const router = useRouter();
  const { isSignedIn, isCook, hydrated } = useAuth();
  const { t } = useLang();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [zone, setZone] = useState('');
  const [zoneOpen, setZoneOpen] = useState(false);
  const [nid, setNid] = useState('');
  const [note, setNote] = useState('');

  // Below the state, so the hook order is the same on the render that
  // redirects as on the one that draws the page.
  if (hydrated && isSignedIn) {
    return <Redirect href={isCook ? '/cook' : '/edit-profile'} />;
  }

  const submit = () => {
    if (!name.trim() || !phone.trim() || !zone || !nid.trim()) {
      setNote(t('Fill in every field so we can start verification.'));
      return;
    }
    setNote('');

    /* Step 1 of 3 hands off to the full three-step signup, pre-set to
       "cook". Everything collected here rides along as params, so the next
       screen opens on step 2 with these four fields already answered rather
       than asking for them a second time. */
    router.push({
      pathname: '/auth',
      params: { role: 'cook', name: name.trim(), phone: phone.trim(), zone, nid: nid.trim() },
    });
  };

  return (
    <Screen glow="both">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ---- Hero ---- */}
        <Container style={{ alignItems: 'center', paddingBottom: 40 }}>
          <Reveal delay={1} style={{ alignItems: 'center' }}>
            <Display style={{ textAlign: 'center' }}>{t('ELEVATE YOUR KITCHEN.')}</Display>
            <GradientText
              style={{ ...displayStyle(r.heroTitle), textAlign: 'center' }}
            >
              {t('OWN YOUR BUSINESS.')}
            </GradientText>

            <Body muted size={15} style={{ textAlign: 'center', marginTop: 24 }}>
              {t('Join an elite network of culinary artisans. No upfront costs. Ultimate flexibility. Connect directly with food lovers who crave authenticity.')}
            </Body>
          </Reveal>
        </Container>

        {/* ---- Onboarding form ---- */}
        <Container>
          <Reveal delay={2}>
            <View
              style={[
                {
                  paddingVertical: 28,
                  paddingHorizontal: 20,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                  overflow: 'hidden',
                },
                shadow.md,
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 32,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Heading size={24} style={{ marginBottom: 2 }}>
                    {t('Onboarding')}
                  </Heading>
                  <Body muted size={14}>
                    {t('Step 1 of 3: Verification')}
                  </Body>
                </View>

                {/* The ghost step numeral, at 5% ink */}
                <Text
                  style={{
                    fontFamily: font.displayBlack,
                    fontSize: 48,
                    lineHeight: 50,
                    color: colors.text,
                    opacity: 0.05,
                  }}
                >
                  01
                </Text>
              </View>

              <FormNote text={note} />

              <FloatLabelInput
                label={t('Full legal name')}
                value={name}
                onChangeText={setName}
                placeholder={t('As it appears on your ID')}
                autoComplete="name"
              />

              <FloatLabelInput
                label={t('Secure phone number')}
                value={phone}
                onChangeText={setPhone}
                placeholder="+880 1XXXXXXXXX"
                keyboardType="phone-pad"
                autoComplete="tel"
              />

              {/* A select is never empty, so its label rides high permanently. */}
              <View style={{ marginBottom: 20 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('Primary cooking location, currently')} ${zone ? t(zone) : '—'}`}
                  onPress={() => setZoneOpen((v) => !v)}
                  style={{
                    borderWidth: 1,
                    borderColor: zoneOpen ? colors.primary300 : colors.line,
                    borderRadius: radius.sm,
                    backgroundColor: zoneOpen ? colors.raised : colors.sunken,
                    paddingTop: 24,
                    paddingBottom: 9,
                    paddingLeft: 14,
                    paddingRight: 40,
                  }}
                >
                  <Text
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: 9,
                      fontFamily: font.uiSemi,
                      fontSize: 10.5,
                      letterSpacing: 0.95,
                      textTransform: 'uppercase',
                      color: zoneOpen ? colors.primary : colors.textMuted,
                    }}
                  >
                    {t('Primary cooking location')}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: 16,
                      color: zone ? colors.text : colors.textLight,
                    }}
                  >
                    {zone ? t(zone) : t('Select your zone')}
                  </Text>
                  <Icon
                    name="chevronDown"
                    size={16}
                    color={colors.textLight}
                    style={{ position: 'absolute', right: 14, top: 22 }}
                  />
                </Pressable>

                {zoneOpen ? (
                  <View
                    style={{
                      marginTop: 6,
                      padding: 6,
                      borderRadius: radius.sm,
                      backgroundColor: colors.surfaceSolid,
                      borderWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    {ZONES.map((z) => (
                      <Pressable
                        key={z}
                        onPress={() => {
                          setZone(z);
                          setZoneOpen(false);
                        }}
                        style={({ pressed }) => ({
                          paddingVertical: 12,
                          paddingHorizontal: 10,
                          borderRadius: radius.xs,
                          backgroundColor:
                            pressed || zone === z ? colors.primary50 : 'transparent',
                        })}
                      >
                        <Text
                          style={{
                            fontFamily: zone === z ? font.uiSemi : font.ui,
                            fontSize: 15,
                            color: zone === z ? colors.primary : colors.text,
                          }}
                        >
                          {t(z)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <FloatLabelInput
                label={t('National ID (encrypted)')}
                value={nid}
                onChangeText={setNid}
                placeholder={t('Enter NID for secure verification')}
                keyboardType="number-pad"
                trailingIcon="lock"
              />

              <View
                style={{
                  gap: 16,
                  marginTop: 32,
                  paddingTop: 24,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                }}
              >
                <Button label={t('Continue')} icon="arrowRight" block onPress={submit} />
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.canGoBack() ? router.back() : router.replace('/')
                  }
                  style={{ alignItems: 'center', paddingVertical: 10 }}
                >
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: type.xs + 1,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: colors.textMuted,
                    }}
                  >
                    {t('Cancel')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Reveal>

          {/* ---- Perks ---- */}
          <View style={{ gap: 16, marginTop: 48 }}>
            {PERKS.map((p, i) => (
              <Reveal key={p.title} delay={i + 3}>
                <BentoBox style={{ padding: 24, alignItems: 'center', gap: 16 }}>
                  <IconTile name={p.icon} variant={p.variant} />
                  <Heading size={18} style={{ textAlign: 'center' }}>
                    {t(p.title)}
                  </Heading>
                  <Body muted size={14} style={{ textAlign: 'center' }}>
                    {t(p.body)}
                  </Body>
                </BentoBox>
              </Reveal>
            ))}
          </View>
        </Container>
      </KeyboardAvoidingView>
    </Screen>
  );
}
