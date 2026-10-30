/**
 * The cook's own shelves.
 *
 * Nothing here is a fixed list. A cook who sells cake and achar and one who
 * sells pitha and nimki have nothing in common, so the categories are theirs
 * to make, name, order and remove -- and the order matters, because it is the
 * order customers see across the top of the shop.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import FloatLabelInput, { FormNote } from '../../../src/components/FloatLabelInput';
import { Body, Heading } from '../../../src/components/Typography';
import { EmptyState, errorText } from '../../../src/components/MealBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useLang } from '../../../src/i18n/LanguageContext';
import { useAlert } from '../../../src/components/Alert';
import CategoryIcon from '../../../src/components/CategoryIcon';
import CategoryIconPicker, { EMOJI } from '../../../src/components/CategoryIconPicker';
import { ShopNotFound, resolveShop, withKitchenGate } from '../../../src/components/CookBits';

/* Held behind the same approval gate as the tab group — see `withKitchenGate`. */
export default withKitchenGate(StoreCategories);

function StoreCategories() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const alert = useAlert();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI[0]);
  /* An uploaded picture, when the cook chose one instead of an emoji. */
  const [image, setImage] = useState('');
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);

  /* The shop this screen is working on, named by the route's `?shop=`
     param and defaulting to the kitchen's first when the route named none.
     A param that names a shop this kitchen does not have is not quietly
     swapped for the first one — see `resolveShop`. */
  const { shop: shopParam } = useLocalSearchParams();
  const shops = kitchen ? shop.myStores(kitchen.id) : [];
  const { store, missing } = resolveShop(shops, shopParam);
  const categories = store ? shop.categoriesOf(store.id) : [];

  const add = async () => {
    const out = await shop.addCategory(store.id, name, emoji, image);
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    setNote(null);
    setName('');
    setImage('');
  };

  /* Re-icon a shelf that already exists. */
  const reicon = async (id, next) => {
    const out = await shop.updateCategory(id, next);
    if (!out.ok) alert.error(errorText(out.error, t, n, out));
    else setNote(null);
  };

  const rename = async (id, value) => {
    const out = await shop.updateCategory(id, { name: value });
    if (!out.ok) alert.error(errorText(out.error, t, n, out));
    else setNote(null);
  };

  const remove = async (id) => {
    const out = await shop.removeCategory(id);
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    setNote(null);
  };

  if (missing) {
    return (
      <CookScreen>
        <Container>
          <ShopNotFound onBack={() => router.replace('/cook/store')} />
        </Container>
      </CookScreen>
    );
  }

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
            {t('Categories')}
          </Heading>
          <Body muted size={15} style={{ marginTop: 4, marginBottom: 22 }}>
            {t('Your own shelves, in the order customers will see them.')}
          </Body>
        </Reveal>

        {/* ---- add ---- */}
        <Reveal delay={2}>
          <View
            style={[
              {
                gap: 12,
                padding: 16,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
              },
              shadow.sm,
            ]}
          >
            <FloatLabelInput
              label={t('New category')}
              value={name}
              onChangeText={setName}
              placeholder={t('Cake')}
              onSubmitEditing={add}
            />

            {/* The platform's own categories, as starting points. Tapping one
                fills the name and the icon; both stay editable, because a
                cook's shelf is theirs to name. */}
            {shop.taxonomy.length ? (
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: type.xs,
                    color: colors.textMuted,
                  }}
                >
                  {t('Start from a common one')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                >
                  {shop.taxonomy
                    .filter((c) => !categories.some((own) => own.name === t(c.label)))
                    .map((c) => (
                      <Pressable
                        key={c.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('Start from a common one')} ${t(c.label)}`}
                        onPress={() => {
                          setName(t(c.label));
                          if (c.emoji) {
                            setEmoji(c.emoji);
                            setImage('');
                          }
                        }}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingVertical: 8,
                          paddingHorizontal: 13,
                          borderRadius: radius.pill,
                          backgroundColor: pressed ? colors.sage50 : colors.sunken,
                          borderWidth: 1,
                          borderColor: colors.line,
                        })}
                      >
                        {c.emoji ? <Text style={{ fontSize: 12 }}>{c.emoji}</Text> : null}
                        <Text
                          style={{ fontFamily: font.uiSemi, fontSize: 12, color: colors.text }}
                        >
                          {t(c.label)}
                        </Text>
                      </Pressable>
                    ))}
                </ScrollView>
              </View>
            ) : null}

            {/* An emoji from the list, one the cook types, or a picture. */}
            <CategoryIconPicker
              emoji={emoji}
              image={image}
              onChange={(next) => {
                setEmoji(next.emoji);
                setImage(next.image);
              }}
            />

            <Button
              label={t('Add category')}
              icon="plus"
              iconPosition="left"
              block
              disabled={!name.trim() || !store}
              onPress={add}
            />
          </View>
        </Reveal>

        <View style={{ marginTop: 16 }}>{note ? <FormNote text={note} /> : null}</View>

        {/* ---- the list ---- */}
        <View style={{ marginTop: 26, gap: 10 }}>
          {categories.map((c, i) => (
            <React.Fragment key={c.id}>
            <View
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
                shadow.xs,
              ]}
            >
              {/* Up and down rather than a drag: a two-finger reorder gesture
                  inside a scrolling list is a fight, and there are rarely more
                  than a handful of these. */}
              <View style={{ gap: 2 }}>
                <Arrow
                  dir="up"
                  enabled={i > 0}
                  onPress={() => shop.moveCategory(c.id, -1)}
                />
                <Arrow
                  dir="down"
                  enabled={i < categories.length - 1}
                  onPress={() => shop.moveCategory(c.id, 1)}
                />
              </View>

              <CategoryIcon category={c} size={28} fallback="•" />

              {editing === c.id ? (
                <View style={{ flex: 1 }}>
                  <FloatLabelInput
                    label={t('Name')}
                    value={c.name}
                    onChangeText={(v) => rename(c.id, v)}
                    onSubmitEditing={() => setEditing(null)}
                  />
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('Rename')} ${c.name}`}
                  onPress={() => setEditing(c.id)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.sm + 2,
                      color: colors.text,
                    }}
                  >
                    {c.name}
                  </Text>
                  <Text
                    style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                  >
                    {t('{n} products', {
                      n: n(shop.productsOf(store.id, c.id).length),
                    })}
                  </Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('Delete')} ${c.name}`}
                onPress={() => remove(c.id)}
                hitSlop={8}
                style={{ padding: 6 }}
              >
                <Icon name="x" size={16} color={colors.textLight} />
              </Pressable>
            </View>

            {/* Tapping the name opens the shelf for editing: its name above,
                and here its icon — the same picker the add form uses. */}
            {editing === c.id ? (
              <View
                style={{
                  gap: 12,
                  padding: 14,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <CategoryIconPicker
                  emoji={c.emoji}
                  image={c.image}
                  onChange={(next) => reicon(c.id, next)}
                />
                <Button label={t('Done')} block onPress={() => setEditing(null)} />
              </View>
            ) : null}
            </React.Fragment>
          ))}

          {!categories.length ? (
            <EmptyState
              icon="sliders"
              title={t('No categories yet')}
              body={t('Add the first one above. Products go under them.')}
            />
          ) : null}
        </View>
      </Container>
    </CookScreen>
  );
}

function Arrow({ dir, enabled, onPress }) {
  const { colors } = useTheme();
  const { t } = useLang();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir === 'up' ? t('Move up') : t('Move down')}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={4}
      style={{ opacity: enabled ? 1 : 0.25, padding: 2 }}
    >
      <Icon
        name="chevronDown"
        size={15}
        color={colors.textMuted}
        strokeWidth={2.2}
        style={dir === 'up' ? { transform: [{ rotate: '180deg' }] } : null}
      />
    </Pressable>
  );
}
