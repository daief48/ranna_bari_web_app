/**
 * A cook's storefront.
 *
 * Cover, then who is behind the counter, then their own categories, then the
 * shelves. The category row is the cook's list in the cook's order -- nothing
 * here is a fixed taxonomy, because a cook who sells cake and achar has
 * nothing in common with one who sells pitha and nimki.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
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
  Skeleton,
  StockPill,
} from '../../src/components/StoreBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { customerKeyOf } from '../../src/lib/ledger';
import DistanceChip from '../../src/components/DistanceChip';
import { expand } from '../../src/lib/search';
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
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);

  /* The directory carries the shop; the shelves are a second request,
     made when somebody actually walks in. */
  const { ensureStore } = shop;

  /*
   * `asked` is the difference between "not here yet" and "not here".
   *
   * This screen is reachable by link, so on a cold open the fetch has not
   * happened when it first renders and `storeById` is empty — which used to
   * fall straight through to "That shop is no longer listed". A real shop,
   * open, with a full shelf, announcing itself as delisted for as long as the
   * network took. Only once the request has settled does an absent shop mean
   * an absent shop.
   */
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    let alive = true;
    setAsked(false);
    Promise.resolve(ensureStore(String(id))).finally(() => {
      if (alive) setAsked(true);
    });
    return () => {
      alive = false;
    };
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

  /*
   * Searching this shop's shelf.
   *
   * On the device, over the rows already loaded — the whole catalogue came
   * down with the shop, so a round trip per keystroke would be slower and
   * would stop working the moment the network did.
   *
   * `expand()` is the app's own matcher, the one Browse uses: it folds case,
   * handles the Bengali spellings of a Latin-typed word and the reverse, so
   * "achar" finds আচার and "আম" finds "Aam er achar". A plain `includes` here
   * would have made this box the one place in the app where typing in Bengali
   * finds nothing.
   */
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return products;

    /* Every word has to match something, any of its spellings will do. "aam
       achar" should find the mango pickle and not every pickle on the shelf,
       which an any-word match would give. */
    const forms = words.map((w) => expand(w));
    return products.filter((p) => {
      const hay = `${p.name ?? ''} ${p.description ?? ''}`.toLowerCase();
      return forms.every((variants) => variants.some((f) => hay.includes(f)));
    });
  }, [products, query]);

  if (!store) {
    /* Still asking. The shelf skeleton rather than a spinner, because it is
       the shape of what is coming and the page does not jump when it lands. */
    if (!asked) {
      return (
        <Screen>
          <Container style={{ paddingTop: 30, gap: 16 }}>
            <Skeleton height={190} round={20} />
            <Skeleton height={22} width="60%" />
            <Skeleton height={14} width="40%" />
            <ProductGridSkeleton count={4} />
          </Container>
        </Screen>
      );
    }

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

  const saved = shop.isStoreSaved(store.id);

  /* Signing in is the price of a list that follows you between devices, so
     the button says so rather than failing silently for a guest. */
  const toggleSave = async () => {
    if (!isSignedIn) return router.push('/auth');
    const out = await shop.toggleSavedStore(store.id);
    if (!out.ok) {
      alert.error(errorText(out.error, t, n, out));
      return;
    }
    alert.success(
      out.saved
        ? t('{name} saved. Find it in your profile.', { name: store.name })
        : t('{name} removed from your saved shops.', { name: store.name }),
    );
  };

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

        {/* ---- keep this shop ----
            Opposite the back chip, on the cover, because it belongs to the
            shop rather than to any one shelf — and because this is the first
            thing on screen, which is where somebody decides they like a
            place. It fills with saffron when kept, so the state is readable
            at a glance without the label a 38px circle has no room for. */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          accessibilityLabel={saved ? t('Saved — tap to remove') : t('Save this shop')}
          onPress={toggleSave}
          style={({ pressed }) => ({
            position: 'absolute',
            top: backTop,
            right: 16,
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 19,
            backgroundColor: saved ? colors.saffron : 'rgba(20, 16, 14, 0.5)',
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          <Icon
            name="star"
            size={18}
            color={saved ? colors.onDark : '#FFFFFF'}
            strokeWidth={saved ? 2.4 : 2}
          />
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
            <View
              style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textLight }}
            />
            <DistanceChip target={store} kind="shop" />
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

      {/* ---- searching the shelf ----
          Above the categories, because it searches across all of them: a
          filter that sat below the category row would look like it only
          applied to the one selected. */}
      <Container style={{ paddingTop: 20, paddingBottom: 0 }}>
        <View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              height: 48,
              paddingRight: 6,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
            },
            shadow.sm,
          ]}
        >
          <Icon name="search" size={17} color={colors.textMuted} style={{ marginLeft: 15 }} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search in this shop…')}
            placeholderTextColor={colors.textLight}
            returnKeyType="search"
            accessibilityLabel={t('Search in this shop…')}
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: font.ui,
              fontSize: 15.5,
              color: colors.text,
              paddingHorizontal: 11,
            }}
          />
          {query ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('Clear search')}
              style={{ paddingHorizontal: 8 }}
            >
              <Icon name="x" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </Container>

      {/* ---- the cook's own categories ----
          Hidden while searching: the search runs across the whole shelf, so
          leaving a category selected beside it would show two filters where
          only one is being applied. */}
      {categories.length && !query ? (
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
          text={
            query
              ? t('{n} found', { n: n(results.length) })
              : t('{n} products', { n: n(products.length) })
          }
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
        ) : results.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {results.map((product, i) => (
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
