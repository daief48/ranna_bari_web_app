/**
 * One request, from the kitchen's side: name a price, then haggle.
 *
 * The cook sees the whole request and their own offer, and nothing at all
 * about anybody else's. Not "you are the third cheapest", not how many others
 * answered -- there is no read in `requestLogic` that would tell this screen,
 * which is where that guarantee has to live.
 */
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Button from '../../../src/components/Button';
import Reveal from '../../../src/components/Reveal';
import FloatLabelInput from '../../../src/components/FloatLabelInput';
import { EmptyState, errorText } from '../../../src/components/MealBits';
import {
  Banner,
  Label,
  NegotiationThread,
  OfferStatusPill,
  RequestStatusPill,
  RequestSummary,
  TurnBanner,
} from '../../../src/components/RequestBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { formatOrderDate } from '../../../src/store/OrdersContext';
import { OFFER_STATUS, REQUEST_STATUS, standing, turnOf } from '../../../src/lib/requestLogic';
import { COOK_ADVANCES } from '../../../src/lib/ledger';
import { MealStatusPill, PaymentPill } from '../../../src/components/MealBits';
import { useLang } from '../../../src/i18n/LanguageContext';

export default function CookRequestScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [counter, setCounter] = useState('');
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  const request = shop.requestById(String(id));
  const offer = useMemo(
    () => (request && kitchen ? shop.offerForCook(request.id, kitchen.id) : null),
    [shop, request, kitchen],
  );

  if (!request) {
    return (
      <CookScreen>
        <Container style={{ paddingTop: 30 }}>
          <EmptyState
            icon="alertCircle"
            title={t('Request not found')}
            body={t('That request no longer exists.')}
            action={
              <Button label={t('Food requests')} onPress={() => router.replace('/cook/requests')} />
            }
          />
        </Container>
      </CookScreen>
    );
  }

  const category = shop.categoryById(request.categoryId);

  /* Once it is paid for it is an ordinary order, and this is where the cook
     already is -- so it is driven from here rather than from a board that
     only carries shop baskets. */
  const order = request.orderId
    ? shop.orders.find((o) => o.id === request.orderId)
    : null;
  const nextStep = order
    ? COOK_ADVANCES[order.handover === 'pickup' ? 'pickup' : 'delivery'][order.status]
    : null;
  const myTurn = offer ? turnOf(offer) === 'cook' : false;
  const negotiating = offer?.status === OFFER_STATUS.NEGOTIATING;
  const closed =
    request.status === REQUEST_STATUS.CANCELLED ||
    ['not-selected', 'withdrawn'].includes(offer?.status);

  const submit = () => {
    const out = shop.submitOffer(
      request.id,
      {
        kitchenId: kitchen.id,
        name: kitchen.name,
        avatar: kitchen.avatar,
        rating: kitchen.rating,
        reviewCount: kitchen.reviewCount,
        area: kitchen.area,
        lat: kitchen.lat,
        lng: kitchen.lng,
      },
      price.trim() ? price : null,
      note.trim(),
      prepTime.trim(),
    );
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    setError(null);
    setFlash(
      price.trim()
        ? t('Your price is with the customer.')
        : t('You are on the list. Add a price when you know it.'),
    );
    setPrice('');
  };

  const send = () => {
    const out = shop.counterOffer(offer.id, 'cook', counter);
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    setError(null);
    setCounter('');
  };

  const accept = () => {
    const out = shop.acceptPrice(offer.id, 'cook');
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    setError(null);
    setFlash(t('Agreed at ৳{n}. Waiting for payment.', { n: n(standing(offer).amount) }));
  };

  const advance = () => {
    const out = shop.advanceOrder(order.id);
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    setError(null);
  };

  /* The other half of "interested": a cook who cannot take it says so, and
     the request leaves their board instead of sitting there unanswered. */
  const decline = () => {
    const out = shop.declineRequest(request.id, kitchen.id);
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    router.replace('/cook/requests');
  };

  const withdraw = () => {
    const out = shop.withdrawOffer(offer.id);
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    router.replace('/cook/requests');
  };

  return (
    <CookScreen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook/requests'))}
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
            {t('Food requests')}
          </Text>
        </Pressable>

        {/* ---- what they want ---- */}
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
          <RequestSummary request={request} category={category} />

          <View style={{ gap: 5, paddingTop: 4 }}>
            <Detail icon="user" text={request.customerName || t('A customer')} />
            {request.address ? <Detail icon="pin" text={request.address} /> : null}
            <Detail icon="clock" text={formatOrderDate(request.createdAt, lang)} />
            <Detail
              icon={request.target === 'all' ? 'sparkles' : 'chefHat'}
              text={request.target === 'all' ? t('Open to every cook') : t('Sent to you')}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {offer ? (
              <OfferStatusPill status={offer.status} />
            ) : (
              <RequestStatusPill status={request.status} />
            )}
          </View>
        </View>

        {flash ? (
          <View style={{ marginTop: 16 }}>
            <Banner tone="sage" icon="check" title={flash} />
          </View>
        ) : null}
        {error ? (
          <View style={{ marginTop: 16 }}>
            <Banner tone="primary" icon="alertCircle" title={error} />
          </View>
        ) : null}

        {/* ---- closed ---- */}
        {closed ? (
          <View style={{ marginTop: 20 }}>
            <Banner
              tone="primary"
              icon="x"
              title={
                request.status === REQUEST_STATUS.CANCELLED
                  ? t('The customer withdrew this request')
                  : t('The customer went with another cook')
              }
              body={t('Nothing more to do here.')}
            />
          </View>
        ) : null}

        {/* ---- name a price ---- */}
        {!closed && request.status === REQUEST_STATUS.OPEN ? (
          <Reveal delay={1}>
            <View style={{ marginTop: 24 }}>
              <Label text={offer ? t('Change your price') : t('Your price')} />
              <View style={{ gap: 14 }}>
                <FloatLabelInput
                  label={t('What would you charge?')}
                  value={price}
                  onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder={offer?.price != null ? String(offer.price) : '1200'}
                />
                <FloatLabelInput
                  label={t('How long you need')}
                  value={prepTime}
                  onChangeText={setPrepTime}
                  placeholder={t('24 hours')}
                />
                <FloatLabelInput
                  label={t('A note to the customer (optional)')}
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('I make these to order, fresh on the day.')}
                  multiline
                />
              </View>

              <Button
                label={offer ? t('Update my offer') : t('Send my price')}
                icon="arrowRight"
                block
                onPress={submit}
                style={{ marginTop: 16 }}
              />

              {!offer ? (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <Button
                    variant="glass"
                    label={t('Just interested')}
                    onPress={() => {
                      setPrice('');
                      submit();
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="ghost"
                    label={t('Not interested')}
                    onPress={decline}
                    style={{ flex: 1 }}
                  />
                </View>
              ) : null}

              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: type.xs,
                  lineHeight: type.xs * 1.6,
                  textAlign: 'center',
                  color: colors.textLight,
                  marginTop: 12,
                }}
              >
                {t('Other cooks cannot see your price, and you cannot see theirs.')}
              </Text>
            </View>
          </Reveal>
        ) : null}

        {/* ---- haggling ---- */}
        {!closed && offer && (negotiating || offer.status === OFFER_STATUS.AGREED) ? (
          <View style={{ marginTop: 24, gap: 16 }}>
            <TurnBanner offer={offer} side="cook" cookName={kitchen?.name ?? ''} />

            <View>
              <Label text={t('How the price moved')} />
              <NegotiationThread offer={offer} cookName={t('You')} />
            </View>

            {negotiating && myTurn ? (
              <View style={{ gap: 12 }}>
                <Button
                  label={t('Accept ৳{n}', { n: n(standing(offer)?.amount ?? 0) })}
                  icon="check"
                  iconPosition="left"
                  block
                  onPress={accept}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View
                    style={[
                      {
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        height: 52,
                        paddingHorizontal: 16,
                        borderRadius: radius.pill,
                        backgroundColor: colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: colors.line,
                      },
                      shadow.sm,
                    ]}
                  >
                    <Text
                      style={{ fontFamily: font.uiBold, fontSize: 17, color: colors.textMuted }}
                    >
                      ৳
                    </Text>
                    <TextInput
                      value={counter}
                      onChangeText={(v) => setCounter(v.replace(/[^0-9]/g, ''))}
                      placeholder={t('Meet in the middle')}
                      placeholderTextColor={colors.textLight}
                      keyboardType="number-pad"
                      returnKeyType="send"
                      onSubmitEditing={() => counter && send()}
                      style={[
                        {
                          flex: 1,
                          minWidth: 0,
                          fontFamily: font.ui,
                          fontSize: 16,
                          color: colors.text,
                        },
                        Platform.OS === 'web' ? { outlineStyle: 'none' } : null,
                      ]}
                    />
                  </View>
                  <Button
                    variant="glass"
                    label={t('Send')}
                    disabled={!counter}
                    onPress={send}
                  />
                </View>
              </View>
            ) : null}


          </View>
        ) : null}

        {/* ---- the order it became ---- */}
        {order ? (
          <View style={{ marginTop: 24, gap: 12 }}>
            <Label text={t('The order')} />
            <View
              style={[
                {
                  gap: 12,
                  padding: 16,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
                shadow.sm,
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.sm + 2,
                      color: colors.text,
                    }}
                  >
                    {order.customerName || t('A customer')}
                  </Text>
                  <Text
                    style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                  >
                    {order.code}
                    {order.address ? ` · ${order.address}` : ''}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: type.md,
                    color: colors.text,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  ৳{n(order.amount)}
                </Text>
              </View>

              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              >
                <MealStatusPill status={order.status} />
                <PaymentPill payment={order.payment} />
              </View>

              {nextStep ? (
                <Button
                  small
                  label={t(
                    {
                      confirmed: 'Start cooking',
                      preparing: 'Mark ready',
                      ready: 'Send out',
                      delivering: 'Mark delivered',
                    }[order.status],
                  )}
                  block
                  onPress={advance}
                />
              ) : order.status === 'delivered' ? (
                <Text
                  style={{ fontFamily: font.ui, fontSize: type.xs + 1, color: colors.textMuted }}
                >
                  {t('Waiting for the customer to confirm they got it.')}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ---- pull out ---- */}
        {!closed && offer && offer.status !== OFFER_STATUS.AGREED ? (
          <Button
            variant="ghost"
            label={t('Withdraw my offer')}
            block
            onPress={withdraw}
            style={{ marginTop: 26 }}
          />
        ) : null}
      </Container>
    </CookScreen>
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
