/**
 * One product, created or edited.
 *
 * The pre-order switch is the one field worth understanding before filling
 * anything else in: it decides what happens when the shelf is empty. With it
 * off, a sold-out product simply stops selling. With it on, it keeps selling
 * as a request the cook answers -- which is a promise to make more, so it is
 * never on by default.
 *
 * The form runs in the order a cook thinks: the photograph, then what it is
 * and what it costs, then the shelf it sits on, then how it sells, then
 * whether it is live at all. A preview card drawn exactly as the customer's
 * shelf draws it rides along, so "will this look right" is answered while
 * typing rather than after saving.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { toStorableImage } from '../../../../src/lib/pickedImage';

import CookScreen from '../../../../src/components/CookScreen';
import { Container } from '../../../../src/components/Screen';
import Icon from '../../../../src/components/Icon';
import CategoryIcon from '../../../../src/components/CategoryIcon';
import Reveal from '../../../../src/components/Reveal';
import Button from '../../../../src/components/Button';
import FloatLabelInput from '../../../../src/components/FloatLabelInput';
import { FieldError, PublishSwitch, RowHeading } from '../../../../src/components/CookBits';
import { BentoBox, IconTile } from '../../../../src/components/Surfaces';
import { StockPill } from '../../../../src/components/StoreBits';
import { Body, Heading, Price } from '../../../../src/components/Typography';
import { useTheme } from '../../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../../src/theme/tokens';
import { useKitchen } from '../../../../src/store/KitchenContext';
import { useCommerce } from '../../../../src/store/CommerceContext';
import { useLang } from '../../../../src/i18n/LanguageContext';
import { useAlert } from '../../../../src/components/Alert';

/* Kept for products saved before a shelf drew photographs — an old row may
   legitimately have none, and the shelf has always drawn a stand-in for it.
   A new product is steered to pick a real one. */
const PLACEHOLDER =
  'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=800&h=600&fit=crop';

export default function ProductEditor() {
  const { id } = useLocalSearchParams();
  const { kitchen } = useKitchen();
  const shop = useCommerce();
  const router = useRouter();
  const { t } = useLang();

  const isNew = String(id) === 'new';
  /* Which shop this editor is working on — named by the route, defaulting
     to the kitchen's first for a link that arrived without one. */
  const { shop: shopParam } = useLocalSearchParams();
  const shops = kitchen ? shop.myStores(kitchen.id) : [];
  const store =
    shops.find((s) => String(s.id) === String(shopParam)) ?? shops[0] ?? null;
  const existing = isNew ? null : shop.productById(String(id));

  /* Guard before the form so its fields are never seeded from a document
     that has not finished loading. */
  if (!store || (!isNew && !existing)) {
    return (
      <CookScreen>
        <Container style={{ paddingTop: 30 }}>
          <Heading size={22}>{t('Product not found')}</Heading>
          <Body muted size={15} style={{ marginTop: 6 }}>
            {t('That product is no longer listed.')}
          </Body>
          <Button
            label={t('Your shop')}
            style={{ marginTop: 18 }}
            onPress={() => router.replace('/cook/store')}
          />
        </Container>
      </CookScreen>
    );
  }

  return <Form store={store} product={existing} isNew={isNew} />;
}

