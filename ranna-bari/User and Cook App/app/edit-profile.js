import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Reveal from '../src/components/Reveal';
import Button from '../src/components/Button';
import FloatLabelInput, { FormNote } from '../src/components/FloatLabelInput';
import LocationPicker from '../src/components/LocationPicker';
import SectionHeader from '../src/components/SectionHeader';
import { IconTile } from '../src/components/Surfaces';
import { Body, Heading } from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useSession } from '../src/store/SessionContext';
import { useLang } from '../src/i18n/LanguageContext';

const SPECIALTIES = [
  'Traditional Heritage',
  'Coastal Seafood',
  'Street & Snacks',
  'Biryani & Rice',
  'Vegetarian & Bhorta',
  'Desserts & Pitha',
];

const LABELS = [
  ['Home', 'home'],
  ['Work', 'box'],
  ['Other', 'pin'],
];

/**
 * AuthContext hydrates from AsyncStorage asynchronously, so `account` is null
 * for the first render or two. Initialising the form's state from it there
 * would capture those nulls for good and show a signed-in user a blank form
 * with the wrong role selected -- so the form stays unmounted until the real
 * account has arrived.
 */
export default function EditProfileScreen() {
  const { colors } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { account, isSignedIn, hydrated } = useAuth();

  if (!hydrated) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', paddingTop: 60 }}>
          <ActivityIndicator color={colors.primary} />
        </Container>
      </Screen>
    );
  }

  if (!isSignedIn) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', gap: 18, paddingTop: 40 }}>
          <IconTile name="user" large />
          <Heading size={20}>{t('Sign in first')}</Heading>
          <Body muted size={15} style={{ textAlign: 'center' }}>
            {t('Your profile details live with your account.')}
          </Body>
          <Button
            label={t('Sign in or join')}
            icon="arrowRight"
            onPress={() => router.replace('/auth')}
          />
        </Container>
      </Screen>
    );
  }

  return <EditProfileForm account={account} />;
}

