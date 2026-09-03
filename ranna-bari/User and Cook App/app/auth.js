import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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
import { useLang } from '../src/i18n/LanguageContext';
import { normaliseArea } from '../src/lib/areas';
import { useKitchen, useSpecialties } from '../src/store/KitchenContext';

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

/* The list is the backend's now, and this screen reads it live. The second
   copy that used to live here is gone: two hardcoded lists is how they end
   up disagreeing. */

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
  const { requestCode, verifyCode, saveProfile, saveAddress } = useSession();
  const { ensureKitchen } = useKitchen();
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
  const [siPhone, setSiPhone] = useState('');
  const [siCode, setSiCode] = useState('');
  const [siStage, setSiStage] = useState('phone'); // 'phone' | 'code'
  const [siBusy, setSiBusy] = useState(false);

  /* ---- sign up ---- */
  // Arriving from the cook funnel means the role question is already answered.
  const [step, setStep] = useState(fromCookFunnel ? 2 : 1);
  const [role, setRole] = useState(fromCookFunnel ? 'cook' : 'user');
  const [roleNote, setRoleNote] = useState('');
  const [detailsNote, setDetailsNote] = useState('');
  const [locNote, setLocNote] = useState('');
  /* The last step of signing up is proving the number, same as signing in. */
  const [suStage, setSuStage] = useState('form'); // 'form' | 'code'
  const [suCode, setSuCode] = useState('');
  const [suBusy, setSuBusy] = useState(false);

  const [name, setName] = useState(param('name', ''));
  const [phone, setPhone] = useState(param('phone', ''));
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [kitchen, setKitchen] = useState('');
  /* Several, in the order chosen. The first is the primary — it is what the
     kitchen card shows and what Kitchen.specialty stores. */
  const [specialties, setSpecialties] = useState([]);
  const [nid, setNid] = useState(param('nid', ''));
  /* The room the food is cooked in — as many views of it as the cook wants.
     Optional here, and the one thing on this form an operator can actually
     look at when deciding. */
  const [kitchenPhotos, setKitchenPhotos] = useState([]);
  const [terms, setTerms] = useState(false);

  /*
   * No pin until somebody drops one.
   *
   * This used to open on a seeded flat in Dhanmondi so that "Create account"
   * was live immediately — which meant an account created without touching
   * the map was filed at an address its owner had never seen, and every
   * kitchen's distance was measured from it. `submit` already refuses a null
   * pin with "Drop your pin on the map so we know where to find you", so the
   * empty state was always the one the flow was written for.
   */
  const [place, setPlace] = useState(null);
  const [detail, setDetail] = useState('');
  const [addressLabel, setAddressLabel] = useState('Home');
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
              [specialties.join(''), 'specialty'],
              [nid, 'National ID'],
              /* A kitchen with no picture cannot be approved: it is the only
                 evidence on this form about where the food is cooked. Joined
                 so the empty list reads as a missing field to the check
                 below, which tests strings. */
              [kitchenPhotos.join(''), 'kitchen photo'],
            ]
          : []),
      ];

      if (required.some(([v]) => !String(v).trim())) {
        /* The photo is not a text input and nothing about it highlights, so
           "fill in the highlighted fields" would send a cook hunting through
           the form for a box that is already filled. */
        setDetailsNote(
          role === 'cook' && !kitchenPhotos.length
            ? t('Add at least one photo of your kitchen to continue.')
            : t('Fill in the highlighted fields to continue.'),
        );
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

      /* Everything the three steps collected, in one shape: it is what this
         device stores, what the server is told, and what a cook's kitchen is
         built from. */
      const profile = {
        role,
        name: name.trim(),
        phone: identity.phone ?? phone.trim(),
        email: email.trim(),
        kitchen: kitchen.trim(),
        /* The primary, for everything that reads a single specialty, and the
           whole set beside it. */
        specialty: specialties[0] ?? '',
        specialties,
        /* The first picture is the banner and the whole set is the gallery.
           Undefined rather than empty so registerKitchen falls back to what is
           stored instead of writing a blank over an existing picture. */
        coverImage: kitchenPhotos[0] || undefined,
        photos: kitchenPhotos.length ? kitchenPhotos : undefined,
        area: place.address,
        lat: place.lat,
        lng: place.lng,
        addressDetail: detail.trim(),
        addressLabel,
        deliveryRadiusKm: role === 'cook' ? radiusKm : null,
        accountId: identity.accountId,
        kitchenId: identity.kitchenId,
      };

      await signIn(profile);

      /*
       * And the same profile to the server.
       *
       * `signIn` above writes to this device only. That is why signup looked
       * fine on the phone that filled it in, and why a reinstall — or signing
       * in on a second one — came back to empty fields and asked for
       * everything again: the server held the phone number the code was sent
       * to and nothing else. Name, email, area, pin and door number were all
       * empty strings on the account row.
       *
       * The address goes through `/account/addresses` rather than the
       * profile endpoint because that is the one that mirrors the pin into
       * the flat `area`/`lat`/`lng` fields the meals board, the shop
       * directory and every distance on the app are measured from. Without
       * it a new customer is nowhere, and nothing is near them.
       */
      /*
       * One retry, and only for the one failure that is transient.
       *
       * These run moments after the token is minted. Anything that reads it a
       * render too early answers `unauthenticated` — not because the caller
       * is unauthorised, but because the value has not arrived yet — and the
       * profile would then be saved on the device and nowhere else, which is
       * exactly the bug this replaced. Every other refusal is real, and is
       * reported rather than repeated.
       */
      const persist = async (send) => {
        const first = await send();
        if (first.ok || first.error !== 'unauthenticated') return first;
        await new Promise((resolve) => setTimeout(resolve, 400));
        return send();
      };

      const written = await Promise.all([
        persist(() => saveProfile({ name: name.trim(), email: email.trim() })),
        place
          ? persist(() =>
              saveAddress({
                label: addressLabel,
                /* The picker hands back a full postal address — 'Lane 11
                   East, 1212 Dhaka'. An area is a neighbourhood, and that is
                   what the filters, the cards and the shop directory match
                   on. */
                area: normaliseArea(place.address),
                detail: detail.trim(),
                lat: place.lat,
                lng: place.lng,
                select: true,
              }),
            )
          : { ok: true },
      ]);

      /* The account exists either way, so this does not block the last step —
         but it is said out loud rather than swallowed, because a profile that
         lives only on one phone is the bug this replaced. */
      if (written.some((r) => !r.ok)) {
        alert.error(
          t('Your account is ready, but we could not save your details. Open Profile to add them.'),
        );
      }

      /*
       * A cook's kitchen, created here rather than by a later effect.
       *
       * `KitchenSync` in the root layout does this too, but only while the
       * *local* account says `role: 'cook'` — a flag that lives on the phone.
       * Close the app before that effect runs and the kitchen is never made;
       * the server then reports the account as a customer, and on the next
       * install the local flag is restored from the server as `user`, so the
       * effect never fires again and the kitchen is lost for good. Measured
       * on a real signup: `role: "user"`, `kitchen: null`.
       *
       * `ensureKitchen` asks the server before it writes, so running here as
       * well as there is safe — the second caller finds the kitchen and stops.
       */
      if (role === 'cook') {
        await ensureKitchen(profile).catch(() => {});
      }

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
                  specialties,
                  setSpecialties,
                  nid,
                  setNid,
                  kitchenPhotos,
                  setKitchenPhotos,
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
  /* Caps in Latin; in Bengali the same call is identity, which is the whole
     reason there is no second uppercase entry to keep in step. */
  const { brand } = useLang();
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
        <Text style={wordStyle}>{brand.first.toUpperCase()}</Text>
        <Text style={[wordStyle, { color: '#F0A88F' }]}>{brand.second.toUpperCase()}</Text>
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
                  value={fields.specialties}
                  onChange={fields.setSpecialties}
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

                <KitchenPhotoField
                  value={fields.kitchenPhotos}
                  onChange={fields.setKitchenPhotos}
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
/**
 * One photograph of the kitchen.
 *
 * Shown as the wide banner it will become on the kitchen's card, and cropped
 * to that shape at pick time rather than letting the card do it later — a cook
 * choosing the picture should see what customers will see.
 *
 * At least one is required — it is the only evidence on this form about where
 * the food is actually cooked, and an operator cannot approve a kitchen
 * without seeing it.
 *
 * Refusing photo access still is not an error state: the field says what it
 * needs and the cook can grant access and come back. A permission dialog is
 * not a reason to throw away everything else they typed.
 */
function KitchenPhotoField({ value, onChange }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const [note, setNote] = useState('');

  const photos = Array.isArray(value) ? value : [];

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote(t('RannaBari needs photo access to add a kitchen picture.'));
      return;
    }
    /* Multiple in one go, and no cropping: a gallery is a set of views of a
       room, and forcing each through a 3:1 crop would make every one of them
       a banner. The first is used as the banner and the card crops it there,
       where the shape is actually needed. */
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (res.canceled) return;

    const picked = (res.assets ?? []).map((a) => a.uri).filter(Boolean);
    if (!picked.length) return;

    setNote('');
    /* Appended, and de-duplicated: opening the picker twice and tapping the
       same photograph should not put it in the list twice. */
    onChange([...photos, ...picked.filter((uri) => !photos.includes(uri))]);
  };

  const removeAt = (index) => onChange(photos.filter((_, i) => i !== index));

  return (
    <View style={{ marginTop: 14 }}>
      {photos.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Add photos of your kitchen')}
          onPress={pick}
          style={({ pressed }) => ({
            height: 104,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.primary200,
            backgroundColor: colors.sunken,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="chefHat" size={22} color={colors.primary} />
          <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.textMuted }}>
            {t('Add photos of your kitchen')}
          </Text>
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((uri, i) => (
            <View key={uri} style={{ width: 92, height: 92 }}>
              <Image
                source={{ uri }}
                contentFit="cover"
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: radius.xs,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              />
              {/* The first is the banner, and saying so is the difference
                  between an ordered list and an arbitrary one. */}
              {i === 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 4,
                    bottom: 4,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: radius.pill,
                    backgroundColor: colors.primary,
                  }}
                >
                  <Text
                    style={{ fontFamily: font.uiBold, fontSize: 9, color: colors.onPrimary }}
                  >
                    {t('COVER')}
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Remove this photo')}
                onPress={() => removeAt(i)}
                hitSlop={8}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Icon name="x" size={12} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}

          {/* No ceiling on purpose — a cook with twelve views of their kitchen
              should be able to show twelve. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Add more photos')}
            onPress={pick}
            style={({ pressed }) => ({
              width: 92,
              height: 92,
              borderRadius: radius.xs,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.primary200,
              backgroundColor: colors.sunken,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Icon name="plus" size={20} color={colors.primary} />
          </Pressable>
        </View>
      )}

      {photos.length ? (
        <Text
          style={{
            marginTop: 8,
            fontFamily: font.ui,
            fontSize: type.xs,
            color: colors.textLight,
          }}
        >
          {t('{n} added · the first one is your cover', { n: n(photos.length) })}
        </Text>
      ) : null}

      {note ? (
        <Text
          style={{
            marginTop: 8,
            fontFamily: font.ui,
            fontSize: type.xs,
            color: colors.textMuted,
          }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * What a kitchen cooks best — as many as apply.
 *
 * The first selected is the primary: the card shows one specialty and the
 * stored `specialty` field is one string, so something has to be first. It is
 * shown as MAIN and can be changed by tapping its chip, rather than being an
 * accident of tap order that could only be undone by starting over.
 *
 * The list comes from the backend, where an operator edits it. The constant in
 * KitchenContext is only what shows before the first response lands.
 */
function SpecialtyPicker({ value, onChange }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const options = useSpecialties();

  const chosen = Array.isArray(value) ? value : [];

  const toggle = (name) =>
    onChange(chosen.includes(name) ? chosen.filter((s) => s !== name) : [...chosen, name]);

  /* Promote to primary by moving it to the front — the order *is* the
     ranking, so there is no second field to keep in step. */
  const makeMain = (name) => onChange([name, ...chosen.filter((s) => s !== name)]);

  /* Matched on the translated label as well as the stored one, so searching
     in Bengali finds the row a Bengali reader is looking at. */
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? options.filter(
        (s) =>
          s.toLowerCase().includes(needle) || String(t(s)).toLowerCase().includes(needle),
      )
    : options;

  /* Two names fit across a phone; past that the count is more use than a
     truncated list of the first one and a half. */
  const summary = chosen.length
    ? chosen.length <= 2
      ? chosen.map((s) => t(s)).join(', ')
      : t('{first} and {n} more', { first: t(chosen[0]), n: chosen.length - 1 })
    : t('Choose what you cook best');

  return (
    <View style={{ marginBottom: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('What you cook best, currently')} ${
          chosen.length ? chosen.map((s) => t(s)).join(', ') : '—'
        }`}
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
          numberOfLines={1}
          style={{
            fontFamily: font.ui,
            fontSize: 16,
            color: chosen.length ? colors.text : colors.textLight,
          }}
        >
          {summary}
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
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
            overflow: 'hidden',
          }}
        >
          {/* What you have picked, all of it, without scrolling for it. */}
          {chosen.length ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                padding: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.line2,
              }}
            >
              {chosen.map((s, i) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityLabel={
                    i === 0
                      ? `${t(s)} — ${t('shown on your card')}`
                      : `${t('Make {name} your main specialty', { name: t(s) })}`
                  }
                  onPress={() => makeMain(s)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 5,
                    paddingLeft: 10,
                    paddingRight: 4,
                    borderRadius: radius.pill,
                    backgroundColor: i === 0 ? colors.primary : colors.primary50,
                    borderWidth: 1,
                    borderColor: i === 0 ? colors.primary : colors.primary100,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: 12.5,
                      color: i === 0 ? colors.onPrimary : colors.primary,
                    }}
                  >
                    {t(s)}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Remove {name}', { name: t(s) })}
                    onPress={() => toggle(s)}
                    hitSlop={8}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon
                      name="x"
                      size={11}
                      strokeWidth={2.5}
                      color={i === 0 ? colors.onPrimary : colors.primary}
                    />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Twenty-four rows is too many to scroll past on a phone. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.line2,
            }}
          >
            <Icon name="search" size={15} color={colors.textLight} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('Search specialties')}
              placeholderTextColor={colors.textLight}
              autoCorrect={false}
              style={{
                flex: 1,
                paddingVertical: 4,
                fontFamily: font.ui,
                fontSize: 14.5,
                color: colors.text,
              }}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Clear search')}
                onPress={() => setQuery('')}
                hitSlop={8}
              >
                <Icon name="x" size={14} color={colors.textLight} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            style={{ maxHeight: 260 }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {shown.length === 0 ? (
              <View style={{ padding: 18, alignItems: 'center', gap: 4 }}>
                <Text
                  style={{ fontFamily: font.uiSemi, fontSize: 14, color: colors.text }}
                >
                  {t('Nothing matches “{q}”', { q: query.trim() })}
                </Text>
                <Text
                  style={{ fontFamily: font.ui, fontSize: 12.5, color: colors.textMuted }}
                >
                  {t('Ask RannaBari to add it and it will appear here.')}
                </Text>
              </View>
            ) : (
              shown.map((s) => {
                const on = chosen.includes(s);
                /* The sheet stays open: picking several is the point, and
                   closing after each tap would make the second a second
                   journey. */
                return (
                  <Pressable
                    key={s}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(s)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 11,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      backgroundColor: pressed ? colors.primary50 : 'transparent',
                    })}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? colors.primary : 'transparent',
                        borderWidth: on ? 0 : 1.5,
                        borderColor: colors.line,
                      }}
                    >
                      {on ? (
                        <Icon name="check" size={13} color={colors.onPrimary} strokeWidth={3} />
                      ) : null}
                    </View>

                    <Text
                      style={{
                        flex: 1,
                        fontFamily: on ? font.uiSemi : font.ui,
                        fontSize: 15,
                        color: on ? colors.primary : colors.text,
                      }}
                    >
                      {t(s)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {/* Says what the chips above mean, once there is more than one and
              the ranking starts to matter. */}
          {chosen.length > 1 ? (
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderTopWidth: 1,
                borderTopColor: colors.line2,
                backgroundColor: colors.sunken,
              }}
            >
              <Text
                style={{ fontFamily: font.ui, fontSize: 11.5, color: colors.textMuted }}
              >
                {t('Tap a chip to make it the one shown on your kitchen card.')}
              </Text>
            </View>
          ) : null}
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
