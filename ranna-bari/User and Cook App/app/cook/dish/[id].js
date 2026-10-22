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
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { toStorableImage } from '../../../src/lib/pickedImage';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import FloatLabelInput from '../../../src/components/FloatLabelInput';
import { FieldError, PublishSwitch, RowHeading } from '../../../src/components/CookBits';
import { BentoBox, Tag } from '../../../src/components/Surfaces';
import { Body, Heading, Price } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useAlert } from '../../../src/components/Alert';
import { useLang } from '../../../src/i18n/LanguageContext';

/** The tag vocabulary the browse filters and mood pills already understand. */
const TAGS = [
  'breakfast',
  'lunch',
  'dinner',
  'snacks',
  'healthy',
  'vegan',
  'spicy',
  'sweet',
  'comfort',
  'budget',
  'heritage',
  'seafood',
];

/* A dish with no photo is a dish nobody orders, so a new one starts on a
   stock plate rather than an empty frame. The cook can replace it. */
const PLACEHOLDER =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop';

/**
 * The kitchen arrives from AsyncStorage a render or two late, so the form
 * cannot initialise its state from it directly -- editing an existing dish
 * would capture blanks and then quietly save them over the real one. The
 * editor mounts only once the dish is in hand.
 */
export default function DishEditor() {
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { kitchen, hydrated } = useKitchen();

  const isNew = String(id) === 'new';
  const existing = kitchen?.dishes.find((d) => d.id === String(id));

  if (!hydrated || (!kitchen && !isNew)) {
    return (
      <CookScreen>
        <Container style={{ alignItems: 'center', gap: 18, paddingTop: 60 }}>
          <ActivityIndicator color={colors.sage} />
        </Container>
      </CookScreen>
    );
  }

  if (!kitchen || (!isNew && !existing)) {
    return (
      <CookScreen>
        <Container style={{ alignItems: 'center', gap: 16, paddingTop: 40 }}>
          <Icon name="alertCircle" size={32} color={colors.sage} />
          <Heading size={20}>{t('Dish not found')}</Heading>
          <Body muted size={15} style={{ textAlign: 'center' }}>
            {t('It may have been removed from your menu.')}
          </Body>
          <Button label={t('Back to menu')} onPress={() => router.replace('/cook/menu')} />
        </Container>
      </CookScreen>
    );
  }

  return <DishForm isNew={isNew} existing={existing} />;
}

/**
 * One dish, in the order a cook thinks about it.
 *
 * The photograph first — it is the field a customer's eye lands on and the
 * one a cook already has an answer for — then what the dish is, then what it
 * costs, then how it is found. A live preview rides below the fields, drawn
 * exactly as a customer's menu row draws it, so "will this look right" is
 * answered while typing rather than after saving.
 *
 * Each field carries its own error, directly beneath it, and an error clears
 * the moment that field is touched again. One shared note at the top of a
 * form cannot say which of three problems it is about.
 */
