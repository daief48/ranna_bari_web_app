import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Reveal from '../src/components/Reveal';
import Button from '../src/components/Button';
import { Badge } from '../src/components/Surfaces';
import { Body, GradientText, Heading, Price, SectionTitle } from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import useResponsive from '../src/theme/useResponsive';
import { font, radius, type } from '../src/theme/tokens';
import { useCart } from '../src/store/CartContext';
import { useMenus } from '../src/data';

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
  const pairing = usePairing(items);

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
  const checkout = () =>
    router.push({
      pathname: '/checkout',
      params: instructions.trim() ? { note: instructions.trim() } : {},
    });

  return (
    <Screen activeIcon="cart">
      <Container>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 32 }}>
          <SectionTitle>YOUR </SectionTitle>
          <GradientText
            style={{
              fontFamily: font.displayExtra,
              fontSize: r.sectionTitle,
              lineHeight: r.sectionTitle * 1.08,
              letterSpacing: r.sectionTitle * -0.012,
            }}
          >
            CART
          </GradientText>
        </View>

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
            <Heading size={20}>Nothing here yet</Heading>
            <Body muted size={15} style={{ textAlign: 'center' }}>
              Pick a kitchen and the dishes you add will show up here.
            </Body>
            <Button
              label="Browse artisans"
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
                      AI Pairing Suggestion
                    </Text>
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.sm,
                        lineHeight: 20,
                        color: colors.textMuted,
                      }}
                    >
                      Goes well with your order: {pairing.name} for ৳{pairing.price}.
                    </Text>
                  </View>
                  <Button
                    variant="glass"
                    label="Add"
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
                  <Badge tone="accent" label={`From: ${chefName}`} />
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
                          label="Decrease quantity"
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
                          {item.qty}
                        </Text>
                        <QtyButton
                          icon="plus"
                          label="Increase quantity"
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
                ← Add more items
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
                  Order Summary
                </Heading>

                <SummaryRow label="Subtotal" value={subtotal} />
                <SummaryRow label="Delivery Fee" value={deliveryFee} />
                <SummaryRow label="Platform Fee" value={platformFee} />

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
                  <Price size={23}>Total</Price>
                  <GradientText
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 23,
                      letterSpacing: -0.46,
                    }}
                  >
                    ৳{total}
                  </GradientText>
                </View>

                <TextInput
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder="Add delivery instructions (optional)"
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

                <Button label="Proceed to checkout" block onPress={checkout} />

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
                    Cash on delivery. Pay the rider at your door.
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
