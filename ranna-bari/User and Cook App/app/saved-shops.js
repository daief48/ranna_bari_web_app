/**
 * The shops this account has kept.
 *
 * A shop was easy to find once and hard to find again: the directory is
 * ordered by distance and filtered by what will deliver to you, so the shop
 * you bought achar from last month is somewhere in a list that has since
 * reordered itself. Saving is the fix, and this is where the list lives.
 *
 * Deliberately not filtered the way the directory is. A shop that has shut
 * for the evening, or sits a kilometre outside its own delivery radius from
 * where you are standing right now, still appears — the card says so, and
 * quietly dropping rows from a list somebody curated by hand would be the
 * app editing their choices for them.
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Button from '../src/components/Button';
import Reveal from '../src/components/Reveal';
import SectionHeader from '../src/components/SectionHeader';
import { EmptyState, errorText } from '../src/components/MealBits';
import { Skeleton, StoreCard } from '../src/components/StoreBits';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useCommerce } from '../src/store/CommerceContext';
import { distanceKm } from '../src/lib/geo';
import { useLang } from '../src/i18n/LanguageContext';
import { useAlert } from '../src/components/Alert';

export default function SavedShops() {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const alert = useAlert();
  const router = useRouter();
  const { account, isSignedIn } = useAuth();
  const { savedStoresList, hydrated, isStoreSaved, toggleSavedStore } = useCommerce();

  const origin = useMemo(
    () =>
      typeof account?.lat === 'number' && typeof account?.lng === 'number'
        ? { lat: account.lat, lng: account.lng }
        : null,
    [account],
  );

  /* Distance is worked out here rather than in the selector, because it is a
     property of where the reader is standing, not of the list. */
  const rows = useMemo(
    () =>
      savedStoresList().map((row) => ({
        ...row,
        km:
          origin && typeof row.store.lat === 'number'
            ? distanceKm(origin, { lat: row.store.lat, lng: row.store.lng })
            : null,
      })),
    [savedStoresList, origin],
  );


  /* The star on each card. A guest is sent to sign in rather than silently
     failing, because the list is per-account and there is nowhere to put it
     until there is an account. */
  const save = async (store) => {
    if (!isSignedIn) return router.push('/auth');
    const out = await toggleSavedStore(store.id);
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
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.primary} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.primary,
            }}
          >
            {t('Back')}
          </Text>
        </Pressable>

        <SectionHeader
          lead={t('SAVED')}
          accent={t('SHOPS')}
          subtitle={t('The shops you kept, in the order you kept them.')}
          style={{ marginBottom: 22 }}
        />

        {!isSignedIn ? (
          <EmptyState
            icon="user"
            title={t('Sign in to keep shops')}
            body={t('Your saved shops follow your account, so they are there on any device.')}
            action={<Button label={t('Sign in')} onPress={() => router.push('/auth')} />}
          />
        ) : !hydrated ? (
          <View style={{ gap: 16 }}>
            <Skeleton height={180} round={radius.lg} />
            <Skeleton height={180} round={radius.lg} />
          </View>
        ) : rows.length ? (
          <View style={{ gap: 16 }}>
            {rows.map(({ store, km, products }, i) => (
              <Reveal key={store.id} delay={(i % 5) + 1}>
                <StoreCard
                  store={store}
                  km={km}
                  products={products}
                  saved={isStoreSaved(store.id)}
                  onSave={() => save(store)}
                  onPress={() => router.push(`/stores/${store.id}`)}
                />
              </Reveal>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="star"
            title={t('No saved shops yet')}
            body={t('Tap the star on any shop to keep it here.')}
            action={<Button label={t('All shops')} onPress={() => router.push('/stores')} />}
          />
        )}
      </Container>
    </Screen>
  );
}