function EditProfileForm({ account }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { updateAccount } = useAuth();
  const { saveProfile } = useSession();

  /* Every field here is one the sign-in or signup flow already collected, so
     the form opens on the stored values rather than on blanks. */
  const [avatar, setAvatar] = useState(account?.avatar ?? null);
  const [name, setName] = useState(account?.name ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [role, setRole] = useState(account?.role ?? 'user');
  const [kitchen, setKitchen] = useState(account?.kitchen ?? '');
  const [specialty, setSpecialty] = useState(account?.specialty ?? '');
  const [specialtyOpen, setSpecialtyOpen] = useState(false);
  const [line, setLine] = useState(account?.addressDetail ?? '');
  const [area, setArea] = useState(account?.area ?? '');
  const [label, setLabel] = useState(account?.addressLabel ?? 'Home');
  const [bio, setBio] = useState(account?.bio ?? '');
  const [coords, setCoords] = useState(
    typeof account?.lat === 'number'
      ? { lat: account.lat, lng: account.lng }
      : null,
  );

  /* The picker reports its centre once on load, before anyone has touched
     it. Acting on that first emission would overwrite a saved area with
     whatever the map happened to open on, so it is skipped. */
  const settled = useRef(false);
  const onPinMoved = useCallback(({ lat, lng, address }) => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    setCoords({ lat, lng });
    if (address) setArea(address);
  }, []);

  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState(false);

  /**
   * The picker hands back a local `file://` uri on native but a `blob:` url on
   * web, and a blob url dies on the next reload. Storing the base64 payload
   * instead keeps the picture across restarts on every platform -- which is
   * why the crop is square and the quality deliberately low.
   */
  const pickImage = async (fromCamera) => {
    setNote('');
    setPicking(true);
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!perm.granted) {
        setNote(
          fromCamera
            ? t('Camera permission was blocked. Allow it in your device settings.')
            : t('Photo permission was blocked. Allow it in your device settings.'),
        );
        return;
      }

      const options = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset) return;

      setAvatar(
        asset.base64
          ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
          : asset.uri,
      );
    } catch (e) {
      setNote('That image could not be loaded. Try another one.');
    } finally {
      setPicking(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setNote('A name is the one thing a rider needs to ask for.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setNote('That email address does not look right.');
      return;
    }
    if (phone.trim() && phone.replace(/\D/g, '').length < 10) {
      setNote('That phone number looks too short to call.');
      return;
    }
    if (role === 'cook' && !kitchen.trim()) {
      setNote(t('Your kitchen needs a name for customers to find it.'));
      return;
    }

    setNote('');
    /* To the server first, then the device. The profile used to stop at
       AsyncStorage, which is why an address never survived a reinstall and
       why the server — the thing that decides which kitchens reach you —
       had never heard of one. */
    await saveProfile({ name: name.trim(), email: email.trim(), avatar, bio: bio.trim() });

    await updateAccount({
      avatar,
      lat: coords?.lat ?? account?.lat ?? null,
      lng: coords?.lng ?? account?.lng ?? null,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      role,
      kitchen: kitchen.trim(),
      specialty,
      addressDetail: line.trim(),
      area: area.trim(),
      addressLabel: label,
      bio: bio.trim(),
    });

    setSaved(true);
    setTimeout(() => router.back(), 650);
  };

  const initials = (name || 'R')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <Screen glow="both">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Container>
          <SectionHeader
            lead={t('EDIT')}
            accent={t('PROFILE')}
            subtitle={t('Everything you gave us when you joined, yours to change.')}
            style={{ marginBottom: 24 }}
          />

          <FormNote text={note} />
          {saved ? <FormNote text={t('Saved.')} tone="info" /> : null}

          {/* ---- Photo ---- */}
          <Reveal delay={1}>
            <View style={[card(colors), shadow.sm, { alignItems: 'center' }]}>
              <View style={{ marginBottom: 18 }}>
                {avatar ? (
                  <Image
                    source={{ uri: avatar }}
                    contentFit="cover"
                    transition={200}
                    style={{
                      width: 104,
                      height: 104,
                      borderRadius: 34,
                      borderWidth: 3,
                      borderColor: colors.raised,
                      backgroundColor: colors.sunken,
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 104,
                      height: 104,
                      borderRadius: 34,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.primary50,
                      borderWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: font.displayExtra,
                        fontSize: 34,
                        letterSpacing: -1,
                        color: colors.primary,
                      }}
                    >
                      {initials}
                    </Text>
                  </View>
                )}

                {picking ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: 34,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(20, 16, 14, 0.55)',
                    }}
                  >
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                <Button
                  variant="glass"
                  label={t('Choose photo')}
                  icon="box"
                  iconPosition="left"
                  small
                  disabled={picking}
                  onPress={() => pickImage(false)}
                />
                {/* The web file picker has no camera path worth offering. */}
                {Platform.OS !== 'web' ? (
                  <Button
                    variant="glass"
                    label={t('Camera')}
                    icon="locate"
                    iconPosition="left"
                    small
                    disabled={picking}
                    onPress={() => pickImage(true)}
                  />
                ) : null}
                {avatar ? (
                  <Button
                    variant="ghost"
                    label={t('Remove')}
                    small
                    disabled={picking}
                    onPress={() => setAvatar(null)}
                  />
                ) : null}
              </View>
            </View>
          </Reveal>

          {/* ---- Basics ---- */}
          <Reveal delay={2}>
            <View style={[card(colors), shadow.sm, { marginTop: 16 }]}>
              <CardHeading icon="user" title={t('About you')} />

              <FloatLabelInput
                label={t('Full name')}
                value={name}
                onChangeText={setName}
                placeholder={t('As you want cooks to see it')}
                autoComplete="name"
              />
              <FloatLabelInput
                label={t('Phone')}
                value={phone}
                onChangeText={setPhone}
                placeholder="+880 1XXXXXXXXX"
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <FloatLabelInput
                label={t('Email')}
                value={email}
                onChangeText={setEmail}
                placeholder={t('you@example.com')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              <FloatLabelInput
                label={t('About')}
                value={bio}
                onChangeText={setBio}
                placeholder={t('Allergies, favourite spice level, anything a cook should know')}
                multiline
                style={{ marginBottom: 0 }}
              />
            </View>
          </Reveal>

          {/* ---- Role ----
                  Signup promises "you can always add the other side later
                  from your profile", so this is where that happens. */}
          <Reveal delay={3}>
            <View style={[card(colors), shadow.sm, { marginTop: 16 }]}>
              <CardHeading icon="chefHat" title={t('How you use RannaBari')} />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[
                  ['user', 'utensils', 'I eat'],
                  ['cook', 'chefHat', 'I cook'],
                ].map(([key, icon, title]) => {
                  const on = role === key;
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setRole(key)}
                      style={[
                        {
                          flex: 1,
                          alignItems: 'center',
                          gap: 10,
                          paddingVertical: 18,
                          borderRadius: radius.md,
                          borderWidth: 1.5,
                          borderColor: on ? colors.primary : colors.line,
                          backgroundColor: on ? colors.surfaceSolid : colors.sunken,
                        },
                        on ? shadow.md : null,
                      ]}
                    >
                      <IconTile
                        name={icon}
                        variant={key === 'cook' ? 'sage' : 'primary'}
                        style={{ width: 44, height: 44, borderRadius: 14 }}
                      />
                      <Text
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: type.sm + 1,
                          color: on ? colors.text : colors.textMuted,
                        }}
                      >
                        {t(title)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {role === 'cook' ? (
                <View style={{ marginTop: 20 }}>
                  <FloatLabelInput
                    label={t('Kitchen name')}
                    value={kitchen}
                    onChangeText={setKitchen}
                    placeholder="e.g. Fatema's Heritage Kitchen"
                  />

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('What you cook best, currently')} ${specialty ? t(specialty) : '—'}`}
                    onPress={() => setSpecialtyOpen((v) => !v)}
                    style={{
                      borderWidth: 1,
                      borderColor: specialtyOpen ? colors.primary : colors.line,
                      borderRadius: radius.sm,
                      backgroundColor: specialtyOpen ? colors.raised : colors.sunken,
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
                        color: specialtyOpen ? colors.primary : colors.textMuted,
                      }}
                    >
                      {t('What you cook best')}
                    </Text>
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: 16,
                        color: specialty ? colors.text : colors.textLight,
                      }}
                    >
                      {specialty ? t(specialty) : t('Choose a specialty')}
                    </Text>
                    <Icon
                      name="chevronDown"
                      size={16}
                      color={colors.textLight}
                      style={{ position: 'absolute', right: 14, top: 22 }}
                    />
                  </Pressable>

                  {specialtyOpen ? (
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
                            setSpecialty(s);
                            setSpecialtyOpen(false);
                          }}
                          style={({ pressed }) => ({
                            paddingVertical: 12,
                            paddingHorizontal: 10,
                            borderRadius: radius.xs,
                            backgroundColor:
                              pressed || specialty === s
                                ? colors.primary50
                                : 'transparent',
                          })}
                        >
                          <Text
                            style={{
                              fontFamily: specialty === s ? font.uiSemi : font.ui,
                              fontSize: 15,
                              color: specialty === s ? colors.primary : colors.text,
                            }}
                          >
                            {t(s)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Reveal>

          {/* ---- Address ---- */}
          <Reveal delay={4}>
            <View style={[card(colors), shadow.sm, { marginTop: 16 }]}>
              <CardHeading icon="pin" title={t('Default address')} />

              {/* The same picker signup step 3 uses, opened on the pin the
                  account already has rather than on the Dhaka default. */}
              <View style={{ marginBottom: 18 }}>
                <LocationPicker
                  height={220}
                  center={
                    typeof account?.lat === 'number'
                      ? { lat: account.lat, lng: account.lng, zoom: 16 }
                      : undefined
                  }
                  onChange={onPinMoved}
                />
              </View>

              <FloatLabelInput
                label={t('House / road / flat')}
                value={line}
                onChangeText={setLine}
                placeholder={t('House 12, Road 7, Flat 4B')}
              />
              <FloatLabelInput
                label={t('Area')}
                value={area}
                onChangeText={setArea}
                placeholder={t('Dhanmondi, Dhaka')}
              />

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
                {t('Save this address as')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {LABELS.map(([l, icon]) => {
                  const on = label === l;
                  return (
                    <Pressable
                      key={l}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setLabel(l)}
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
                        {t(l)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 9,
                  marginTop: 16,
                }}
              >
                <Icon name="navigation" size={14} color={colors.sage} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: font.ui,
                    fontSize: 12.5,
                    lineHeight: 19,
                    color: colors.textLight,
                  }}
                >
                  {t('Checkout starts from this address. Drag the map to move your pin — the area fills itself in.')}
                </Text>
              </View>
            </View>
          </Reveal>

          <View style={{ marginTop: 24, gap: 12 }}>
            <Button label={t('Save changes')} icon="check" block onPress={save} />
            <Pressable
              accessibilityRole="button"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: 13,
                  letterSpacing: 0.52,
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                }}
              >
                {t('Cancel')}
              </Text>
            </Pressable>
          </View>
        </Container>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const card = (colors) => ({
  paddingVertical: 24,
  paddingHorizontal: 20,
  borderRadius: radius.lg,
  backgroundColor: colors.surfaceSolid,
  borderWidth: 1,
  borderColor: colors.line,
});

function CardHeading({ icon, title }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
      }}
    >
      <Heading size={19} style={{ flex: 1 }}>
        {title}
      </Heading>
      <Icon name={icon} size={19} color={colors.textLight} />
    </View>
  );
}
