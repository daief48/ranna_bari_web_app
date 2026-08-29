/**
 * The addresses this account delivers to.
 *
 * There used to be exactly one, held on the device, and the profile card
 * printed a "HOME" chip with nothing to contrast against. Home and office is
 * the ordinary case in food delivery — the second most common thing anybody
 * does with a delivery app after ordering — and changing between them meant
 * editing your profile and retyping a street.
 *
 * One of these is always the selected one, and the whole platform reads that
 * one: what a kitchen's radius reaches, what the meals board measures from,
 * where an order is sent. So selecting is the primary action here and the
 * card says which is live rather than leaving it to be inferred.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Button from '../src/components/Button';
import Reveal from '../src/components/Reveal';
import SectionHeader from '../src/components/SectionHeader';
import LocationPicker from '../src/components/LocationPicker';
import FloatLabelInput, { FormNote } from '../src/components/FloatLabelInput';
import { EmptyState, errorText } from '../src/components/MealBits';
import { Body } from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useSession } from '../src/store/SessionContext';
import { useLang } from '../src/i18n/LanguageContext';
import { useAlert } from '../src/components/Alert';

/** The three a person actually has. Anything else they can type. */
const LABELS = ['Home', 'Office', 'Other'];

export default function Addresses() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const alert = useAlert();
  const { isSignedIn } = useAuth();
  const { addresses, saveAddress, selectAddress, removeAddress } = useSession();

  /* `null` = the list. An object = the editor, on that address or a new one. */
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!isSignedIn) {
    return (
      <Screen>
        <Container style={{ paddingTop: 30 }}>
          <EmptyState
            icon="user"
            title={t('Sign in to save addresses')}
            body={t('Your addresses follow your account, so they are there on any device.')}
            action={<Button label={t('Sign in')} onPress={() => router.push('/auth')} />}
          />
        </Container>
      </Screen>
    );
  }

  if (editing) {
    return (
      <Editor
        entry={editing}
        onCancel={() => setEditing(null)}
        onSave={async (draft) => {
          setBusy(true);
          const out = await saveAddress(draft);
          setBusy(false);
          if (!out.ok) {
            alert.error(errorText(out.error, t, n, out));
            return;
          }
          setEditing(null);
          alert.success(t('Address saved.'));
        }}
        busy={busy}
      />
    );
  }

  const choose = async (entry) => {
    if (entry.selected) return;
    Haptics.selectionAsync().catch(() => {});
    const out = await selectAddress(entry.id);
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(t('Delivering to {label} from now on.', { label: t(entry.label) }));
  };

  const forget = async (entry) => {
    const yes = await alert.confirm(
      t('Remove {label}?', { label: t(entry.label) }),
      t('This only removes the address. Your past orders keep the one they were sent to.'),
    );
    if (!yes) return;
    const out = await removeAddress(entry.id);
    if (!out.ok) alert.error(errorText(out.error, t, n, out));
  };

  return (
    <Screen>
      <Container>
        <Back onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />

        <SectionHeader
          lead={t('YOUR')}
          accent={t('ADDRESSES')}
          subtitle={t('Orders go to the one marked delivering. Tap another to switch.')}
          style={{ marginBottom: 22 }}
        />

        {addresses.length ? (
          <View style={{ gap: 12 }}>
            {addresses.map((entry, i) => (
              <Reveal key={entry.id} delay={(i % 5) + 1}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: !!entry.selected }}
                  accessibilityLabel={
                    entry.selected
                      ? `${t(entry.label)} — ${t('Delivering here')}`
                      : `${t(entry.label)} — ${t('Deliver here instead')}`
                  }
                  onPress={() => choose(entry)}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      gap: 13,
                      padding: 15,
                      borderRadius: radius.md,
                      backgroundColor: entry.selected ? colors.primary50 : colors.surfaceSolid,
                      borderWidth: 1,
                      borderColor: entry.selected
                        ? colors.primary100
                        : pressed
                        ? colors.primary200
                        : colors.line,
                    },
                    shadow.sm,
                  ]}
                >
                  <Icon
                    name={entry.selected ? 'navigation' : 'pin'}
                    size={19}
                    color={entry.selected ? colors.primary : colors.textLight}
                    strokeWidth={2}
                  />

                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: type.md,
                          color: colors.text,
                        }}
                      >
                        {t(entry.label)}
                      </Text>
                      {entry.selected ? (
                        <Text
                          style={{
                            fontFamily: font.uiBold,
                            fontSize: 9,
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            color: colors.primary,
                          }}
                        >
                          {t('Delivering here')}
                        </Text>
                      ) : null}
                    </View>

                    <Text
                      numberOfLines={2}
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs + 1,
                        lineHeight: (type.xs + 1) * 1.5,
                        color: colors.textMuted,
                      }}
                    >
                      {[entry.detail, entry.area].filter(Boolean).join(', ') ||
                        t('No street given')}
                    </Text>
                  </View>

                  <View style={{ gap: 10 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('Edit')} ${t(entry.label)}`}
                      hitSlop={8}
                      onPress={() => setEditing(entry)}
                    >
                      <Icon name="sliders" size={17} color={colors.textLight} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('Remove')} ${t(entry.label)}`}
                      hitSlop={8}
                      onPress={() => forget(entry)}
                    >
                      <Icon name="x" size={17} color={colors.textLight} />
                    </Pressable>
                  </View>
                </Pressable>
              </Reveal>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="pin"
            title={t('No addresses yet')}
            body={t('Add where you want food delivered. You can keep more than one.')}
          />
        )}

        <Button
          label={t('Add an address')}
          icon="plus"
          iconPosition="left"
          variant={addresses.length ? 'glass' : 'primary'}
          block
          onPress={() => setEditing({ label: 'Home' })}
          style={{ marginTop: 20 }}
        />
      </Container>
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * the editor
 * ------------------------------------------------------------------ */

