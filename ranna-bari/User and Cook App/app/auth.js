import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';

import Icon from '../src/components/Icon';
import Button from '../src/components/Button';
import FloatLabelInput, { FormNote } from '../src/components/FloatLabelInput';
import LocationPicker from '../src/components/LocationPicker';
import { IconTile } from '../src/components/Surfaces';
import { useTheme } from '../src/theme/ThemeProvider';
import useResponsive from '../src/theme/useResponsive';
import { font, radius, tracking, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useSession } from '../src/store/SessionContext';
import { useAlert } from '../src/components/Alert';
import {
  DEMO_ADDRESS,
  DEMO_CREDENTIALS,
  DEMO_KITCHEN,
  DEMO_SIGNUP,
} from '../src/lib/demoData';
import { useLang } from '../src/i18n/LanguageContext';

/* The aside imagery and copy follow the chosen path, so the screen keeps
   talking about the thing the visitor picked. */
const ASIDE = {
  none: {
    eyebrow: 'Home kitchens, near you',
    title: 'Every plate here was cooked by somebody’s hands.',
    emphasis: 'somebody’s',
    img: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1400&q=80',
  },
  user: {
    eyebrow: 'Dinner is three streets away',
    title: 'Tonight, eat something made, not manufactured.',
    emphasis: 'made',
    img: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1400&q=80',
  },
  cook: {
    eyebrow: 'Your kitchen, your business',
    title: 'The recipe is already yours. We bring the customers.',
    emphasis: 'yours',
    img: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1400&q=80',
  },
};

const SPECIALTIES = [
  'Traditional Heritage',
  'Coastal Seafood',
  'Street & Snacks',
  'Biryani & Rice',
  'Vegetarian & Bhorta',
  'Desserts & Pitha',
];

const PW_WORDS = ['Strength', 'Weak', 'Fair', 'Good', 'Strong'];

/** The exact scoring in js/auth.js: length, length again, mixed case, digit+symbol. */
function passwordScore(v) {
  if (!v) return 0;
  let score = 0;
  if (v.length >= 8) score++;
  if (v.length >= 12) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v) && /[^\w\s]/.test(v)) score++;
  return score;
}

