/**
 * Kitchen details — the whole listing, in four steps.
 *
 * This was a flat form: name, specialty, description, radius, one save
 * button. Everything a customer sees about a kitchen except its menu lived
 * in those four fields, while the cover, the avatar and the registration
 * gallery sat on a different screen that could change two of them. A cook
 * who wanted to fix a bad photograph had to know which screen held it.
 *
 * The wizard puts the whole listing in one flow — basics, photographs,
 * delivery, publish — with the steps drawn at the top, so a cook always
 * knows how much is left. The draft is held in state and posted once, at
 * the end: one request, one answer, no half-saved listing between steps.
 *
 * The state still lives in `KitchenContext`, so the save is exactly the
 * patch the flat form made — nothing about what is stored has changed.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { toStorableImage, weighGallery, GALLERY_BUDGET_BYTES } from '../../src/lib/pickedImage';
import { KNOWN_AREAS, normaliseArea } from '../../src/lib/areas';

import CookScreen from '../../src/components/CookScreen';
import { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import FloatLabelInput from '../../src/components/FloatLabelInput';
import {
  ActionRow,
  FieldError,
  KycBanner,
  PublishSwitch,
  RadiusSlider,
  WizardSteps,
} from '../../src/components/CookBits';
import { Body, Heading } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { SPECIALTIES, useKitchen } from '../../src/store/KitchenContext';
import { useAlert } from '../../src/components/Alert';
import { useLang } from '../../src/i18n/LanguageContext';

export default function KitchenDetails() {
  const { colors } = useTheme();
  const { t } = useLang();
  const { kitchen, hydrated } = useKitchen();

  /* KitchenContext hydrates asynchronously, so `kitchen` is null for the
     first render or two. State initialised from it there would capture those
     nulls for good and leave a cook editing an empty form. */
  if (!hydrated || !kitchen) {
    return (
      <CookScreen>
        <Container style={{ alignItems: 'center', gap: 18, paddingTop: 60 }}>
          <ActivityIndicator color={colors.sage} />
          <Heading size={20}>{t('Loading your kitchen…')}</Heading>
        </Container>
      </CookScreen>
    );
  }

  return <Wizard kitchen={kitchen} />;
}

const STEPS = ['The basics', 'Photos', 'Delivery', 'Publish'];

