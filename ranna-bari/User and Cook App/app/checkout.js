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
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Reveal from '../src/components/Reveal';
import Button from '../src/components/Button';
import FloatLabelInput, { FormNote } from '../src/components/FloatLabelInput';
import SectionHeader from '../src/components/SectionHeader';
import { IconTile } from '../src/components/Surfaces';
import { Body, GradientText, Heading, Price } from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../src/theme/tokens';
import { useCart } from '../src/store/CartContext';
import { useAuth } from '../src/store/AuthContext';
import { PAYMENT_METHODS, useOrders } from '../src/store/OrdersContext';
import { DEMO_CHECKOUT } from '../src/lib/demoData';
import { useLang } from '../src/i18n/LanguageContext';

const LABELS = [
  ['Home', 'home'],
  ['Work', 'box'],
  ['Other', 'pin'],
];

/** Waits for the stored account before seeding the form -- see edit-profile. */
export default function CheckoutScreen() {
  const { colors } = useTheme();
  const { hydrated } = useAuth();

  if (!hydrated) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', paddingTop: 60 }}>
          <ActivityIndicator color={colors.primary} />
        </Container>
      </Screen>
    );
  }
  return <CheckoutForm />;
}

function CheckoutForm() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { account } = useAuth();
  const { placeOrder } = useOrders();
  const {
    items,
    subtotal,
    deliveryFee,
    platformFee,
    total,
    clear,
  } = useCart();

  /* Prefill from the account the signup flow saved -- the pin it dropped is
     the whole point of that step, so re-typing the address here would be
     asking twice for the same thing. */
  const [name, setName] = useState(account?.name || DEMO_CHECKOUT.name);
  const [phone, setPhone] = useState(account?.phone || DEMO_CHECKOUT.phone);
  const [line, setLine] = useState(account?.addressDetail || DEMO_CHECKOUT.line);
  const [area, setArea] = useState(account?.area || DEMO_CHECKOUT.area);
  const [label, setLabel] = useState(account?.addressLabel || DEMO_CHECKOUT.label);
  const [instructions, setInstructions] = useState(
    typeof params.note === 'string' ? params.note : '',
  );
  const [method, setMethod] = useState('cod');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);

  const chefName = items[0]?.chefName ?? '';
  const itemCount = useMemo(
    () => items.reduce((s, i) => s + i.qty, 0),
    [items],
  );

  const submit = () => {
    if (!name.trim() || !phone.trim() || !line.trim()) {
      setNote(t('We need a name, a phone number and a street address to deliver.'));
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setNote(t('That phone number looks too short for the rider to call.'));
      return;
    }
    setNote('');
    setPlacing(true);

    /* A basket spanning two kitchens is two orders -- two cooks, two queues,
       two receipts. `placeOrder` does that split, so this gets a list back
       however many kitchens were involved. */
    const placed = placeOrder({
      paymentMethod: method,
      items,
      subtotal,
      deliveryFee,
      platformFee,
      total,
      contact: { name: name.trim(), phone: phone.trim() },
      address: {
        label,
        line: line.trim(),
        area: area.trim(),
        lat: account?.lat ?? null,
        lng: account?.lng ?? null,
        instructions: instructions.trim(),
      },
    });

    // The cart is emptied only after the order exists, so a failure here
    // could never lose the basket.
    clear();
    // One kitchen gets its receipt; several go to the list, because no single
    // receipt would be honest about the others.
    router.replace(placed.length === 1 ? `/order/${placed[0].id}` : '/orders');
  };

  if (!items.length) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', gap: 18, paddingTop: 40 }}>
          <IconTile name="cart" large />
          <Heading size={20}>{t('Your cart is empty')}</Heading>
          <Body muted size={15} style={{ textAlign: 'center' }}>
            {t('Add a dish before checking out.')}
          </Body>
          <Button
            label={t('Browse artisans')}
            icon="arrowRight"
            onPress={() => router.replace('/browse')}
          />
        </Container>
      </Screen>
    );
  }

  return (
    <Screen glow="both">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Container>
          <SectionHeader
            lead={t('SECURE')}
            accent={t('CHECKOUT')}
            subtitle={
              chefName
                ? `${t(itemCount === 1 ? '{n} item' : '{n} items', { n: n(itemCount) })} — ${chefName}`
                : t(itemCount === 1 ? '{n} item' : '{n} items', { n: n(itemCount) })
            }
            style={{ marginBottom: 24 }}
          />

          <FormNote text={note} />

          {/* ---- 1 · Deliver to ---- */}
          <Reveal delay={1}>
            <View style={[card(colors), shadow.sm]}>
              <StepHeading n="1" icon="pin" title={t('Deliver to')} />

              <FloatLabelInput
                label={t('Full name')}
                value={name}
                onChangeText={setName}
                placeholder={t('Who should the rider ask for?')}
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

              <View style={{ marginTop: 20 }}>
                <FloatLabelInput
                  label={t('Delivery instructions')}
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder={t('Gate code, landmark, ring twice…')}
                  style={{ marginBottom: 0 }}
                />
              </View>
            </View>
          </Reveal>

          {/* ---- 2 · Payment ---- */}
          <Reveal delay={2}>
            <View style={[card(colors), shadow.sm, { marginTop: 16 }]}>
              <StepHeading n="2" icon="banknote" title={t("How you'll pay")} />

              <View style={{ gap: 12 }}>
                {PAYMENT_METHODS.map((m) => {
                  const on = method === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: !m.available }}
                      disabled={!m.available}
                      onPress={() => setMethod(m.key)}
                      style={[
                        {
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: 14,
                          padding: 16,
                          borderRadius: radius.md,
                          borderWidth: 1.5,
                          borderColor: on ? colors.primary : colors.line,
                          backgroundColor: on ? colors.surfaceSolid : colors.sunken,
                          opacity: m.available ? 1 : 0.55,
                        },
                        on ? shadow.md : null,
                      ]}
                    >
                      <IconTile
                        name={m.icon}
                        variant={on ? 'primary' : 'sage'}
                        style={{ width: 44, height: 44, borderRadius: 14 }}
                      />

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: font.displayBold,
                              fontSize: 17,
                              letterSpacing: -0.2,
                              color: colors.text,
                            }}
                          >
                            {t(m.title)}
                          </Text>
                          {!m.available ? (
                            <View
                              style={{
                                paddingVertical: 3,
                                paddingHorizontal: 9,
                                borderRadius: radius.pill,
                                backgroundColor: colors.saffron50,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: font.uiBold,
                                  fontSize: 9.5,
                                  letterSpacing: 0.7,
                                  textTransform: 'uppercase',
                                  color: colors.saffron,
                                }}
                              >
                                {t('Soon')}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text
                          style={{
                            fontFamily: font.ui,
                            fontSize: 13,
                            lineHeight: 20,
                            color: colors.textMuted,
                          }}
                        >
                          {t(m.desc)}
                        </Text>
                      </View>

                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          marginTop: 2,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1.5,
                          borderColor: on ? 'transparent' : colors.line,
                          backgroundColor: on ? colors.primary : 'transparent',
                        }}
                      >
                        {on ? (
                          <Icon name="check" size={13} color="#FFFFFF" strokeWidth={3} />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {method === 'cod' ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginTop: 16,
                    padding: 14,
                    borderRadius: radius.md,
                    backgroundColor: colors.saffron50,
                    borderWidth: 1,
                    borderColor: colors.saffron100,
                  }}
                >
                  <Icon name="alertCircle" size={17} color={colors.saffron} />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: font.ui,
                      fontSize: 13,
                      lineHeight: 20,
                      color: colors.textMuted,
                    }}
                  >
                    {t('Keep ৳{total} in cash ready. Riders carry limited change, so exact notes help.', { total: n(total) })}
                  </Text>
                </View>
              ) : null}
            </View>
          </Reveal>

          {/* ---- 3 · Summary ---- */}
          <Reveal delay={3}>
            <View style={[card(colors), shadow.sm, { marginTop: 16 }]}>
              <StepHeading n="3" icon="receipt" title={t('Order summary')} />

              <View style={{ gap: 12, marginBottom: 20 }}>
                {items.map((i) => (
                  <View
                    key={i.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <Image
                      source={{ uri: i.image }}
                      contentFit="cover"
                      transition={150}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 13,
                        backgroundColor: colors.sunken,
                      }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: type.sm + 1,
                          color: colors.text,
                        }}
                      >
                        {i.name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        ৳{n(i.price)} × {n(i.qty)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: type.sm + 1,
                        color: colors.text,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      ৳{n(i.price * i.qty)}
                    </Text>
                  </View>
                ))}
              </View>

              <Row label={t('Subtotal')} value={n(subtotal)} />
              <Row label={t('Delivery Fee')} value={n(deliveryFee)} />
              <Row label={t('Platform Fee')} value={n(platformFee)} />

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 16,
                  paddingTop: 16,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                }}
              >
                <Price size={23}>{t('Pay on delivery')}</Price>
                <GradientText
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 23,
                    letterSpacing: -0.46,
                  }}
                >
                  ৳{n(total)}
                </GradientText>
              </View>
            </View>
          </Reveal>

          <View style={{ marginTop: 24, gap: 12 }}>
            <Button
              label={placing ? t('Placing…') : t('Place order · ৳{total}', { total: n(total) })}
              icon="arrowRight"
              block
              disabled={placing}
              onPress={submit}
            />
            <Text
              style={{
                textAlign: 'center',
                fontFamily: font.ui,
                fontSize: type.xs,
                lineHeight: 19,
                color: colors.textMuted,
              }}
            >
              {t('No card needed. You pay the rider in cash at your door.')}
            </Text>
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

/** The numbered heading each checkout card opens with. */
function StepHeading({ n, icon, title }) {
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
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary50,
        }}
      >
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: 12,
            color: colors.primary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {n}
        </Text>
      </View>
      <Heading size={19} style={{ flex: 1 }}>
        {title}
      </Heading>
      <Icon name={icon} size={19} color={colors.textLight} />
    </View>
  );
}

function Row({ label, value }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}
    >
      <Text style={{ fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: font.uiMedium,
          fontSize: type.sm,
          color: colors.textMuted,
          fontVariant: ['tabular-nums'],
        }}
      >
        ৳{value}
      </Text>
    </View>
  );
}
