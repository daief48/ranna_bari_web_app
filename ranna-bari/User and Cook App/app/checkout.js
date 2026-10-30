import React, { useRef, useState } from 'react';
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
import { useUnifiedCart } from '../src/store/useUnifiedCart';
import { useAuth } from '../src/store/AuthContext';
import { PAYMENT_METHODS, useOrders } from '../src/store/OrdersContext';
import { useCommerce } from '../src/store/CommerceContext';
import { addressFromAccount } from '../src/lib/ledger';
import { digitsOnly, foldDigits } from '../src/lib/format';
import { useLang } from '../src/i18n/LanguageContext';
import { errorText } from '../src/lib/errors';

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

/**
 * Checkout for the whole cart — kitchen dishes and shop products together.
 *
 * Two kinds of order sit behind one button, and they are not the same thing:
 *
 *   - Shop products are priced and held by the server from the customer's
 *     SAVED address, and are paid from the wallet only.
 *   - Kitchen dishes are priced on the device and may be paid in cash.
 *
 * So the rules here are the ones that keep those two honest:
 *
 *   - Any shop product in the cart makes the whole cart wallet-paid. Cash is
 *     only offered when it is true for everything.
 *   - With a shop product in the cart the address is the saved one, read-only
 *     (change it on the addresses screen). The server prices shop delivery
 *     from that address and never from this form, so a form that let the
 *     customer type another one would show one fee and charge another.
 *   - The wallet is checked against the SUM of both parts before anything is
 *     placed. Each request only checks its own amount; the second could fail
 *     after the first had already taken the money.
 *   - The two parts are separate requests, so they are placed in a safe order
 *     (shop first — it is the one the server can refuse on stock) and a
 *     failure of the second never throws away the first.
 */