export default function AuthScreen() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();
  const { requestCode, verifyCode } = useSession();
  const alert = useAlert();

  /* become-cook.js is step 1 of the same funnel: it collects a name, a phone,
     a zone and an NID, then hands over. Reading them here is what keeps that
     from being a form the user fills in twice. */
  const params = useLocalSearchParams();
  const { t } = useLang();
  const fromCookFunnel = params.role === 'cook';
  const param = (key, fallback) =>
    typeof params[key] === 'string' && params[key] ? params[key] : fallback;

  const [tab, setTab] = useState(fromCookFunnel ? 'signup' : 'signin');

  /* ---- sign in ---- */
  /* Sign in is a phone and a code now, not an id and a password: the server
     has no passwords, and an account here is a handset that proved it holds
     its own number. */
  const [siPhone, setSiPhone] = useState(DEMO_CREDENTIALS.phone ?? '');
  const [siCode, setSiCode] = useState('');
  const [siStage, setSiStage] = useState('phone'); // 'phone' | 'code'
  const [siBusy, setSiBusy] = useState(false);

  /* ---- sign up ---- */
  // Arriving from the cook funnel means the role question is already answered.
  const [step, setStep] = useState(fromCookFunnel ? 2 : 1);
  const [role, setRole] = useState(fromCookFunnel ? 'cook' : DEMO_SIGNUP.role);
  const [roleNote, setRoleNote] = useState('');
  const [detailsNote, setDetailsNote] = useState('');
  const [locNote, setLocNote] = useState('');
  /* The last step of signing up is proving the number, same as signing in. */
  const [suStage, setSuStage] = useState('form'); // 'form' | 'code'
  const [suCode, setSuCode] = useState('');
  const [suBusy, setSuBusy] = useState(false);

  const [name, setName] = useState(param('name', DEMO_SIGNUP.name));
  const [phone, setPhone] = useState(param('phone', DEMO_SIGNUP.phone));
  const [email, setEmail] = useState(DEMO_SIGNUP.email);
  const [pw, setPw] = useState(DEMO_SIGNUP.password);
  const [kitchen, setKitchen] = useState(DEMO_KITCHEN.kitchen);
  const [specialty, setSpecialty] = useState(DEMO_KITCHEN.specialty);
  const [nid, setNid] = useState(param('nid', DEMO_KITCHEN.nid));
  const [terms, setTerms] = useState(DEMO_SIGNUP.terms);

  /* Seeded rather than null, so "Create account" is live the moment step 3
     opens instead of waiting on the debounced reverse geocode. Dragging the
     map replaces this with the real pin. */
  const [place, setPlace] = useState({
    lat: DEMO_ADDRESS.lat,
    lng: DEMO_ADDRESS.lng,
    // The zone chosen on the cook funnel is the pin's starting address.
    address: param('zone', DEMO_ADDRESS.area),
  });
  const [detail, setDetail] = useState(DEMO_ADDRESS.detail);
  const [addressLabel, setAddressLabel] = useState(DEMO_ADDRESS.label);
  const [radiusKm, setRadiusKm] = useState(3);

  const aside = ASIDE[tab === 'signup' && role ? role : 'none'];
  const pwLevel = passwordScore(pw);

  /* ---- validation, port of js/auth.js validate() ---- */
  const goStep = (target) => {
    if (target < step) {
      setStep(target);
      return;
    }

    if (step === 1) {
      if (!role) {
        setRoleNote(t('Pick one to continue.'));
        return;
      }
      setRoleNote('');
    }

    if (step === 2) {
      const required = [
        [name, 'name'],
        [phone, 'phone'],
        [email, 'email'],
        [pw, 'password'],
        ...(role === 'cook'
          ? [
              [kitchen, 'kitchen name'],
              [specialty, 'specialty'],
              [nid, 'National ID'],
            ]
          : []),
      ];

      if (required.some(([v]) => !String(v).trim())) {
        setDetailsNote(t('Fill in the highlighted fields to continue.'));
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setDetailsNote(t('That email address does not look right.'));
        return;
      }
      if (pw.length < 8) {
        setDetailsNote(t('Use at least 8 characters for your password.'));
        return;
      }
      if (!terms) {
        setDetailsNote(t('Please accept the Terms and Privacy Policy.'));
        return;
      }
      setDetailsNote('');
    }

    setStep(target);
  };

  /**
   * Finish signing up — which means proving the number first.
   *
   * The three steps before this collect a profile, and a profile is not an
   * account: everything the new user is about to do (book a meal, open a
   * kitchen, hold money) is a write the server will refuse without a token.
   * So the last step is the same one-time code the sign-in tab uses, and the
   * profile is only stored once it comes back verified.
   */
  const submit = async () => {
    if (!place) {
      return alert.error(t('Drop your pin on the map so we know where to find you.'));
    }
    if (!phone.trim()) {
      return alert.error(t('We need your mobile number to send a code.'));
    }
    setLocNote('');

    if (suStage === 'form') {
      setSuBusy(true);
      try {
        const out = await requestCode(phone.trim());
        setSuStage('code');
        if (out.devCode) setSuCode(String(out.devCode));
      } catch (error) {
        alert.error(error?.message ?? t('Could not send a code.'));
      } finally {
        setSuBusy(false);
      }
      return;
    }

    if (!suCode.trim()) {
      return alert.error(t('Enter the six-digit code.'));
    }

    setSuBusy(true);
    try {
      const identity = await verifyCode(phone.trim(), suCode.trim(), name.trim());

      await signIn({
        /* The profile the three steps collected, kept because it is real and
           the server holds none of it: an area, a pin, a door number. */
        role,
        name: name.trim(),
        phone: identity.phone ?? phone.trim(),
        email: email.trim(),
        kitchen: kitchen.trim(),
        specialty,
        area: place.address,
        lat: place.lat,
        lng: place.lng,
        addressDetail: detail.trim(),
        addressLabel,
        deliveryRadiusKm: role === 'cook' ? radiusKm : null,
        accountId: identity.accountId,
        kitchenId: identity.kitchenId,
      });

      setStep(4);
    } catch (error) {
      alert.error(error?.message ?? t('That code did not work.'));
    } finally {
      setSuBusy(false);
    }
  };

  /**
   * Sign in, for real this time.
   *
   * This used to build an account out of whatever string was typed and throw
   * the password away — which was survivable while nothing left the device.
   * It is not survivable now: every meal, order and taka in the app is a row
   * on a server that decides what this account may touch, and it decides from
   * a token. Without one, every write comes back `unauthenticated` and the
   * screen shows "something went wrong".
   *
   * So it is one number and one code. No password — it is one more thing to
   * lose, and the account was already keyed on a phone number.
   */
  const askCode = async () => {
    if (!siPhone.trim()) {
      return alert.error(t('Enter your mobile number.'));
    }
    setSiBusy(true);
    try {
      const out = await requestCode(siPhone.trim());
      setSiStage('code');
      /* With no SMS provider wired in the server hands the code back so the
         flow can be walked end to end. It refuses to once one is configured,
         so this cannot reach production by accident. */
      if (out.devCode) setSiCode(String(out.devCode));
    } catch (error) {
      alert.error(error?.message ?? t('Could not send a code.'));
    } finally {
      setSiBusy(false);
    }
  };

  const doSignIn = async () => {
    if (siStage === 'phone') return askCode();

    if (!siCode.trim()) {
      return alert.error(t('Enter the six-digit code.'));
    }
    setSiBusy(true);
    try {
      const identity = await verifyCode(siPhone.trim(), siCode.trim());
      /* The server decides the role: an account with a kitchen is a cook,
         whatever this device previously believed about itself. */
      const acct = await signIn({
        role: identity.kitchenId ? 'cook' : 'user',
        accountId: identity.accountId,
        kitchenId: identity.kitchenId,
        kitchen: identity.kitchenName ?? '',
        name: identity.name ?? '',
        phone: identity.phone,
      });
      alert.success(t('Signed in.'));
      router.replace(acct.role === 'cook' ? '/cook' : '/profile');
    } catch (error) {
      alert.error(error?.message ?? t('That code did not work.'));
    } finally {
      setSiBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 48 + insets.bottom }}
        >
          {/* =========================================================
              BRAND BANNER
              Under 1024px the sticky aside collapses into a short banner
              so the form starts above the fold. On a phone the supporting
              paragraph goes entirely -- the role cards a few hundred
              pixels below make the same argument, better.
              ========================================================= */}
          <View
            style={{
              paddingTop: insets.top + 18,
              paddingBottom: 22,
              paddingHorizontal: r.gutter,
              gap: 14,
              overflow: 'hidden',
              backgroundColor: 'rgb(20, 16, 14)',
            }}
          >
            <Image
              source={{ uri: aside.img }}
              contentFit="cover"
              transition={900}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            {/* Warm terracotta veil. A plain black scrim greys the food out. */}
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(20, 16, 14, 0.74)',
                'rgba(199, 56, 26, 0.50)',
                'rgba(20, 16, 14, 0.92)',
              ]}
              locations={[0, 0.48, 1]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            <View style={{ flexDirection: 'row' }}>
              <AsideBrand />
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 8,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: radius.pill,
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.18)',
              }}
            >
              <Icon name="sparkles" size={15} color="#E8BE5A" />
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: 11,
                  letterSpacing: 11 * tracking.label,
                  textTransform: 'uppercase',
                  color: '#FFF6F1',
                }}
              >
                {t(aside.eyebrow)}
              </Text>
            </View>

            <AsideTitle title={t(aside.title)} emphasis={t(aside.emphasis)} />
          </View>

          {/* =========================================================
              FORM COLUMN
              ========================================================= */}
          <View style={{ paddingHorizontal: r.gutter, paddingTop: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                marginBottom: 18,
              }}
            >
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace('/')
                }
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 9,
                  paddingLeft: 12,
                  paddingRight: 16,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: pressed ? colors.primary200 : colors.line,
                  backgroundColor: colors.surfaceSolid,
                })}
              >
                <Icon name="arrowLeft" size={16} color={colors.textMuted} />
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: 13,
                    color: colors.textMuted,
                  }}
                >
                  {t('Back to RannaBari')}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isDark ? 'Switch to light mode' : 'Switch to dark mode'
                }
                onPress={toggle}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.surfaceSolid,
                }}
              >
                <Icon
                  name={isDark ? 'sun' : 'moon'}
                  size={19}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>

            {/* ---- Switch ---- */}
            <View
              style={{
                flexDirection: 'row',
                gap: 4,
                padding: 5,
                marginBottom: 20,
                borderRadius: radius.pill,
                backgroundColor: colors.sunken,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              {[
                ['signin', t('Sign in')],
                ['signup', t('Create account')],
              ].map(([key, label]) => {
                const on = tab === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => setTab(key)}
                    style={[
                      {
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: 11,
                        paddingHorizontal: 8,
                        borderRadius: radius.pill,
                        backgroundColor: on ? colors.surfaceSolid : 'transparent',
                      },
                      on ? shadow.sm : null,
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 13,
                        color: on ? colors.text : colors.textMuted,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {tab === 'signin' ? (
              <SignInView
                phone={siPhone}
                setPhone={setSiPhone}
                code={siCode}
                setCode={setSiCode}
                stage={siStage}
                busy={siBusy}
                onSubmit={doSignIn}
                onBack={() => {
                  setSiStage('phone');
                  setSiCode('');
                }}
                onSwitch={() => setTab('signup')}
              />
            ) : (
              <SignUpView
                step={step}
                role={role}
                setRole={(r) => {
                  setRole(r);
                  setRoleNote('');
                }}
                roleNote={roleNote}
                detailsNote={detailsNote}
                locNote={locNote}
                suStage={suStage}
                setSuStage={setSuStage}
                suCode={suCode}
                setSuCode={setSuCode}
                suBusy={suBusy}
                goStep={goStep}
                submit={submit}
                fields={{
                  name,
                  setName,
                  phone,
                  setPhone,
                  email,
                  setEmail,
                  pw,
                  setPw,
                  kitchen,
                  setKitchen,
                  specialty,
                  setSpecialty,
                  nid,
                  setNid,
                  terms,
                  setTerms,
                  detail,
                  setDetail,
                  addressLabel,
                  setAddressLabel,
                  radiusKm,
                  setRadiusKm,
                }}
                pwLevel={pwLevel}
                place={place}
                setPlace={setPlace}
                /* A cook finishes signup inside their own kitchen, not on a
                   customer profile page they have no use for. */
                onDone={() => router.replace(role === 'cook' ? '/cook' : '/browse')}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ---------------------------------------------------------
   Aside pieces
   --------------------------------------------------------- */

/** The wordmark, re-skinned for the dark scrim: glass mark, peach "BARI". */
function AsideBrand() {
  const wordStyle = {
    fontFamily: font.displayExtra,
    fontSize: 20,
    letterSpacing: -0.6,
    color: '#FFF6F1',
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image
        source={require('../assets/logo.png')}
        style={{ width: 34, height: 34 }}
        contentFit="contain"
      />
      <View style={{ flexDirection: 'row' }}>
        <Text style={wordStyle}>RANNA</Text>
        <Text style={[wordStyle, { color: '#F0A88F' }]}>BARI</Text>
      </View>
    </View>
  );
}

/** The headline, with the one italic word the CSS marks with <em>. */
/**
 * The one emphasised word is found by splitting the sentence on it, which
 * only works while the emphasis is a literal substring of the title. Both
 * are translated together and the Bengali pair is chosen to keep that true;
 * if a future translation breaks it, split() returns the whole string and
 * the line simply renders without the accent rather than losing text.
 */
function AsideTitle({ title, emphasis }) {
  const base = {
    fontFamily: font.displayExtra,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.55,
    color: '#FFF6F1',
  };
  const parts = title.split(emphasis);

  return (
    <Text style={base}>
      {parts[0]}
      {/* A real italic face. fontStyle:'italic' on a custom family either
          does nothing or gets synthesised into a slanted smear. */}
      <Text style={{ ...base, fontFamily: font.displayItalic, color: '#F0A88F' }}>
        {emphasis}
      </Text>
      {parts[1]}
    </Text>
  );
}

/* ---------------------------------------------------------
   Sign in
   --------------------------------------------------------- */
function SignInView({ phone, setPhone, code, setCode, stage, busy, note, onSubmit, onBack, onSwitch }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

  return (
    <Animated.View entering={FadeInDown.duration(400)}>
      <View style={{ marginBottom: 20 }}>
        <Text
          style={{
            fontFamily: font.displayExtra,
            fontSize: 30,
            lineHeight: 33,
            letterSpacing: -0.84,
            color: colors.text,
            marginBottom: 8,
          }}
        >
          {t('Welcome back.')}
        </Text>
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: 14.5,
            lineHeight: 23,
            color: colors.textMuted,
          }}
        >
          {t('Sign in to order dinner, or to open your kitchen for the day.')}
        </Text>
      </View>

      <View style={[cardStyle(colors), shadow.md]}>
        <FormNote text={note} />

        {/* No password field: the server has none. An account here is a
            handset that proved it holds its own number, so the whole of
            signing in is that number and the code sent to it. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 9,
            padding: 12,
            marginBottom: 16,
            borderRadius: radius.sm,
            backgroundColor: colors.sage50,
          }}
        >
          <Icon name="sparkles" size={16} color={colors.sage} />
          <Text
            style={{
              flex: 1,
              fontFamily: font.ui,
              fontSize: 12.5,
              lineHeight: 19,
              color: colors.textMuted,
            }}
          >
            {stage === 'phone'
              ? t('We send a six-digit code to your phone. No password to remember.')
              : t('We sent a six-digit code to {phone}.', { phone })}
          </Text>
        </View>

        <FloatLabelInput
          label={t('Mobile number')}
          value={phone}
          onChangeText={setPhone}
          placeholder="01712 345678"
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoComplete="tel"
          editable={stage === 'phone'}
          style={{ marginBottom: 16 }}
        />

        {stage === 'code' ? (
          <FloatLabelInput
            label={t('Six-digit code')}
            value={code}
            onChangeText={setCode}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <View style={{ marginBottom: 24 }} />

        <Button
          label={
            busy
              ? t('Just a moment…')
              : stage === 'phone'
                ? t('Send code')
                : t('Sign in')
          }
          icon="arrowRight"
          block
          disabled={busy}
          onPress={onSubmit}
        />

        {stage === 'code' ? (
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={{ marginTop: 14, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: font.uiSemi, fontSize: 13.5, color: colors.primary }}>
              {t('Use a different number')}
            </Text>
          </Pressable>
        ) : null}

        <Divider label={t('or continue with')} />

        <View style={{ gap: 12 }}>
          <SocialButton provider="google" label={t('Google')} />
          <SocialButton provider="phone" label={t('Phone OTP')} />
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginTop: 26,
        }}
      >
        <Text
          style={{ fontFamily: font.ui, fontSize: 14, color: colors.textMuted }}
        >
          {t('New to RannaBari?')}{' '}
        </Text>
        <Pressable onPress={onSwitch} accessibilityRole="button">
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: 14,
              color: colors.primary,
            }}
          >
            {t('Create an account')}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/* ---------------------------------------------------------
   Sign up — three steps plus a done state
   --------------------------------------------------------- */
function SignUpView({
  step,
  role,
  setRole,
  roleNote,
  detailsNote,
  locNote,
  suStage,
  setSuStage,
  suCode,
  setSuCode,
  suBusy,
  goStep,
  submit,
  fields,
  pwLevel,
  place,
  setPlace,
  onDone,
}) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

  const heads = {
    1: {
      h1: t('Join RannaBari.'),
      sub: t('Three short steps. The last one puts you on the map — literally.'),
    },
    2: { h1: t('Join RannaBari.'), sub: t('Three short steps.') },
    3: { h1: t('Join RannaBari.'), sub: t('Almost there.') },
    4: { h1: '', sub: '' },
  }[step];

  return (
    <View>
      {step < 4 ? (
        <>
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontFamily: font.displayExtra,
                fontSize: 30,
                lineHeight: 33,
                letterSpacing: -0.84,
                color: colors.text,
                marginBottom: 8,
              }}
            >
              {heads.h1}
            </Text>
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 14.5,
                lineHeight: 23,
                color: colors.textMuted,
              }}
            >
              {heads.sub}
            </Text>
          </View>

          <StepRail step={step} />
        </>
      ) : null}

      <View style={[cardStyle(colors), shadow.md]}>
        {step === 1 ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <StepHead
              title={t('What brings you here?')}
              sub="You can always add the other side later from your profile."
            />

            <View style={{ gap: 14 }}>
              <RoleCard
                selected={role === 'user'}
                onPress={() => setRole('user')}
                icon="utensils"
                variant="primary"
                title={t("I'm here to eat")}
                desc={t('Order home-cooked meals from kitchens on your street.')}
                perks={['Free', 'Order in 2 taps']}
              />
              <RoleCard
                selected={role === 'cook'}
                onPress={() => setRole('cook')}
                icon="chefHat"
                variant="sage"
                title={t("I'm here to cook")}
                desc={t('Turn your kitchen into a business. Cook, list, deliver.')}
                perks={[t('Keep 85%'), t('Your schedule')]}
              />
            </View>

            {roleNote ? (
              <View style={{ marginTop: 16 }}>
                <FormNote text={roleNote} tone="info" />
              </View>
            ) : null}

            <Actions
              next={{ label: 'Continue', onPress: () => goStep(2) }}
              backLabel="Cancel"
              onBack={null}
            />
          </Animated.View>
        ) : null}

        {step === 2 ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <StepHead
              title={role === 'cook' ? t('Your kitchen details') : t('Your details')}
              sub={
                role === 'cook'
                  ? 'This is what customers will see, plus one thing only we see.'
                  : 'We only ask for what an order actually needs.'
              }
            />

            <FormNote text={detailsNote} />

            <FloatLabelInput
              label={t('Full name')}
              value={fields.name}
              onChangeText={fields.setName}
              placeholder={t('Full name')}
              autoComplete="name"
              style={{ marginBottom: 16 }}
            />
            <FloatLabelInput
              label={t('Phone')}
              value={fields.phone}
              onChangeText={fields.setPhone}
              placeholder="+880 1XXXXXXXXX"
              keyboardType="phone-pad"
              autoComplete="tel"
              style={{ marginBottom: 16 }}
            />
            <FloatLabelInput
              label={t('Email')}
              value={fields.email}
              onChangeText={fields.setEmail}
              placeholder={t('you@example.com')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={{ marginBottom: 16 }}
            />
            <FloatLabelInput
              label={t('Password')}
              value={fields.pw}
              onChangeText={fields.setPw}
              placeholder={t('At least 8 characters')}
              secureTextEntry
              autoComplete="new-password"
              style={{ marginBottom: 6 }}
            />

            <PasswordStrength level={pwLevel} />

            {role === 'cook' ? (
              <>
                <FloatLabelInput
                  label={t('Kitchen name')}
                  value={fields.kitchen}
                  onChangeText={fields.setKitchen}
                  placeholder={t("e.g. Fatema's Heritage Kitchen")}
                  style={{ marginBottom: 16 }}
                />

                <SpecialtyPicker
                  value={fields.specialty}
                  onChange={fields.setSpecialty}
                />

                <FloatLabelInput
                  label={t('National ID')}
                  value={fields.nid}
                  onChangeText={fields.setNid}
                  placeholder={t('10 or 17 digit NID')}
                  keyboardType="number-pad"
                  trailingIcon="lock"
                  style={{ marginBottom: 10 }}
                />

                <FieldHint
                  icon="shieldCheck"
                  text="Encrypted at rest and used once, for the verification badge. It is never shown to customers."
                />
              </>
            ) : null}

            <Checkbox
              checked={fields.terms}
              onToggle={() => fields.setTerms((v) => !v)}
              label={t('I agree to the Terms and the Privacy Policy.')}
              linkWords={['Terms', 'Privacy Policy.']}
            />

            <Actions
              next={{ label: 'Continue', onPress: () => goStep(3) }}
              backLabel="Back"
              onBack={() => goStep(1)}
            />
          </Animated.View>
        ) : null}

        {step === 3 ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <StepHead
              title={
                role === 'cook'
                  ? t('Where do you cook?')
                  : t('Where should we find you?')
              }
              sub={
                role === 'cook'
                  ? t('Drag the map so the pin sits on your kitchen. This decides who can order from you.')
                  : t('Drag the map so the pin sits on your door. This decides which kitchens you see.')
              }
            />

            <FormNote text={locNote} />

            <LocationPicker onChange={setPlace} height={250} />

            <View style={{ marginTop: 18 }}>
              <FloatLabelInput
                label={t('House / road / flat')}
                value={fields.detail}
                onChangeText={fields.setDetail}
                placeholder={t('House 12, Road 7, Flat 4B')}
                style={{ marginBottom: 16 }}
              />
            </View>

            {role === 'user' ? (
              <View style={{ marginBottom: 8 }}>
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: type.micro,
                    letterSpacing: type.micro * tracking.label,
                    textTransform: 'uppercase',
                    color: colors.textMuted,
                    marginBottom: 10,
                  }}
                >
                  Save this address as
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    ['Home', 'home'],
                    ['Work', 'box'],
                    ['Other', 'pin'],
                  ].map(([label, icon]) => {
                    const on = fields.addressLabel === label;
                    return (
                      <Pressable
                        key={label}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => fields.setAddressLabel(label)}
                        style={[
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 7,
                            paddingVertical: 9,
                            paddingHorizontal: 15,
                            borderRadius: radius.pill,
                            borderWidth: 1,
                            borderColor: on ? 'transparent' : colors.line,
                            backgroundColor: on ? colors.primary : colors.sunken,
                          },
                          on ? shadow.primary : null,
                        ]}
                      >
                        <Icon
                          name={icon}
                          size={15}
                          color={on ? '#FFFFFF' : colors.textMuted}
                        />
                        <Text
                          style={{
                            fontFamily: font.uiSemi,
                            fontSize: 13,
                            color: on ? '#FFFFFF' : colors.textMuted,
                          }}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <RadiusSlider
                value={fields.radiusKm}
                onChange={fields.setRadiusKm}
              />
            )}

            {/* The number has to be proved before any of this becomes an
                account — everything the new user does next is a write the
                server refuses without a token. */}
            {suStage === 'code' ? (
              <View style={{ marginTop: 18 }}>
                <FloatLabelInput
                  label={t('Six-digit code')}
                  value={suCode}
                  onChangeText={setSuCode}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: 12.5,
                    lineHeight: 19,
                    color: colors.textMuted,
                    marginTop: 8,
                  }}
                >
                  {t('We sent a six-digit code to {phone}.', { phone: fields.phone })}
                </Text>
              </View>
            ) : null}

            <Actions
              next={{
                label: suBusy
                  ? 'Just a moment…'
                  : suStage === 'form'
                    ? 'Send code'
                    : 'Create account',
                onPress: submit,
              }}
              backLabel="Back"
              onBack={() => (suStage === 'code' ? setSuStage('form') : goStep(2))}
            />
          </Animated.View>
        ) : null}

        {step === 4 ? (
          <DoneState
            role={role}
            name={fields.name}
            place={place}
            addressLabel={fields.addressLabel}
            radiusKm={fields.radiusKm}
            onDone={onDone}
          />
        ) : null}
      </View>

      {step < 4 ? (
        <Text
          style={{
            marginTop: 22,
            textAlign: 'center',
            fontFamily: font.ui,
            fontSize: 11.5,
            lineHeight: 19,
            color: colors.textLight,
          }}
        >
          {t('Protected by reCAPTCHA. Read our Privacy Policy and Terms of Service.')}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------
   Sign-up pieces
   --------------------------------------------------------- */

/** `.step-rail` — labels are hidden below 768px, so this is dots and lines. */
function StepRail({ step }) {
  const { colors, shadow } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 20,
      }}
    >
      {[1, 2, 3].map((n, i) => {
        const active = step === n;
        const done = step > n;
        return (
          <React.Fragment key={n}>
            <View
              style={[
                {
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done
                    ? colors.sage
                    : active
                      ? colors.primary
                      : colors.sunken,
                  borderWidth: done || active ? 0 : 1,
                  borderColor: colors.line,
                },
                active ? shadow.primary : null,
              ]}
            >
              {done ? (
                <Icon name="check" size={15} color="#FFFFFF" strokeWidth={3} />
              ) : (
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 12,
                    color: active ? '#FFFFFF' : colors.textLight,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {n}
                </Text>
              )}
            </View>

            {i < 2 ? (
              <View
                style={{
                  flex: 1,
                  minWidth: 12,
                  height: 2,
                  borderRadius: 2,
                  overflow: 'hidden',
                  backgroundColor: colors.line,
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: step > n ? '100%' : '0%',
                    borderRadius: 2,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function StepHead({ title, sub }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        style={{
          fontFamily: font.displayExtra,
          fontSize: 21,
          letterSpacing: -0.42,
          color: colors.text,
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: font.ui,
          fontSize: 14,
          lineHeight: 22,
          color: colors.textMuted,
        }}
      >
        {sub}
      </Text>
    </View>
  );
}

/**
 * `.role-card` — the fork in the flow: cook or eat.
 * Sunken, not surface-solid: in dark mode surface-solid is the same colour as
 * the card behind it, so the control disappeared into it.
 */
function RoleCard({ selected, onPress, icon, variant, title, desc, perks }) {
  const { colors, shadow } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        {
          padding: 18,
          paddingHorizontal: 16,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: selected ? colors.primary : colors.line,
          backgroundColor: selected ? colors.surfaceSolid : colors.sunken,
        },
        selected ? shadow.md : null,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: selected ? 'transparent' : colors.line,
          backgroundColor: selected ? colors.primary : 'transparent',
        }}
      >
        {selected ? (
          <Icon name="check" size={13} color="#FFFFFF" strokeWidth={3} />
        ) : null}
      </View>

      <IconTile
        name={icon}
        variant={variant}
        style={{ width: 48, height: 48, borderRadius: 15, marginBottom: 12 }}
      />

      <Text
        style={{
          fontFamily: font.displayExtra,
          fontSize: 18,
          lineHeight: 22,
          letterSpacing: -0.27,
          color: colors.text,
          marginBottom: 5,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: font.ui,
          fontSize: 13,
          lineHeight: 20,
          color: colors.textMuted,
        }}
      >
        {desc}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 14,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: colors.line2,
        }}
      >
        {perks.map((p) => (
          <View
            key={p}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 9,
              borderRadius: radius.pill,
              backgroundColor: colors.sunken,
            }}
          >
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: 11,
                color: colors.textMuted,
              }}
            >
              {p}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** `.pw-strength` — four ticks filling left to right. */
function PasswordStrength({ level }) {
  const { colors } = useTheme();

  const tone = [
    colors.line,
    colors.primary,
    colors.saffron,
    colors.saffron,
    colors.sage,
  ][level];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: -6,
        marginBottom: 18,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 4, flex: 1 }}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= level ? tone : colors.line,
            }}
          />
        ))}
      </View>
      <Text
        style={{
          minWidth: 58,
          textAlign: 'right',
          fontFamily: font.uiSemi,
          fontSize: 11.5,
          color: level ? tone : colors.textLight,
        }}
      >
        {PW_WORDS[level]}
      </Text>
    </View>
  );
}

