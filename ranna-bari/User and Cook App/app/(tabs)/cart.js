import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import { Badge } from '../../src/components/Surfaces';
import { Body, GradientText, Heading, Price, SectionTitle } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useCart } from '../../src/store/CartContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { customerKeyOf } from '../../src/lib/ledger';
import { useAuth } from '../../src/store/AuthContext';
import { useMenus } from '../../src/data';
import { useLang } from '../../src/i18n/LanguageContext';

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

export default function CartScreen() {
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const router = useRouter();
  const {
    items,
    subtotal,
    deliveryFee,
    platformFee,
    total,
    updateQty,
    remove,
    add,
  } = useCart();

  const [instructions, setInstructions] = useState('');
  const { t, n } = useLang();
  const pairing = usePairing(items);

  /* The shop basket, which is a different basket: wallet-paid, stock-checked
     and held in escrow. Summarised here rather than merged in, because
     merging two payment rails into one list would make the totals a lie. */
  const { account, isSignedIn } = useAuth();
  const shop = useCommerce();
  const shopPriced = shop.priceCart(customerKeyOf(account));
  const shopCount = shopPriced.lines.reduce((sum, l) => sum + l.qty, 0);

  /* The cart badge on the navbar shows a single kitchen's order in the web
     build; group the rows the same way so the "FROM:" chip stays truthful. */
  const groups = useMemo(() => {
    const byChef = new Map();
    for (const i of items) {
      const key = i.chefName || 'Your kitchen';
      if (!byChef.has(key)) byChef.set(key, []);
      byChef.get(key).push(i);
    }
    return Array.from(byChef.entries());
  }, [items]);

  /* Carry the instructions forward rather than asking for them again on the
     next screen -- the field exists here because the web build had no
     checkout page to put it on. */
  /*
   * Sent to sign in from here rather than from checkout.
   *
   * A guest could fill a basket, tap through, and only be told at the
   * payment screen that the whole thing needs an account — two screens after
   * the point where saying so would have cost them nothing.
   */
  const checkout = () => {
    if (!isSignedIn) return router.push('/auth');
    return router.push({
      pathname: '/checkout',
      params: instructions.trim() ? { note: instructions.trim() } : {},
    });
  };

  const checkoutShelf = () =>
    isSignedIn ? router.push('/store-checkout') : router.push('/auth');

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

        {shopCount ? (
          <View
            style={[
              {
                padding: 16,
                marginBottom: 24,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
              },
              shadow.sm,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primary50,
                }}
              >
                <Icon name="box" size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ fontFamily: font.uiSemi, fontSize: type.sm + 2, color: colors.text }}
                >
                  {t('From the shelf')}
                </Text>
                <Text
                  style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                >
                  {t('Paid from your wallet, and held until it reaches you.')}
                </Text>
              </View>
            </View>

            {/* The lines themselves, so nothing about this basket is hidden
                behind a tap. */}
            <View style={{ gap: 8, marginTop: 14 }}>
              {shopPriced.lines.map((line) => (
                <View
                  key={line.key ?? line.productId}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      color: colors.text,
                    }}
                  >
                    {/* The server's cart line carries the name; the local
                        product lookup is empty for a shop the customer has
                        not opened, which is most of them. */}
                    {line.name ?? line.product?.name ?? t('Item')}
                    <Text style={{ color: colors.textMuted }}>{`  ×${n(line.qty)}`}</Text>
                  </Text>
                  {line.preorder ? (
                    <Text
                      style={{ fontFamily: font.uiBold, fontSize: 10, color: colors.saffron }}
                    >
                      {t('Pre-order')}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.sm,
                      color: colors.text,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    ৳{n(line.lineTotal)}
                  </Text>
                </View>
              ))}
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 14,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: colors.line2,
              }}
            >
              <Text
                style={{ flex: 1, fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}
              >
                {t('{n} items', { n: n(shopCount) })}
              </Text>
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.md,
                  color: colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                ৳{n(shopPriced.total)}
              </Text>
            </View>

            <Button
              label={t('Place shop order')}
              block
              onPress={checkoutShelf}
              style={{ marginTop: 12 }}
            />
          </View>
        ) : null}

        {!items.length ? (
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
            <Heading size={20}>
              {shopCount ? t('No kitchen dishes yet') : t('Nothing here yet')}
            </Heading>
            <Body muted size={15} style={{ textAlign: 'center' }}>
              {t('Pick a kitchen and the dishes you add will show up here.')}
            </Body>
            <Button
              label={t('Browse artisans')}
              icon="arrowRight"
              onPress={() => router.replace('/browse')}
            />
          </View>
        ) : (
          <>
            {/* ---- AI pairing suggestion ---- */}
            {pairing ? (
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
                      add(pairing, { id: items[0].chefId, name: items[0].chefName })
                    }
                  />
                </View>
              </Reveal>
            ) : null}

            {/* ---- Items, grouped by kitchen ---- */}
            {groups.map(([chefName, rows], gi) => (
              <View key={chefName} style={{ marginBottom: 8 }}>
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
                          ৳{item.price}
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
                          onPress={() => updateQty(item.id, -1)}
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
                          onPress={() => updateQty(item.id, 1)}
                        />
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.name}`}
                        hitSlop={8}
                        onPress={() => remove(item.id)}
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

                <SummaryRow label={t('Subtotal')} value={n(subtotal)} />
                <SummaryRow label={t('Delivery Fee')} value={n(deliveryFee)} />
                <SummaryRow label={t('Platform Fee')} value={n(platformFee)} />

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
                    ৳{n(total)}
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

                <Button label={t('Proceed to checkout')} block onPress={checkout} />

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
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {t('Cash on delivery. Pay the rider at your door.')}
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
