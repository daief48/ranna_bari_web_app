/**
 * One request, through its whole life: offers in, one chosen, a price
 * haggled, and then paid for.
 *
 * The screen changes shape three times because the customer's job changes
 * three times. While it is open they are comparing; once they have chosen
 * they are negotiating with one person; once agreed there is a single number
 * and one button. Showing all three at once would be a form; showing them in
 * turn is a conversation.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import { Body, Heading } from '../../src/components/Typography';
import { EmptyState, errorText } from '../../src/components/MealBits';
import {
  Banner,
  Label,
  NegotiationThread,
  OfferCard,
  RequestStatusPill,
  RequestSummary,
  TurnBanner,
} from '../../src/components/RequestBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { REQUEST_STATUS, isLiveOffer, standing, turnOf } from '../../src/lib/requestLogic';
import { distanceKm } from '../../src/lib/geo';
import { useLang } from '../../src/i18n/LanguageContext';

export default function RequestScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const { account } = useAuth();
  const shop = useCommerce();

  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [counter, setCounter] = useState('');
  const [asking, setAsking] = useState(null); // 'pay' | 'cancel'

  const request = shop.requestById(String(id));
  const offers = useMemo(
    () => (request ? shop.offersForRequest(request.id) : []),
    [shop, request],
  );

  if (!request) {
    return (
      <Screen>
        <Container style={{ paddingTop: 30 }}>
          <EmptyState
            icon="alertCircle"
            title={t('Request not found')}
            body={t('That request no longer exists.')}
            action={
              <Button label={t('Your requests')} onPress={() => router.replace('/requests')} />
            }
          />
        </Container>
      </Screen>
    );
  }

  const selected = offers.find((o) => o.id === request.selectedOfferId) ?? null;
  /* Cheapest first. Price is not the only thing that matters -- the card
     carries rating, distance and how long they need for exactly that reason
     -- but it is the one people scan for, and a list whose header says
     "from ৳1040" should open on the ৳1040. Offers with no price yet go last,
     since there is nothing to compare them on. */
  const live = offers
    .filter(isLiveOffer)
    .slice()
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  const priced = live.filter((o) => o.price != null);
  const cheapest = priced.length ? Math.min(...priced.map((o) => o.price)) : null;
  const category = shop.categoryById(request.categoryId);

  const origin =
    typeof account?.lat === 'number' && typeof account?.lng === 'number'
      ? { lat: account.lat, lng: account.lng }
      : null;
  const kmTo = (offer) =>
    origin && typeof offer.lat === 'number'
      ? distanceKm(origin, { lat: offer.lat, lng: offer.lng })
      : null;

  const balance = shop.wallet.customer;
  const agreed = selected?.agreedPrice ?? null;
  const affordable = agreed != null && balance >= agreed;
  const myTurn = selected ? turnOf(selected) === 'customer' : false;

  const choose = (offer) => {
    const out = shop.selectOffer(request.id, offer.id);
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    setError(null);
    setFlash(t('You picked {who}. The other cooks were told.', { who: offer.cookName }));
  };

  const send = () => {
    const out = shop.counterOffer(selected.id, 'customer', counter);
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    setError(null);
    setCounter('');
  };

  const accept = () => {
    const out = shop.acceptPrice(selected.id, 'customer');
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    setError(null);
    setFlash(t('Agreed at ৳{n}. Pay to confirm.', { n: n(standing(selected).amount) }));
  };

  const pay = () => {
    setAsking(null);
    const out = shop.payForRequest(request.id, {
      name: account?.name ?? '',
      phone: account?.phone ?? '',
      address: account?.address ?? account?.area ?? '',
    });
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    router.replace(`/request-order/${out.result.id}`);
  };

  const cancel = () => {
    setAsking(null);
    const out = shop.cancelRequest(request.id);
    if (!out.ok) return setError(errorText(out.error, t, n, out));
    router.replace('/requests');
  };

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/requests'))}
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
            {t('Your requests')}
          </Text>
        </Pressable>

        {/* ---- what was asked ---- */}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <RequestStatusPill status={request.status} />
            <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textLight }}>
              {request.code}
            </Text>
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

        {/* ================= comparing ================= */}
        {request.status === REQUEST_STATUS.OPEN ? (
          <View style={{ marginTop: 26 }}>
            <Label
              text={
                priced.length
                  ? t('{n} offers', { n: n(priced.length) })
                  : t('Offers')
              }
              right={
                cheapest != null ? (
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.xs + 1,
                      color: colors.textMuted,
                    }}
                  >
                    {t('from ৳{n}', { n: n(cheapest) })}
                  </Text>
                ) : null
              }
            />

            {live.length ? (
              <View style={{ gap: 14 }}>
                {live.map((offer, i) => (
                  <Reveal key={offer.id} delay={(i % 5) + 1}>
                    <OfferCard
                      offer={offer}
                      km={kmTo(offer)}
                      cheapest={offer.price != null && offer.price === cheapest}
                      action={
                        offer.price != null ? (
                          <Button
                            small
                            label={t('Choose {who}', { who: offer.cookName })}
                            block
                            onPress={() => choose(offer)}
                          />
                        ) : null
                      }
                    />
                  </Reveal>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="clock"
                title={t('No offers yet')}
                body={t('Cooks who can make this will answer with their own price.')}
              />
            )}
          </View>
        ) : null}

        {/* ================= negotiating ================= */}
        {selected && request.status !== REQUEST_STATUS.ORDERED ? (
          <View style={{ marginTop: 26, gap: 16 }}>
            <Label text={t('Your cook')} />
            <OfferCard offer={selected} km={kmTo(selected)} selected />

            <TurnBanner offer={selected} side="customer" cookName={selected.cookName} />

            <View>
              <Label text={t('How the price moved')} />
              <NegotiationThread offer={selected} cookName={selected.cookName} />
            </View>

            {/* ---- your move ---- */}
            {request.status === REQUEST_STATUS.SELECTED && myTurn ? (
              <View style={{ gap: 12 }}>
                <Button
                  label={t('Accept ৳{n}', { n: n(standing(selected)?.amount ?? 0) })}
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
                      placeholder={t('Offer less')}
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

            {/* ---- pay ---- */}
            {request.status === REQUEST_STATUS.AGREED ? (
              <View style={{ gap: 12 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: affordable ? colors.line : colors.saffron100,
                  }}
                >
                  <Icon
                    name="banknote"
                    size={17}
                    color={affordable ? colors.sage : colors.saffron}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: type.sm + 1,
                        color: colors.text,
                      }}
                    >
                      {t('Wallet balance')}: ৳{n(balance)}
                    </Text>
                    {!affordable ? (
                      <Text
                        style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.saffron }}
                      >
                        {t('Top up ৳{n} to place this order', { n: n(agreed - balance) })}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push('/wallet')}
                    hitSlop={8}
                  >
                    <Text
                      style={{
                        fontFamily: font.uiBold,
                        fontSize: type.xs + 1,
                        color: colors.primary,
                      }}
                    >
                      {t('Top up')}
                    </Text>
                  </Pressable>
                </View>

                <Button
                  label={
                    affordable
                      ? t('Pay ৳{n}', { n: n(agreed) })
                      : t('Top up to continue')
                  }
                  icon="lock"
                  iconPosition="left"
                  block
                  onPress={affordable ? () => setAsking('pay') : () => router.push('/wallet')}
                />
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    lineHeight: type.xs * 1.6,
                    textAlign: 'center',
                    color: colors.textLight,
                  }}
                >
                  {t('The cook is paid only after you confirm the food arrived.')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ================= ordered ================= */}
        {request.status === REQUEST_STATUS.ORDERED ? (
          <View style={{ marginTop: 26, gap: 14 }}>
            <Banner
              tone="sage"
              icon="shieldCheck"
              title={t('Ordered at ৳{n}', { n: n(agreed ?? 0) })}
              body={t('Track it, and confirm when the food arrives.')}
            />
            <Button
              label={t('Track your order')}
              icon="arrowRight"
              block
              onPress={() => router.push(`/request-order/${request.orderId}`)}
            />
          </View>
        ) : null}

        {/* ---- the ones who did not get it ---- */}
        {request.status !== REQUEST_STATUS.OPEN &&
        offers.some((o) => !isLiveOffer(o)) ? (
          <View style={{ marginTop: 30 }}>
            <Label text={t('Other offers')} />
            <View style={{ gap: 12 }}>
              {offers
                .filter((o) => !isLiveOffer(o))
                .map((offer) => (
                  <OfferCard key={offer.id} offer={offer} km={kmTo(offer)} />
                ))}
            </View>
          </View>
        ) : null}

        {request.status !== REQUEST_STATUS.ORDERED &&
        request.status !== REQUEST_STATUS.CANCELLED ? (
          <Button
            variant="ghost"
            label={t('Withdraw this request')}
            block
            onPress={() => setAsking('cancel')}
            style={{ marginTop: 26 }}
          />
        ) : null}
      </Container>

      <Confirm
        open={asking === 'pay'}
        title={t('Pay ৳{n}?', { n: n(agreed ?? 0) })}
        body={t(
          '৳{n} leaves your wallet now and is held by RannaBari. {cook} is paid only after you confirm the food arrived.',
          { n: n(agreed ?? 0), cook: selected?.cookName ?? '' },
        )}
        confirmLabel={t('Pay now')}
        onConfirm={pay}
        onClose={() => setAsking(null)}
      />

      <Confirm
        open={asking === 'cancel'}
        title={t('Withdraw this request?')}
        body={t('Every offer on it closes. Nothing has been charged, so nothing is refunded.')}
        confirmLabel={t('Withdraw')}
        onConfirm={cancel}
        onClose={() => setAsking(null)}
      />
    </Screen>
  );
}

function Confirm({ open, title, body, confirmLabel, onConfirm, onClose }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 20,
          backgroundColor: 'rgba(20, 16, 14, 0.5)',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              padding: 22,
              gap: 14,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
            },
            shadow.lg,
          ]}
        >
          <Heading size={19}>{title}</Heading>
          <Body muted size={14}>
            {body}
          </Body>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="glass" label={t('Never mind')} onPress={onClose} style={{ flex: 1 }} />
            <Button label={confirmLabel} onPress={onConfirm} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
