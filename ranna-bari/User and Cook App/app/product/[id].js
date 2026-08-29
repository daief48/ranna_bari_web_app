/**
 * One product.
 *
 * The whole screen turns on one distinction: is this on the shelf, or is it
 * something the cook will make if you ask. Those are different promises and
 * they cost the customer different things -- one arrives, the other has to be
 * agreed to first -- so they never share a button, a colour or a sentence.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Button from '../../src/components/Button';
import { Body, Heading, Price } from '../../src/components/Typography';
import { EmptyState, errorText } from '../../src/components/MealBits';
import { QtyStepper, Skeleton, StockPill, Placeholder } from '../../src/components/StoreBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { customerKeyOf } from '../../src/lib/ledger';
import { useLang } from '../../src/i18n/LanguageContext';
import { useAlert } from '../../src/components/Alert';
import { useNavbarOffset } from '../../src/components/Navbar';

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  /* The back chip clears the floating navbar on every device. */
  const backTop = useNavbarOffset() - 18;
  const alert = useAlert();
  const r = useResponsive();
  const router = useRouter();
  const { account, isSignedIn } = useAuth();
  const shop = useCommerce();

  /* Reachable by link, so the shelf this sits on may never have been
     fetched. `ensureProduct` brings the shop with it, because availability
     is a reading of the two together. */
  const { ensureProduct } = shop;

  /*
   * `asked` separates "not here yet" from "not here".
   *
   * On a cold open — a shared link, a reload — nothing has been fetched when
   * this first renders, and the guard below used to read that as a deleted
   * product and say so. A real product, in stock, telling the customer it is
   * no longer listed for as long as the request took. Only a settled request
   * makes an empty lookup mean anything.
   */
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    let alive = true;
    setAsked(false);
    Promise.resolve(ensureProduct(String(id))).finally(() => {
      if (alive) setAsked(true);
    });
    return () => {
      alive = false;
    };
  }, [id, ensureProduct]);

  const product = shop.productById(String(id));
  const store = product ? shop.storeById(product.storeId) : null;
  const key = customerKeyOf(account);

  const choices = product?.options?.choices ?? [];
  const [option, setOption] = useState(choices[0]?.label ?? null);
  const [qty, setQty] = useState(product?.minQty ?? 1);
  const [shot, setShot] = useState(0);
  const [error, setError] = useState(null);

  const category = useMemo(
    () =>
      product && store
        ? shop.categoriesOf(store.id).find((c) => c.id === product.categoryId)
        : null,
    [shop, product, store],
  );

  if (!product || !store) {
    /* Still asking. The shape of the page that is coming — gallery, title,
       price — so nothing jumps when it arrives. */
    if (!asked) {
      return (
        <Screen>
          <Container style={{ paddingTop: 30, gap: 16 }}>
            <Skeleton height={300} round={20} />
            <Skeleton height={24} width="70%" />
            <Skeleton height={18} width="35%" />
            <Skeleton height={14} width="90%" />
            <Skeleton height={14} width="60%" />
          </Container>
        </Screen>
      );
    }

    return (
      <Screen>
        <Container style={{ paddingTop: 30 }}>
          <EmptyState
            icon="alertCircle"
            title={t('Product not found')}
            body={t('That product is no longer listed.')}
            action={<Button label={t('All shops')} onPress={() => router.replace('/stores')} />}
          />
        </Container>
      </Screen>
    );
  }

  const availability = shop.availability(product, store);
  const preorder = availability === 'preorder';
  const buyable = availability === 'in-stock' || preorder;
  const unit = shop.unitPriceOf(product, option);
  const images = product.images?.length ? product.images : [''];
  const max = product.maxQty ?? (availability === 'in-stock' ? product.stock : null);

  const add = async (thenGo) => {
    if (!isSignedIn) return router.push('/auth');
    const out = await shop.addToCart(key, product.id, qty, option);
    if (!out.ok) {
      return alert.error(errorText(out.error, t, n, { ...out, productName: product.name }));
    }
    if (thenGo) router.push('/store-checkout');
    else router.back();
  };

  return (
    <Screen contentStyle={{ paddingTop: 0 }}>
      {/* ---- gallery ---- */}
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setShot(Math.round(e.nativeEvent.contentOffset.x / r.width))
          }
        >
          {images.map((uri, i) =>
            uri ? (
              <Image
                key={i}
                source={{ uri }}
                contentFit="cover"
                transition={250}
                style={{ width: r.width, height: 300, backgroundColor: colors.sunken }}
              />
            ) : (
              <Placeholder
                key={i}
                name={product.name}
                height={300}
                style={{ width: r.width }}
              />
            ),
          )}
        </ScrollView>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('Back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/stores'))}
          style={{
            position: 'absolute',
            /* Under the floating bar rather than at a guessed offset — 52
               put it behind the brand pill on a notched phone. */
            top: backTop,
            left: 16,
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 19,
            backgroundColor: 'rgba(20, 16, 14, 0.5)',
          }}
        >
          <Icon name="arrowLeft" size={18} color="#FFFFFF" strokeWidth={2} />
        </Pressable>

        {images.length > 1 ? (
          <View
            style={{
              position: 'absolute',
              bottom: 14,
              alignSelf: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            {images.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === shot ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === shot ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)',
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      <Container style={{ paddingTop: 20 }}>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <StockPill availability={availability} stock={product.stock} />
            {category ? (
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.xs,
                  letterSpacing: type.xs * tracking.label,
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                }}
              >
                {category.emoji ? `${category.emoji} ` : ''}
                {category.name}
              </Text>
            ) : null}
          </View>

          <Heading size={26}>{product.name}</Heading>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Price size={28}>৳{n(unit)}</Price>
            {product.minQty > 1 ? (
              <Text style={{ fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}>
                {t('minimum {n}', { n: n(product.minQty) })}
              </Text>
            ) : null}
          </View>

          {product.description ? (
            <Body muted size={15} style={{ marginTop: 2 }}>
              {product.description}
            </Body>
          ) : null}
        </View>

        {/* ---- what the cook has to say about getting it to you ---- */}
        <View style={{ gap: 1, marginTop: 20 }}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/stores/${store.id}`)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 13,
              borderBottomWidth: 1,
              borderBottomColor: colors.line2,
            }}
          >
            <Icon name="chefHat" size={15} color={colors.primary} />
            <Text
              style={{ flex: 1, fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.primary }}
            >
              {store.name}
            </Text>
            <Icon name="chevronRight" size={15} color={colors.textLight} />
          </Pressable>

          {product.prepTime ? (
            <Fact icon="clock" label={t('Preparation')} value={product.prepTime} />
          ) : null}
          <Fact
            icon="delivery"
            label={t('Delivery')}
            value={
              product.deliveryNote ||
              (store.freeDeliveryOver
                ? t('৳{fee}, free over ৳{over}', {
                    fee: n(store.deliveryFee),
                    over: n(store.freeDeliveryOver),
                  })
                : store.deliveryFee
                  ? t('৳{fee}', { fee: n(store.deliveryFee) })
                  : t('Free'))
            }
          />
          {availability === 'in-stock' ? (
            <Fact icon="box" label={t('In stock')} value={n(product.stock)} />
          ) : null}
        </View>

        {/* ---- options ---- */}
        {choices.length ? (
          <View style={{ marginTop: 22, gap: 10 }}>
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: type.xs + 1,
                letterSpacing: (type.xs + 1) * tracking.label,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {product.options.name}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {choices.map((c) => {
                const active = option === c.label;
                return (
                  <Pressable
                    key={c.label}
                    accessibilityRole="button"
                    aria-pressed={active}
                    accessibilityState={{ selected: active }}
                    onPress={() => setOption(c.label)}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 10,
                        paddingHorizontal: 15,
                        borderRadius: radius.pill,
                        backgroundColor: active ? colors.primary : colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.line,
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
                      {c.label}
                    </Text>
                    {c.priceDelta ? (
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 11,
                          color: active ? 'rgba(255,255,255,0.85)' : colors.textMuted,
                        }}
                      >
                        +৳{n(c.priceDelta)}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* ---- pre-order, said plainly ---- */}
        {preorder ? (
          <View
            style={{
              gap: 8,
              padding: 16,
              marginTop: 22,
              borderRadius: radius.sm,
              backgroundColor: colors.saffron50,
              borderWidth: 1,
              borderColor: colors.saffron100,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="clock" size={16} color={colors.saffron} />
              <Text
                style={{ fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}
              >
                {t('Pre-order only')}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.sm,
                lineHeight: type.sm * 1.55,
                color: colors.textMuted,
              }}
            >
              {t(
                'This is out of stock, but {cook} makes it to order. Your payment is held while they decide, and returned in full if they cannot take it.',
                { cook: store.name },
              )}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              marginTop: 18,
              borderRadius: radius.sm,
              backgroundColor: colors.primary50,
              borderWidth: 1,
              borderColor: colors.primary200,
            }}
          >
            <Icon name="alertCircle" size={16} color={colors.primary} />
            <Text style={{ flex: 1, fontFamily: font.ui, fontSize: type.sm, color: colors.text }}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* ---- buy ---- */}
        {buyable ? (
          <View style={{ marginTop: 24, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <QtyStepper
                value={qty}
                min={product.minQty ?? 1}
                max={max}
                onChange={setQty}
              />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text
                  style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                >
                  {t('Total')}
                </Text>
                <Price size={20}>৳{n(unit * qty)}</Price>
              </View>
            </View>

            <Button
              label={preorder ? t('Pre-order · ৳{n}', { n: n(unit * qty) }) : t('Add to basket')}
              icon={preorder ? 'clock' : 'plus'}
              iconPosition="left"
              block
              onPress={() => add(false)}
            />
            <Button
              variant="glass"
              label={t('Buy now')}
              icon="arrowRight"
              block
              onPress={() => add(true)}
            />
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 16,
              marginTop: 24,
              borderRadius: radius.sm,
              backgroundColor: colors.sunken,
              borderWidth: 1,
              borderColor: colors.line2,
            }}
          >
            <Icon name="lock" size={16} color={colors.textMuted} />
            <Text style={{ flex: 1, fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}>
              {availability === 'closed'
                ? t('{name} is closed right now.', { name: store.name })
                : availability === 'off'
                  ? t('{name} is not on sale right now.', { name: product.name })
                  : t('{name} is out of stock.', { name: product.name })}
            </Text>
          </View>
        )}
      </Container>
    </Screen>
  );
}

function Fact({ icon, label, value }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: colors.line2,
      }}
    >
      <Icon name={icon} size={15} color={colors.textMuted} />
      <Text
        style={{
          flex: 1,
          fontFamily: font.uiSemi,
          fontSize: type.xs + 1,
          letterSpacing: (type.xs + 1) * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          flexShrink: 1,
          textAlign: 'right',
          fontFamily: font.ui,
          fontSize: type.sm + 1,
          color: colors.text,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
