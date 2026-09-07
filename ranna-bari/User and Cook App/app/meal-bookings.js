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
import { monthLabel } from '../src/features/meal-plan/format';

export default function MealBookingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useSession();
  const { t, n } = useLang();

  const [bookings, setBookings] = useState(null);

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
                          <Text
                            numberOfLines={1}
                            style={{ fontFamily: font.uiBold, fontSize: 15.5, color: colors.text }}
                          >
                            {booking.kitchenName || booking.cookName}
                          </Text>
                          <Body muted style={{ fontSize: 12.5, marginTop: 1 }}>
                            {monthLabel(booking.month)} ·{' '}
                            {t(booking.categoryLabel || booking.categoryKey)}
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
