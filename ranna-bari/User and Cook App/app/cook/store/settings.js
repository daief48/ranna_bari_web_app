/**
 * The shop's own details.
 *
 * Everything here is what a customer sees before they see a single product,
 * so it is worth more care than a settings screen usually gets: the cover,
 * the logo, the sentence under the name, and the one number that decides
 * whether an order is worth placing — what delivery costs.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { BlockLabel } from '../../../src/components/StoreBits';
import { errorText } from '../../../src/components/MealBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useLang } from '../../../src/i18n/LanguageContext';
import LocationPicker from '../../../src/components/LocationPicker';
import { RadiusSlider } from '../../../src/components/CookBits';
import { useAlert } from '../../../src/components/Alert';

export default function StoreSettings() {
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;

  /* The form only mounts once there is something to fill it with, so the
     fields are never initialised from a document that has not loaded. */
  if (!store) {
    return (
      <CookScreen>
        <Container style={{ paddingTop: 30 }}>
          <Heading size={20}>…</Heading>
        </Container>
      </CookScreen>
    );
  }
  return <Form store={store} kitchenId={kitchen.id} />;
}

function Form({ store, kitchenId }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const alert = useAlert();
  const router = useRouter();
  const shop = useCommerce();

  /* Null until the cook moves the pin. Null means "leave whatever is stored",
     which for a shop with none is the kitchen's — so opening this screen and
     saving does not silently pin the shop to wherever the map happened to
     open. */
  const [pin, setPin] = useState(null);
  const [radiusKm, setRadiusKm] = useState(
    store.deliveryRadiusKm ?? 3,
  );
  const [name, setName] = useState(store.name || '');
  const [tagline, setTagline] = useState(store.tagline || '');
  const [description, setDescription] = useState(store.description || '');
  const [phone, setPhone] = useState(store.phone || '');
  const [area, setArea] = useState(store.area ?? '');
  const [logo, setLogo] = useState(store.logo ?? '');
  const [cover, setCover] = useState(store.cover ?? '');
  const [fee, setFee] = useState(String(store.deliveryFee ?? 0));
  const [freeOver, setFreeOver] = useState(
    store.freeDeliveryOver == null ? '' : String(store.freeDeliveryOver),
  );
  const [note, setNote] = useState(null);
  const [saved, setSaved] = useState(false);

  const pick = async (setter, aspect) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alert.error(t('RannaBari needs photo access to set a shop photo.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setter(res.assets[0].uri);
  };

  const save = async () => {
    const out = await shop.saveStore(kitchenId, {
      name: name.trim(),
      tagline: tagline.trim(),
      description: description.trim(),
      phone: phone.trim(),
      area: area.trim(),
      logo,
      cover,
      deliveryFee: Math.max(0, Math.round(Number(fee) || 0)),
      freeDeliveryOver: freeOver.trim() ? Math.round(Number(freeOver)) : null,
      deliveryRadiusKm: radiusKm,
      /* Only sent when the pin was actually moved. */
      ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
    });
    if (!out.ok) {
      setSaved(false);
      alert.error(errorText(out.error, t, n, out));
      return;
    }
    setNote(null);
    setSaved(true);
  };

  return (
    <CookScreen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook/store'))}
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
            {t('Your shop')}
          </Text>
        </Pressable>

        <Reveal delay={1}>
          <Heading size={30} style={{ letterSpacing: -0.6 }}>
            {t('Shop settings')}
          </Heading>
          <Body muted size={15} style={{ marginTop: 4, marginBottom: 22 }}>
            {t('This is the first thing a customer sees. Changes are live at once.')}
          </Body>
        </Reveal>

        {/* ---- cover and logo ---- */}
        <Reveal delay={2}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Change cover photo')}
            onPress={() => pick(setCover, [16, 9])}
            style={({ pressed }) => [
              {
                height: 150,
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
              source={{ uri: cover }}
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
              <Icon name="plus" size={14} color="#FFFFFF" strokeWidth={2.2} />
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.xs + 1,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: '#FFFFFF',
                }}
              >
                {t('Cover photo')}
              </Text>
            </View>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: -26, marginBottom: 22 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Change shop logo')}
              onPress={() => pick(setLogo, [1, 1])}
              style={({ pressed }) => [
                { opacity: pressed ? 0.9 : 1 },
                shadow.sm,
              ]}
            >
              <Image
                source={{ uri: logo }}
                contentFit="cover"
                transition={200}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 24,
                  borderWidth: 3,
                  borderColor: colors.canvas,
                  backgroundColor: colors.sunken,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: 26,
                  height: 26,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 13,
                  backgroundColor: colors.sage,
                  borderWidth: 2,
                  borderColor: colors.canvas,
                }}
              >
                <Icon name="plus" size={12} color="#FFFFFF" strokeWidth={2.4} />
              </View>
            </Pressable>
            <Text
              style={{
                flex: 1,
                paddingTop: 30,
                fontFamily: font.ui,
                fontSize: type.xs + 1,
                color: colors.textMuted,
              }}
            >
              {t('Tap either photo to change it.')}
            </Text>
          </View>
        </Reveal>

        {/* ---- who you are ---- */}
        <Reveal delay={3}>
          <View style={{ gap: 14 }}>
            <FloatLabelInput label={t('Shop name')} value={name} onChangeText={setName} />
            <FloatLabelInput
              label={t('One line about the shop')}
              value={tagline}
              onChangeText={setTagline}
              placeholder={t('Cakes, pitha and achar, made at home')}
            />
            <FloatLabelInput
              label={t('Description')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('What you make, and how you make it')}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <FloatLabelInput
                label={t('Phone')}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                style={{ flex: 1 }}
              />
              <FloatLabelInput
                label={t('Area')}
                value={area}
                onChangeText={setArea}
                style={{ flex: 1 }}
              />
            </View>

            {/* ---- where the shop actually is ----
                A shop with no pin of its own borrows the kitchen's, which is
                right by default and wrong for a cook who bakes at home and
                keeps the shelf at a second address. Until now that was not
                sayable: the field existed on the server and nothing on the
                device could set it. */}
            <View style={{ marginTop: 18 }}>
              <BlockLabel text={t('Where the shop is')} />
              <Body muted size={13} style={{ marginBottom: 10 }}>
                {pin
                  ? t('Customers see this pin and measure delivery from it.')
                  : t('Using your kitchen’s location. Move the pin to set its own.')}
              </Body>
              <LocationPicker
                height={220}
                center={
                  typeof store.lat === 'number'
                    ? { lat: store.lat, lng: store.lng, zoom: 16 }
                    : undefined
                }
                onChange={(place) => {
                  setPin(place);
                  setSaved(false);
                }}
              />
            </View>
          </View>
        </Reveal>

        {/* ---- delivery ---- */}
        <Reveal delay={4}>
          <View style={{ marginTop: 26 }}>
            <BlockLabel text={t('Delivery')} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <FloatLabelInput
                label={t('Delivery fee')}
                value={fee}
                onChangeText={(v) => setFee(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={{ flex: 1 }}
              />
              <FloatLabelInput
                label={t('Free over (optional)')}
                value={freeOver}
                onChangeText={(v) => setFreeOver(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder={t('Never')}
                style={{ flex: 1 }}
              />
            </View>

            {/* How far the shelf travels, which is not necessarily how far a
                hot meal will: a jar of achar posts further than a plate of
                bhuna. The shop kept inheriting the kitchen's radius with no
                way to say otherwise. */}
            <View style={{ marginTop: 18 }}>
              <RadiusSlider
                value={radiusKm}
                onChange={(v) => {
                  setRadiusKm(v);
                  setSaved(false);
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.xs,
                lineHeight: type.xs * 1.6,
                color: colors.textLight,
                marginTop: 10,
              }}
            >
              {t('Charged once per order, however many things are in the basket.')}
            </Text>
          </View>
        </Reveal>

        {note ? <FormNote text={note} /> : null}
        {saved ? <FormNote text={t('Saved.')} tone="ok" /> : null}

        <Reveal delay={5}>
          <Button
            label={t('Save changes')}
            icon="check"
            iconPosition="left"
            block
            onPress={save}
            style={{ marginTop: 22 }}
          />
        </Reveal>
      </Container>
    </CookScreen>
  );
}
