/**
 * Kitchen details — name, specialty, description, delivery radius.
 *
 * This was a fold-out panel on the kitchen screen. Folded, a cook could not
 * see what any of it was set to without opening it; open, it pushed the rows
 * below — preview your listing, switch to ordering, log out — most of a
 * screen further down, so the page changed shape depending on a toggle.
 *
 * It is four settings that are read together and saved together, which is a
 * page, not a drawer. Here they all fit on one screen, the save button has a
 * bottom of its own to sit at, and the kitchen screen behind it keeps one
 * shape.
 *
 * The state still lives in `KitchenContext`, so this holds a draft and hands
 * it back on save exactly as the panel did — nothing about what is stored, or
 * when, has changed.
 */
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../src/components/CookScreen';
import { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import FloatLabelInput, { FormNote } from '../../src/components/FloatLabelInput';
import { Body, Heading } from '../../src/components/Typography';
import { RadiusSlider } from '../../src/components/CookBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { SPECIALTIES, useKitchen } from '../../src/store/KitchenContext';
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
          <Heading size={20}>{t('Setting up your kitchen…')}</Heading>
        </Container>
      </CookScreen>
    );
  }

  return <DetailsForm kitchen={kitchen} />;
}

function DetailsForm({ kitchen }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { updateKitchen } = useKitchen();

  const [name, setName] = useState(kitchen.name ?? '');
  const [specialty, setSpecialty] = useState(kitchen.specialty ?? '');
  const [specialtyOpen, setSpecialtyOpen] = useState(false);
  const [description, setDescription] = useState(kitchen.description ?? '');
  const [radiusKm, setRadiusKm] = useState(kitchen.deliveryRadiusKm ?? 3);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  const back = () =>
    router.canGoBack() ? router.back() : router.replace('/cook/kitchen');

  const save = () => {
    if (!name.trim()) {
      setNote(t('Your kitchen needs a name for customers to find it.'));
      return;
    }
    setNote('');
    updateKitchen({
      name: name.trim(),
      specialty,
      description: description.trim(),
      deliveryRadiusKm: radiusKm,
    });
    setSaved(true);
    Haptics.selectionAsync().catch(() => {});
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
                letterSpacing: type.micro * tracking.label,
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
            <Body muted size={15} style={{ marginTop: 4, marginBottom: 26 }}>
              {t('Changes reach customers immediately.')}
            </Body>
          </Reveal>

          <FormNote text={note} />
          {saved && !note ? (
            <FormNote text={t('Saved. Your listing is live.')} tone="info" />
          ) : null}

          <FloatLabelInput
            label={t('Kitchen name')}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setSaved(false);
            }}
            placeholder={t('What customers see on the map')}
          />

          {/* A select is never empty, so its label rides high permanently. */}
          <View style={{ marginBottom: 20 }}>
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
                    onPress={() => {
                      setSpecialty(s);
                      setSpecialtyOpen(false);
                      setSaved(false);
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
          </View>

          <FloatLabelInput
            label={t('About your cooking')}
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              setSaved(false);
            }}
            placeholder={t('One or two lines customers read first')}
            multiline
            numberOfLines={3}
          />

          <RadiusSlider
            value={radiusKm}
            onChange={(v) => {
              setRadiusKm(v);
              setSaved(false);
            }}
          />

          <Button
            label={saved ? t('Saved') : t('Save changes')}
            icon={saved ? 'check' : 'arrowRight'}
            block
            onPress={save}
            style={{ marginTop: 20 }}
          />
        </Container>
      </KeyboardAvoidingView>
    </CookScreen>
  );
}
