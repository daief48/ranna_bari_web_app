/**
 * Requests waiting for an answer.
 *
 * A pre-order is somebody asking whether the cook will make something, with
 * the money already set aside to show they mean it. Both answers are one tap
 * and both are final for that request, so they sit side by side and neither
 * is the default.
 *
 * Declining is not a failure state. A cook who cannot make forty pieces of
 * pitha by Friday should say so in one tap and have the customer's money back
 * before they have closed the app.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import { Body, Heading, Price } from '../../../src/components/Typography';
import { EmptyState, errorText } from '../../../src/components/MealBits';
import { OrderLines } from '../../../src/components/StoreBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { formatOrderDate, timeAgo } from '../../../src/store/OrdersContext';
import { useLang } from '../../../src/i18n/LanguageContext';
import { formatAddress } from '../../../src/lib/address';
import { useAlert } from '../../../src/components/Alert';

export default function StorePreorders() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const alert = useAlert();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;

  const pending = useMemo(
    () => (kitchen ? shop.pendingPreorders(kitchen.id) : []),
    [shop, kitchen],
  );

  /* Answered requests stay on the screen, newest first: a cook who declines
     one by mistake should be able to see that they did. */
  const answered = useMemo(() => {
    if (!store) return [];
    return shop
      .storeOrders(store.id)
      .filter((o) => o.preorder && o.status !== 'pending')
      .slice(0, 8);
  }, [shop, store]);

  const accept = async (order) => {
    const out = await shop.acceptPreorder(order.id);
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(t('Accepted. {customer} has been told.', { customer: order.customerName }));
  };

  const reject = async (order) => {
    const out = await shop.rejectPreorder(order.id, 'Declined by the kitchen');
    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    alert.success(t('Declined. ৳{n} went back to {customer}.', {
      n: n(out.result),
      customer: order.customerName,
    }));
  };

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
            {t('Pre-orders')}
          </Heading>
          <Body muted size={15} style={{ marginTop: 4, marginBottom: 20 }}>
            {pending.length
              ? t(
                  pending.length === 1
                    ? '{n} person is waiting to hear from you.'
                    : '{n} people are waiting to hear from you.',
                  { n: n(pending.length) },
                )
              : t('Requests for things you were out of land here.')}
          </Body>
        </Reveal>

        {flash ? <Flash tone="sage" icon="check" text={flash} /> : null}
        {error ? <Flash tone="primary" icon="alertCircle" text={error} /> : null}

        {pending.length ? (
          <View style={{ gap: 12, marginTop: 4 }}>
            {pending.map((order, i) => (
              <Reveal key={order.id} delay={(i % 5) + 1}>
                <Request
                  order={order}
                  onAccept={() => accept(order)}
                  onReject={() => reject(order)}
                />
              </Reveal>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="clock"
            title={t('Nothing waiting')}
            body={t(
              'Turn on pre-orders for a product and customers can still ask for it when it sells out.',
            )}
          />
        )}

        {/* ---- what has already been answered ---- */}
        {answered.length ? (
          <View style={{ marginTop: 30 }}>
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
              {t('Already answered')}
            </Text>
            <View style={{ gap: 10 }}>
              {answered.map((order) => (
                <View
                  key={order.id}
                  style={[
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: radius.sm,
                      backgroundColor: colors.surfaceSolid,
                      borderWidth: 1,
                      borderColor: colors.line2,
                    },
                    shadow.xs,
                  ]}
                >
                  <Icon
                    name={order.status === 'rejected' ? 'x' : 'check'}
                    size={16}
                    color={order.status === 'rejected' ? colors.textMuted : colors.sage}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
                    >
                      {order.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                    >
                      {order.customerName} · {formatOrderDate(order.createdAt, lang)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 10,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      color: order.status === 'rejected' ? colors.textMuted : colors.sage,
                    }}
                  >
                    {order.status === 'rejected' ? t('Declined') : t('Accepted')}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Container>
    </CookScreen>
  );
}

function Request({ order, onAccept, onReject }) {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();

  return (
    <View
      style={[
        {
          gap: 12,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.saffron100,
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image
          source={{ uri: order.image }}
          contentFit="cover"
          transition={200}
          style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.sunken }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.uiSemi, fontSize: type.sm + 2, color: colors.text }}
          >
            {order.customerName || t('A customer')}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
          >
            {order.code} · {timeAgo(order.createdAt, t, n)}
          </Text>
        </View>
        <Price size={18}>৳{n(order.amount)}</Price>
      </View>

      <OrderLines lines={order.lines ?? []} />

      <View style={{ gap: 4 }}>
        {order.phone ? (
          <Detail icon="phone" text={order.phone} />
        ) : null}
        {formatAddress(order.address) ? (
          <Detail icon="pin" text={formatAddress(order.address)} />
        ) : null}
        <Detail icon="clock" text={formatOrderDate(order.createdAt, lang)} />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          borderRadius: radius.sm,
          backgroundColor: colors.saffron50,
        }}
      >
        <Icon name="lock" size={14} color={colors.saffron} />
        <Text
          style={{
            flex: 1,
            fontFamily: font.ui,
            fontSize: type.xs + 1,
            lineHeight: (type.xs + 1) * 1.5,
            color: colors.text,
          }}
        >
          {t('৳{n} is held. Declining returns it in full.', { n: n(order.amount) })}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          variant="glass"
          label={t('Decline')}
          onPress={onReject}
          style={{ flex: 1 }}
        />
        <Button
          label={t('Accept')}
          icon="check"
          iconPosition="left"
          onPress={onAccept}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

function Detail({ icon, text }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={12} color={colors.textLight} />
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
      >
        {text}
      </Text>
    </View>
  );
}

function Flash({ tone, icon, text }) {
  const { colors } = useTheme();
  const fg = tone === 'sage' ? colors.sage : colors.primary;
  const bg = tone === 'sage' ? colors.sage50 : colors.primary50;
  const line = tone === 'sage' ? colors.sage100 : colors.primary200;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        marginBottom: 16,
        borderRadius: radius.sm,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: line,
      }}
    >
      <Icon name={icon} size={16} color={fg} />
      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: type.sm,
          lineHeight: type.sm * 1.5,
          color: colors.text,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