function CheckoutForm() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { account, isSignedIn } = useAuth();
  const { placeOrder } = useOrders();
  const shop = useCommerce();
  const cart = useUnifiedCart();
  const balance = shop.wallet?.customer ?? 0;

  /* Prefill from the account the signup flow saved -- the pin it dropped is
     the whole point of that step, so re-typing the address here would be
     asking twice for the same thing. */
  const [name, setName] = useState(account?.name || '');
  const [phone, setPhone] = useState(account?.phone || '');
  const [line, setLine] = useState(account?.addressDetail || '');
  const [area, setArea] = useState(account?.area || '');
  const [label, setLabel] = useState(account?.addressLabel || 'Home');
  const [instructions, setInstructions] = useState(
    typeof params.note === 'string' ? params.note : '',
  );
  const [chosen, setChosen] = useState('cod');
  const [note, setNote] = useState('');
  const [cookNote, setCookNote] = useState('');
  const [placing, setPlacing] = useState(false);
  /* How many orders a half-finished attempt already placed, so the screen can
     say so and point at them instead of leaving the customer to wonder. */
  const [placedCount, setPlacedCount] = useState(0);
  /* A shop checkout whose reply was lost but whose cart came back empty: the
     order very probably exists, and the link to the orders list is the
     honest next step rather than a retry button. */
  const [maybePlaced, setMaybePlaced] = useState(false);
  /* `placing` is state: the button only disables after a re-render, so two taps
     in the same frame both got through `submit`. A ref closes at once. */
  const placingRef = useRef(false);

  const { hasDish, hasShop } = cart;

  /* Cash is only offered when it is true for everything in the cart. */
  const method = hasShop ? 'wallet' : chosen;
  const affordable = balance >= cart.total;
  const shortfall = Math.max(0, cart.total - balance);

  const saved = addressFromAccount(account);
  const blocked = cart.problems.length > 0;
  const blockedWhy = blocked
    ? errorText(cart.problems[0].problem, t, n, { productName: cart.problems[0].name })
    : '';

  const itemCount = cart.count;

  const shopDeliveryLabel =
    cart.shopSide === 'inside'
      ? t('Delivery (inside {place})', { place: t(cart.shopHome) })
      : cart.shopSide === 'outside'
        ? t('Delivery (outside {place})', { place: t(cart.shopHome) })
        : null;

  /*
   * Where sign-in sends somebody back to.
   *
   * An order needs an account, and the old shape of that was: fill in the
   * whole form, press the button, get "Sign in to do that." and be left
   * holding it. Asking first — and returning here afterwards — is the same
   * requirement without the wasted typing.
   */
  const toSignIn = () => router.push('/auth?next=/checkout');

  const toTopUp = () =>
    router.push({ pathname: '/wallet', params: { need: String(shortfall) } });

  const submit = async () => {
    if (!isSignedIn) {
      toSignIn();
      return;
    }

    const hasWhere = hasShop ? !!saved?.line || !!saved?.area : !!line.trim();
    /* Folded to ASCII before anything counts or sends it: a Bengali keyboard
       types ০১৭১২, and a check written for 01712 called that "too short". */
    const phoneAscii = foldDigits(phone).trim();
    if (!name.trim() || !phoneAscii || !hasWhere) {
      setNote(t('We need a name, a phone number and a street address to deliver.'));
      return;
    }
    if (digitsOnly(phoneAscii).length < 10) {
      setNote(t('That phone number looks too short for the rider to call.'));
      return;
    }
    if (blocked) {
      setNote(blockedWhy);
      return;
    }
    /* The whole cart, both halves, against one balance — see the header. */
    if (method === 'wallet' && !affordable) {
      toTopUp();
      return;
    }
    if (placingRef.current) return;
    placingRef.current = true;
    setNote('');
    setPlacedCount(0);
    setMaybePlaced(false);
    setPlacing(true);
    /* Remember wallet if a shop product forced it: a retry after a half-placed
       cart must not quietly turn the rest into cash. */
    if (hasShop) setChosen('wallet');

    const finish = () => {
      placingRef.current = false;
      setPlacing(false);
    };

    /* The address the order carries. With a shop product in the cart it is the
       saved one, so what is written on the order is what the fee was priced
       from. */
    const address = hasShop
      ? { ...saved, instructions: instructions.trim() }
      : {
          label,
          line: line.trim(),
          area: area.trim(),
          lat: account?.lat ?? null,
          lng: account?.lng ?? null,
          instructions: instructions.trim(),
        };
    const cookWords = cookNote.trim() ? { note: cookNote.trim().slice(0, 300) } : {};

    /* ---- 1 · the shop part ----
       First, because it is the part the server can still refuse (a jar sold
       out since the cart was opened) — and a refusal here has taken no money
       and placed nothing, so nothing needs undoing. */
    let shopPlaced = [];
    if (hasShop) {
      const out = await shop.checkout(cart.key, {
        name: name.trim(),
        phone: phoneAscii,
        address,
        ...cookWords,
      });
      if (!out.ok) {
        finish();
        if (out.error === 'unauthenticated') {
          setNote(t('Your session ended. Sign in and your cart will still be here.'));
          toSignIn();
          return;
        }
        /* The reply was lost, and the server's cart has since come back
           empty — which is what a checkout that went through leaves behind.
           Saying "could not reach the server" here invites a second order. */
        if (out.maybePlaced) {
          setMaybePlaced(true);
          setNote(
            t('We lost the connection, but your shop order may have gone through — check your orders before trying again.'),
          );
          return;
        }
        setNote(errorText(out.error, t, n, out));
        return;
      }
      shopPlaced = out.result ?? [];
    }

    /* ---- 2 · the kitchen part ----
       A cart spanning two kitchens is two orders -- two cooks, two queues,
       two receipts. `placeOrder` does that split, so this gets a list back
       however many kitchens were involved. */
    let dishPlaced = [];
    if (hasDish) {
      const out = await placeOrder({
        paymentMethod: method,
        items: cart.dishItems,
        subtotal: cart.dishSubtotal,
        deliveryFee: cart.dishDelivery,
        platformFee: cart.platformFee,
        total: cart.dishTotal,
        contact: { name: name.trim(), phone: phoneAscii },
        address,
        ...cookWords,
      });

      /* A refusal that names a dish: `request-invalid` with `detail.field`
         of `items` means a line is no longer on that kitchen's menu, and
         `detail.id` says which. Taking it out of the basket is the only
         repair the customer could make, so it is made for them, and the
         sentence beside the cart says why it shrank. */
      const dropGoneDish = (detail) => {
        if (detail?.field !== 'items') return false;
        const gone = detail.id != null ? String(detail.id) : null;
        const line = gone ? cart.dishItems.find((it) => String(it.id) === gone) : null;
        if (line) cart.removeDish(line.id);
        return !!line;
      };

      /* What was already placed above is real and stays real: say so, and
         leave the kitchen part in the cart exactly as it was. */
      const hadShop = shopPlaced.length > 0;
      const prefix = hadShop
        ? `${t('Your shop order was placed, but the kitchen order was not.')} `
        : '';

      /* The order is the server's now, so this can genuinely fail -- a kitchen
         it has never heard of, or a network that dropped. The cart is left
         exactly as it was so the customer can press the button again. */
      if (!out.ok) {
        finish();
        setPlacedCount(shopPlaced.length);
        /*
         * Say which failure it was.
         *
         * A session that has expired or been revoked looks exactly like a
         * glitch from here, and somebody with a full cart retries until they
         * give up. Nothing here can fix it and retrying never will, so this
         * goes where the answer is rather than reporting a dead end.
         */
        if (out.error === 'unauthenticated') {
          setNote(t('Your session ended. Sign in and your cart will still be here.'));
          toSignIn();
          return;
        }
        /* `out.detail` is the refused row's detail once `placeOrder` passes
           it through: the real shortfall for `wallet-low-balance`, the dish
           id for `request-invalid`. */
        dropGoneDish(out.detail);
        if (out.error === 'wallet-low-balance' && out.detail?.short != null) {
          /* The server's own shortfall, not the one worked out from the
             preview — the two differ exactly when the fees did. */
          setNote(`${prefix}${errorText(out.error, t, n, out)}`);
          router.push({ pathname: '/wallet', params: { need: String(out.detail.short) } });
          return;
        }
        setNote(`${prefix}${errorText(out.error, t, n, out)}`);
        return;
      }

      /* A cart spanning two kitchens can be half taken: one cook closed, one
         dish sold out. Clearing it whole threw the refused kitchen's items away
         with no word. Only what was ordered leaves the cart; the rest stays,
         with the reason beside it. */
      if (out.refused?.length) {
        finish();
        const refusedKitchens = new Set(out.refused.map((r) => String(r.chefId)));
        cart.dishItems
          .filter((it) => !refusedKitchens.has(String(it.chefId ?? 'unknown')))
          .forEach((it) => cart.removeDish(it.id));
        /* And within a refused kitchen, the one dish the server named as
           gone — the rest of that kitchen's lines stay for the retry. */
        for (const r of out.refused) dropGoneDish(r.detail);
        setPlacedCount(shopPlaced.length + (out.result?.length ?? 0));
        const first = out.refused[0];
        setNote(
          `${prefix}${t(
            'One kitchen could not take its part of your order, so it is still in your cart: {reason}',
            { reason: errorText(first.error, t, n, { ...out, detail: first.detail }) },
          )}`,
        );
        return;
      }

      dishPlaced = out.result ?? [];
      // Emptied only after the orders exist, so a failure could never lose it.
      cart.clearDishes();
    }

    finish();

    /* One order gets its receipt; several go to the list, because no single
       receipt would be honest about the others. */
    const receipts = [
      ...shopPlaced.map((o) => `/store-order/${o.id}`),
      ...dishPlaced.map((o) => `/order/${o.id}`),
    ];
    router.replace(receipts.length === 1 ? receipts[0] : '/orders');
  };

  /* Neither half of the cart has been read yet. The empty state below would
     be a guess at this point, and the wrong one for anyone who just tapped
     "Proceed to checkout" on a full basket. */
  if (!cart.ready) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', paddingTop: 60 }}>
          <ActivityIndicator color={colors.primary} />
        </Container>
      </Screen>
    );
  }

  /* Signed out: sent to sign in before a form is shown, not after it is filled
     in. The dishes stay on the device across sign-in. */
  if (!isSignedIn && !cart.isEmpty) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', gap: 18, paddingTop: 40 }}>
          <IconTile name="user" large />
          <Heading size={20}>{t('Sign in to check out')}</Heading>
          <Body muted size={15} style={{ textAlign: 'center' }}>
            {t('Your cart will still be here when you come back.')}
          </Body>
          <Button label={t('Sign in')} icon="arrowRight" onPress={toSignIn} />
        </Container>
      </Screen>
    );
  }

  if (cart.isEmpty) {
    return (
      <Screen>
        <Container style={{ alignItems: 'center', gap: 18, paddingTop: 40 }}>
          <IconTile name="cart" large />
          <Heading size={20}>{t('Your cart is empty')}</Heading>
          <Body muted size={15} style={{ textAlign: 'center' }}>
            {maybePlaced
              ? t('We lost the connection, but your shop order may have gone through — check your orders before trying again.')
              : t('Add something before checking out.')}
          </Body>
          {placedCount || maybePlaced ? (
            <Button label={t('View my orders')} onPress={() => router.replace('/orders')} />
          ) : null}
          <Button
            label={t('Browse artisans')}
            icon="arrowRight"
            onPress={() => router.replace('/browse')}
          />
        </Container>
      </Screen>
    );
  }

  const where = [saved?.line, saved?.area].filter(Boolean).join(', ');
  const region = [cart.account?.district, cart.account?.division].filter(Boolean).join(', ');

  return (
    <Screen glow="both">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Container>
          <SectionHeader
            lead={t('SECURE')}
            accent={t('CHECKOUT')}
            subtitle={t(itemCount === 1 ? '{n} item' : '{n} items', { n: n(itemCount) })}
            style={{ marginBottom: 24 }}
          />

          <FormNote text={note} />
          {placedCount || maybePlaced ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/orders')}
              style={{ marginBottom: 12, alignSelf: 'flex-start' }}
            >
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.sm,
                  color: colors.primary,
                  textDecorationLine: 'underline',
                }}
              >
                {t('View my orders')}
              </Text>
            </Pressable>
          ) : null}

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

              {hasShop ? (
                /* The saved address, read-only. Shop delivery is priced from it
                   on the server, so this card is the address — not a draft of
                   one. Change it where addresses are kept. */
                <View
                  style={{
                    gap: 6,
                    padding: 14,
                    marginBottom: 14,
                    borderRadius: radius.md,
                    backgroundColor: colors.sunken,
                    borderWidth: 1,
                    borderColor: colors.line2,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="pin" size={15} color={colors.sage} />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: font.uiBold,
                        fontSize: type.sm + 1,
                        color: colors.text,
                      }}
                    >
                      {t(saved?.label || 'Home')}
                    </Text>
                    <Pressable
                      accessibilityRole="link"
                      hitSlop={8}
                      onPress={() => router.push('/addresses')}
                    >
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: type.sm,
                          color: colors.primary,
                        }}
                      >
                        {saved ? t('Change') : t('Add address')}
                      </Text>
                    </Pressable>
                  </View>
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      lineHeight: 20,
                      color: colors.textMuted,
                    }}
                  >
                    {where || t('No delivery address saved yet.')}
                    {region ? `\n${region}` : ''}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      lineHeight: type.xs * 1.5,
                      color: colors.textLight,
                    }}
                  >
                    {t('Shop delivery is priced from this saved address.')}
                  </Text>
                  {cart.needsDivision ? (
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => router.push('/addresses')}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        padding: 10,
                        marginTop: 4,
                        borderRadius: radius.sm,
                        backgroundColor: colors.saffron50,
                        borderWidth: 1,
                        borderColor: colors.saffron100,
                      }}
                    >
                      <Icon name="alertCircle" size={14} color={colors.saffron} />
                      <Text
                        style={{
                          flex: 1,
                          fontFamily: font.ui,
                          fontSize: type.xs + 1,
                          color: colors.text,
                        }}
                      >
                        {t(
                          'Add a delivery address with your division, so the right delivery fee applies.',
                        )}
                      </Text>
                      <Icon name="chevronRight" size={13} color={colors.saffron} />
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <>
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
                </>
              )}

              <View style={{ marginTop: 20 }}>
                <FloatLabelInput
                  label={t('Delivery instructions')}
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder={t('Gate code, landmark, ring twice…')}
                />
              </View>

              {/* For the cook, not the rider — a separate question that used to
                  have nowhere to be asked. "Jhal kom" goes to the kitchen. */}
              <View style={{ marginTop: 14 }}>
                <FloatLabelInput
                  label={t('Note for the cook (optional)')}
                  value={cookNote}
                  onChangeText={setCookNote}
                  placeholder={t('Anything the cook should know? Less spicy, less sweet…')}
                  multiline
                />
                {cookNote.length > 260 ? (
                  <Body muted size={11} style={{ marginTop: 2 }}>
                    {n(300 - cookNote.length)}
                  </Body>
                ) : null}
              </View>
            </View>
          </Reveal>

          {/* ---- 2 · Payment ---- */}
          <Reveal delay={2}>
            <View style={[card(colors), shadow.sm, { marginTop: 16 }]}>
              <StepHeading n="2" icon="banknote" title={t("How you'll pay")} />

              <View style={{ gap: 12 }}>
                {PAYMENT_METHODS.map((m) => {
                  /* Cash is only true for a cart of dishes; a shop product makes
                     the whole cart wallet-paid. */
                  const cashBarred = m.key === 'cod' && hasShop;
                  /* Offered only when it can actually pay: an option that is
                     always refused costs a tap to learn nothing. */
                  const usable =
                    m.key === 'wallet' ? affordable : cashBarred ? false : m.available;
                  const on = method === m.key;
                  /* A wallet that cannot cover the order is still a door, not a
                     dead row: tapping it goes to the top-up page, with the
                     shortfall filled in. */
                  const topUpFirst = m.key === 'wallet' && !affordable;
                  return (
                    <Pressable
                      key={m.key}
                      accessibilityRole={topUpFirst ? 'link' : 'radio'}
                      accessibilityState={{ selected: on, disabled: !usable && !topUpFirst }}
                      disabled={!usable && !topUpFirst}
                      onPress={() => (topUpFirst ? toTopUp() : setChosen(m.key))}
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
                          opacity: m.available && !cashBarred ? 1 : 0.55,
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
                        {/* A disabled row that says nothing reads as broken. */}
                        {cashBarred ? (
                          <Text
                            style={{
                              marginTop: 8,
                              fontFamily: font.uiSemi,
                              fontSize: 12.5,
                              lineHeight: 18,
                              color: colors.saffron,
                            }}
                          >
                            {t('Not available with shop items — they are paid from your wallet.')}
                          </Text>
                        ) : null}
                        {/* The only reason the wallet can be locked is the
                            balance, so say that, with the gap and the way to
                            close it. */}
                        {m.key === 'wallet' && !affordable ? (
                          <Text
                            style={{
                              marginTop: 8,
                              fontFamily: font.uiSemi,
                              fontSize: 12.5,
                              lineHeight: 18,
                              color: colors.primary,
                            }}
                          >
                            {t('Balance ৳{have} — add ৳{short} more to use the wallet. Top up', {
                              have: n(balance),
                              short: n(shortfall),
                            })}
                          </Text>
                        ) : null}
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
                    {t('Keep ৳{total} in cash ready. Riders carry limited change, so exact notes help.', { total: n(cart.total) })}
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
                {cart.dishItems.map((i) => (
                  <SummaryItem
                    key={`dish:${i.id}`}
                    image={i.image}
                    name={i.name}
                    meta={`৳${n(i.price)} × ${n(i.qty)}`}
                    total={i.price * i.qty}
                  />
                ))}
                {cart.shopLines.map((l) => (
                  <SummaryItem
                    key={`shop:${l.key}`}
                    image={l.image}
                    name={l.name || t('That product is no longer listed.')}
                    meta={`${l.option ? `${l.option} · ` : ''}৳${n(l.unitPrice)} × ${n(l.qty)}${
                      l.preorder ? ` · ${t('Pre-order')}` : ''
                    }`}
                    total={l.lineTotal}
                    problem={
                      l.problem
                        ? errorText(l.problem, t, n, {
                            productName: l.name,
                            stock: l.stock,
                            max: l.maxQty,
                          })
                        : null
                    }
                  />
                ))}
              </View>

              <Row label={t('Subtotal')} value={n(cart.subtotal)} />
              {hasDish && hasShop ? (
                <>
                  <Row label={t('Delivery · kitchens')} value={n(cart.dishDelivery)} />
                  <Row
                    label={shopDeliveryLabel ?? t('Delivery · shops')}
                    value={n(cart.shopDelivery)}
                  />
                </>
              ) : hasShop ? (
                <Row label={shopDeliveryLabel ?? t('Delivery Fee')} value={n(cart.shopDelivery)} />
              ) : (
                <Row label={t('Delivery Fee')} value={n(cart.dishDelivery)} />
              )}
              {hasDish ? <Row label={t('Platform Fee')} value={n(cart.platformFee)} /> : null}

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
                <Price size={23}>{method === 'cod' ? t('Pay on delivery') : t('Total')}</Price>
                <GradientText
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 23,
                    letterSpacing: -0.46,
                  }}
                >
                  ৳{n(cart.total)}
                </GradientText>
              </View>
            </View>
          </Reveal>

          <View style={{ marginTop: 24, gap: 12 }}>
            {/* The button says what the next tap does. */}
            <Button
              label={
                placing
                  ? t('Placing…')
                  : blocked
                    ? t('Fix the cart to continue')
                    : method === 'wallet' && !affordable
                      ? t('Top up to continue')
                      : t('Place order · ৳{total}', { total: n(cart.total) })
              }
              icon="arrowRight"
              block
              disabled={placing || blocked}
              onPress={submit}
            />
            {blocked ? (
              <Text
                style={{
                  textAlign: 'center',
                  fontFamily: font.uiSemi,
                  fontSize: type.xs + 1,
                  lineHeight: (type.xs + 1) * 1.5,
                  color: colors.saffron,
                }}
              >
                {blockedWhy}
              </Text>
            ) : null}
            <Text
              style={{
                textAlign: 'center',
                fontFamily: font.ui,
                fontSize: type.xs,
                lineHeight: 19,
                color: colors.textMuted,
              }}
            >
              {method === 'cod'
                ? t('No card needed. You pay the rider in cash at your door.')
                : t('The cook is paid only after you confirm the food arrived.')}
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

/** One line of what is being bought, from either half of the cart. */
function SummaryItem({ image, name, meta, total, problem }) {
  const { colors } = useTheme();
  const { n } = useLang();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Image
        source={{ uri: image }}
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
          {name}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.ui,
            fontSize: type.xs,
            color: colors.textMuted,
          }}
        >
          {meta}
        </Text>
        {problem ? (
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: type.xs,
              lineHeight: type.xs * 1.5,
              color: colors.saffron,
            }}
          >
            {problem}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.sm + 1,
          color: colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        ৳{n(total)}
      </Text>
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
