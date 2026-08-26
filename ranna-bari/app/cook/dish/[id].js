import React, { useState } from 'react';
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

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import FloatLabelInput, { FormNote } from '../../../src/components/FloatLabelInput';
import { RowHeading } from '../../../src/components/CookBits';
import { Body, Heading } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';

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
          <Heading size={20}>Dish not found</Heading>
          <Body muted size={15} style={{ textAlign: 'center' }}>
            It may have been removed from your menu.
          </Body>
          <Button label="Back to menu" onPress={() => router.replace('/cook/menu')} />
        </Container>
      </CookScreen>
    );
  }

  return <DishForm isNew={isNew} existing={existing} />;
}

function DishForm({ isNew, existing }) {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { addDish, updateDish, removeDish } = useKitchen();

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [image, setImage] = useState(existing?.image ?? PLACEHOLDER);
  const [tags, setTags] = useState(existing?.tags ?? []);
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote('RannaBari needs photo access to set a dish photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Square, because every surface that shows a dish shows it square.
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setImage(res.assets[0].uri);
  };

  const toggleTag = (t) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const save = () => {
    const value = Number(price);
    if (!name.trim()) {
      setNote('Give the dish a name.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setNote('Set a price above zero, in taka.');
      return;
    }
    if (!tags.length) {
      setNote('Pick at least one tag so customers can find it.');
      return;
    }
    setNote('');

    const payload = {
      name: name.trim(),
      description: description.trim() || 'Cooked to order.',
      price: Math.round(value),
      image,
      tags,
    };

    if (isNew) addDish(payload);
    else updateDish(existing.id, payload);

    Haptics.selectionAsync().catch(() => {});
    router.replace('/cook/menu');
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
              Your menu
            </Text>
          </Pressable>

          <Reveal delay={1}>
            <Heading size={30} style={{ letterSpacing: -0.6 }}>
              {isNew ? 'Add a dish' : 'Edit dish'}
            </Heading>
            <Body muted size={15} style={{ marginTop: 4, marginBottom: 26 }}>
              {isNew
                ? 'It goes live on your listing as soon as you save.'
                : 'Changes reach customers immediately.'}
            </Body>
          </Reveal>

          {/* ---- Photo ---- */}
          <Reveal delay={2}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change the dish photo"
              onPress={pickImage}
              style={({ pressed }) => [
                {
                  height: 190,
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                  marginBottom: 24,
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
                colors={['transparent', `rgba(${colors.scrim}, 0.6)`]}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '45%' }}
              />
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
                  {image !== PLACEHOLDER ? 'Change photo' : 'Add a photo'}
                </Text>
              </View>
            </Pressable>
          </Reveal>

          {/* ---- Details ---- */}
          <Reveal delay={3}>
            <FormNote text={note} />

            <FloatLabelInput
              label="Dish name"
              value={name}
              onChangeText={setName}
              placeholder="Shorshe Ilish"
            />

            <FloatLabelInput
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="One line on what makes it yours"
              multiline
              numberOfLines={3}
            />

            <FloatLabelInput
              label="Price in taka"
              value={price}
              onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))}
              placeholder="450"
              keyboardType="number-pad"
            />
          </Reveal>

          {/* ---- Tags ----
              These are the same keys the browse chips and mood pills filter
              on, so a tag chosen here is what puts the dish in front of
              somebody searching for it. */}
          <Reveal delay={4}>
            <View style={{ marginTop: 8 }}>
              <RowHeading icon="sparkles" title="Tags" />
              <Body muted size={13} style={{ marginTop: -8, marginBottom: 14 }}>
                Customers filter by these. Pick every one that fits.
              </Body>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TAGS.map((t) => {
                  const on = tags.includes(t);
                  return (
                    <Pressable
                      key={t}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => toggleTag(t)}
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
                        {t}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Reveal>

          {/* ---- Save ---- */}
          <View style={{ gap: 12, marginTop: 32 }}>
            <Button
              label={isNew ? 'Add to menu' : 'Save changes'}
              icon="check"
              block
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
                    Remove {existing.name} from your menu? Orders already placed
                    for it are not affected.
                  </Body>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button
                      variant="glass"
                      label="Keep it"
                      small
                      style={{ flex: 1 }}
                      onPress={() => setConfirmDelete(false)}
                    />
                    <Button
                      label="Remove"
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
                  label="Remove from menu"
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
