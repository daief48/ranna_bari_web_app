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
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { toStorableImage, toStorableImages, fitGallery, weighGallery, GALLERY_BUDGET_BYTES } from '../../../src/lib/pickedImage';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import { FormNote } from '../../../src/components/FloatLabelInput';
import { ActionRow, KycBanner } from '../../../src/components/CookBits';
import { Body, Heading } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useAuth } from '../../../src/store/AuthContext';
import { useSession } from '../../../src/store/SessionContext';
import { useOrders } from '../../../src/store/OrdersContext';
import { useLang } from '../../../src/i18n/LanguageContext';
import { useAlert, useAction } from '../../../src/components/Alert';

/**
 * KitchenContext hydrates from AsyncStorage asynchronously, so `kitchen` is
 * null for the first render or two. State initialised from it there would
 * capture those nulls for good and leave a cook staring at an empty form over
 * a card showing their real kitchen -- so the form stays unmounted until the
 * record has actually arrived. Same shape as the profile editor.
 */
export default function CookKitchen() {
  const { colors } = useTheme();
  const { t } = useLang();
  const { kitchen, hydrated } = useKitchen();

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

  return <KitchenForm kitchen={kitchen} />;
}

function KitchenForm({ kitchen }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const alert = useAlert();
  const { updateKitchen, toggleOpen, liveDishes, saving } = useKitchen();
  const run = useAction();
  const { account, setViewMode, signOut } = useAuth();
  const { signOutServer } = useSession();
  const { ordersForKitchen } = useOrders();

  /* Name, specialty, description and radius are edited on their own page now
     — this screen holds the photographs and the rows that lead elsewhere.
     The gallery state mirrors the server; every change posts immediately. */
  const [note, setNote] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);
  const photos = kitchen.photos ?? [];
  const MAX_PHOTOS = 5;
  const dishes = kitchen.dishes ?? [];
  const MENU_PREVIEW = 4;

  const delivered = ordersForKitchen(kitchen.id).filter(
    (o) => o.status === 'delivered',
  ).length;

  const savePhotos = async (next, successNote = '') => {
    const out = await updateKitchen({ photos: next });
    if (out && !out.ok) {
      setNote(t('That photo could not be saved. Try again.'));
      return false;
    }
    setNote(successNote);
    return true;
  };

  const addPhotos = async () => {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setNote(
        t('A kitchen shows up to {max} photos. Remove one to add another.', {
          max: n(MAX_PHOTOS),
        }),
      );
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote(t('RannaBari needs photo access to change your kitchen picture.'));
      return;
    }
    /* Multi-select, no crop — same rules as the wizard's gallery step. */
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.6,
      base64: true,
    });
    if (res.canceled || !res.assets?.length) return;

    setNote(t('Preparing your photos…'));
    const { images, failed } = await toStorableImages(res.assets, 'gallery');
    if (!images.length) {
      setNote(t('Those photos could not be read. Please try different ones.'));
      return;
    }

    const fresh = images.filter((uri) => !photos.includes(uri));
    const overflow = Math.max(0, fresh.length - room);
    const { images: next, dropped } = fitGallery([...photos, ...fresh.slice(0, room)]);
    const saved = await savePhotos(next);
    if (!saved) return;

    const lost = failed + dropped;
    setNote(
      overflow
        ? t('A kitchen shows up to {max} photos, so {over} were not added.', {
            max: n(MAX_PHOTOS),
            over: n(overflow),
          })
        : lost
          ? t('{lost} could not be added, so your gallery has {kept}. Try smaller photos.', {
              lost: n(lost),
              kept: n(next.length),
            })
          : t('Photo added.'),
    );
  };

  const removePhoto = async (uri) => {
    const next = photos.filter((p) => p !== uri);
    if (weighGallery(next) > GALLERY_BUDGET_BYTES) {
      setNote(t('That photo would push the gallery over its size limit. Try a shorter one.'));
      return;
    }
    await savePhotos(next, t('Photo removed.'));
  };

  const pickImage = async (field) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote(t('RannaBari needs photo access to change your kitchen picture.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // A cover is a banner and an avatar is a square; cropping to the shape
      // it will be shown in beats letting the card do it later.
      aspect: field === 'coverImage' ? [3, 1] : [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      /* Written straight through: a photograph is saved the moment it is
         chosen, and always was — there is no draft here to keep.

         The verdict is read rather than discarded. This call was failing on
         the server for months and nothing here noticed, so the picture simply
         did not change and the screen said nothing about why. */
      setNote('');

      /* An avatar is a 40px circle and a cover is a banner, so they are not
         stored at the same size — see IMAGE_ROLES. */
      const stored = await toStorableImage(
        res.assets[0],
        field === 'coverImage' ? 'cover' : 'avatar',
      );
      if (!stored) {
        setNote(t('That photo could not be read. Please try another.'));
        return;
      }

      const out = await updateKitchen({ [field]: stored });
      if (out && !out.ok) {
        setNote(t('That photo could not be saved. Try again.'));
      }
    }
  };

  return (
    <CookScreen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Container>
          <SectionHeader
            lead={t('YOUR')}
            accent={t('KITCHEN')}
            subtitle={t('How customers see you, and what you deliver.')}
          />

          {/*
           * The only thing on this screen that can fail is the photo picker
           * asking for library access. That message used to be rendered
           * inside the details panel, which has moved to its own page — so
           * without this a denied permission would set a note that nothing
           * displayed, and the tap would look like it simply did nothing.
           */}
          <FormNote text={note} />

          {/* Above the listing card, because it changes how to read it: a
              kitchen still waiting on verification looks identical to one
              that passed, and this is the only thing that says which. */}
          <KycBanner
            status={kitchen.kycStatus}
            note={kitchen.kycNote}
            onContact={() => router.push('/chat')}
            style={{ marginBottom: 18 }}
          />

          {/* ---- The shutter ----
              The same switch the dashboard carries, through the same
              toggleOpen, so the two can never disagree about whether the
              kitchen is taking orders. Closing keeps the listing visible but
              stops new orders; a kitchen still waiting on verification can
              flip it too, but the server only lets orders through once it is
              approved — so the line under the title says so rather than
              letting an "open" kitchen sit silent. */}
          <Reveal delay={1}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: !!kitchen.isOpen, busy: !!saving }}
              accessibilityLabel={
                kitchen.isOpen ? t('Kitchen open') : t('Tap to open your kitchen')
              }
              disabled={!!saving}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                run(
                  () => toggleOpen(),
                  () => (kitchen.isOpen ? t('Kitchen closed.') : t('Kitchen is open for orders.')),
                );
              }}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                  padding: 18,
                  marginBottom: 18,
                  borderRadius: radius.md,
                  backgroundColor: kitchen.isOpen ? colors.sage : colors.sunken,
                  borderWidth: 1,
                  borderColor: kitchen.isOpen ? 'transparent' : colors.line,
                  opacity: saving ? 0.7 : 1,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                },
                kitchen.isOpen ? shadow.md : shadow.sm,
              ]}
            >
              <Icon
                name={kitchen.isOpen ? 'utensils' : 'moon'}
                size={22}
                color={kitchen.isOpen ? '#FFFFFF' : colors.textMuted}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: font.displayExtra,
                    fontSize: 20,
                    letterSpacing: -0.4,
                    color: kitchen.isOpen ? '#FFFFFF' : colors.text,
                  }}
                >
                  {kitchen.isOpen ? t('Kitchen open') : t('Kitchen closed')}
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontFamily: font.ui,
                    fontSize: type.xs + 1,
                    color: kitchen.isOpen ? 'rgba(255,255,255,0.9)' : colors.textMuted,
                  }}
                >
                  {kitchen.kycStatus !== 'approved'
                    ? t('Orders start once your kitchen is verified.')
                    : kitchen.isOpen
                      ? t('Taking orders · tap to close')
                      : t('Tap to start taking orders')}
                </Text>
              </View>
            </Pressable>
          </Reveal>

          {/* ---- The listing, as a customer sees it ---- */}
          <Reveal delay={1}>
            <View
              style={[
                {
                  borderRadius: 28,
                  overflow: 'hidden',
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
                shadow.md,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Change cover')}
                onPress={() => pickImage('coverImage')}
                style={{ height: 110 }}
              >
                <Image
                  source={{ uri: kitchen.coverImage }}
                  contentFit="cover"
                  transition={200}
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: colors.sunken,
                  }}
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
                  <Icon name="eye" size={13} color={colors.onDark} />
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 9.5,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: colors.onDark,
                    }}
                  >
                    {t('Change cover')}
                  </Text>
                </View>
              </Pressable>

              <View style={{ padding: 18, paddingTop: 0 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: 14,
                    marginTop: -28,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Change photo')}
                    onPress={() => pickImage('avatar')}
                  >
                    <Image
                      source={{ uri: kitchen.avatar }}
                      contentFit="cover"
                      transition={200}
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 24,
                        borderWidth: 3,
                        borderColor: colors.surfaceSolid,
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
                        borderRadius: 13,
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

                  <View style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.displayExtra,
                        fontSize: 20,
                        letterSpacing: -0.4,
                        color: colors.text,
                      }}
                    >
                      {kitchen.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textMuted,
                      }}
                    >
                      {kitchen.specialty} · {kitchen.area}
                    </Text>
                  </View>
                </View>

                {/* Three numbers, split by hairlines. A kitchen with no
                    reviews shows a dash rather than a fabricated 5.0. */}
                <View
                  style={{
                    flexDirection: 'row',
                    marginTop: 16,
                    borderRadius: radius.md,
                    backgroundColor: colors.sunken,
                    borderWidth: 1,
                    borderColor: colors.line2,
                    overflow: 'hidden',
                  }}
                >
                  <MiniStat
                    value={kitchen.reviewCount ? n(kitchen.rating.toFixed(1)) : '—'}
                    label={t('Rating')}
                  />
                  <View style={{ width: 1, backgroundColor: colors.line2 }} />
                  <MiniStat value={n(liveDishes.length)} label={t('Live dishes')} />
                  <View style={{ width: 1, backgroundColor: colors.line2 }} />
                  <MiniStat value={n(delivered)} label={t('Delivered')} />
                </View>
              </View>
            </View>
          </Reveal>

          {/* ---- Kitchen photos ----
              The gallery a customer scrolls, and the one an operator approves
              the kitchen on. Each change posts at once — this is the photos
              screen; the wizard keeps its save-at-the-end draft. */}
          <Reveal delay={2}>
            <View style={{ marginTop: 28 }}>
              <SectionHeader
                lead={t('KITCHEN')}
                accent={t('PHOTOS')}
                subtitle={t('Tap to add. Tap a photo to remove it.')}
              />

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginTop: 14,
                }}
              >
                {photos.map((uri) => (
                  <Pressable
                    key={uri}
                    accessibilityRole="button"
                    accessibilityLabel={t('Remove photo')}
                    onPress={() =>
                      alert.confirm({
                        title: t('Remove this photo?'),
                        body: t('It comes off the gallery at once. You can add it back any time.'),
                        confirmLabel: t('Remove'),
                        onConfirm: () => removePhoto(uri),
                      })
                    }
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
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
                    <View
                      style={{
                        position: 'absolute',
                        right: 6,
                        top: 6,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(20, 16, 14, 0.55)',
                      }}
                    >
                      <Icon name="x" size={12} color="#FFFFFF" strokeWidth={2.6} />
                    </View>
                  </Pressable>
                ))}

                {photos.length < MAX_PHOTOS ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Add photos')}
                    onPress={addPhotos}
                    style={({ pressed }) => ({
                      width: 96,
                      height: 96,
                      borderRadius: radius.lg,
                      borderWidth: 1.5,
                      borderStyle: 'dashed',
                      borderColor: pressed ? colors.sage : colors.line,
                      backgroundColor: pressed ? colors.sage50 : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                    })}
                  >
                    <Icon name="plus" size={19} color={colors.sage} strokeWidth={2.2} />
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 10,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: colors.sage,
                      }}
                    >
                      {t('Add')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {photos.length === 0 ? (
                <Text
                  style={{
                    marginTop: 10,
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    lineHeight: type.xs * 1.6,
                    color: colors.textMuted,
                  }}
                >
                  {t('No photos yet. Add a few — customers and the verification queue both read this gallery.')}
                </Text>
              ) : null}
            </View>
          </Reveal>

          {/* ---- Food menu ----
              Adding a dish used to live only under Listings, a screen away
              from the page a cook opens to see their kitchen. A kitchen with
              nothing listed cannot take an order, so the way to add the first
              dish is here, beside the photos, and the last few dishes are
              shown so the section reads as the menu rather than a lone button.
              The full list, with the sold-out switches, is the Menu screen. */}
          <Reveal delay={2}>
            <View style={{ marginTop: 28 }}>
              <SectionHeader
                lead={t('FOOD')}
                accent={t('MENU')}
                subtitle={
                  dishes.length
                    ? t('{live} of {total} available to order right now.', {
                        live: n(liveDishes.length),
                        total: n(dishes.length),
                      })
                    : t('Nothing listed yet. Add your first dish.')
                }
              />

              <View style={{ marginTop: 14 }}>
                <Button
                  label={t('Add a dish')}
                  icon="plus"
                  iconPosition="left"
                  block
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    router.push('/cook/dish/new');
                  }}
                />
              </View>

              {dishes.length ? (
                <View style={{ gap: 10, marginTop: 14 }}>
                  {dishes.slice(0, MENU_PREVIEW).map((dish) => (
                    <Pressable
                      key={dish.id}
                      accessibilityRole="link"
                      accessibilityLabel={`${t('Edit dish')}: ${dish.name}, ৳${n(dish.price)}`}
                      onPress={() => router.push(`/cook/dish/${dish.id}`)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        padding: 10,
                        borderRadius: radius.lg,
                        backgroundColor: pressed ? colors.sunken : colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: colors.line,
                        opacity: dish.available ? 1 : 0.62,
                      })}
                    >
                      <Image
                        source={{ uri: dish.image }}
                        contentFit="cover"
                        transition={150}
                        style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.sunken }}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={{ fontFamily: font.displayBold, fontSize: 15, color: colors.text }}
                        >
                          {dish.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            marginTop: 1,
                            fontFamily: font.uiSemi,
                            fontSize: type.xs,
                            color: dish.available ? colors.sage : colors.textMuted,
                          }}
                        >
                          ৳{n(dish.price)} · {dish.available ? t('Available today') : t('Sold out')}
                        </Text>
                      </View>
                      <Icon name="chevronRight" size={16} color={colors.textLight} strokeWidth={2} />
                    </Pressable>
                  ))}

                  {dishes.length > MENU_PREVIEW ? (
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => router.push('/cook/menu')}
                      style={({ pressed }) => ({ alignSelf: 'center', padding: 8, opacity: pressed ? 0.6 : 1 })}
                    >
                      <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.sage }}>
                        {t('See all {n} dishes', { n: n(dishes.length) })}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Reveal>

          {/* ---- Details ----
              A link to its own page rather than a panel that folded open
              here. Everything behind it is set once and then rarely touched,
              but folded it hid what the values *were*, and open it pushed the
              rows a cook actually uses daily — preview the listing, switch to
              ordering — most of a screen further down. Four fields read and
              saved together are a page. */}
          <Reveal delay={2}>
            <View style={{ marginTop: 28 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Kitchen details')}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  router.push('/cook/kitchen-details');
                }}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 16,
                    padding: 16,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: pressed ? colors.sage100 : colors.line,
                  },
                  shadow.sm,
                ]}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.sage50,
                    borderWidth: 1,
                    borderColor: colors.line2,
                  }}
                >
                  <Icon name="sliders" size={22} color={colors.sage} />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.displayBold,
                      fontSize: 17,
                      letterSpacing: -0.17,
                      color: colors.text,
                    }}
                  >
                    {t('Kitchen details')}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      color: colors.textMuted,
                    }}
                  >
                    {t('Name, specialty, description and delivery radius')}
                  </Text>
                </View>

                <Icon
                  name="chevronRight"
                  size={17}
                  color={colors.textLight}
                  strokeWidth={2}
                />
              </Pressable>
            </View>
          </Reveal>

          {/* ---- Elsewhere ---- */}
          <View style={{ gap: 12, marginTop: 32 }}>
            <ActionRow
              icon="eye"
              title={t('Preview your listing')}
              sub={t('See exactly what a customer sees')}
              onPress={() => router.push(`/chef/${kitchen.id}`)}
            />
            <ActionRow
              icon="cart"
              tone="saffron"
              title={t('Switch to ordering')}
              sub={t('Browse and order as a customer')}
              onPress={async () => {
                await setViewMode('customer');
                router.replace('/');
              }}
            />
            <ActionRow
              icon="user"
              tone="primary"
              title={t('Account details')}
              sub={account?.email || account?.phone || t('Your contact and address')}
              onPress={() => router.push('/edit-profile')}
            />
          </View>

          {/* ---- Log out ---- */}
          <View style={{ marginTop: 24 }}>
            {confirmOut ? (
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
                  {t('Log out of {who}? Your menu and orders stay on this device.', { who: account?.email || account?.phone || t('this account') })}
                </Body>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    variant="glass"
                    label={t('Stay in')}
                    small
                    style={{ flex: 1 }}
                    onPress={() => setConfirmOut(false)}
                  />
                  <Button
                    label={t('Log out')}
                    small
                    style={{ flex: 1 }}
                    onPress={async () => {
                      setConfirmOut(false);
                      /* Drop out of cook mode before signing out, so the gate
                         does not bounce between two panels while the account
                         is being cleared. */
                      await setViewMode('customer');
                      // The token goes with the account, not after it.
                      await Promise.all([signOut(), signOutServer()]);
                      router.replace('/');
                    }}
                  />
                </View>
              </View>
            ) : (
              <Button
                variant="glass"
                label={t('Log out')}
                icon="x"
                iconPosition="left"
                block
                onPress={() => setConfirmOut(true)}
              />
            )}
          </View>
        </Container>
      </KeyboardAvoidingView>
    </CookScreen>
  );
}

function MiniStat({ value, label }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <Text
        style={{
          fontFamily: font.displayExtra,
          fontSize: 19,
          lineHeight: 23,
          letterSpacing: -0.4,
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: 9.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** A tap-anywhere track, no gesture lib — the same one the signup flow uses. */
