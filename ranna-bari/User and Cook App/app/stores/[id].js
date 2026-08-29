/**
 * A cook's storefront.
 *
 * Cover, then who is behind the counter, then their own categories, then the
 * shelves. The category row is the cook's list in the cook's order -- nothing
 * here is a fixed taxonomy, because a cook who sells cake and achar has
 * nothing in common with one who sells pitha and nimki.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import { Body, Heading } from '../../src/components/Typography';
import { EmptyState, errorText } from '../../src/components/MealBits';
import {
  BlockLabel,
  CategoryTabs,
  ProductCard,
  ProductGridSkeleton,
  StockPill,
} from '../../src/components/StoreBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { customerKeyOf } from '../../src/lib/ledger';
import { distanceKm, formatDistance } from '../../src/lib/geo';
import { useLang } from '../../src/i18n/LanguageContext';
import { useAlert } from '../../src/components/Alert';
import { useNavbarOffset } from '../../src/components/Navbar';

export default function StoreScreen() {
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

  const [category, setCategory] = useState(null);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);

  /* The directory carries the shop; the shelves are a second request,
     made when somebody actually walks in. */
  const { ensureStore } = shop;
  useEffect(() => {
    ensureStore(String(id));
  }, [id, ensureStore]);

  const store = shop.storeById(String(id));
  const key = customerKeyOf(account);

  const categories = useMemo(
    () => (store ? shop.categoriesOf(store.id) : []),
    [shop, store],
  );

  const products = useMemo(() => {
    if (!store) return [];
    return shop
      .productsOf(store.id, category)
      /* A product the cook has switched off stays out of the shop entirely.
         Out of stock is different -- that one still belongs on the shelf,
         because it may be pre-orderable and it tells you what they make. */
      .filter((p) => p.active);
  }, [shop, store, category]);

  if (!store) {
    return (
      <Screen>
        <Container style={{ paddingTop: 30 }}>
          <EmptyState
            icon="alertCircle"
            title={t('Shop not found')}
            body={t('That shop is no longer listed.')}
            action={<Button label={t('All shops')} onPress={() => router.replace('/stores')} />}
          />
        </Container>
      </Screen>
    );
  }

  const km =
    typeof account?.lat === 'number' && typeof store.lat === 'number'
      ? distanceKm({ lat: account.lat, lng: account.lng }, { lat: store.lat, lng: store.lng })
      : null;
  const away = formatDistance(km, t, n);

  const add = async (product) => {
    if (!isSignedIn) return router.push('/auth');
    const out = await shop.addToCart(key, product.id, 1, null);
    if (!out.ok) {
      alert.error(errorText(out.error, t, n, { ...out, productName: product.name }));
      return;
    }
    alert.success(
      shop.availability(product, store) === 'preorder'
        ? t('{name} added as a pre-order.', { name: product.name })
        : t('{name} added to your basket.', { name: product.name }),
    );
  };

  const basket = shop.cartOf(key).reduce((sum, l) => sum + l.qty, 0);

  return (
    <Screen contentStyle={{ paddingTop: 0 }}>
      {/* ---- cover ---- */}
      <View>
        <Image
          source={{ uri: store.cover }}
          contentFit="cover"
          transition={250}
          style={{ width: '100%', height: 190, backgroundColor: colors.sunken }}
        />
        <LinearGradient
          colors={['transparent', `rgba(${colors.scrim}, 0.55)`]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '40%' }}
        />
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
      </View>

      <Container style={{ paddingTop: 0 }}>
        {/* ---- who is behind the counter ---- */}
        <View style={{ flexDirection: 'row', gap: 14, marginTop: -28 }}>
          <Image
            source={{ uri: store.logo }}
            contentFit="cover"
            transition={250}
            style={[
              {
                width: 72,
                height: 72,
                borderRadius: 24,
                borderWidth: 3,
                borderColor: colors.canvas,
                backgroundColor: colors.sunken,
              },
              shadow.sm,
            ]}
          />
          <View style={{ flex: 1, minWidth: 0, paddingTop: 32 }}>
            <StockPill availability={store.isOpen ? 'in-stock' : 'closed'} />
          </View>
        </View>

        <View style={{ gap: 8, marginTop: 14 }}>
          <Heading size={26}>{store.name}</Heading>
          {store.tagline ? (
            <Text
              style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.primary }}
            >
              {store.tagline}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Icon name="pin" size={12} color={colors.textLight} />
            <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
              {store.area}
            </Text>
            {away ? (
              <>
                <View
                  style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textLight }}
                />
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 10,
                    color: colors.sage,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {away}
                </Text>
              </>
            ) : null}
            {store.phone ? (
              <>
                <View
                  style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textLight }}
                />
                <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
                  {store.phone}
                </Text>
              </>
            ) : null}
          </View>

          {store.description ? (
            <Body muted size={14} style={{ marginTop: 4 }}>
              {store.description}
            </Body>
          ) : null}

          {/* What delivery will cost, before anything is in the basket. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              marginTop: 8,
              borderRadius: radius.sm,
              backgroundColor: colors.sunken,
              borderWidth: 1,
              borderColor: colors.line2,
            }}
          >
            <Icon name="delivery" size={15} color={colors.textMuted} />
            <Text
              style={{
                flex: 1,
                fontFamily: font.ui,
                fontSize: type.xs + 1,
                lineHeight: (type.xs + 1) * 1.5,
                color: colors.textMuted,
              }}
            >
              {store.freeDeliveryOver
                ? t('Delivery ৳{fee} · free over ৳{over}', {
                    fee: n(store.deliveryFee),
                    over: n(store.freeDeliveryOver),
                  })
                : store.deliveryFee
                  ? t('Delivery ৳{fee}', { fee: n(store.deliveryFee) })
                  : t('Free delivery')}
            </Text>
          </View>
        </View>

        {!store.isOpen ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              marginTop: 16,
              borderRadius: radius.sm,
              backgroundColor: colors.saffron50,
              borderWidth: 1,
              borderColor: colors.saffron100,
            }}
          >
            <Icon name="moon" size={16} color={colors.saffron} />
            <Text style={{ flex: 1, fontFamily: font.ui, fontSize: type.sm, color: colors.text }}>
              {t('{name} is closed. The shelves are here for when they open again.', {
                name: store.name,
              })}
            </Text>
          </View>
        ) : null}

        {flash ? <Flash tone="sage" icon="check" text={flash} /> : null}
        {error ? <Flash tone="primary" icon="alertCircle" text={error} /> : null}
      </Container>

      {/* ---- the cook's own categories ---- */}
      {categories.length ? (
        <View style={{ marginTop: 24 }}>
          <CategoryTabs
            categories={categories}
            value={category}
            onChange={setCategory}
            gutter={r.gutter}
          />
        </View>
      ) : null}

      {/* ---- the shelves ---- */}
      <Container style={{ paddingTop: 24 }}>
        <BlockLabel
          text={t('{n} products', { n: n(products.length) })}
          right={
            basket ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/store-checkout')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Icon name="cart" size={15} color={colors.primary} />
                <Text
                  style={{ fontFamily: font.uiBold, fontSize: type.xs + 1, color: colors.primary }}
                >
                  {t('{n} in basket', { n: n(basket) })}
                </Text>
              </Pressable>
            ) : null
          }
        />

        {!shop.hydrated ? (
          <ProductGridSkeleton />
        ) : products.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {products.map((product, i) => (
              <Reveal
                key={product.id}
                delay={(i % 5) + 1}
                style={{ flexBasis: '47%', flexGrow: 1 }}
              >
                <ProductCard
                  product={product}
                  availability={shop.availability(product, store)}
                  onPress={() => router.push(`/product/${product.id}`)}
                  onAdd={() => add(product)}
                />
              </Reveal>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="box"
            title={t('Nothing here yet')}
            body={
              category
                ? t('This category is empty. Try another one.')
                : t('This shop has not listed anything yet.')
            }
          />
        )}
      </Container>
    </Screen>
  );
}

function Flash({ tone, icon, text }) {
  const { colors } = useTheme();
  const fg = tone === 'sage' ? colors.sage : colors.primary;
  const bg = tone === 'sage' ? colors.sage50 : colors.primary50;
  const line = tone === 'sage' ? colors.sage100 : colors.primary200;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        marginTop: 14,
        borderRadius: radius.sm,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: line,
      }}
    >
      <Icon name={icon} size={16} color={fg} />
      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: type.sm,
          lineHeight: type.sm * 1.5,
          color: colors.text,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
