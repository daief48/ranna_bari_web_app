/**
 * Plan a meal.
 *
 * A cook fills this in the evening for tomorrow, which is why the date
 * defaults to tomorrow and the deadline is derived from the service rather
 * than asked for: the useful question is "lunch or dinner", and a cut-off a
 * few hours before is the answer that follows from it. It can still be moved
 * if the answer is wrong.
 *
 * The menu the cook already keeps is offered as a starting point, because
 * most meals are a dish they have listed and retyping it is a chore.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import FloatLabelInput, { FormNote } from '../../../src/components/FloatLabelInput';
import { Body, Heading } from '../../../src/components/Typography';
import { deadlineLabel } from '../../../src/components/MealBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/store/AuthContext';
import { useKitchen } from '../../../src/store/KitchenContext';
import {
  SLOTS,
  addDays,
  dayKey,
  defaultDeadline,
  tomorrowKey,
  useMeals,
} from '../../../src/store/MealsContext';
import { distanceKm } from '../../../src/lib/geo';
import { deliversTo } from '../../../src/lib/kitchen';
import { useLang } from '../../../src/i18n/LanguageContext';

const PLACEHOLDER =
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&h=600&fit=crop';

export default function NewMeal() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const router = useRouter();
  const { account } = useAuth();
  const { kitchen } = useKitchen();
  const meals = useMeals();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [capacity, setCapacity] = useState('');
  const [image, setImage] = useState(PLACEHOLDER);
  const [serveDate, setServeDate] = useState(tomorrowKey());
  const [slot, setSlot] = useState('lunch');
  const [handover, setHandover] = useState('delivery');
  const [handoverNote, setHandoverNote] = useState('');
  const [note, setNote] = useState('');

  /* The next three days is the whole useful range: this is pre-booking for
     tomorrow, not a catering calendar. */
  const days = useMemo(
    () =>
      [0, 1, 2, 3].map((offset) => {
        const date = addDays(offset);
        return {
          key: dayKey(date),
          label:
            offset === 0
              ? t('Today')
              : offset === 1
                ? t('Tomorrow')
                : date.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                  }),
        };
      }),
    [t, lang],
  );

  const deadline = defaultDeadline(serveDate, slot);
  const closes = deadlineLabel(deadline, t, n);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote(t('RannaBari needs photo access to set a meal photo.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setImage(res.assets[0].uri);
  };

  /** Start from something already on the menu. */
  const useDish = (dish) => {
    setTitle(dish.name);
    setDescription(dish.description ?? '');
    setPrice(String(dish.price));
    setImage(dish.image ?? PLACEHOLDER);
  };

  const publish = () => {
    const value = Number(price);
    const cap = capacity.trim() ? Number(capacity) : null;

    if (!kitchen) {
      setNote(t('Set your kitchen up first.'));
      return;
    }
    if (!title.trim()) {
      setNote(t('Give the meal a name.'));
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setNote(t('Set a price above zero, in taka.'));
      return;
    }
    if (cap != null && (!Number.isFinite(cap) || cap <= 0)) {
      setNote(t('Leave the quantity blank for no limit, or set it above zero.'));
      return;
    }
    if (new Date(deadline).getTime() <= Date.now()) {
      setNote(t('That service has already closed. Pick a later date or sitting.'));
      return;
    }

    /* Who hears about it: the same delivery radius browse honours. On this
       device there is one customer to reach, and they are only told if the
       kitchen would actually deliver to them. */
    const nearby =
      typeof account?.lat === 'number' && typeof kitchen.lat === 'number'
        ? deliversTo(
            kitchen,
            distanceKm(
              { lat: account.lat, lng: account.lng },
              { lat: kitchen.lat, lng: kitchen.lng },
            ),
          )
        : true;

    const out = meals.publishMeal(
      {
        kitchenId: kitchen.id,
        cookName: kitchen.name,
        title: title.trim(),
        description: description.trim(),
        image,
        price: Math.round(value),
        capacity: cap == null ? null : Math.round(cap),
        serveDate,
        slot,
        deadline,
        handover,
        handoverNote: handoverNote.trim(),
        area: kitchen.area,
        lat: kitchen.lat,
        lng: kitchen.lng,
        deliveryRadiusKm: kitchen.deliveryRadiusKm,
      },
      nearby,
    );

    if (!out.ok) {
      setNote(t('Something went wrong. Try again.'));
      return;
    }
    router.replace(`/cook/meal/${out.result.id}`);
  };

  const dishes = kitchen?.dishes ?? [];

  return (
    <CookScreen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook/meals'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 18,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.sage} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.sage,
            }}
          >
            {t('Your meals')}
          </Text>
        </Pressable>

        <Reveal delay={1}>
          <Heading size={30} style={{ letterSpacing: -0.6 }}>
            {t('Plan a meal')}
          </Heading>
          <Body muted size={15} style={{ marginTop: 4, marginBottom: 24 }}>
            {t('Customers inside your delivery radius see it as soon as you publish.')}
          </Body>
        </Reveal>

        {/* ---- start from the menu ---- */}
        {dishes.length ? (
          <Reveal delay={2}>
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: type.xs + 1,
                letterSpacing: (type.xs + 1) * tracking.label,
                textTransform: 'uppercase',
                color: colors.textMuted,
                marginBottom: 10,
              }}
            >
              {t('Start from your menu')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              style={{ marginBottom: 22 }}
            >
              {dishes.map((dish) => (
                <Pressable
                  key={dish.id}
                  accessibilityRole="button"
                  onPress={() => useDish(dish)}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 9,
                      paddingHorizontal: 13,
                      borderRadius: radius.pill,
                      backgroundColor: pressed ? colors.sage50 : colors.surfaceSolid,
                      borderWidth: 1,
                      borderColor: colors.line,
                    },
                    shadow.xs,
                  ]}
                >
                  <Icon name="utensils" size={12} color={colors.sage} />
                  <Text
                    style={{ fontFamily: font.uiSemi, fontSize: 13, color: colors.text }}
                  >
                    {dish.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Reveal>
        ) : null}

        {/* ---- photo ---- */}
        <Reveal delay={3}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Change photo')}
            onPress={pickImage}
            style={({ pressed }) => [
              {
                height: 180,
                borderRadius: radius.lg,
                overflow: 'hidden',
                marginBottom: 22,
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
                left: 16,
                bottom: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="plus" size={15} color="#FFFFFF" strokeWidth={2.2} />
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.xs + 1,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: '#FFFFFF',
                }}
              >
                {t('Change photo')}
              </Text>
            </View>
          </Pressable>
        </Reveal>

        {/* ---- the meal ---- */}
        <Reveal delay={4}>
          <View style={{ gap: 14 }}>
            <FloatLabelInput
              label={t('Meal name')}
              value={title}
              onChangeText={setTitle}
              placeholder={t('Chicken Biryani')}
            />
            <FloatLabelInput
              label={t('Description')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('What is in it, and how much')}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <FloatLabelInput
                label={t('Price per plate')}
                value={price}
                onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="180"
                style={{ flex: 1 }}
              />
              <FloatLabelInput
                label={t('Plates (optional)')}
                value={capacity}
                onChangeText={(v) => setCapacity(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder={t('No limit')}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Reveal>

        {/* ---- when ---- */}
        <Reveal delay={5}>
          <Group label={t('Day')}>
            {days.map((day) => (
              <Chip
                key={day.key}
                label={day.label}
                active={serveDate === day.key}
                onPress={() => setServeDate(day.key)}
              />
            ))}
          </Group>

          <Group label={t('Sitting')}>
            {SLOTS.map((s) => (
              <Chip
                key={s.key}
                label={t(s.label)}
                active={slot === s.key}
                onPress={() => setSlot(s.key)}
              />
            ))}
          </Group>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              marginBottom: 22,
              borderRadius: radius.sm,
              backgroundColor: colors.sunken,
              borderWidth: 1,
              borderColor: colors.line2,
            }}
          >
            <Icon name="clock" size={15} color={colors.textMuted} />
            <Text
              style={{
                flex: 1,
                fontFamily: font.ui,
                fontSize: type.xs + 1,
                lineHeight: (type.xs + 1) * 1.5,
                color: colors.textMuted,
              }}
            >
              {t('Orders close a few hours before the sitting — {when}.', {
                when: closes ?? t('already closed'),
              })}
            </Text>
          </View>
        </Reveal>

        {/* ---- how it reaches them ---- */}
        <Reveal delay={6}>
          <Group label={t('Handover')}>
            <Chip
              label={t('Delivery')}
              active={handover === 'delivery'}
              onPress={() => setHandover('delivery')}
            />
            <Chip
              label={t('Collection')}
              active={handover === 'pickup'}
              onPress={() => setHandover('pickup')}
            />
          </Group>

          <FloatLabelInput
            label={t('Handover note (optional)')}
            value={handoverNote}
            onChangeText={setHandoverNote}
            placeholder={
              handover === 'pickup'
                ? t('Collect between 1 and 2pm.')
                : t('Delivered by 1:30pm.')
            }
          />
        </Reveal>

        {note ? <FormNote text={note} /> : null}

        <Reveal delay={7}>
          <Button
            label={t('Publish meal')}
            icon="arrowRight"
            block
            onPress={publish}
            style={{ marginTop: 22 }}
          />
        </Reveal>
      </Container>
    </CookScreen>
  );
}

function Group({ label, children }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 22, marginBottom: 4, gap: 10 }}>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.xs + 1,
          letterSpacing: (type.xs + 1) * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

function Chip({ label, active, onPress }) {
  const { colors, shadow } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      aria-pressed={!!active}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: radius.pill,
          backgroundColor: active ? colors.sage : colors.surfaceSolid,
          borderWidth: 1,
          borderColor: active ? colors.sage : colors.line,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        shadow.xs,
      ]}
    >
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: 13,
          color: active ? '#FFFFFF' : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
