/**
 * One meal, and the two things a customer can do about it.
 *
 * "Interested" is free and reversible; "Confirm order" takes money. Keeping
 * them visibly different — a quiet outline against a solid button, with the
 * amount and the wallet balance spelled out above it — is most of what stops
 * the second being pressed by accident.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Button from '../../src/components/Button';
import { Body, Heading, Price } from '../../src/components/Typography';
import {
  CountTile,
  EmptyState,
  deadlineLabel,
  mealErrorText,
  serviceLabel,
} from '../../src/components/MealBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useMeals } from '../../src/store/MealsContext';
import { customerKeyOf } from '../../src/lib/mealLogic';
import { distanceKm, formatDistance } from '../../src/lib/geo';
import { useLang } from '../../src/i18n/LanguageContext';

export default function MealScreen() {
  const { id } = useLocalSearchParams();
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const router = useRouter();
  const { account, isSignedIn } = useAuth();
  const meals = useMeals();

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const meal = meals.mealById(String(id));
  const key = customerKeyOf(account);

  const mine = useMemo(
    () =>
      meal
        ? meals
            .ordersForMeal(meal.id)
            .find((o) => o.customerKey === key && o.status !== 'cancelled')
        : null,
    [meals, meal, key],
  );

  if (!meal) {
    return (
      <Screen>
        <Container style={{ paddingTop: 30 }}>
          <EmptyState
            icon="alertCircle"
            title={t('Meal not found')}
            body={t('That meal is no longer listed.')}
            action={
              <Button label={t('Tomorrow’s meals')} onPress={() => router.replace('/meals')} />
            }
          />
        </Container>
      </Screen>
    );
  }

  const km =
    typeof account?.lat === 'number' && typeof meal.lat === 'number'
      ? distanceKm({ lat: account.lat, lng: account.lng }, { lat: meal.lat, lng: meal.lng })
      : null;
  const away = formatDistance(km, t, n);

  const left = meals.remaining(meal);
  const confirmed = meals.confirmedCount(meal.id);
  const interested = meal.interested?.length ?? 0;
  const isInterested = (meal.interested ?? []).includes(key);
  const open = meals.isOpen(meal);
  const balance = meals.wallet.customer;
  const affordable = balance >= meal.price;

  const onInterest = () => {
    if (!isSignedIn) return router.push('/auth');
    setError(null);
    meals.toggleInterest(meal.id, key);
  };

  const onConfirm = () => {
    if (!isSignedIn) return router.push('/auth');
    setError(null);
    setConfirming(true);
  };

  const doConfirm = () => {
    setBusy(true);
    const out = meals.confirmOrder(meal.id, {
      key,
      name: account?.name ?? '',
      phone: account?.phone ?? '',
      address: account?.address ?? account?.area ?? '',
    });
    setBusy(false);
    setConfirming(false);

    if (!out.ok) {
      setError(mealErrorText(out.error, t, n, out));
      return;
    }
    router.replace(`/meal-order/${out.result.id}`);
  };

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/meals'))}
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

        <Image
          source={{ uri: meal.image }}
          contentFit="cover"
          transition={250}
          style={{
            width: '100%',
            height: 220,
            borderRadius: radius.md,
            backgroundColor: colors.sunken,
          }}
        />

        <View style={{ paddingTop: 20, gap: 10 }}>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs + 1,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.primary,
            }}
          >
            {serviceLabel(meal, t, lang)}
          </Text>

          <Heading size={26}>{meal.title}</Heading>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Price size={26}>৳{n(meal.price)}</Price>
            <Text
              style={{ fontFamily: font.ui, fontSize: type.sm, color: colors.textMuted }}
            >
              {t('per plate')}
            </Text>
          </View>

          {meal.description ? (
            <Body muted size={15} style={{ marginTop: 4 }}>
              {meal.description}
            </Body>
          ) : null}
        </View>

        {/* ---- who is cooking ---- */}
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/chef/${meal.kitchenId}`)}
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 16,
              marginTop: 22,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: pressed ? colors.primary200 : colors.line,
            },
            shadow.sm,
          ]}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary50,
            }}
          >
            <Icon name="chefHat" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: font.uiSemi, fontSize: type.sm + 2, color: colors.text }}
            >
              {meal.cookName}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
            >
              {meal.area}
              {away ? ` · ${away}` : ''}
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.textLight} />
        </Pressable>

        {/* ---- the numbers ---- */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <CountTile value={n(interested)} label={t('Interested')} tone="saffron" />
          <CountTile value={n(confirmed)} label={t('Confirmed')} tone="primary" />
          <CountTile
            value={left == null ? '∞' : n(left)}
            label={t('Left')}
            tone={left != null && left <= 3 ? 'saffron' : 'sage'}
          />
        </View>

        {/* ---- logistics ---- */}
        <View style={{ gap: 1, marginTop: 22 }}>
          <Fact
            icon={meal.handover === 'pickup' ? 'home' : 'delivery'}
            label={meal.handover === 'pickup' ? t('Collection') : t('Delivery')}
            value={meal.handoverNote || (meal.handover === 'pickup' ? t('Collect from the kitchen.') : t('Delivered to your address.'))}
          />
          <Fact
            icon="clock"
            label={t('Orders close')}
            value={deadlineLabel(meal.deadline, t, n) ?? t('No deadline')}
          />
        </View>

        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 10,
              padding: 14,
              marginTop: 18,
              borderRadius: radius.sm,
              backgroundColor: colors.primary50,
              borderWidth: 1,
              borderColor: colors.primary200,
            }}
          >
            <Icon name="alertCircle" size={16} color={colors.primary} />
            <Text
              style={{
                flex: 1,
                fontFamily: font.ui,
                fontSize: type.sm,
                lineHeight: type.sm * 1.5,
                color: colors.text,
              }}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {/* ---- what you can do ---- */}
        <View style={{ marginTop: 24, gap: 12 }}>
          {mine ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 16,
                  borderRadius: radius.sm,
                  backgroundColor: colors.sage50,
                  borderWidth: 1,
                  borderColor: colors.sage100,
                }}
              >
                <Icon name="check" size={17} color={colors.sage} strokeWidth={2.4} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: font.uiSemi,
                    fontSize: type.sm + 1,
                    color: colors.text,
                  }}
                >
                  {t('You have booked this meal.')}
                </Text>
              </View>
              <Button
                label={t('Track your order')}
                icon="arrowRight"
                block
                onPress={() => router.push(`/meal-order/${mine.id}`)}
              />
            </>
          ) : (
            <>
              {/* Interest first: it is the reversible one, and a cook reads it
                  the night before to decide how much to shop for. */}
              <Button
                variant={isInterested ? "primary" : "glass"}
                label={isInterested ? t('Interested ✓') : t('I’m interested')}
                icon={isInterested ? 'check' : 'sparkles'}
                iconPosition="left"
                block
                onPress={onInterest}
              />

              {open ? (
                <>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 4,
                    }}
                  >
                    <Icon
                      name="banknote"
                      size={14}
                      color={affordable ? colors.sage : colors.saffron}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: font.ui,
                        fontSize: type.xs + 1,
                        color: colors.textMuted,
                      }}
                    >
                      {t('Wallet balance')}: ৳{n(balance)}
                    </Text>
                    {!affordable ? (
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
                    ) : null}
                  </View>

                  <Button
                    label={
                      affordable
                        ? t('Confirm order · ৳{n}', { n: n(meal.price) })
                        : t('Top up to confirm')
                    }
                    icon="lock"
                    iconPosition="left"
                    block
                    onPress={affordable ? onConfirm : () => router.push('/wallet')}
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
                    {t('Your payment is held until you confirm the food arrived.')}
                  </Text>
                </>
              ) : (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 16,
                    borderRadius: radius.sm,
                    backgroundColor: colors.saffron50,
                    borderWidth: 1,
                    borderColor: colors.saffron100,
                  }}
                >
                  <Icon name="lock" size={16} color={colors.saffron} />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      color: colors.text,
                    }}
                  >
                    {left != null && left <= 0
                      ? t('This meal is sold out.')
                      : t('Orders for this meal have closed.')}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </Container>

      {/* ---- the one confirmation that spends money ---- */}
      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirming(false)}
      >
        <Pressable
          onPress={() => setConfirming(false)}
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
                gap: 16,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
              },
              shadow.lg,
            ]}
          >
            <Heading size={20}>{t('Confirm this meal?')}</Heading>

            <View style={{ gap: 1 }}>
              <Fact icon="pot" label={t('Meal')} value={meal.title} />
              <Fact icon="clock" label={t('Served')} value={serviceLabel(meal, t, lang)} />
              <Fact icon="banknote" label={t('Amount')} value={`৳${n(meal.price)}`} />
              <Fact
                icon="lock"
                label={t('Balance after')}
                value={`৳${n(balance - meal.price)}`}
              />
            </View>

            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.xs + 1,
                lineHeight: (type.xs + 1) * 1.55,
                color: colors.textMuted,
              }}
            >
              {t(
                '৳{n} leaves your wallet now and is held by RannaBari. The cook is paid only after you confirm the food arrived.',
                { n: n(meal.price) },
              )}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                variant="glass"
                label={t('Cancel')}
                onPress={() => setConfirming(false)}
                style={{ flex: 1 }}
              />
              <Button
                label={busy ? t('Confirming…') : t('Confirm')}
                disabled={busy}
                onPress={doConfirm}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/** A labelled line in a stack of them. */
function Fact({ icon, label, value }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: colors.line2,
      }}
    >
      <Icon name={icon} size={15} color={colors.textMuted} />
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.xs + 1,
          letterSpacing: (type.xs + 1) * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
          width: 96,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: type.sm + 1,
          lineHeight: (type.sm + 1) * 1.45,
          color: colors.text,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
