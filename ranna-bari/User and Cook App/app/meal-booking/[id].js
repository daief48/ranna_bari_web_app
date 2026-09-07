/**
 * One month, meal by meal — and the button that pays the cook.
 *
 * Rule 20 lives here, and it is the only thing on the customer's side of the
 * whole system that moves money: a meal is released when the person who ate it
 * says it arrived. Not the courier, not a timer, not the cook. So "Meal
 * received" sits on the meal it is about rather than on the month, and it says
 * what pressing it does before it is pressed.
 *
 * The dish name and the price come from the booking's snapshot, taken when the
 * money moved; the status comes from the live order. Where they disagree the
 * order is right — the snapshot is frozen on purpose so a receipt keeps saying
 * what was actually paid.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Button from '../../src/components/Button';
import SectionHeader from '../../src/components/SectionHeader';
import ChatLauncher from '../../src/components/ChatLauncher';
import { Body } from '../../src/components/Typography';
import { useAlert } from '../../src/components/Alert';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius } from '../../src/theme/tokens';
import { useSession } from '../../src/store/SessionContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { useLang } from '../../src/i18n/LanguageContext';

import { Divider, Loading, Panel, Row } from '../../src/features/meal-plan/components';
import { fetchMyBooking } from '../../src/features/meal-plan/api';
import { SLOT_LABEL, monthLabel, relativeDay, todayKey } from '../../src/features/meal-plan/format';

/** What a meal's state means to the person who bought it. */
function itemState(item, t) {
  if (item.status === 'cancelled') return { label: t('Cancelled'), tone: 'bad' };
  if (item.payment === 'refunded') return { label: t('Refunded'), tone: 'bad' };
  if (item.status === 'completed') {
    return item.payment === 'released'
      ? { label: t('You confirmed this'), tone: 'good' }
      : { label: t('Confirmed — releasing'), tone: 'good' };
  }
  if (item.status === 'delivered') return { label: t('Delivered — confirm it'), tone: 'warn' };
  return { label: t('Coming'), tone: 'neutral' };
}