/**
 * A select is never empty, so the float label would sit on top of the value;
 * the CSS pins it up permanently. Same here: the label always rides high.
 */
function SpecialtyPicker({ value, onChange }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ marginBottom: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('What you cook best, currently')} ${value ? t(value) : '—'}`}
        onPress={() => setOpen((v) => !v)}
        style={{
          borderWidth: 1,
          borderColor: open ? colors.primary : colors.line,
          borderRadius: radius.sm,
          backgroundColor: open ? colors.raised : colors.sunken,
          paddingTop: 24,
          paddingBottom: 9,
          paddingLeft: 14,
          paddingRight: 40,
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            position: 'absolute',
            left: 14,
            top: 9,
            fontFamily: font.uiSemi,
            fontSize: 10.5,
            letterSpacing: 10.5 * tracking.label,
            textTransform: 'uppercase',
            color: open ? colors.primary : colors.textMuted,
          }}
        >
          {t('What you cook best')}
        </Text>
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: 16,
            color: value ? colors.text : colors.textLight,
          }}
        >
          {value ? t(value) : t('Choose a specialty')}
        </Text>
        <Icon
          name="chevronDown"
          size={16}
          color={colors.textLight}
          style={{ position: 'absolute', right: 14, top: 22 }}
        />
      </Pressable>

      {open ? (
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
          {SPECIALTIES.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              onPress={() => {
                onChange(s);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderRadius: radius.xs,
                backgroundColor:
                  pressed || value === s ? colors.primary50 : 'transparent',
              })}
            >
              <Text
                style={{
                  fontFamily: value === s ? font.uiSemi : font.ui,
                  fontSize: 15,
                  color: value === s ? colors.primary : colors.text,
                }}
              >
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** `.range` — delivery radius, cooks only. A tap-anywhere track, no gesture lib. */
function RadiusSlider({ value, onChange }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const [width, setWidth] = useState(0);

  const MIN = 1;
  const MAX = 12;
  const pct = (value - MIN) / (MAX - MIN);

  const setFromX = (x) => {
    if (!width) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    // step: 0.5
    onChange(Math.round((MIN + ratio * (MAX - MIN)) * 2) / 2);
  };

  return (
    <View style={{ marginBottom: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: type.micro,
            letterSpacing: type.micro * tracking.label,
            textTransform: 'uppercase',
            color: colors.textMuted,
          }}
        >
          {t('Delivery radius')}
        </Text>
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: 15,
            color: colors.primary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {n(value.toFixed(1))} km
        </Text>
      </View>

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setFromX(e.nativeEvent.locationX)}
        onResponderMove={(e) => setFromX(e.nativeEvent.locationX)}
        style={{ paddingVertical: 12 }}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: MIN, max: MAX, now: value }}
      >
        <View
          style={{
            height: 6,
            borderRadius: 999,
            backgroundColor: colors.line,
          }}
        >
          <View
            style={{
              height: 6,
              width: `${pct * 100}%`,
              borderRadius: 999,
              backgroundColor: colors.primary,
            }}
          />
        </View>

        <View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 4,
              left: Math.max(0, pct * width - 11),
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: colors.primary,
              borderWidth: 3,
              borderColor: colors.raised,
            },
            shadow.primary,
          ]}
        />
      </View>

      <FieldHint
        icon="route"
        text="Only customers inside this circle will see your kitchen. Start small — you can widen it any time."
      />
    </View>
  );
}

function DoneState({ role, name, place, addressLabel, radiusKm, onDone }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  const rows = [
    [t('Account'), role === 'cook' ? t('Home cook') : t('Customer')],
    [t('Full name'), name || '—'],
    [t('Default address'), place?.address || '—'],
    role === 'cook'
      ? [t('Delivery radius'), `${n(radiusKm.toFixed(1))} km`]
      : [t('Saved as'), t(addressLabel)],
  ];

  return (
    <Animated.View
      entering={FadeInDown.duration(400)}
      style={{ alignItems: 'center', paddingVertical: 14 }}
    >
      <LinearGradient
        colors={[colors.sage, '#33441f']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{
          width: 66,
          height: 66,
          borderRadius: 33,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        <Icon name="check" size={30} color="#FFFFFF" strokeWidth={2.4} />
      </LinearGradient>

      <Text
        style={{
          fontFamily: font.displayExtra,
          fontSize: 23,
          letterSpacing: -0.46,
          color: colors.text,
          marginBottom: 10,
        }}
      >
        {t('You’re in.')}
      </Text>
      <Text
        style={{
          textAlign: 'center',
          fontFamily: font.ui,
          fontSize: 14,
          lineHeight: 23,
          color: colors.textMuted,
          marginBottom: 26,
        }}
      >
        {t('Your account is ready and your pin is on the map.')}
      </Text>

      <View
        style={{
          width: '100%',
          paddingHorizontal: 14,
          marginBottom: 26,
          borderRadius: radius.md,
          backgroundColor: colors.sunken,
          borderWidth: 1,
          borderColor: colors.line2,
        }}
      >
        {rows.map(([label, value], i) => (
          <View
            key={label}
            style={{
              gap: 3,
              paddingVertical: 11,
              borderBottomWidth: i === rows.length - 1 ? 0 : 1,
              borderBottomColor: colors.line2,
            }}
          >
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 13.5,
                color: colors.textMuted,
              }}
            >
              {label}
            </Text>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: font.uiSemi,
                fontSize: 13.5,
                color: colors.text,
              }}
            >
              {value}
            </Text>
          </View>
        ))}
      </View>

      <Button
        label={role === 'cook' ? t('Go to my kitchen') : t('Start exploring')}
        icon="arrowRight"
        block
        onPress={onDone}
      />
    </Animated.View>
  );
}

/* ---------------------------------------------------------
   Small shared bits
   --------------------------------------------------------- */
const cardStyle = (colors) => ({
  padding: 20,
  paddingHorizontal: 16,
  borderRadius: radius.md,
  backgroundColor: colors.surfaceSolid,
  borderWidth: 1,
  borderColor: colors.line,
});

/** `.auth-actions` — stacked and full-width on a phone, primary on top. */
function Actions({ next, backLabel, onBack }) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <View
      style={{
        gap: 14,
        marginTop: 28,
        paddingTop: 22,
        borderTopWidth: 1,
        borderTopColor: colors.line2,
      }}
    >
      <Button label={next.label} icon="arrowRight" block onPress={next.onPress} />
      <Pressable
        accessibilityRole="button"
        onPress={
          onBack ??
          (() => (router.canGoBack() ? router.back() : router.replace('/')))
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 18,
          borderRadius: radius.pill,
        }}
      >
        {onBack ? (
          <Icon name="arrowLeft" size={16} color={colors.textMuted} />
        ) : null}
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: 13,
            letterSpacing: 0.52,
            textTransform: 'uppercase',
            color: colors.textMuted,
          }}
        >
          {backLabel}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * `.auth-check` — one flex item for the sentence, so it wraps as prose.
 * Left bare, each text run and each link becomes its own flex item and wraps
 * on its own: "I agree to the / Terms / and the / Privacy Policy".
 */
function Checkbox({ checked, onToggle, label, linkWords = [] }) {
  const { colors } = useTheme();

  const parts = useMemo(() => {
    if (!linkWords.length) return [{ text: label, link: false }];
    const pattern = new RegExp(
      `(${linkWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    );
    return label
      .split(pattern)
      .filter(Boolean)
      .map((chunk) => ({ text: chunk, link: linkWords.includes(chunk) }));
  }, [label, linkWords]);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          marginTop: 1,
          borderRadius: 7,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: checked ? 'transparent' : colors.line,
          backgroundColor: checked ? colors.primary : colors.sunken,
        }}
      >
        {checked ? (
          <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3.2} />
        ) : null}
      </View>

      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: 13.5,
          lineHeight: 20,
          color: colors.textMuted,
        }}
      >
        {parts.map((p, i) => (
          <Text
            key={i}
            style={
              p.link
                ? {
                    fontFamily: font.uiSemi,
                    color: colors.primary,
                    textDecorationLine: 'underline',
                  }
                : undefined
            }
          >
            {p.text}
          </Text>
        ))}
      </Text>
    </Pressable>
  );
}

