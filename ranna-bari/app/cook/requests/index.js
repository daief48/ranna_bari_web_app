/**
 * Requests a cook could take.
 *
 * What is deliberately absent is any hint of what anyone else bid. A cook
 * naming a price should be pricing the work, and a board showing the current
 * lowest turns that into an auction the cheapest kitchen always wins.
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import SectionHeader from '../../../src/components/SectionHeader';
import { EmptyState } from '../../../src/components/MealBits';
import {
  OfferStatusPill,
  RequestStatusPill,
  RequestSummary,
} from '../../../src/components/RequestBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { timeAgo } from '../../../src/store/OrdersContext';
import { REQUEST_STATUS } from '../../../src/lib/requestLogic';
import { useLang } from '../../../src/i18n/LanguageContext';

export default function CookRequests() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  const rows = useMemo(() => {
    if (!kitchen) return { open: [], mine: [], done: [] };
    const all = shop
      .requestsForCook(kitchen.id)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);

    const withMine = all.map((request) => ({
      request,
      offer: shop.offerForCook(request.id, kitchen.id),
    }));

    return {
      // Nobody has answered for this kitchen yet, and it is still taking bids.
      open: withMine.filter(
        (r) => !r.offer && r.request.status === REQUEST_STATUS.OPEN,
      ),
      // Answered, and still going somewhere.
      mine: withMine.filter(
        (r) =>
          r.offer &&
          !['not-selected', 'withdrawn'].includes(r.offer.status) &&
          r.request.status !== REQUEST_STATUS.CANCELLED,
      ),
      done: withMine.filter(
        (r) =>
          (r.offer && ['not-selected', 'withdrawn'].includes(r.offer.status)) ||
          r.request.status === REQUEST_STATUS.CANCELLED,
      ),
    };
  }, [shop, kitchen]);

  const total = rows.open.length + rows.mine.length + rows.done.length;

  return (
    <CookScreen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook'))}
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
            {t('Kitchen')}
          </Text>
        </Pressable>

        <SectionHeader
          lead={t('FOOD')}
          accent={t('REQUESTS')}
          subtitle={
            rows.open.length
              ? t('{n} people are looking for something you could make.', {
                  n: n(rows.open.length),
                })
              : t('Customers asking for things nobody has listed.')
          }
        />

        {rows.open.length ? (
          <Group label={t('Waiting for your price')}>
            {rows.open.map(({ request }, i) => (
              <Reveal key={request.id} delay={(i % 5) + 1}>
                <Row
                  request={request}
                  category={shop.categoryById(request.categoryId)}
                  onPress={() => router.push(`/cook/requests/${request.id}`)}
                />
              </Reveal>
            ))}
          </Group>
        ) : null}

        {rows.mine.length ? (
          <Group label={t('Your offers')}>
            {rows.mine.map(({ request, offer }) => (
              <Row
                key={request.id}
                request={request}
                offer={offer}
                category={shop.categoryById(request.categoryId)}
                onPress={() => router.push(`/cook/requests/${request.id}`)}
              />
            ))}
          </Group>
        ) : null}

        {rows.done.length ? (
          <Group label={t('Closed')}>
            {rows.done.map(({ request, offer }) => (
              <Row
                key={request.id}
                request={request}
                offer={offer}
                category={shop.categoryById(request.categoryId)}
                muted
                onPress={() => router.push(`/cook/requests/${request.id}`)}
              />
            ))}
          </Group>
        ) : null}

        {!total ? (
          <EmptyState
            icon="sparkles"
            title={t('Nothing asked for yet')}
            body={t(
              'When somebody near you wants something they cannot find, it lands here and you can name your price.',
            )}
          />
        ) : null}
      </Container>
    </CookScreen>
  );
}

function Group({ label, children }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 26 }}>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.sm,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.textMuted,
          marginBottom: 12,
        }}
      >
        {label}
      </Text>
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}

function Row({ request, offer, category, muted, onPress }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={request.title}
      onPress={onPress}
      style={({ pressed }) => [
        {
          gap: 12,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? colors.sage100 : colors.line,
          opacity: muted ? 0.65 : 1,
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <RequestSummary request={request} category={category} compact />
        </View>
        {offer?.price != null ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: type.md,
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              ৳{n(offer.price)}
            </Text>
            <Text style={{ fontFamily: font.ui, fontSize: 10, color: colors.textLight }}>
              {t('your price')}
            </Text>
          </View>
        ) : (
          <Icon name="chevronRight" size={16} color={colors.textLight} />
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {offer ? (
          <OfferStatusPill status={offer.status} />
        ) : (
          <RequestStatusPill status={request.status} />
        )}
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textLight }}>
          {request.target === 'all' ? t('Open to every cook') : t('Sent to you')}
          {' · '}
          {timeAgo(request.createdAt, t, n)}
        </Text>
      </View>
    </Pressable>
  );
}
