/**
 * Requests a cook could take.
 *
 * What is deliberately absent is any hint of what anyone else bid. A cook
 * naming a price should be pricing the work, and a board showing the current
 * lowest turns that into an auction the cheapest kitchen always wins.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import SectionHeader from '../../../src/components/SectionHeader';
import { EmptyState } from '../../../src/components/MealBits';
import CookRequestsBoard from '../../../src/components/CookRequestsBoard';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useCookRequestRows } from '../../../src/features/requests/useCookRequestRows';
import { useLang } from '../../../src/i18n/LanguageContext';
import { withKitchenGate } from '../../../src/components/CookBits';

/* Held behind the same approval gate as the tab group — see `withKitchenGate`. */
export default withKitchenGate(CookRequests);

function CookRequests() {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();

  /* The grouping rules live in one place -- the Orders tab and the badges read the same hook. */
  const rows = useCookRequestRows();

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

        <CookRequestsBoard rows={rows} onOpen={(request) => router.push(`/cook/requests/${request.id}`)} />

        {!total && rows.ready && !rows.failed ? (
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