function Wizard({ kitchen }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  /* Every write below reports what happened. */
  const alert = useAlert();
  const router = useRouter();
  const { updateKitchen } = useKitchen();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [photoNote, setPhotoNote] = useState('');

  /* ---- the draft ----
     Everything the four steps collect, held here and posted once. Nothing
     reaches the server until the last step says so — a half-finished wizard
     must never be a half-changed listing. */
  const [name, setName] = useState(kitchen.name ?? '');
  const [specialty, setSpecialty] = useState(kitchen.specialty ?? '');
  const [specialtyOpen, setSpecialtyOpen] = useState(false);
  const [description, setDescription] = useState(kitchen.description ?? '');
  const [cover, setCover] = useState(kitchen.coverImage ?? '');
  const [avatar, setAvatar] = useState(kitchen.avatar ?? '');
  const [photos, setPhotos] = useState(kitchen.photos ?? []);
  const [area, setArea] = useState(kitchen.area ?? '');
  const [radiusKm, setRadiusKm] = useState(kitchen.deliveryRadiusKm ?? 3);
  const [open, setOpen] = useState(!!kitchen.isOpen);

  const stepLabels = useMemo(() => STEPS.map((s) => t(s)), [t]);

  const back = () =>
    router.canGoBack() ? router.back() : router.replace('/cook/profile');

  /* ---- photograph picking ----
     A photograph is resized the moment it is chosen — the tile shows the
     stored data URI, which is exactly what will be posted, so the wizard
     never shows a preview the server cannot reproduce. */
  const pickPhoto = async (role) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhotoNote(t('RannaBari needs photo access to change your kitchen picture.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // A cover is a banner and an avatar is a square; cropping to the shape
      // it will be shown in beats letting the card do it later.
      aspect: role === 'cover' ? [3, 1] : [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setPhotoNote('');
    setErrors((e) => ({ ...e, photos: undefined }));
    const stored = await toStorableImage(res.assets[0], role);
    if (!stored) {
      setPhotoNote(t('That photo could not be read. Please try another.'));
      return;
    }

    if (role === 'cover') setCover(stored);
    else setAvatar(stored);
    Haptics.selectionAsync().catch(() => {});
  };

  const addGalleryPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhotoNote(t('RannaBari needs photo access to change your kitchen picture.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setPhotoNote('');
    const stored = await toStorableImage(res.assets[0], 'gallery');
    if (!stored) {
      setPhotoNote(t('That photo could not be read. Please try another.'));
      return;
    }

    /* The whole gallery travels in one request, so the budget is checked
       here — over it, the platform refuses the body whole, and the cook
       finds out by losing the lot. One rejected addition beats that. */
    if (weighGallery([...photos, stored]) > GALLERY_BUDGET_BYTES) {
      setPhotoNote(
        t('That photo would push the gallery over its size limit. Try a shorter one.'),
      );
      return;
    }

    setPhotos((prev) => [...prev, stored]);
    Haptics.selectionAsync().catch(() => {});
  };

  /* ---- step gates ---- */
  const validateStep = (index) => {
    const next = {};
    if (index === 0 && !name.trim()) next.name = t('Your kitchen needs a name for customers to find it.');
    if (index === 1 && !cover && !avatar) {
      next.photos = t('A kitchen without a single photo reads as empty. Add one.');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const nextStep = () => {
    if (!validateStep(step)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const save = async () => {
    for (let i = 0; i < STEPS.length - 1; i += 1) {
      if (!validateStep(i)) {
        setStep(i);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return;
      }
    }

    setSaving(true);
    const out = await updateKitchen({
      name: name.trim(),
      specialty,
      description: description.trim(),
      coverImage: cover,
      avatar,
      photos,
      area: area ? normaliseArea(area) : '',
      deliveryRadiusKm: radiusKm,
      isOpen: open,
    });
    setSaving(false);

    if (!out || out.ok === false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setErrors({ form: out?.message || t('That did not work') });
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    alert.success(t('Saved. Customers see your listing now.'));
    back();
  };

  return (
    <CookScreen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Container>
          <Pressable
            accessibilityRole="link"
            onPress={back}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 22,
            }}
          >
            <Icon name="arrowLeft" size={17} color={colors.textMuted} strokeWidth={2} />
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: type.micro,
                letterSpacing: type.micro * 0.09,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {t('Your kitchen')}
            </Text>
          </Pressable>

          <Reveal delay={1}>
            <Heading size={30} style={{ letterSpacing: -0.6 }}>
              {t('Kitchen details')}
            </Heading>
            <Body muted size={15} style={{ marginTop: 4, marginBottom: 22 }}>
              {t('Everything a customer sees. Saved in one go, at the end.')}
            </Body>
          </Reveal>

          <WizardSteps steps={stepLabels} current={step} />

          {/* ---- step 1 · the basics ---- */}
          {step === 0 ? (
            <Reveal delay={2}>
              <FloatLabelInput
                label={t('Kitchen name')}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setErrors((e) => ({ ...e, name: undefined }));
                }}
                placeholder={t('What customers see on the map')}
              />
              <FieldError text={errors.name} />

              {/* A select is never empty, so its label rides high permanently. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('What you cook best, currently')} ${specialty ? t(specialty) : '—'}`}
                onPress={() => setSpecialtyOpen((v) => !v)}
                style={{
                  borderWidth: 1,
                  borderColor: specialtyOpen ? colors.sage : colors.line,
                  borderRadius: radius.sm,
                  backgroundColor: specialtyOpen ? colors.raised : colors.sunken,
                  paddingTop: 24,
                  paddingBottom: 9,
                  paddingLeft: 14,
                  paddingRight: 40,
                  marginBottom: 20,
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
                    color: specialtyOpen ? colors.sage : colors.textMuted,
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
                    marginTop: -12,
                    marginBottom: 20,
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
                      onPress={() => {
                        setSpecialty(s);
                        setSpecialtyOpen(false);
                      }}
                      style={({ pressed }) => ({
                        paddingVertical: 12,
                        paddingHorizontal: 10,
                        borderRadius: radius.xs,
                        backgroundColor:
                          pressed || specialty === s ? colors.sage50 : 'transparent',
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: specialty === s ? font.uiSemi : font.ui,
                          fontSize: 15,
                          color: specialty === s ? colors.sage : colors.text,
                        }}
                      >
                        {t(s)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <FloatLabelInput
                label={t('About your cooking')}
                value={description}
                onChangeText={setDescription}
                placeholder={t('One or two lines customers read first')}
                multiline
                numberOfLines={3}
              />
            </Reveal>
          ) : null}

          {/* ---- step 2 · photographs ----
              The cover is the banner, the avatar is the circle, the gallery
              is what an operator reads while deciding. All three are here
              because they are one subject: what this kitchen looks like. */}
          {step === 1 ? (
            <Reveal delay={2}>
              {photoNote ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 14,
                    padding: 12,
                    borderRadius: radius.sm,
                    backgroundColor: colors.primary50,
                    borderWidth: 1,
                    borderColor: colors.primary100,
                  }}
                >
                  <Icon name="alertCircle" size={15} color={colors.primary} />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      color: colors.text,
                    }}
                  >
                    {photoNote}
                  </Text>
                </View>
              ) : null}
              <FieldError text={errors.photos} />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Change cover')}
                onPress={() => pickPhoto('cover')}
                style={({ pressed }) => [
                  {
                    height: 130,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: colors.line,
                    opacity: pressed ? 0.94 : 1,
                  },
                  shadow.sm,
                ]}
              >
                <Image
                  source={cover ? { uri: cover } : null}
                  contentFit="cover"
                  transition={200}
                  style={{ width: '100%', height: '100%', backgroundColor: colors.sunken }}
                />
                <LinearGradient
                  colors={['transparent', `rgba(${colors.scrim}, 0.55)`]}
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}
                />
                <View
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    paddingVertical: 7,
                    paddingHorizontal: 12,
                    borderRadius: radius.pill,
                    backgroundColor: 'rgba(255, 255, 255, 0.22)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  }}
                >
                  <Icon name="gem" size={13} color={colors.onDark} />
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 9.5,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: colors.onDark,
                    }}
                  >
                    {cover ? t('Change cover') : t('Add a cover')}
                  </Text>
                </View>
              </Pressable>

              {/* The avatar, beside the note about what each picture is for —
                  two different shapes doing two different jobs. */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                  marginTop: 14,
                  marginBottom: 8,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Change photo')}
                  onPress={() => pickPhoto('avatar')}
                >
                  <Image
                    source={avatar ? { uri: avatar } : null}
                    contentFit="cover"
                    transition={200}
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 28,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.sunken,
                    }}
                  />
                  <View
                    style={{
                      position: 'absolute',
                      right: -2,
                      bottom: -2,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.sage,
                      borderWidth: 2,
                      borderColor: colors.surfaceSolid,
                    }}
                  >
                    <Icon name="plus" size={13} color="#FFFFFF" strokeWidth={2.4} />
                  </View>
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.sm,
                      color: colors.text,
                    }}
                  >
                    {t('Your round picture')}
                  </Text>
                  <Text
                    style={{
                      marginTop: 2,
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      lineHeight: 17,
                      color: colors.textMuted,
                    }}
                  >
                    {t('Rides with your name on cards, chat and reviews.')}
                  </Text>
                </View>
              </View>

              {/* The gallery a customer scrolls, and the one an operator
                  approves the kitchen on. Registration collected these; this
                  is the first place they could be changed since. */}
              <View style={{ marginTop: 18 }}>
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: type.sm,
                    color: colors.text,
                    marginBottom: 4,
                  }}
                >
                  {t('Kitchen photos')}
                </Text>
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    lineHeight: 17,
                    color: colors.textMuted,
                    marginBottom: 12,
                  }}
                >
                  {t('The gallery customers scroll — and the one your verification is read from.')}
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {photos.map((uri, i) => (
                    <View key={`${String(uri).slice(-24)}-${i}`}>
                      <Image
                        source={{ uri }}
                        contentFit="cover"
                        transition={150}
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: radius.lg,
                          backgroundColor: colors.sunken,
                          borderWidth: 1,
                          borderColor: colors.line,
                        }}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('Remove photo')}
                        onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          width: 24,
                          height: 24,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 12,
                          backgroundColor: colors.surfaceSolid,
                          borderWidth: 1,
                          borderColor: colors.line,
                        }}
                      >
                        <Icon name="x" size={12} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ))}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Add a photo')}
                    onPress={addGalleryPhoto}
                    style={({ pressed }) => ({
                      width: 96,
                      height: 96,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      borderRadius: radius.lg,
                      backgroundColor: pressed ? colors.sage50 : colors.sunken,
                      borderWidth: 1,
                      borderColor: colors.line,
                    })}
                  >
                    <Icon name="plus" size={18} color={colors.sage} strokeWidth={2.2} />
                  </Pressable>
                </View>
              </View>
            </Reveal>
          ) : null}

          {/* ---- step 3 · delivery ----
              Where this kitchen travels. The area puts it in the filters;
              the radius decides whose door it will reach. */}
          {step === 2 ? (
            <Reveal delay={2}>
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: type.micro,
                  letterSpacing: type.micro * 0.09,
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                  marginBottom: 12,
                }}
              >
                {t('Your area')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {Array.from(new Set([area, ...KNOWN_AREAS].filter(Boolean))).map((a) => {
                  const on = area === a;
                  return (
                    <Pressable
                      key={a}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setArea(a)}
                      style={({ pressed }) => ({
                        paddingVertical: 9,
                        paddingHorizontal: 14,
                        borderRadius: radius.pill,
                        backgroundColor: on ? colors.sage : colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: on ? colors.sage : colors.line,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: on ? font.uiBold : font.uiSemi,
                          fontSize: 13,
                          color: on ? '#FFFFFF' : colors.textMuted,
                        }}
                      >
                        {a}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <RadiusSlider value={radiusKm} onChange={setRadiusKm} />
              <Body muted size={13} style={{ marginTop: 4 }}>
                {t('How far you will carry food. Further means more customers — and colder food.')}
              </Body>
            </Reveal>
          ) : null}

          {/* ---- step 4 · publish ----
              The switch is the shutter. Below it, the verification state —
              because opening a pending kitchen is the first thing a new cook
              tries, and this is the place they discover the wait. */}
          {step === 3 ? (
            <Reveal delay={2}>
              <KycBanner
                status={kitchen.kycStatus}
                note={kitchen.kycNote}
                onContact={() => router.push('/chat')}
                style={{ marginBottom: 14 }}
              />

              {kitchen.kycStatus !== 'approved' ? (
                <ActionRow
                  icon="shieldCheck"
                  tone={kitchen.kycStatus === 'rejected' ? 'primary' : 'saffron'}
                  title={
                    kitchen.documentsSubmittedAt == null
                      ? t('Send your documents')
                      : t('Your documents')
                  }
                  sub={
                    kitchen.documentsSubmittedAt == null
                      ? t('NID and kitchen photos — the check starts with these')
                      : t('Submitted. Tap to review what we hold.')
                  }
                  onPress={() => router.push('/cook-documents')}
                  style={{ marginBottom: 14 }}
                />
              ) : null}

              <PublishSwitch
                value={open}
                onChange={setOpen}
                title={open ? t('Open for orders') : t('Closed')}
                sub={
                  open
                    ? t('On the map and taking orders the moment this is saved.')
                    : t('Listed, but nobody can order until you open.')
                }
              />
            </Reveal>
          ) : null}

          {/* ---- movement ---- */}
          {errors.form ? (
            <View style={{ marginTop: 18 }}>
              <FieldError text={errors.form} />
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 26 }}>
            {step > 0 ? (
              <Button
                variant="glass"
                label={t('Back')}
                icon="arrowLeft"
                iconPosition="left"
                style={{ flex: 1 }}
                onPress={() => setStep((s) => s - 1)}
              />
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {step < STEPS.length - 1 ? (
              <Button label={t('Continue')} icon="arrowRight" style={{ flex: 2 }} onPress={nextStep} />
            ) : (
              <Button
                label={saving ? t('Saving…') : t('Save changes')}
                icon={saving ? undefined : 'check'}
                style={{ flex: 2 }}
                disabled={saving}
                onPress={save}
              />
            )}
          </View>
        </Container>
      </KeyboardAvoidingView>
    </CookScreen>
  );
}
