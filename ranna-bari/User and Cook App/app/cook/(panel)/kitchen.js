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
  const { updateKitchen, liveDishes } = useKitchen();
  const { account, setViewMode, signOut } = useAuth();
  const { signOutServer } = useSession();
  const { ordersForKitchen } = useOrders();

  /* Name, specialty, description and radius are edited on their own page now
     — this screen only holds the two photographs and the rows that lead
     elsewhere, so the only state left is what those need. */
  const [note, setNote] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);

  const delivered = ordersForKitchen(kitchen.id).filter(
    (o) => o.status === 'delivered',
  ).length;

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
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      /* Written straight through: a photograph is saved the moment it is
         chosen, and always was — there is no draft here to keep.

         The verdict is read rather than discarded. This call was failing on
         the server for months and nothing here noticed, so the picture simply
         did not change and the screen said nothing about why. */
      setNote('');
      const out = await updateKitchen({ [field]: res.assets[0].uri });
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
