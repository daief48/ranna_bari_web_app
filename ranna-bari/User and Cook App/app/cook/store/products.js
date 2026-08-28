/**
 * The shelves, and what is on them.
 *
 * Doubles as the inventory screen on purpose. A cook's most common shop
 * errand by far is "I made twelve more jars", and making that a stepper on
 * the list rather than a form two taps away is the difference between a
 * stock count that is kept up and one that is not.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import { Body, Heading, Price } from '../../../src/components/Typography';
import { EmptyState } from '../../../src/components/MealBits';
import { QtyStepper, StockPill } from '../../../src/components/StoreBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import useResponsive from '../../../src/theme/useResponsive';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useLang } from '../../../src/i18n/LanguageContext';

/** The four questions a cook asks of their own catalogue. */
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'On sale' },
  { key: 'out', label: 'Out of stock' },
  { key: 'off', label: 'Hidden' },
];

export default function StoreProducts() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const r = useResponsive();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  const [filter, setFilter] = useState('all');

  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;
  const all = useMemo(
    () => (store ? shop.productsOf(store.id) : []),
    [shop, store],
  );

  const products = useMemo(() => {
    if (filter === 'live') return all.filter((p) => p.active && p.stock > 0);
    if (filter === 'out') return all.filter((p) => p.active && p.stock <= 0);
    if (filter === 'off') return all.filter((p) => !p.active);
    return all;
  }, [all, filter]);

  const categoryName = (id) =>
    store ? shop.categoriesOf(store.id).find((c) => c.id === id)?.name : null;

  return (
    <CookScreen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook/store'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 18,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.sage} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.sage,
            }}
          >
            {t('Your shop')}
          </Text>
        </Pressable>

        <Reveal delay={1}>
          <Heading size={30} style={{ letterSpacing: -0.6 }}>
            {t('Products')}
          </Heading>
          <Body muted size={15} style={{ marginTop: 4, marginBottom: 20 }}>
            {t('Change stock here. Tap a product to edit everything else.')}
          </Body>
          <Button
            label={t('Add a product')}
            icon="plus"
            iconPosition="left"
            block
            onPress={() => router.push('/cook/store/product/new')}
          />
        </Reveal>
      </Container>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: r.gutter, paddingVertical: 2 }}
        style={{ marginTop: 20 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count =
            f.key === 'all'
              ? all.length
              : f.key === 'live'
                ? all.filter((p) => p.active && p.stock > 0).length
                : f.key === 'out'
                  ? all.filter((p) => p.active && p.stock <= 0).length
                  : all.filter((p) => !p.active).length;

          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              aria-pressed={active}
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f.key)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  paddingVertical: 10,
                  paddingHorizontal: 15,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.sage : colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: active ? colors.sage : colors.line,
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
                {t(f.label)}
              </Text>
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 11,
                  color: active ? 'rgba(255,255,255,0.85)' : colors.textMuted,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {n(count)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Container style={{ paddingTop: 20 }}>
        {products.length ? (
          <View style={{ gap: 12 }}>
            {products.map((product, i) => (
              <Reveal key={product.id} delay={(i % 5) + 1}>
                <Row
                  product={product}
                  category={categoryName(product.categoryId)}
                  onOpen={() => router.push(`/cook/store/product/${product.id}`)}
                  onStock={(v) => shop.setStock(product.id, v)}
                  onToggle={() => shop.toggleProduct(product.id)}
                />
              </Reveal>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="box"
            title={all.length ? t('Nothing in this view') : t('No products yet')}
            body={
              all.length
                ? t('Try another filter.')
                : t('Add the first thing you sell. It goes live as soon as you save.')
            }
          />
        )}
      </Container>
    </CookScreen>
  );
}

function Row({ product, category, onOpen, onStock, onToggle }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  /* Availability from the cook's side ignores whether the shop is open --
     that is one switch elsewhere, and repeating it on every row would tell
     them the same thing twenty times. */
  const availability = !product.active
    ? 'off'
    : product.stock > 0
      ? 'in-stock'
      : product.preorder
        ? 'preorder'
        : 'out';

  return (
    <View
      style={[
        {
          gap: 12,
          padding: 12,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.line,
          opacity: product.active ? 1 : 0.7,
        },
        shadow.xs,
      ]}
    >
      <Pressable
        accessibilityRole="link"
        onPress={onOpen}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <Image
          source={{ uri: product.images?.[0] }}
          contentFit="cover"
          transition={200}
          style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: colors.sunken }}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.displayBold,
              fontSize: 16,
              letterSpacing: -0.16,
              color: colors.text,
            }}
          >
            {product.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Price size={14}>৳{n(product.price)}</Price>
            {category ? (
              <Text
                numberOfLines={1}
                style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
              >
                {category}
              </Text>
            ) : null}
          </View>
          <StockPill availability={availability} stock={product.stock} />
        </View>
        <Icon name="chevronRight" size={16} color={colors.textLight} />
      </Pressable>

      {/* ---- stock, where the cook actually is ---- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.line2,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: font.uiSemi,
            fontSize: type.xs + 1,
            color: colors.textMuted,
          }}
        >
          {t('In stock')}
        </Text>
        <QtyStepper small value={product.stock} min={0} onChange={onStock} />
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: product.active }}
          accessibilityLabel={product.active ? t('Hide from the shop') : t('Put back on sale')}
          onPress={onToggle}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: radius.pill,
            backgroundColor: pressed ? colors.sunken : 'transparent',
            borderWidth: 1,
            borderColor: colors.line,
          })}
        >
          <Icon
            name={product.active ? 'eye' : 'eyeOff'}
            size={14}
            color={product.active ? colors.sage : colors.textMuted}
          />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: 10,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: product.active ? colors.sage : colors.textMuted,
            }}
          >
            {product.active ? t('On sale') : t('Hidden')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
