/**
 * The shops.
 *
 * Separate from Browse on purpose: browsing kitchens is "what shall I eat
 * tonight", and this is "who sells the achar". Same cooks, different errand.
 *
 * Only shops that will deliver to the address on file are listed, the same
 * rule the kitchen list follows -- a shop that cannot reach you is not a
 * shop, it is a window display.
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import SectionHeader from '../../src/components/SectionHeader';
import { EmptyState } from '../../src/components/MealBits';
import { Skeleton, StoreCard } from '../../src/components/StoreBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { useLang } from '../../src/i18n/LanguageContext';

export default function StoresScreen() {
  const { colors } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { account } = useAuth();
  const { storesNearby, hydrated } = useCommerce();

  const origin = useMemo(
    () =>
      typeof account?.lat === 'number' && typeof account?.lng === 'number'
        ? { lat: account.lat, lng: account.lng }
        : null,
    [account],
  );

  const rows = useMemo(() => storesNearby(origin), [storesNearby, origin]);

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
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
          lead={t('HOME')}
          accent={t('SHOPS')}
          subtitle={t('Cakes, pitha, achar and everything else cooks make to keep.')}
          style={{ marginBottom: 22 }}
        />

        {!hydrated ? (
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
                  onPress={() => router.push(`/stores/${store.id}`)}
                />
              </Reveal>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="box"
            title={t('No shops near you yet')}
            body={t(
              'Cooks near you have not opened a shop yet. If you cook, yours can be the first.',
            )}
            action={
              <Button label={t('Browse kitchens')} onPress={() => router.push('/browse')} />
            }
          />
        )}
      </Container>
    </Screen>
  );
}
