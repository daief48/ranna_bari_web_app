/**
 * The shop directory, wherever it is being shown.
 *
 * It lived only on its own tab. Folding Shops into Browse — so the bar carries
 * five destinations rather than seven — meant the same list had to render in
 * two places, and a second copy of the matching, the delivery filter and the
 * save-star would have drifted from the first within a week.
 *
 * The search term is passed in rather than owned here: on Browse it is the
 * one box at the top of the screen, and a second box inside this list would
 * be two ways to ask the same question.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Button from './Button';
import Icon from './Icon';
import Reveal from './Reveal';
import { EmptyState, errorText } from './MealBits';
import { Skeleton, StoreCard } from './StoreBits';
import { font, radius, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../store/AuthContext';
import { useCommerce } from '../store/CommerceContext';
import { useLang } from '../i18n/LanguageContext';
import { useAlert } from './Alert';
import { makeMatcher, RANK } from '../lib/search';

export default function ShopResults({
  query = '',
  openOnly = false,
  freeOnly = false,
  onClearFilters,
}) {
  const { t, n } = useLang();
  const { colors } = useTheme();
  const alert = useAlert();
  const router = useRouter();
  const { account, isSignedIn } = useAuth();
  const { storesNearby, hydrated, isStoreSaved, toggleSavedStore, products } = useCommerce();

  const origin = useMemo(
    () =>
      typeof account?.lat === 'number' && typeof account?.lng === 'number'
        ? { lat: account.lat, lng: account.lng }
        : null,
    [account],
  );

  /* Coverage answers against the address on file, not the pin alone: a shop
     that named Gopalganj reaches a Gopalganj address however far the crow
     would have to fly. */
  const addr = useMemo(
    () =>
      account
        ? {
            division: account.division ?? '',
            district: account.district ?? '',
            area: account.area ?? '',
          }
        : null,
    [account],
  );

  const all = useMemo(() => storesNearby(origin, addr), [storesNearby, origin, addr]);

  /*
   * Product names per shop, for the ones the app happens to hold.
   *
   * `storesNearby` returns a product *count* rather than the products —
   * counting what is loaded would read "0 items" for every shop the customer
   * has not opened. So a shelf nobody has opened is searchable by its shop's
   * own details, and gets richer once opened.
   */
  const shelfWords = useMemo(() => {
    const byStore = new Map();
    for (const item of products ?? []) {
      const key = String(item.storeId);
      if (!byStore.has(key)) byStore.set(key, []);
      byStore.get(key).push(item.name);
    }
    return byStore;
  }, [products]);

  const rows = useMemo(() => {
    const matcher = makeMatcher(query);

    let list = all;
    if (openOnly) list = list.filter((r) => r.store.isOpen !== false);
    if (freeOnly) list = list.filter((r) => Number(r.store.deliveryFee ?? 0) === 0);
    if (!matcher) return list;

    return list
      .map((row) => ({
        row,
        rank: matcher.rank({
          name: row.store.name,
          tags: [row.store.area, ...(row.store.tags ?? [])],
          text: [row.store.tagline, ...(shelfWords.get(String(row.store.id)) ?? [])].join(' '),
        }),
      }))
      .filter((hit) => hit.rank !== RANK.NONE)
      .sort((a, b) => a.rank - b.rank)
      .map((hit) => hit.row);
  }, [all, query, openOnly, freeOnly, shelfWords]);

  const narrowed = !!query.trim() || openOnly || freeOnly;

  /* The list arrives with the deliverers in front; what is left is shown
     rather than hidden, folded under its own heading. An open shop a few
     kilometres past the radius used to be a total invisibility event — the
     customer was shown an empty screen and the cook heard silence. Distance
     still gates the basket; here it only gates attention. */
  const [showOutside, setShowOutside] = useState(false);
  const near = rows.filter((r) => r.near !== false);
  const outside = rows.filter((r) => r.near === false);

  /* A guest is sent to sign in rather than silently failing: the list is
     per-account, and there is nowhere to put it until there is an account. */
  const save = async (store) => {
    if (!isSignedIn) return router.push('/auth');
    const out = await toggleSavedStore(store.id);
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(
      out.saved
        ? t('{name} saved. Find it in your profile.', { name: store.name })
        : t('{name} removed from your saved shops.', { name: store.name }),
    );
  };

  if (!hydrated) {
    return (
      <View style={{ gap: 16 }}>
        <Skeleton height={180} round={radius.lg} />
        <Skeleton height={180} round={radius.lg} />
      </View>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon="box"
        title={narrowed ? t('Nothing matches that') : t('No shops near you yet')}
        body={
          narrowed
            ? t('Try a different word, or clear the filters.')
            : t('Cooks near you have not opened a shop yet. If you cook, yours can be the first.')
        }
        action={
          narrowed && onClearFilters ? (
            <Button label={t('Clear filters')} onPress={onClearFilters} />
          ) : (
            <Button label={t('Browse kitchens')} onPress={() => router.push('/browse')} />
          )
        }
      />
    );
  }

  const card = ({ store, km, products: productCount }, i) => (
    <Reveal key={store.id} delay={(i % 5) + 1}>
      <StoreCard
        store={store}
        km={km}
        products={productCount}
        saved={isStoreSaved(store.id)}
        onSave={() => save(store)}
        onPress={() => router.push(`/stores/${store.id}`)}
      />
    </Reveal>
  );

  return (
    <View style={{ gap: 16 }}>
      {near.map(card)}

      {outside.length ? (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showOutside }}
            accessibilityLabel={t('Outside your delivery area')}
            onPress={() => setShowOutside((v) => !v)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: pressed ? colors.sunken : 'transparent',
            })}
          >
            <Icon
              name={showOutside ? 'chevronDown' : 'chevronRight'}
              size={14}
              color={colors.textMuted}
              strokeWidth={2.2}
            />
            <Text
              style={{
                flex: 1,
                fontFamily: font.uiSemi,
                fontSize: type.sm,
                color: colors.textMuted,
              }}
            >
              {t('Outside your delivery area')} · {n(outside.length)}
            </Text>
          </Pressable>

          {showOutside ? <View style={{ gap: 16, marginTop: 16 }}>{outside.map(card)}</View> : null}
        </View>
      ) : null}
    </View>
  );
}
