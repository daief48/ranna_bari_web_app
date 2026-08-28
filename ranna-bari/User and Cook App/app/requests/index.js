/**
 * Everything the customer has asked for.
 *
 * Each row answers the only question worth asking of an open request: has
 * anyone answered, and what is it going to cost. The spread of offers rather
 * than a count, because "৳950 – ৳1,250" tells you whether to keep waiting
 * and "5 offers" does not.
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
import { RequestStatusPill, RequestSummary } from '../../src/components/RequestBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { customerKeyOf } from '../../src/lib/ledger';
import { useLang } from '../../src/i18n/LanguageContext';

export default function RequestsScreen() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const { account, isSignedIn } = useAuth();
  const shop = useCommerce();

  const key = customerKeyOf(account);
  const requests = useMemo(
    () => shop.requestsForCustomer(key).slice().sort((a, b) => b.createdAt - a.createdAt),
    [shop, key],
  );

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
          lead={t('YOUR')}
          accent={t('REQUESTS')}
          subtitle={t('Ask for something nobody has listed, and let cooks name their price.')}
          style={{ marginBottom: 20 }}
        />

        <Button
          label={t('Ask for something')}
          icon="plus"
          iconPosition="left"
          block
          onPress={() => router.push(isSignedIn ? '/requests/new' : '/auth')}
        />

        {requests.length ? (
          <View style={{ gap: 14, marginTop: 26 }}>
            {requests.map((request, i) => (
              <Reveal key={request.id} delay={(i % 5) + 1}>
                <Row
                  request={request}
                  summary={shop.offerSummary(request.id)}
                  category={shop.categoryById(request.categoryId)}
                  selected={
                    request.selectedOfferId
                      ? shop.offersForRequest(request.id).find((o) => o.id === request.selectedOfferId)
                      : null
                  }
                  onPress={() => router.push(`/requests/${request.id}`)}
                />
              </Reveal>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="sparkles"
            title={t('Nothing asked for yet')}
            body={t(
              'Wanted a two-pound chocolate cake for Friday and could not find one? Describe it, and every cook who could make it can offer you a price.',
            )}
          />
        )}
      </Container>
    </Screen>
  );
}

function Row({ request, summary, category, selected, onPress }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  /* One line that says where this is up to, chosen by what the customer
     would do next rather than by the status name. */
  const line = () => {
    if (request.status === 'ordered') return t('Paid and on its way');
    if (request.status === 'cancelled') return t('You withdrew this');
    if (request.status === 'agreed') {
      return t('Agreed at ৳{n} — pay to confirm', { n: n(selected?.agreedPrice ?? 0) });
    }
    if (request.status === 'selected') {
      return t('Negotiating with {who}', { who: selected?.cookName ?? '' });
    }
    if (!summary.priced) return t('No offers yet');
    if (summary.low === summary.high) {
      return t('{n} offers · ৳{low}', { n: n(summary.priced), low: n(summary.low) });
    }
    return t('{n} offers · ৳{low} – ৳{high}', {
      n: n(summary.priced),
      low: n(summary.low),
      high: n(summary.high),
    });
  };

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${request.title}, ${line()}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          gap: 12,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? colors.primary200 : colors.line,
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <RequestSummary request={request} category={category} compact />
        </View>
        <Icon name="chevronRight" size={16} color={colors.textLight} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <RequestStatusPill status={request.status} />
        <Text
          style={{
            flex: 1,
            fontFamily: font.uiSemi,
            fontSize: type.xs + 1,
            color: colors.textMuted,
          }}
        >
          {line()}
        </Text>
      </View>

      {request.status === 'open' && summary.interested > summary.priced ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textLight }}>
          {t('{n} more interested, price to come', {
            n: n(summary.interested - summary.priced),
          })}
        </Text>
      ) : null}
    </Pressable>
  );
}
