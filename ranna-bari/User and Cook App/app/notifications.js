/**
 * What the meal system has been trying to tell you.
 *
 * One screen, two audiences: which list you get follows the mode you are in,
 * because "a customer showed interest" and "your food is on the way" are
 * addressed to two different people who happen to share this device.
 *
 * There is no push here and there cannot be -- this build has no server to
 * send from and no device token to send to. These are the same events a push
 * notification would carry, delivered where they can be: in the app.
 */
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import SectionHeader from '../src/components/SectionHeader';
import { EmptyState, notificationText } from '../src/components/MealBits';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useCommerce } from '../src/store/CommerceContext';
import { timeAgo } from '../src/store/OrdersContext';
import { useLang } from '../src/i18n/LanguageContext';

/** Which glyph carries each event, so the list scans without being read. */
const ICONS = {
  'meal-published': 'pot',
  'meal-cancelled': 'x',
  interest: 'sparkles',
  'order-confirmed': 'receipt',
  'order-placed': 'lock',
  'order-preparing': 'pot',
  'order-ready': 'chefHat',
  'order-delivering': 'delivery',
  'order-delivered': 'box',
  'order-completed': 'shieldCheck',
  'order-cancelled': 'x',
  'payment-released': 'banknote',
  'confirm-receipt': 'box',
  topup: 'plus',
  'store-order-new': 'box',
  'preorder-new': 'clock',
  'preorder-sent': 'clock',
  'preorder-accepted': 'check',
  'preorder-rejected': 'x',
};

export default function NotificationsScreen() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const { isCookMode } = useAuth();
  const meals = useCommerce();

  const audience = isCookMode ? 'cook' : 'customer';
  const rows = meals.notificationsFor(audience);

  /* Opening the list is reading it. Marking on unmount instead would leave a
     badge sitting over a screen the person is looking at. */
  const { markRead } = meals;
  useEffect(() => {
    markRead(audience);
  }, [markRead, audience]);

  const open = (nt) => {
    if (nt.orderId) {
      /* Which order screen depends on what sold it -- a shop order has no
         meal behind it, and a meal order has no shop. */
      const order = meals.orders.find((o) => o.id === nt.orderId);
      if (order?.kind === 'store') {
        router.push(
          isCookMode
            ? order.status === 'pending'
              ? '/cook/store/preorders'
              : '/cook/store/orders'
            : `/store-order/${nt.orderId}`,
        );
        return;
      }
      router.push(isCookMode ? `/cook/meal/${nt.mealId}` : `/meal-order/${nt.orderId}`);
      return;
    }
    if (nt.mealId) {
      router.push(isCookMode ? `/cook/meal/${nt.mealId}` : `/meals/${nt.mealId}`);
      return;
    }
    router.push('/wallet');
  };

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
          accent={t('UPDATES')}
          subtitle={
            isCookMode
              ? t('Interest, orders and payouts from your kitchen and shop.')
              : t('Meals near you, and where your orders have got to.')
          }
          right={
            rows.length ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => meals.clearNotifications(audience)}
                hitSlop={8}
              >
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: type.xs + 1,
                    color: colors.primary,
                  }}
                >
                  {t('Clear')}
                </Text>
              </Pressable>
            ) : null
          }
          style={{ marginBottom: 22 }}
        />

        {rows.length ? (
          <View style={{ gap: 10 }}>
            {rows.map((nt) => {
              const text = notificationText(nt, {
                mealById: meals.mealById,
                orders: meals.orders,
                t,
                n,
              });
              return (
                <Pressable
                  key={nt.id}
                  accessibilityRole="link"
                  onPress={() => open(nt)}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: 14,
                      borderRadius: radius.sm,
                      backgroundColor: pressed ? colors.primary50 : colors.surfaceSolid,
                      borderWidth: 1,
                      borderColor: nt.read ? colors.line2 : colors.primary200,
                    },
                    shadow.xs,
                  ]}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: nt.read ? colors.sunken : colors.primary50,
                    }}
                  >
                    <Icon
                      name={ICONS[nt.kind] ?? 'sparkles'}
                      size={16}
                      color={nt.read ? colors.textMuted : colors.primary}
                    />
                  </View>

                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: type.sm + 2,
                        color: colors.text,
                      }}
                    >
                      {text.title}
                    </Text>
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.sm,
                        lineHeight: type.sm * 1.5,
                        color: colors.textMuted,
                      }}
                    >
                      {text.body}
                    </Text>
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.xs,
                        color: colors.textLight,
                      }}
                    >
                      {timeAgo(nt.at, t, n)}
                    </Text>
                  </View>

                  <Icon name="chevronRight" size={15} color={colors.textLight} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="sparkles"
            title={t('Nothing new')}
            body={
              isCookMode
                ? t('Publish a meal and you will hear the moment someone books it.')
                : t('When a cook near you plans tomorrow’s meal, it lands here.')
            }
          />
        )}
      </Container>
    </Screen>
  );
}
