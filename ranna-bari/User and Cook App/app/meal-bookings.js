/**
 * The months you have bought.
 *
 * A booking is the receipt for a month; the meals on it are separate orders
 * with separate lives. So the number that leads each row is not the total
 * paid but how many meals are still waiting on something — that is the only
 * part of a finished month a customer still has to do anything about.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Reveal from '../src/components/Reveal';
import Button from '../src/components/Button';
import SectionHeader from '../src/components/SectionHeader';
import { Body } from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import { font } from '../src/theme/tokens';
import { useSession } from '../src/store/SessionContext';
import { useLang } from '../src/i18n/LanguageContext';

import { Divider, Empty, Loading, Panel, Row } from '../src/features/meal-plan/components';
import { fetchMyBookings } from '../src/features/meal-plan/api';
import { SLOT_LABEL, monthLabel, relativeDay, todayKey } from '../src/features/meal-plan/format';

export default function MealBookingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useSession();
  const { t, n } = useLang();

  const [bookings, setBookings] = useState(null);
  const today = todayKey();

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let alive = true;
      fetchMyBookings(token).then((out) => {
        if (alive) setBookings(out.ok ? (out.result.bookings ?? []) : []);
      });
      return () => {
        alive = false;
      };
    }, [token]),
  );

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead={t('MY')}
          accent={t('MEAL BOOKINGS')}
          subtitle={t('Every month you have bought, and what is still to come.')}
          style={{ marginTop: 16 }}
        />

        {bookings === null ? (
          <Loading />
        ) : bookings.length === 0 ? (
          <View style={{ marginTop: 22 }}>
            <Empty
              title={t('No meal bookings yet')}
              hint={t('Pick a kitchen, choose your meals for the month, and pay once.')}
            />
            <Button
              label={t('Find a kitchen')}
              block
              style={{ marginTop: 14 }}
              onPress={() => router.push('/meals')}
            />
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 20 }}>
            {bookings.map((booking, i) => {
              /* Waiting on the customer, specifically — a meal that has been
                 delivered and not confirmed is the only thing on this screen
                 they can act on. */
              const toConfirm = booking.items.filter((it) => it.status === 'delivered').length;
              const upcoming = booking.items.filter(
                (it) => it.status !== 'completed' && it.status !== 'cancelled',
              ).length;

              /*
               * What this card is *for*, on its first line.
               *
               * Three months bought from the same kitchen produced three
               * identical cards — same name, same month, same total — with the
               * only difference buried three rows down. A booking is not
               * usefully identified by who sold it; it is identified by what is
               * about to happen on it.
               */
              const next = booking.items
                .filter(
                  (it) =>
                    it.status !== 'cancelled' && it.status !== 'completed' && it.date >= today,
                )
                .sort((a, b) => a.date.localeCompare(b.date))[0];

              return (
                <Reveal key={booking.id} delay={Math.min(i + 1, 6)}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/meal-booking/${booking.id}`)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                  >
                    <Panel tone={toConfirm ? 'warn' : undefined}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          {/* The line that says what to do, where the kitchen
                              name used to be. The name is still here — it is
                              just not the most useful thing on the card. */}
                          {toConfirm ? (
                            <Text
                              style={{
                                fontFamily: font.uiBold,
                                fontSize: 15.5,
                                color: colors.saffron,
                              }}
                            >
                              {t('{n} meals to confirm', { n: n(toConfirm) })}
                            </Text>
                          ) : next ? (
                            <Text
                              numberOfLines={1}
                              style={{
                                fontFamily: font.uiBold,
                                fontSize: 15.5,
                                color: colors.text,
                              }}
                            >
                              {relativeDay(next.date, t)} ·{' '}
                              {t(SLOT_LABEL[next.slot] ?? next.slot)} · {next.name || t('Meal')}
                            </Text>
                          ) : (
                            <Text
                              style={{
                                fontFamily: font.uiBold,
                                fontSize: 15.5,
                                color: colors.textMuted,
                              }}
                            >
                              {t('Month finished')}
                            </Text>
                          )}
                          <Body muted style={{ fontSize: 12.5, marginTop: 2 }}>
                            {booking.kitchenName || booking.cookName} · {monthLabel(booking.month)}
                          </Body>
                          {/* The code, quiet, because it is what a customer
                              reads out to support and nothing else. */}
                          <Body muted style={{ fontSize: 11, marginTop: 1 }}>
                            {booking.code}
                          </Body>
                        </View>
                        <Icon name="arrowRight" size={16} color={colors.textMuted} />
                      </View>

                      <Divider />

                      <Row
                        label={t('Meals')}
                        value={t('{n} at ৳{rate}', {
                          n: n(booking.count),
                          rate: n(booking.rate),
                        })}
                      />
                      <Row label={t('Paid in advance')} value={`৳${n(booking.totalAmount)}`} />
                      {toConfirm ? (
                        <Row
                          label={t('Waiting on you')}
                          value={t('{n} to confirm', { n: n(toConfirm) })}
                          tone="warn"
                          strong
                        />
                      ) : (
                        <Row
                          label={t('Still to come')}
                          value={upcoming ? n(upcoming) : t('none — month finished')}
                          tone={upcoming ? undefined : 'good'}
                        />
                      )}
                    </Panel>
                  </Pressable>
                </Reveal>
              );
            })}
          </View>
        )}

        <Body muted style={{ marginTop: 22, marginBottom: 26, fontSize: 12, lineHeight: 18 }}>
          {t('Your money is held by the platform, not sent to the cook. Each meal is released only when you confirm it arrived — so a month you paid for on the first is still yours to hold on the twentieth.')}
        </Body>
      </Container>
    </Screen>
  );
}