function FieldHint({ icon, text }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 7,
        marginTop: -6,
        marginBottom: 16,
      }}
    >
      <Icon name={icon} size={14} color={colors.sage} style={{ marginTop: 3 }} />
      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: 12.5,
          lineHeight: 19,
          color: colors.textLight,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/** `.auth-divider` — a centred label with a rule running out of both sides. */
function Divider({ label }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginVertical: 20,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: 11,
          letterSpacing: 11 * tracking.label,
          textTransform: 'uppercase',
          color: colors.textLight,
        }}
      >
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}

function SocialButton({ provider, label }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${label}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: pressed ? colors.primary200 : colors.line,
        backgroundColor: pressed ? colors.surfaceSolid : colors.sunken,
      })}
    >
      {provider === 'google' ? (
        <GoogleMark />
      ) : (
        <Icon name="phone" size={18} color={colors.text} />
      )}
      <Text
        style={{ fontFamily: font.uiSemi, fontSize: 14, color: colors.text }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Google's four-colour G, copied from the inline SVG in auth.html. */
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.5 12.27c0-.86-.08-1.5-.24-2.16H12v3.92h6.6c-.13 1.08-.85 2.72-2.45 3.82l-.02.15 3.56 2.76.25.02c2.26-2.09 3.56-5.17 3.56-8.51Z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.79-2.93c-1 .7-2.36 1.19-4.15 1.19a7.2 7.2 0 0 1-6.81-4.97l-.14.01-3.7 2.86-.05.13A11.99 11.99 0 0 0 12 24Z"
      />
      <Path
        fill="#FBBC05"
        d="M5.19 14.39a7.4 7.4 0 0 1-.4-2.39c0-.83.15-1.64.39-2.39l-.01-.16-3.75-2.9-.12.06A11.99 11.99 0 0 0 0 12c0 1.94.47 3.77 1.3 5.39l3.89-3Z"
      />
      <Path
        fill="#EB4335"
        d="M12 4.64c2.27 0 3.8.98 4.67 1.8l3.41-3.33C18 1.17 15.24 0 12 0 7.31 0 3.26 2.69 1.3 6.61l3.88 3.01A7.23 7.23 0 0 1 12 4.64Z"
      />
    </Svg>
  );
}
