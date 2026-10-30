import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import ShopCartLine from '../../src/components/ShopCartLine';
import { Badge } from '../../src/components/Surfaces';
import { Body, GradientText, Heading, Price, SectionTitle } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useUnifiedCart } from '../../src/store/useUnifiedCart';
import { useMenus } from '../../src/data';
import { useLang } from '../../src/i18n/LanguageContext';
import { useAlert } from '../../src/components/Alert';
import { errorText } from '../../src/lib/errors';

/** A cheap, honest pairing: the least expensive dish from another kitchen. */
function usePairing(items) {
  const menus = useMenus();
  return useMemo(() => {
    if (!items.length) return null;

    const inCart = new Set(items.map((i) => i.id));
    const chefIds = new Set(items.map((i) => String(i.chefId)));

    const candidates = menus
      .filter((m) => chefIds.has(String(m.chefId)))
      .flatMap((m) => m.items)
      .filter((d) => !inCart.has(d.id))
      .sort((a, b) => a.price - b.price);

    return candidates[0] ?? null;
  }, [items, menus]);
}

/**
 * The cart — kitchen dishes and shop products in one place.
 *
 * Two halves sit behind it (dishes on the device, shop products on the
 * server) and `useUnifiedCart` is what lets this screen not care. Dishes are
 * grouped by kitchen and shop products by shop, each under the same
 * "From: …" badge; there is one summary and one way forward.
 */