function DishForm({ isNew, existing }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const alert = useAlert();
  const { addDish, updateDish, removeDish } = useKitchen();

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [image, setImage] = useState(existing?.image ?? PLACEHOLDER);
  const [tags, setTags] = useState(existing?.tags ?? []);
  const [available, setAvailable] = useState(existing ? existing.available !== false : true);

  /* Per-field errors, set on save and cleared the moment their own field is
     edited — so fixing one never means pressing save again to see the next. */
  const [errors, setErrors] = useState({});
  /* The photograph is resized to a data URI before it can be shown as it
     will be stored; the picker's own preview is a handle that dies with the
     pick. This note is the wait, and the failure, when there is one. */
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoNote, setPhotoNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhotoNote(t('RannaBari needs photo access to set a dish photo.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Square, because every surface that shows a dish shows it square.
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setProcessingPhoto(true);
    setPhotoNote('');
    const stored = await toStorableImage(res.assets[0], 'dish');
    setProcessingPhoto(false);

    if (!stored) {
      setPhotoNote(t('That photo could not be read. Please try another.'));
      return;
    }
    setImage(stored);
    Haptics.selectionAsync().catch(() => {});
  };

  const toggleTag = (tag) =>
    setTags((prev) => {
      setErrors((e) => ({ ...e, tags: undefined }));
      return prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag];
    });

  /* One read of the price, everywhere. A half-typed "4" is not an error —
     it is somebody mid-typing — so the preview simply waits for a number. */
  const priceValue = Number(price);
  const priceValid = Number.isFinite(priceValue) && priceValue > 0;

  /* The preview is the customer's menu row, drawn with the same proportions
     the menu list uses — 62px photo, one line of description, price and the
     first tag. What is being edited here is what will be read there. */
  const preview = useMemo(
    () => ({
      image,
      name: name.trim(),
      description: description.trim(),
      price: priceValid ? Math.round(priceValue) : null,
      tag: tags[0],
    }),
    [image, name, description, priceValid, priceValue, tags],
  );

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = t('Give the dish a name.');
    if (!priceValid) next.price = t('Set a price above zero, in taka.');
    if (!tags.length) next.tags = t('Pick at least one tag so customers can find it.');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || t('Cooked to order.'),
      price: Math.round(priceValue),
      image,
      tags,
      /* Sold-out is a state a cook sets, not a side effect of saving: a dish
         written down for tomorrow is a draft, and this is the switch that
         says which. */
      available,
    };

    setSaving(true);
    const out = isNew ? await addDish(payload) : await updateDish(existing.id, payload);
    setSaving(false);

    if (!out || out.ok === false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setErrors((e) => ({ ...e, form: out?.message || t('That did not work') }));
      return;
    }

    /* The celebration is small on purpose: one tick, one buzz, and the menu
       with the new card on it — not a screen a cook has to dismiss. */
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    alert.success(
      isNew ? t('{name} is on your menu.', { name: name.trim() }) : t('Saved. Customers see it now.'),
    );
    router.replace({
      pathname: '/cook/menu',
      params: { highlight: isNew ? out?.result?.dish?.id ?? '' : String(existing.id) },
    });
  };

  return (
    <CookScreen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Container>
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/cook/menu')
            }
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
              letterSpacing: type.micro * tracking.label,
              textTransform: 'uppercase',
              color: colors.textMuted,
            }}
          >
            {t('Your menu')}
            </Text>
          </Pressable>

          <Reveal delay={1}>
            <Heading size={30} style={{ letterSpacing: -0.6 }}>
              {isNew ? t('Add a dish') : t('Edit dish')}
            </Heading>
            <Body muted size={15} style={{ marginTop: 4, marginBottom: 22 }}>
              {isNew
                ? t('A photo, a name, a price — that is a dish. It goes live when you say so.')
                : t('Changes reach customers immediately.')}
            </Body>
          </Reveal>

          {/* ---- Photo first ----
              The whole width, at the size it is judged in. A thumbnail beside
              a form makes a photograph feel like paperwork; this is the dish
              as a customer will scroll past it. */}
          {/* The remove-photo chip is a sibling of the photo press, not a
              child of it: on web each role="button" becomes a real <button>,
              and a button inside a button is invalid HTML. The Reveal view
              wraps exactly the photo, so it is the chip's positioning
              context. */}
          <Reveal delay={2} style={{ marginBottom: 18 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Change photo')}
              onPress={pickImage}
              disabled={processingPhoto}
              style={({ pressed }) => [
                {
                  height: 210,
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
                source={{ uri: image }}
                contentFit="cover"
                transition={200}
                style={{ width: '100%', height: '100%', backgroundColor: colors.sunken }}
              />
              <LinearGradient
                colors={['transparent', `rgba(${colors.scrim}, 0.62)`]}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '45%' }}
              />

              {processingPhoto ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 14,
                    bottom: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 8,
                    paddingHorizontal: 13,
                    borderRadius: radius.pill,
                    backgroundColor: 'rgba(16, 12, 10, 0.55)',
                  }}
                >
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 10,
                      letterSpacing: 0.85,
                      textTransform: 'uppercase',
                      color: '#FFFFFF',
                    }}
                  >
                    {t('Preparing the photo…')}
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    position: 'absolute',
                    left: 14,
                    bottom: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 8,
                    paddingHorizontal: 13,
                    borderRadius: radius.pill,
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  }}
                >
                  <Icon name="plus" size={14} color={colors.onDark} strokeWidth={2.2} />
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 10,
                      letterSpacing: 0.85,
                      textTransform: 'uppercase',
                      color: colors.onDark,
                    }}
                  >
                    {image !== PLACEHOLDER ? t('Change photo') : t('Add a photo')}
                  </Text>
                </View>
              )}
            </Pressable>

            {/* A stock plate is a stand-in, not a choice — so it is the one
                photo that can be removed without leaving the dish bare. */}
            {image !== PLACEHOLDER && !processingPhoto ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Remove photo')}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setImage(PLACEHOLDER);
                }}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 30,
                  height: 30,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 15,
                  backgroundColor: 'rgba(16, 12, 10, 0.5)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                }}
              >
                <Icon name="x" size={14} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </Reveal>

          {photoNote ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginBottom: 18,
                marginTop: -6,
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

          {/* ---- The essentials ---- */}
          <Reveal delay={3}>
            <RowHeading icon="chefHat" title={t('The essentials')} />

            <FloatLabelInput
              label={t('Dish name')}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setErrors((e) => ({ ...e, name: undefined }));
              }}
              placeholder="Shorshe Ilish"
            />
            <FieldError text={errors.name} />

            <FloatLabelInput
              label={t('Price in taka')}
              value={price}
              onChangeText={(v) => {
                setPrice(v.replace(/[^0-9]/g, ''));
                setErrors((e) => ({ ...e, price: undefined }));
              }}
              placeholder="450"
              keyboardType="number-pad"
            />
            <FieldError text={errors.price} />

            <FloatLabelInput
              label={t('Description')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('One line on what makes it yours')}
              multiline
              numberOfLines={3}
            />
          </Reveal>

          {/* ---- Tags ----
              These are the same keys the browse chips and mood pills filter
              on, so a tag chosen here is what puts the dish in front of
              somebody searching for it. */}
          <Reveal delay={4}>
            <View style={{ marginTop: 8 }}>
              <RowHeading icon="sparkles" title={t('Tags')} />
              <Body muted size={13} style={{ marginTop: -8, marginBottom: 14 }}>
                {t('Customers filter by these. Pick every one that fits.')}
              </Body>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TAGS.map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => toggleTag(tag)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 9,
                        paddingHorizontal: 14,
                        borderRadius: radius.pill,
                        backgroundColor: on ? colors.sage : colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: on ? colors.sage : colors.line,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      })}
                    >
                      {on ? (
                        <Icon name="check" size={12} color="#FFFFFF" strokeWidth={2.6} />
                      ) : null}
                      <Text
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: 12.5,
                          letterSpacing: 0.4,
                          textTransform: 'uppercase',
                          color: on ? '#FFFFFF' : colors.textMuted,
                        }}
                      >
                        {t(tag)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <FieldError text={errors.tags} />
            </View>
          </Reveal>

          {/* ---- Live preview ----
              The menu row, as the customer scrolls it — rebuilt from the
              fields above on every keystroke, so the card and the form can
              never disagree about what is being saved. */}
          <Reveal delay={5}>
            <View style={{ marginTop: 16 }}>
              <RowHeading icon="eye" title={t('How customers will see it')} />
              <BentoBox
                style={[
                  { padding: 14, opacity: available ? 1 : 0.62 },
                  !available && { borderColor: colors.saffron100 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Image
                    source={{ uri: preview.image }}
                    contentFit="cover"
                    transition={200}
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 18,
                      backgroundColor: colors.sunken,
                    }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 16,
                        letterSpacing: -0.16,
                        color: colors.text,
                      }}
                    >
                      {preview.name || t('Dish name')}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        marginTop: 1,
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {preview.description || t('One line on what makes it yours')}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 7,
                      }}
                    >
                      <Price size={16}>
                        {preview.price ? `৳${n(preview.price)}` : '৳ —'}
                      </Price>
                      {preview.tag ? <Tag label={t(preview.tag)} /> : null}
                    </View>
                  </View>
                </View>
              </BentoBox>
            </View>
          </Reveal>

          {/* ---- Publish ----
              Draft and live are one switch: saved-but-invisible versus
              orderable. It defaults to live, because a cook who filled this
              whole form came here to sell something. */}
          <Reveal delay={6}>
            <View style={{ marginTop: 24 }}>
              <RowHeading icon="flame" title={t('Publish')} />
              <PublishSwitch
                value={available}
                onChange={(v) => setAvailable(v)}
                title={available ? t('Available now') : t('Saved, but sold out')}
                sub={
                  available
                    ? t('Customers can order it the moment it is saved.')
                    : t('It sits on your menu greyed out until you switch it on.')
                }
              />
            </View>
          </Reveal>

          {/* ---- Save ---- */}
          <View style={{ gap: 12, marginTop: 28 }}>
            {errors.form ? <FieldError text={errors.form} /> : null}
            <Button
              label={saving ? t('Saving…') : isNew ? t('Add to menu') : t('Save changes')}
              icon={saving ? undefined : 'check'}
              block
              disabled={saving || processingPhoto}
              onPress={save}
            />

            {!isNew ? (
              confirmDelete ? (
                <View
                  style={{
                    padding: 16,
                    borderRadius: radius.md,
                    backgroundColor: colors.primary50,
                    borderWidth: 1,
                    borderColor: colors.primary100,
                    gap: 12,
                  }}
                >
                  <Body size={14}>
                    {t('Remove {name} from your menu? Orders already placed for it are not affected.', { name: existing.name })}
                  </Body>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button
                      variant="glass"
                      label={t('Keep it')}
                      small
                      style={{ flex: 1 }}
                      onPress={() => setConfirmDelete(false)}
                    />
                    <Button
                      label={t('Remove')}
                      small
                      style={{ flex: 1 }}
                      onPress={() => {
                        removeDish(existing.id);
                        router.replace('/cook/menu');
                      }}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  variant="ghost"
                  label={t('Remove from menu')}
                  icon="x"
                  iconPosition="left"
                  block
                  onPress={() => setConfirmDelete(true)}
                />
              )
            ) : null}
          </View>
        </Container>
      </KeyboardAvoidingView>
    </CookScreen>
  );
}