function Editor({ entry, onCancel, onSave, busy }) {
  const { colors } = useTheme();
  const { t } = useLang();

  const [label, setLabel] = useState(entry.label ?? 'Home');
  const [area, setArea] = useState(entry.area ?? '');
  const [detail, setDetail] = useState(entry.detail ?? '');
  const [instructions, setInstructions] = useState(entry.instructions ?? '');
  const [pin, setPin] = useState(null);
  const [note, setNote] = useState('');

  const submit = () => {
    if (!detail.trim() && !area.trim()) {
      setNote(t('Give a street or an area so a rider can find you.'));
      return;
    }
    setNote('');
    onSave({
      ...(entry.id ? { id: entry.id } : {}),
      label: label.trim() || 'Home',
      area: area.trim(),
      detail: detail.trim(),
      instructions: instructions.trim(),
      /* Only when moved — editing a label should not silently re-pin the
         address to wherever the map happened to open. */
      ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
    });
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Container>
          <Back onPress={onCancel} label={t('Your addresses')} />

          <SectionHeader
            lead={entry.id ? t('EDIT') : t('NEW')}
            accent={t('ADDRESS')}
            style={{ marginBottom: 20 }}
          />

          <FormNote text={note} />

          {/* The label first: it is what the list is read by. */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
            {LABELS.map((option) => {
              const on = label === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setLabel(option)}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    alignItems: 'center',
                    borderRadius: radius.sm,
                    backgroundColor: on ? colors.primary50 : colors.sunken,
                    borderWidth: 1,
                    borderColor: on ? colors.primary100 : colors.line,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: on ? font.uiBold : font.ui,
                      fontSize: type.sm,
                      color: on ? colors.primary : colors.textMuted,
                    }}
                  >
                    {t(option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <FloatLabelInput
            label={t('House / road / flat')}
            value={detail}
            onChangeText={setDetail}
            placeholder={t('House 12, Road 7, Flat 4B')}
          />
          <FloatLabelInput
            label={t('Area')}
            value={area}
            onChangeText={setArea}
            placeholder={t('Dhanmondi, Dhaka')}
          />
          <FloatLabelInput
            label={t('Note for the rider (optional)')}
            value={instructions}
            onChangeText={setInstructions}
            placeholder={t('Ring twice, the gate bell is broken.')}
          />

          <Body muted size={13} style={{ marginTop: 4, marginBottom: 10 }}>
            {t('The pin is what decides which kitchens can reach you.')}
          </Body>
          <LocationPicker
            height={220}
            center={
              typeof entry.lat === 'number'
                ? { lat: entry.lat, lng: entry.lng, zoom: 16 }
                : undefined
            }
            onChange={setPin}
          />

          <Button
            label={busy ? t('Saving…') : t('Save address')}
            icon="check"
            block
            disabled={busy}
            onPress={submit}
            style={{ marginTop: 22 }}
          />
        </Container>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Back({ onPress, label }) {
  const { colors } = useTheme();
  const { t } = useLang();

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 20,
        alignSelf: 'flex-start',
      }}
    >
      <Icon name="arrowLeft" size={16} color={colors.primary} strokeWidth={2} />
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.xs,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.primary,
        }}
      >
        {label ?? t('Back')}
      </Text>
    </Pressable>
  );
}