export default function MealBookingScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useSession();
  const { confirmReceived } = useCommerce();
  const { t, n } = useLang();
  const alert = useAlert();

  const [booking, setBooking] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    const out = await fetchMyBooking(token, String(id));
    setBooking(out.ok ? out.result.booking : false);
  }, [token, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const receive = (item) => {
    alert.confirm({
      title: t('Confirm {meal}?', { meal: item.name || t('this meal') }),
      body: t(
        '৳{amount} is released to the cook for this meal, and cannot be taken back. Only confirm a meal you actually received.',
        { amount: n(item.amount) },
      ),
      confirmLabel: t('Yes, I got it'),
      onConfirm: async () => {
        setBusy(item.orderId);
        const out = await confirmReceived(item.orderId);
        setBusy(null);
        if (out && out.ok === false) {
          alert.error(out.message ?? t('That did not work.'), t('Not confirmed'));
          return;
        }
        await load();
      },
    });
  };

  if (booking === null) {
    return (
      <Screen>
        <Container>
          <Loading />
        </Container>
      </Screen>
    );
  }

  if (booking === false) {
    return (
      <Screen>
        <Container>
          <SectionHeader lead={t('MEAL')} accent={t('BOOKING')} style={{ marginTop: 16 }} />
          <Panel style={{ marginTop: 20 }}>
            <Body>{t('That booking could not be found.')}</Body>
            <Button
              label={t('My bookings')}
              block
              style={{ marginTop: 14 }}
              onPress={() => router.replace('/meal-bookings')}
            />
          </Panel>
        </Container>
      </Screen>
    );
  }

  const toConfirm = booking.items.filter((it) => it.status === 'delivered');
  const held = booking.items.filter((it) => it.payment === 'held');
  const done = booking.items.filter((it) => it.payment === 'released');

  /* The question this screen is opened with. It was answerable from data
     already on the page and buried as whichever row happened to be second. */
  const today = todayKey();
  const next = booking.items
    .filter((it) => it.status !== 'cancelled' && it.status !== 'completed' && it.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  /* The order a message about this month should hang off. */
  const chatOrderId = (next ?? booking.items[0])?.orderId ?? null;

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead={booking.kitchenName || booking.cookName}
          accent={monthLabel(booking.month).toUpperCase()}
          subtitle={t('{n} meals · {code}', { n: n(booking.count), code: booking.code })}
          style={{ marginTop: 16 }}
        />

        {toConfirm.length ? (
          <Panel style={{ marginTop: 18 }} tone="warn">
            <Text style={{ fontFamily: font.uiBold, fontSize: 14.5, color: colors.saffron }}>
              {t('{n} meals are waiting on you', { n: n(toConfirm.length) })}
            </Text>
            <Body muted style={{ marginTop: 4, lineHeight: 19 }}>
              {t('The cook has handed these over. Confirming each one pays them for it.')}
            </Body>
          </Panel>
        ) : next ? (
          <Panel style={{ marginTop: 18 }}>
            <Body muted style={{ fontSize: 12.5 }}>
              {t('Next meal')}
            </Body>
            <Text
              style={{ fontFamily: font.uiBold, fontSize: 16, color: colors.text, marginTop: 2 }}
            >
              {relativeDay(next.date, t)} · {t(SLOT_LABEL[next.slot] ?? next.slot)}
            </Text>
            <Body style={{ marginTop: 2 }}>{next.name || t('Meal')}</Body>
          </Panel>
        ) : null}

        <Panel style={{ marginTop: 14 }}>
          <Row
            label={t('Rate agreed')}
            value={t('৳{rate} a meal', { rate: n(booking.rate) })}
            strong
          />
          <Row label={t('Paid in advance')} value={`৳${n(booking.totalAmount)}`} />
          <Divider />
          <Row
            label={t('Still held')}
            value={`৳${n(held.reduce((s, it) => s + it.amount, 0))}`}
            tone={held.length ? 'warn' : 'good'}
          />
          {/* "Released", not "released to the cook": the cook receives this
              less the platform's commission, and the customer has no business
              being told a number that is not what either side actually got.
              What is true for them is that this much has left escrow. */}
          <Row
            label={t('Released')}
            value={`৳${n(done.reduce((s, it) => s + it.amount, 0))}`}
            tone="good"
          />
          {/* Where a month of food is going. Worth being able to check on the
              receipt for it, rather than only at the moment of buying. */}
          {booking.address?.line ? (
            <>
              <Divider />
              <Row
                label={t('Delivering to')}
                value={[booking.address.line, booking.address.area].filter(Boolean).join(', ')}
              />
            </>
          ) : null}
        </Panel>

        {/*
          A way to reach the cook, from the screen that tells people to.
          The foot of this page says a meal that never arrived can be raised
          with support "from the order itself" — which was true and had no door
          on it. Chat is threaded per order, and a month has no order of its
          own, so it opens against the meal in question: the next one due, or
          the first on the booking once the month is over.
        */}
        {chatOrderId ? (
          <View style={{ marginTop: 14 }}>
            <ChatLauncher
              spec={{ kind: 'order', orderId: chatOrderId }}
              label={t('Message the cook')}
              compact
            />
          </View>
        ) : null}

        <View style={{ marginTop: 22, gap: 10 }}>
          {booking.items.map((item) => {
            const state = itemState(item, t);
            const canConfirm = item.status === 'delivered';

            return (
              <Panel key={item.orderId} tone={canConfirm ? 'warn' : undefined}>
                {/* The whole row opens the order. The footer told people to
                    "raise it with support from the order itself" while nothing
                    on the screen was a way in. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Open {meal}', { meal: item.name || t('this meal') })}
                  onPress={() => router.push(`/meal-order/${item.orderId}`)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ fontFamily: font.uiBold, fontSize: 14.5, color: colors.text }}
                    >
                      {item.name || t('Meal')}
                    </Text>
                    <Body muted style={{ fontSize: 12.5, marginTop: 2 }}>
                      {relativeDay(item.date, t)} · {t(SLOT_LABEL[item.slot] ?? item.slot)}
                    </Body>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{ fontFamily: font.uiBold, fontSize: 14, color: colors.text }}
                    >
                      ৳{n(item.amount)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: 11.5,
                        marginTop: 2,
                        color:
                          state.tone === 'good'
                            ? colors.sage
                            : state.tone === 'warn'
                              ? colors.saffron
                              : state.tone === 'bad'
                                ? colors.primary
                                : colors.textMuted,
                      }}
                    >
                      {state.label}
                    </Text>
                  </View>
                </Pressable>

                {canConfirm ? (
                  <Button
                    label={busy === item.orderId ? t('Confirming…') : t('Meal received')}
                    block
                    disabled={busy === item.orderId}
                    style={{ marginTop: 12 }}
                    onPress={() => receive(item)}
                  />
                ) : null}
              </Panel>
            );
          })}
        </View>

        <Body muted style={{ marginTop: 20, marginBottom: 26, fontSize: 12, lineHeight: 18 }}>
          {t('Nothing releases on its own. A meal you never received stays held — message the cook above, or open the meal to raise it with support.')}
        </Body>
      </Container>
    </Screen>
  );
}