function Form({ store, product, isNew }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const shop = useCommerce();
  const alert = useAlert();

  const categories = shop.categoriesOf(store.id);

  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [stock, setStock] = useState(product ? String(product.stock) : '');
  const [minQty, setMinQty] = useState(String(product?.minQty ?? 1));
  const [maxQty, setMaxQty] = useState(product?.maxQty == null ? '' : String(product.maxQty));
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? null);
  const [images, setImages] = useState(product?.images?.length ? product.images : []);
  const [preorder, setPreorder] = useState(!!product?.preorder);
  const [active, setActive] = useState(product ? product.active : true);
  const [prepTime, setPrepTime] = useState(product?.prepTime ?? '');
  const [deliveryNote, setDeliveryNote] = useState(product?.deliveryNote ?? '');

  /* Per-field errors, set on save and cleared the moment their own field is
     edited. The photograph's note is its own: picking is async, and the wait
     while it is resized belongs next to the tile that started it. */
  const [errors, setErrors] = useState({});
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* A durable URI is kept exactly as it is; a fresh pick is resized to the
     role it will live at. Storing the picker's handle was how `blob:` and
     `file:` addresses ended up in the database, legible to nobody but the
     device that chose them — see `lib/pickedImage`. */
  const addImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErrors((e) => ({
        ...e,
        images: t('RannaBari needs photo access to set a product photo.'),
      }));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setProcessing(true);
    setErrors((e) => ({ ...e, images: undefined }));
    const stored = await toStorableImage(res.assets[0], 'dish');
    setProcessing(false);

    if (!stored) {
      setErrors((e) => ({
        ...e,
        images: t('That photo could not be read. Please try another.'),
      }));
      return;
    }
    setImages((prev) => [...prev, stored]);
    Haptics.selectionAsync().catch(() => {});
  };

  const priceValue = Number(price);
  const priceValid = Number.isFinite(priceValue) && priceValue > 0;
  const stockValue = Number(stock);
  const stockValid = stock.trim() !== '' && Number.isFinite(stockValue) && stockValue >= 0;

  /* The shelf card, as a customer walking the shop draws it: photo, name,
     price, and the pill that says buyable or not. */
  const preview = useMemo(
    () => ({
      image: images[0] ?? null,
      name: name.trim(),
      price: priceValid ? Math.round(priceValue) : null,
      inStock: stockValid && stockValue > 0,
    }),
    [images, name, priceValid, priceValue, stockValid, stockValue],
  );

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = t('Give the product a name.');
    if (!priceValid) next.price = t('Set a price above zero, in taka.');
    if (!stockValid) next.stock = t('How many are on the shelf? Zero is a number.');
    if (!categoryId) next.categoryId = t('Pick a shelf — products live under categories.');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    setSaving(true);
    const out = await shop.saveProduct({
      productId: product?.id,
      storeId: store.id,
      patch: {
        name: name.trim(),
        description: description.trim(),
        price: Math.round(priceValue),
        stock: Math.round(stockValue),
        minQty: minQty.trim() ? minQty : 1,
        maxQty: maxQty.trim() ? maxQty : null,
        categoryId,
        images: images.length ? images : [PLACEHOLDER],
        preorder,
        /* Hidden is a state a cook chooses, not a side effect of missing a
           switch — the sentence under it says what each side costs. */
        active,
        prepTime: prepTime.trim(),
        deliveryNote: deliveryNote.trim(),
      },
    });
    setSaving(false);

    if (!out.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setErrors((e) => ({ ...e, form: out.message || t('That did not work') }));
      return;
    }

    /* The save answers `{ ok }` and nothing else, so a brand-new product has
       no id to land on — the toast is its moment, and the shelf it joins is
       one tap back. An edit names its row. */
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    alert.success(
      active
        ? t('{name} is on your shelf.', { name: name.trim() })
        : t('{name} saved as a draft.', { name: name.trim() }),
    );
    router.replace({
      pathname: '/cook/store/products',
      params: {
        shop: String(store.id),
        ...(product?.id ? { highlight: String(product.id) } : {}),
      },
    });
  };

  const remove = () => {
    shop.removeProduct(product.id);
    router.replace('/cook/store/products');
  };

  return (
    <CookScreen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace({
                  pathname: '/cook/store/products',
                  params: { shop: String(store.id) },
                })
          }
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
            {t('Products')}
          </Text>
        </Pressable>

        <Reveal delay={1}>
          <Heading size={30} style={{ letterSpacing: -0.6 }}>
            {isNew ? t('Add a product') : t('Edit product')}
          </Heading>
          <Body muted size={15} style={{ marginTop: 4, marginBottom: 22 }}>
            {isNew
              ? t('A photo, a price, a shelf — it is on sale when you say so.')
              : t('Changes reach customers immediately.')}
          </Body>
        </Reveal>

        {/* ---- Photos first ----
            The first photograph is the one the shelf shows; the rest are the
            ones a customer swipes to. One big tile for the lead, the rest in
            a strip, and the picker's wait spelled out on the tile itself. */}
        <Reveal delay={2}>
          <RowHeading icon="gem" title={t('Photos')} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Add a photo')}
            onPress={addImage}
            disabled={processing}
            style={({ pressed }) => [
              {
                height: 190,
                borderRadius: radius.lg,
                overflow: 'hidden',
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.line,
                opacity: pressed ? 0.94 : 1,
              },
              shadow.sm,
            ]}
          >
            {preview.image ? (
              <Image
                source={{ uri: preview.image }}
                contentFit="cover"
                transition={200}
                style={{ width: '100%', height: '100%', backgroundColor: colors.sunken }}
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  backgroundColor: colors.sunken,
                }}
              >
                <IconTile name="box" variant="saffron" />
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: type.sm,
                    color: colors.textMuted,
                  }}
                >
                  {t('Add the first photo')}
                </Text>
              </View>
            )}

            {processing ? (
              <View
                style={{
                  position: 'absolute',
                  left: 14,
                  bottom: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 13,
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(16, 12, 10, 0.55)',
                }}
              >
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 10,
                    letterSpacing: 0.85,
                    textTransform: 'uppercase',
                    color: '#FFFFFF',
                  }}
                >
                  {t('Preparing the photo…')}
                </Text>
              </View>
            ) : (
              <View
                style={{
                  position: 'absolute',
                  left: 14,
                  bottom: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 13,
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                }}
              >
                <Icon name="plus" size={14} color={colors.onDark} strokeWidth={2.2} />
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 10,
                    letterSpacing: 0.85,
                    textTransform: 'uppercase',
                    color: colors.onDark,
                  }}
                >
                  {preview.image ? t('Add more photos') : t('Add a photo')}
                </Text>
              </View>
            )}
          </Pressable>

          {errors.images ? <FieldError text={errors.images} /> : null}

          {images.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 4, marginBottom: 8 }}
            >
              {images.map((uri, i) => (
                <View key={`${String(uri).slice(-24)}-${i}`}>
                  <Image
                    source={{ uri }}
                    contentFit="cover"
                    transition={180}
                    style={{
                      width: 74,
                      height: 74,
                      borderRadius: radius.sm,
                      backgroundColor: colors.sunken,
                      borderWidth: i === 0 ? 2 : 1,
                      borderColor: i === 0 ? colors.sage : colors.line,
                    }}
                  />
                  {i === 0 ? (
                    <View
                      style={{
                        position: 'absolute',
                        left: 4,
                        bottom: 4,
                        paddingVertical: 2,
                        paddingHorizontal: 6,
                        borderRadius: radius.pill,
                        backgroundColor: colors.sage,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 8.5,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          color: '#FFFFFF',
                        }}
                      >
                        {t('Cover')}
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('Remove photo')}
                      onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 24,
                        height: 24,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 12,
                        backgroundColor: colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: colors.line,
                      }}
                    >
                      <Icon name="x" size={12} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          ) : null}
        </Reveal>

        {/* ---- The essentials ---- */}
        <Reveal delay={3}>
          <View style={{ marginTop: 16 }}>
            <RowHeading icon="chefHat" title={t('The essentials')} />

            <FloatLabelInput
              label={t('Product name')}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setErrors((e) => ({ ...e, name: undefined }));
              }}
              placeholder={t('Chocolate Cake')}
            />
            <FieldError text={errors.name} />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FloatLabelInput
                  label={t('Price')}
                  value={price}
                  onChangeText={(v) => {
                    setPrice(v.replace(/[^0-9]/g, ''));
                    setErrors((e) => ({ ...e, price: undefined }));
                  }}
                  keyboardType="number-pad"
                  placeholder="800"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FloatLabelInput
                  label={t('Stock')}
                  value={stock}
                  onChangeText={(v) => {
                    setStock(v.replace(/[^0-9]/g, ''));
                    setErrors((e) => ({ ...e, stock: undefined }));
                  }}
                  keyboardType="number-pad"
                  placeholder="5"
                />
              </View>
            </View>
            <FieldError text={errors.price ?? errors.stock} />

            <FloatLabelInput
              label={t('Description')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('What is in it, and how it is made')}
              multiline
            />
          </View>
        </Reveal>

        {/* ---- The shelf ---- */}
        <Reveal delay={4}>
          <View style={{ marginTop: 16 }}>
            <RowHeading icon="box" title={t('Shelf')} />
            {categories.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {categories.map((c) => {
                  const on = categoryId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        setCategoryId(c.id);
                        setErrors((e) => ({ ...e, categoryId: undefined }));
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 10,
                        paddingHorizontal: 15,
                        borderRadius: radius.pill,
                        backgroundColor: on ? colors.sage : colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: on ? colors.sage : colors.line,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      <CategoryIcon category={c} size={16} />
                      <Text
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: 13,
                          color: on ? '#FFFFFF' : colors.text,
                        }}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  router.push({
                    pathname: '/cook/store/categories',
                    params: { shop: String(store.id) },
                  })
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 14,
                  borderRadius: radius.sm,
                  backgroundColor: colors.saffron50,
                  borderWidth: 1,
                  borderColor: colors.saffron100,
                }}
              >
                <Icon name="alertCircle" size={16} color={colors.saffron} />
                <Text
                  style={{ flex: 1, fontFamily: font.ui, fontSize: type.sm, color: colors.text }}
                >
                  {t('Make a category first — products live under them.')}
                </Text>
                <Icon name="chevronRight" size={15} color={colors.saffron} />
              </Pressable>
            )}
            <FieldError text={errors.categoryId} />
          </View>
        </Reveal>

        {/* ---- Live preview ---- */}
        <Reveal delay={5}>
          <View style={{ marginTop: 16 }}>
            <RowHeading icon="eye" title={t('How customers will see it')} />
            <BentoBox
              style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <Image
                source={preview.image ? { uri: preview.image } : null}
                contentFit="cover"
                transition={200}
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: 18,
                  backgroundColor: colors.sunken,
                }}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: font.displayBold,
                    fontSize: 16,
                    letterSpacing: -0.16,
                    color: colors.text,
                  }}
                >
                  {preview.name || t('Product name')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Price size={16}>
                    {preview.price ? `৳${n(preview.price)}` : '৳ —'}
                  </Price>
                  {preview.price ? (
                    <StockPill
                      availability={active ? (preview.inStock ? 'in-stock' : 'out') : 'off'}
                      stock={stockValid ? Math.round(stockValue) : 0}
                    />
                  ) : null}
                </View>
                {!active ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {t('Hidden until you publish it')}
                  </Text>
                ) : null}
              </View>
            </BentoBox>
          </View>
        </Reveal>

        {/* ---- How it sells ---- */}
        <Reveal delay={6}>
          <View style={{ marginTop: 16 }}>
            <RowHeading icon="clock" title={t('How it sells')} />

            <PublishSwitch
              value={active}
              onChange={setActive}
              title={active ? t('On sale') : t('Hidden draft')}
              sub={
                active
                  ? t('Customers can buy it as soon as it is saved.')
                  : t('Kept on your shelf, seen by nobody, until you switch it on.')
              }
            />

            <View style={{ marginTop: 12 }}>
              <PublishSwitch
                value={preorder}
                onChange={setPreorder}
                title={t('Allow pre-orders')}
                sub={t(
                  'When stock hits zero this keeps selling, as a request you accept or decline.',
                )}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <FloatLabelInput
                label={t('Minimum order')}
                value={minQty}
                onChangeText={(v) => setMinQty(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={{ flex: 1 }}
              />
              <FloatLabelInput
                label={t('Maximum (optional)')}
                value={maxQty}
                onChangeText={(v) => setMaxQty(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder={t('No limit')}
                style={{ flex: 1 }}
              />
            </View>

            <FloatLabelInput
              label={t('Preparation time')}
              value={prepTime}
              onChangeText={setPrepTime}
              placeholder={t('24 hours')}
            />
            <FloatLabelInput
              label={t('Delivery note (optional)')}
              value={deliveryNote}
              onChangeText={setDeliveryNote}
              placeholder={t('Delivered chilled, same day')}
            />
          </View>
        </Reveal>

        {/* ---- Save ---- */}
        <View style={{ gap: 12, marginTop: 26 }}>
          {errors.form ? <FieldError text={errors.form} /> : null}
          <Button
            label={saving ? t('Saving…') : isNew ? t('Add product') : t('Save changes')}
            icon={saving ? undefined : 'check'}
            block
            disabled={saving || processing}
            onPress={save}
          />

          {!isNew ? (
            confirmDelete ? (
              <View
                style={{
                  padding: 16,
                  borderRadius: radius.md,
                  backgroundColor: colors.primary50,
                  borderWidth: 1,
                  borderColor: colors.primary100,
                  gap: 12,
                }}
              >
                <Body size={14}>
                  {t('Remove {name} from your shop? Orders already placed are not affected.', {
                    name: product.name,
                  })}
                </Body>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    variant="glass"
                    label={t('Keep it')}
                    small
                    style={{ flex: 1 }}
                    onPress={() => setConfirmDelete(false)}
                  />
                  <Button label={t('Remove')} small style={{ flex: 1 }} onPress={remove} />
                </View>
              </View>
            ) : (
              <Button
                variant="ghost"
                label={t('Delete product')}
                icon="x"
                iconPosition="left"
                block
                onPress={() => setConfirmDelete(true)}
              />
            )
          ) : null}
        </View>
      </Container>
    </CookScreen>
  );
}