export default function CartScreen() {
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const router = useRouter();
  const alert = useAlert();
  const cart = useUnifiedCart();
  const { t, n } = useLang();
  const pairing = usePairing(cart.dishItems);

  /* The dish lines are copies taken the day they were added; the menus in
     memory are today's. Bring the prices level whenever the menus change so
     the total on the button is the total the server will charge. */
  const menus = useMenus();
  const { syncDishPrices } = cart;
  useEffect(() => {
    const byId = new Map();
    for (const menu of menus) {
      for (const dish of menu.items ?? []) byId.set(String(dish.id), dish);
    }
    if (byId.size) syncDishPrices(byId);
  }, [menus, syncDishPrices]);

  const [instructions, setInstructions] = useState('');
  /* The shop line whose round trip is in flight. */
  const [busyLine, setBusyLine] = useState(null);

  /* The cart badge on the navbar shows a single kitchen's order in the web
     build; group the rows the same way so the "FROM:" chip stays truthful. */
  const groups = useMemo(() => {
    const byChef = new Map();
    for (const i of cart.dishItems) {
      const key = i.chefName || 'Your kitchen';
      if (!byChef.has(key)) byChef.set(key, []);
      byChef.get(key).push(i);
    }
    return Array.from(byChef.entries());
  }, [cart.dishItems]);

  /* A shop line's controls talk to the server, so a refusal (the last jar was
     just bought) arrives after the tap and has to be said out loud. */
  const withLine = async (line, run) => {
    if (busyLine) return;
    setBusyLine(line.key);
    const out = await run();
    setBusyLine(null);
    if (out && out.ok === false) {
      alert.error(errorText(out.error, t, n, { ...out, productName: line.name }));
    }
  };

  /* The first thing the server would refuse, said next to the button that it
     would have refused. */
  const blocked = cart.problems.length > 0;
  const blockedWhy = blocked
    ? errorText(cart.problems[0].problem, t, n, { productName: cart.problems[0].name })
    : '';

  /*
   * Sent to sign in from here rather than from checkout.
   *
   * A guest could fill a cart, tap through, and only be told at the payment
   * screen that the whole thing needs an account — two screens after the
   * point where saying so would have cost them nothing.
   *
   * Carry the instructions forward rather than asking for them again on the
   * next screen.
   */
  const checkout = () => {
    const note = instructions.trim();
    /* The signed-out branch used to drop the note on the floor: sign in,
       land on checkout, and the instructions typed a minute ago were gone.
       `next` is a whole in-app path, query included, so it is encoded once
       as a value and the auth screen hands it to the router untouched. */
    if (!cart.isSignedIn) {
      const next = note ? `/checkout?note=${encodeURIComponent(note)}` : '/checkout';
      return router.push({ pathname: '/auth', params: { next } });
    }
    return router.push({
      pathname: '/checkout',
      params: note ? { note } : {},
    });
  };

  /* Shop products need an account to exist at all, so what the shop part of
     the delivery costs is only known once it is there. Said in the row's own
     label rather than a footnote. */
  const shopDeliveryLabel =
    cart.shopSide === 'inside'
      ? t('Delivery (inside {place})', { place: t(cart.shopHome) })
      : cart.shopSide === 'outside'
        ? t('Delivery (outside {place})', { place: t(cart.shopHome) })
        : null;

  return (
    <Screen>
      <Container>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 32 }}>
          <SectionTitle>{t('YOUR')} </SectionTitle>
          <GradientText
            style={{
              fontFamily: font.displayExtra,
              fontSize: r.sectionTitle,
              lineHeight: r.sectionTitle * 1.08,
              letterSpacing: r.sectionTitle * tracking.tight,
            }}
          >
            {t('CART')}
          </GradientText>
        </View>

        {!cart.ready ? (
          /* Both halves are still being read. An empty state here would be a
             guess, and for the half-second it took it was the wrong one. */
          <View style={{ alignItems: 'center', gap: 18, paddingVertical: 60 }}>
            <ActivityIndicator color={colors.primary} />
            <Body muted size={14}>{t('Loading your cart…')}</Body>
          </View>
        ) : cart.isEmpty ? (
          <View style={{ alignItems: 'center', gap: 18, paddingVertical: 40 }}>
            <View
              style={{
                width: 68,
                height: 68,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary50,
              }}
            >
              <Icon name="cart" size={30} color={colors.primary} />
            </View>
            <Heading size={20}>{t('Your cart is empty')}</Heading>
            <Body muted size={15} style={{ textAlign: 'center' }}>
              {t('Pick a kitchen or a shop and what you add will show up here.')}
            </Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              <Button
                label={t('Browse artisans')}
                icon="arrowRight"
                onPress={() => router.replace('/browse')}
              />
              <Button
                variant="glass"
                label={t('Browse shops')}
                onPress={() => router.replace('/stores')}
              />
            </View>
          </View>
        ) : (
          <>
            {/* ---- AI pairing suggestion (dishes only) ---- */}
            {pairing && cart.hasDish ? (
              <Reveal delay={1}>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    marginBottom: 24,
                    borderRadius: radius.md,
                    backgroundColor: colors.saffron50,
                    borderWidth: 1,
                    borderColor: colors.saffron100,
                  }}
                >
                  <Icon name="sparkles" size={24} color={colors.saffron} />
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <Text
                      style={{
                        fontFamily: font.displayBold,
                        fontSize: 16,
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {t('AI Pairing Suggestion')}
                    </Text>
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.sm,
                        lineHeight: 20,
                        color: colors.textMuted,
                      }}
                    >
                      {t('Goes well with your order:')} {pairing.name} — ৳{n(pairing.price)}
                    </Text>
                  </View>
                  <Button
                    variant="glass"
                    label={t('Add')}
                    small
                    onPress={() =>
                      cart.addDish(pairing, {
                        id: cart.dishItems[0].chefId,
                        name: cart.dishItems[0].chefName,
                      })
                    }
                  />
                </View>
              </Reveal>
            ) : null}

            {/* ---- Kitchen dishes, grouped by kitchen ---- */}
            {groups.map(([chefName, rows], gi) => (
              <View key={`dish:${chefName}`} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                  <Badge tone="accent" label={`${t('From:')} ${chefName}`} />
                </View>

                {rows.map((item, i) => (
                  <Reveal key={item.id} delay={gi + i + 1}>
                    <View
                      style={[
                        {
                          alignItems: 'center',
                          gap: 14,
                          padding: 20,
                          marginBottom: 14,
                          borderRadius: radius.lg,
                          backgroundColor: colors.surfaceSolid,
                          borderWidth: 1,
                          borderColor: colors.line,
                        },
                        shadow.sm,
                      ]}
                    >
                      <Image
                        source={{ uri: item.image }}
                        contentFit="cover"
                        transition={200}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: radius.md,
                          backgroundColor: colors.sunken,
                        }}
                      />

                      <View style={{ width: '100%', alignItems: 'center' }}>
                        <Text
                          style={{
                            fontFamily: font.displayBold,
                            fontSize: 17,
                            letterSpacing: -0.34,
                            textAlign: 'center',
                            color: colors.text,
                            marginBottom: 4,
                          }}
                        >
                          {item.name}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={{
                            fontFamily: font.ui,
                            fontSize: type.sm,
                            lineHeight: 20,
                            textAlign: 'center',
                            color: colors.textMuted,
                            marginBottom: 8,
                          }}
                        >
                          {item.description}
                        </Text>
                        <Text
                          style={{
                            fontFamily: font.uiSemi,
                            fontSize: type.sm + 1,
                            color: colors.primary,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          ৳{n(item.price)}
                        </Text>
                      </View>

                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 16,
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: radius.pill,
                          backgroundColor: colors.sunken,
                          borderWidth: 1,
                          borderColor: colors.line2,
                        }}
                      >
                        <QtyButton
                          icon="minus"
                          label={t('Decrease quantity')}
                          onPress={() => cart.updateDishQty(item.id, -1)}
                        />
                        <Text
                          style={{
                            minWidth: 20,
                            textAlign: 'center',
                            fontFamily: font.uiBold,
                            fontSize: type.sm + 1,
                            color: colors.text,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {n(item.qty)}
                        </Text>
                        <QtyButton
                          icon="plus"
                          label={t('Increase quantity')}
                          onPress={() => cart.updateDishQty(item.id, 1)}
                        />
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${t('Remove')} ${item.name}`}
                        hitSlop={8}
                        onPress={() => cart.removeDish(item.id)}
                        style={({ pressed }) => ({
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          padding: 10,
                          opacity: pressed ? 0.6 : 1,
                        })}
                      >
                        <Icon name="x" size={18} color={colors.textLight} />
                      </Pressable>
                    </View>
                  </Reveal>
                ))}
              </View>
            ))}

            {/* ---- Shop products, grouped by shop ---- */}
            {cart.shopGroups.map((group, gi) => (
              <View key={`shop:${group.storeId}`} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  <Badge
                    tone="accent"
                    label={`${t('From:')} ${group.storeName || t('Shop')}`}
                  />
                  <Badge tone="sage" icon="box" label={t('Shop')} />
                </View>

                {group.lines.map((line, i) => (
                  <Reveal key={line.key} delay={groups.length + gi + i + 1}>
                    <ShopCartLine
                      line={line}
                      busy={busyLine === line.key}
                      onQty={(qty) => withLine(line, () => cart.setShopQty(line.key, qty))}
                      onRemove={() => withLine(line, () => cart.removeShopLine(line.key))}
                      onOpen={() => router.push(`/product/${line.productId}`)}
                    />
                  </Reveal>
                ))}
              </View>
            ))}

            {cart.hasPreorder ? (
              <View
                style={{
                  gap: 6,
                  padding: 14,
                  marginBottom: 8,
                  borderRadius: radius.sm,
                  backgroundColor: colors.saffron50,
                  borderWidth: 1,
                  borderColor: colors.saffron100,
                }}
              >
                <Text style={{ fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}>
                  {t('Some of this is a pre-order')}
                </Text>
                <Body muted size={13}>
                  {t(
                    'Pre-ordered items go to the cook as a request and are billed separately from the rest. If the cook cannot take them, that part is refunded in full.',
                  )}
                </Body>
              </View>
            ) : null}

            <Pressable
              onPress={() => router.push('/browse')}
              style={{ marginTop: 16, alignSelf: 'flex-start' }}
            >
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: type.sm + 1,
                  color: colors.primary,
                  textDecorationLine: 'underline',
                }}
              >
                ← {t('Add more items')}
              </Text>
            </Pressable>

            {/* ---- Summary ---- */}
            <Reveal delay={2}>
              <View
                style={[
                  {
                    marginTop: 24,
                    paddingVertical: 24,
                    paddingHorizontal: 20,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: colors.line,
                  },
                  shadow.sm,
                ]}
              >
                <Heading size={22} style={{ marginBottom: 24 }}>
                  {t('Order Summary')}
                </Heading>

                <SummaryRow label={t('Subtotal')} value={n(cart.subtotal)} />

                {/* Dishes and shops are charged differently, so with both in
                    the cart each gets its own line instead of one number
                    nobody could check. */}
                {cart.hasDish && cart.hasShop ? (
                  <>
                    <SummaryRow label={t('Delivery · kitchens')} value={n(cart.dishDelivery)} />
                    <SummaryRow
                      label={shopDeliveryLabel ?? t('Delivery · shops')}
                      value={n(cart.shopDelivery)}
                    />
                  </>
                ) : cart.hasShop ? (
                  <SummaryRow
                    label={shopDeliveryLabel ?? t('Delivery Fee')}
                    value={n(cart.shopDelivery)}
                  />
                ) : (
                  <SummaryRow label={t('Delivery Fee')} value={n(cart.dishDelivery)} />
                )}
                {cart.hasDish ? (
                  <SummaryRow label={t('Platform Fee')} value={n(cart.platformFee)} />
                ) : null}

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
                  <Price size={23}>{t('Total')}</Price>
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

                <TextInput
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder={t('Add delivery instructions (optional)')}
                  placeholderTextColor={colors.textLight}
                  style={{
                    marginTop: 24,
                    marginBottom: 24,
                    paddingVertical: 15,
                    paddingHorizontal: 16,
                    borderRadius: radius.sm,
                    backgroundColor: colors.sunken,
                    borderWidth: 1,
                    borderColor: colors.line,
                    fontFamily: font.ui,
                    fontSize: 16,
                    color: colors.text,
                  }}
                />

                <Button
                  label={blocked ? t('Fix the cart to continue') : t('Proceed to checkout')}
                  block
                  disabled={blocked}
                  onPress={checkout}
                />

                {blocked ? (
                  <Text
                    style={{
                      marginTop: 12,
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

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    marginTop: 16,
                  }}
                >
                  <Icon name="banknote" size={15} color={colors.sage} />
                  <Text
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {/* Everything is paid from the wallet now (cash on delivery
                        is retired for new orders); this only says so, so nobody
                        is surprised at checkout. */}
                    {cart.hasShop
                      ? t('Shop items are paid from your wallet, and held until they reach you.')
                      : t('You pay from your wallet at checkout, and the cook is paid once your food arrives.')}
                  </Text>
                </View>
              </View>
            </Reveal>
          </>
        )}
      </Container>
    </Screen>
  );
}

function SummaryRow({ label, value }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}
    >
      <Text
        style={{ fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}
      >
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

function QtyButton({ icon, label, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 26,
        height: 26,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.primary : 'transparent',
      })}
    >
      {({ pressed }) => (
        <Icon
          name={icon}
          size={16}
          color={pressed ? colors.onPrimary : colors.text}
          strokeWidth={2}
        />
      )}
    </Pressable>
  );
}
