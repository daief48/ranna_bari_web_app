/**
 * One product, created or edited.
 *
 * The pre-order switch is the one field worth understanding before filling
 * anything else in: it decides what happens when the shelf is empty. With it
 * off, a sold-out product simply stops selling. With it on, it keeps selling
 * as a request the cook answers -- which is a promise to make more, so it is
 * never on by default.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import CookScreen from '../../../../src/components/CookScreen';
import { Container } from '../../../../src/components/Screen';
import Icon from '../../../../src/components/Icon';
import Reveal from '../../../../src/components/Reveal';
import Button from '../../../../src/components/Button';
import FloatLabelInput, { FormNote } from '../../../../src/components/FloatLabelInput';
import { Body, Heading } from '../../../../src/components/Typography';
import { BlockLabel } from '../../../../src/components/StoreBits';
import { EmptyState, errorText } from '../../../../src/components/MealBits';
import { useTheme } from '../../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../../src/theme/tokens';
import { useKitchen } from '../../../../src/store/KitchenContext';
import { useCommerce } from '../../../../src/store/CommerceContext';
import { useLang } from '../../../../src/i18n/LanguageContext';
import { DEMO_PRODUCT } from '../../../../src/lib/demoData';

const PLACEHOLDER =
  'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=800&h=600&fit=crop';

export default function ProductEditor() {
  const { id } = useLocalSearchParams();
  const { kitchen } = useKitchen();
  const shop = useCommerce();
  const router = useRouter();
  const { t } = useLang();

  const isNew = String(id) === 'new';
  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;
  const existing = isNew ? null : shop.productById(String(id));

  /* Guard before the form so its fields are never seeded from a document
     that has not finished loading. */
  if (!store || (!isNew && !existing)) {
    return (
      <CookScreen>
        <Container style={{ paddingTop: 30 }}>
          <EmptyState
            icon="alertCircle"
            title={t('Product not found')}
            body={t('That product is no longer listed.')}
            action={
              <Button label={t('Your shop')} onPress={() => router.replace('/cook/store')} />
            }
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

  const categories = shop.categoriesOf(store.id);

  const [name, setName] = useState(product?.name ?? DEMO_PRODUCT.name);
  const [description, setDescription] = useState(product?.description ?? DEMO_PRODUCT.description);
  const [price, setPrice] = useState(product ? String(product.price) : DEMO_PRODUCT.price);
  const [stock, setStock] = useState(product ? String(product.stock) : DEMO_PRODUCT.stock);
  const [minQty, setMinQty] = useState(String(product?.minQty ?? 1));
  const [maxQty, setMaxQty] = useState(product?.maxQty == null ? DEMO_PRODUCT.maxQty : String(product.maxQty));
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? null);
  const [images, setImages] = useState(product?.images?.length ? product.images : [PLACEHOLDER]);
  const [preorder, setPreorder] = useState(!!product?.preorder);
  const [active, setActive] = useState(product ? product.active : true);
  const [prepTime, setPrepTime] = useState(product?.prepTime ?? DEMO_PRODUCT.prepTime);
  const [deliveryNote, setDeliveryNote] = useState(product?.deliveryNote ?? DEMO_PRODUCT.deliveryNote);
  const [note, setNote] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote(t('RannaBari needs photo access to set a product photo.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setImages((prev) =>
        prev[0] === PLACEHOLDER ? [res.assets[0].uri] : [...prev, res.assets[0].uri],
      );
    }
  };

  const save = () => {
    const out = shop.saveProduct({
      productId: product?.id,
      storeId: store.id,
      patch: {
        name: name.trim(),
        description: description.trim(),
        price,
        stock,
        minQty: minQty.trim() ? minQty : 1,
        maxQty: maxQty.trim() ? maxQty : null,
        categoryId,
        images,
        preorder,
        active,
        prepTime: prepTime.trim(),
        deliveryNote: deliveryNote.trim(),
      },
    });
    if (!out.ok) return setNote(errorText(out.error, t, n, out));
    router.replace('/cook/store/products');
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
            router.canGoBack() ? router.back() : router.replace('/cook/store/products')
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
              ? t('It appears in your shop as soon as you save.')
              : t('Changes reach customers immediately.')}
          </Body>
        </Reveal>

        {/* ---- photos ---- */}
        <Reveal delay={2}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
            {images.map((uri, i) => (
              <View key={`${uri}-${i}`}>
                <Image
                  source={{ uri }}
                  contentFit="cover"
                  transition={200}
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: radius.sm,
                    backgroundColor: colors.sunken,
                    borderWidth: 1,
                    borderColor: colors.line,
                  }}
                />
                {images.length > 1 ? (
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
                ) : null}
              </View>
            ))}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Add a photo')}
              onPress={addImage}
              style={({ pressed }) => ({
                width: 96,
                height: 96,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderRadius: radius.sm,
                backgroundColor: pressed ? colors.sage50 : colors.sunken,
                borderWidth: 1,
                borderColor: colors.line,
              })}
            >
              <Icon name="plus" size={18} color={colors.sage} strokeWidth={2.2} />
              <Text
                style={{ fontFamily: font.uiSemi, fontSize: 10, color: colors.textMuted }}
              >
                {t('Photo')}
              </Text>
            </Pressable>
          </View>
        </Reveal>

        {/* ---- the product ---- */}
        <Reveal delay={3}>
          <View style={{ gap: 14 }}>
            <FloatLabelInput
              label={t('Product name')}
              value={name}
              onChangeText={setName}
              placeholder={t('Chocolate Cake')}
            />
            <FloatLabelInput
              label={t('Description')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('What is in it, and how it is made')}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <FloatLabelInput
                label={t('Price')}
                value={price}
                onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="800"
                style={{ flex: 1 }}
              />
              <FloatLabelInput
                label={t('Stock')}
                value={stock}
                onChangeText={(v) => setStock(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="5"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Reveal>

        {/* ---- category ---- */}
        <Reveal delay={4}>
          <View style={{ marginTop: 24 }}>
            <BlockLabel text={t('Category')} />
            {categories.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {categories.map((c) => {
                  const on = categoryId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      aria-pressed={on}
                      accessibilityState={{ selected: on }}
                      onPress={() => setCategoryId(c.id)}
                      style={({ pressed }) => [
                        {
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
                        },
                        shadow.xs,
                      ]}
                    >
                      {c.emoji ? <Text style={{ fontSize: 13 }}>{c.emoji}</Text> : null}
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
                onPress={() => router.push('/cook/store/categories')}
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
          </View>
        </Reveal>

        {/* ---- how it sells ---- */}
        <Reveal delay={5}>
          <View style={{ marginTop: 24 }}>
            <BlockLabel text={t('How it sells')} />

            <Switch
              icon="clock"
              title={t('Allow pre-orders')}
              sub={t(
                'When stock hits zero this keeps selling, as a request you accept or decline.',
              )}
              value={preorder}
              onToggle={() => setPreorder((v) => !v)}
            />
            <Switch
              icon={active ? 'eye' : 'eyeOff'}
              title={t('On sale')}
              sub={t('Turn this off to hide it without deleting it.')}
              value={active}
              onToggle={() => setActive((v) => !v)}
            />

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

            <View style={{ gap: 14, marginTop: 14 }}>
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
          </View>
        </Reveal>

        {note ? (
          <View style={{ marginTop: 18 }}>
            <FormNote text={note} />
          </View>
        ) : null}

        <Reveal delay={6}>
          <Button
            label={isNew ? t('Add product') : t('Save changes')}
            icon="check"
            iconPosition="left"
            block
            onPress={save}
            style={{ marginTop: 22 }}
          />

          {!isNew ? (
            <Button
              variant="ghost"
              label={confirmDelete ? t('Tap again to delete') : t('Delete product')}
              block
              onPress={() => (confirmDelete ? remove() : setConfirmDelete(true))}
              style={{ marginTop: 10 }}
            />
          ) : null}
        </Reveal>
      </Container>
    </CookScreen>
  );
}

/** A labelled switch with its consequence spelled out under it. */
function Switch({ icon, title, sub, value, onToggle }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 14,
        marginBottom: 10,
        borderRadius: radius.sm,
        backgroundColor: pressed ? colors.sunken : colors.surfaceSolid,
        borderWidth: 1,
        borderColor: value ? colors.sage100 : colors.line,
      })}
    >
      <Icon name={icon} size={17} color={value ? colors.sage : colors.textMuted} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
          {title}
        </Text>
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.xs,
            lineHeight: type.xs * 1.55,
            color: colors.textMuted,
          }}
        >
          {sub}
        </Text>
      </View>

      <View
        style={{
          width: 46,
          height: 27,
          borderRadius: 14,
          padding: 3,
          justifyContent: 'center',
          alignItems: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? colors.sage : colors.sunken,
          borderWidth: 1,
          borderColor: value ? colors.sage : colors.line,
        }}
      >
        <View
          style={{
            width: 19,
            height: 19,
            borderRadius: 10,
            backgroundColor: value ? '#FFFFFF' : colors.textLight,
          }}
        />
      </View>
    </Pressable>
  );
}
