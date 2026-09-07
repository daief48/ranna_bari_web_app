/**
 * Cooks taking meal bookings, and the month you would be buying.
 *
 * A different purchase from everything else in the app: not one plate tonight
 * but a month's worth of them, picked off a calendar and paid for up front.
 * So the numbers that decide it lead every card — what one meal costs, and
 * how many you are obliged to take — because a customer choosing between two
 * kitchens is choosing between two commitments, not two menus.
 *
 * This replaced the per-plate board, whose endpoints went with the monthly
 * system. That board sold tomorrow's dinner; this sells September.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Reveal from '../../src/components/Reveal';
import Button from '../../src/components/Button';
import SectionHeader from '../../src/components/SectionHeader';
import SearchBar from '../../src/components/SearchBar';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius } from '../../src/theme/tokens';
import { useSession } from '../../src/store/SessionContext';
import { useLang } from '../../src/i18n/LanguageContext';
import { makeMatcher } from '../../src/lib/search';

import { Chip, ChipRow, Empty, Loading, Panel } from '../../src/features/meal-plan/components';
import { SLOT_LABEL, dateLabel, monthLabel } from '../../src/features/meal-plan/format';
import { fetchMealServices } from '../../src/features/meal-plan/api';

export default function MealsTab() {
  const { colors } = useTheme();
  const router = useRouter();
  const { token } = useSession();
  const { t, n } = useLang();

  const [services, setServices] = useState(null);
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let alive = true;
      fetchMealServices(token).then((out) => {
        if (alive) setServices(out.ok ? (out.result.services ?? []) : []);
      });
      return () => {
        alive = false;
      };
    }, [token]),
  );

  /* The categories actually on offer, not every category the platform has —
     a filter that returns nothing on every kitchen is a filter nobody wants. */
  const categories = useMemo(() => {
    const seen = new Map();
    for (const s of services ?? []) {
      if (!seen.has(s.categoryKey)) seen.set(s.categoryKey, s.categoryLabel || s.categoryKey);
    }
    return [...seen.entries()];
  }, [services]);

  const shown = useMemo(() => {
    const match = query.trim() ? makeMatcher(query) : null;
    return (services ?? []).filter((s) => {
      if (category && s.categoryKey !== category) return false;
      if (!match) return true;
      return match(s.kitchenName) || match(s.cookName) || match(s.area);
    });
  }, [services, category, query]);

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead={t('MONTHLY')}
          accent={t('MEALS')}
          subtitle={t('Pick your meals for the month. Pay once, eat all month.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={t('A kitchen or an area')}
          />
        </View>

        {categories.length > 1 ? (
          <View style={{ marginTop: 12 }}>
            <ChipRow>
              <Chip label={t('All')} active={!category} onPress={() => setCategory('')} />
              {categories.map(([key, label]) => (
                <Chip
                  key={key}
                  label={t(label)}
                  active={category === key}
                  onPress={() => setCategory(key)}
                />
              ))}
            </ChipRow>
          </View>
        ) : null}

        {/* How this works, before the thing it explains.
            The full paragraph sits at the foot of the screen, which is after
            the kitchens — so somebody who has never bought a month scrolled
            past the decision before reaching the explanation of it. */}
        <View
          style={{
            marginTop: 14,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {[t('Choose your days'), t('Pay once'), t('Confirm each meal')].map((step, i) => (
            <View key={step} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {i > 0 ? (
                <Icon name="arrowRight" size={11} color={colors.textMuted} />
              ) : null}
              <Text
                style={{ fontFamily: font.ui, fontSize: 12.5, color: colors.textMuted }}
              >
                {step}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/meal-bookings')}
          style={({ pressed }) => ({
            marginTop: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.sunken,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Icon name="receipt" size={17} color={colors.text} />
          <Text style={{ flex: 1, fontFamily: font.uiBold, fontSize: 14, color: colors.text }}>
            {t('My meal bookings')}
          </Text>
          <Icon name="arrowRight" size={15} color={colors.textMuted} />
        </Pressable>

        {/* The empty state below goes somewhere. "No kitchen is offering meals
            yet" is true and is also a full stop — the customer still wants
            dinner, and the rest of the app still sells it. */}
        {services === null ? (
          <Loading label={t('Finding kitchens…')} />
        ) : shown.length === 0 ? (
          <View style={{ marginTop: 22 }}>
            <Empty
              title={
                services.length === 0
                  ? t('No kitchen is offering meals yet')
                  : t('Nothing matches that')
              }
              hint={
                services.length === 0
                  ? t('A cook has to set up a meal service and switch it on before a month can be booked.')
                  : t('Try another area, or clear the filters.')
              }
            />
            {services.length === 0 ? (
              <Button
                label={t('Browse tonight’s kitchens instead')}
                block
                style={{ marginTop: 14 }}
                onPress={() => router.push('/browse')}
              />
            ) : (query || category) ? (
              <Button
                label={t('Clear the filters')}
                variant="glass"
                block
                style={{ marginTop: 14 }}
                onPress={() => {
                  setQuery('');
                  setCategory('');
                }}
              />
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 20 }}>
            {shown.map((service, i) => (
              <Reveal key={service.kitchenId} delay={Math.min(i + 1, 6)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Open {name}', { name: service.kitchenName })}
                  onPress={() => router.push(`/meal-service/${service.kitchenId}`)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                >
                  <Panel>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {service.avatar ? (
                        <Image
                          source={{ uri: service.avatar }}
                          style={{ width: 52, height: 52, borderRadius: radius.md }}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: radius.md,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: colors.sunken,
                          }}
                        >
                          <Icon name="pot" size={22} color={colors.textMuted} />
                        </View>
                      )}

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={{ fontFamily: font.uiBold, fontSize: 15.5, color: colors.text }}
                        >
                          {service.kitchenName}
                        </Text>
                        <Body muted style={{ fontSize: 12.5, marginTop: 1 }}>
                          {[service.categoryLabel, service.area].filter(Boolean).join(' · ')}
                        </Body>
                        {service.reviewCount > 0 ? (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              marginTop: 3,
                            }}
                          >
                            <Icon name="star" size={12} color={colors.saffron} />
                            <Text
                              style={{
                                fontFamily: font.ui,
                                fontSize: 12,
                                color: colors.textMuted,
                              }}
                            >
                              {n(service.rating.toFixed(1))} · {n(service.reviewCount)}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text
                          style={{ fontFamily: font.displayBold, fontSize: 19, color: colors.sage }}
                        >
                          ৳{n(service.rate)}
                        </Text>
                        <Body muted style={{ fontSize: 11 }}>
                          {t('a meal')}
                        </Body>
                      </View>
                    </View>

                    {/*
                      The food, before the terms.

                      This card sold a month on a rate and a range, which is
                      the half of the decision a customer cares about least.
                      What a kitchen actually cooks is the reason to choose it,
                      and it was a tap away for no reason — the calendar is
                      already resolved server-side to fill this in.
                    */}
                    {service.upcoming?.length ? (
                      <View
                        style={{
                          marginTop: 12,
                          paddingTop: 10,
                          borderTopWidth: 1,
                          borderTopColor: colors.line,
                          gap: 3,
                        }}
                      >
                        {service.upcoming.map((meal) => (
                          <View
                            key={`${meal.date}-${meal.slot}`}
                            style={{ flexDirection: 'row', gap: 8 }}
                          >
                            {/* One line, always. "7 Sept · Breakfast" wrapped
                                in a narrower column, which turned a three-row
                                preview into six ragged ones. */}
                            <Text
                              numberOfLines={1}
                              style={{
                                width: 112,
                                fontFamily: font.ui,
                                fontSize: 11.5,
                                color: colors.textMuted,
                              }}
                            >
                              {dateLabel(meal.date)} · {t(SLOT_LABEL[meal.slot] ?? meal.slot)}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                fontFamily: font.ui,
                                fontSize: 13,
                                color: colors.text,
                              }}
                            >
                              {meal.name}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {/* The commitment, said plainly — it is the half of this
                        decision a menu photograph cannot answer. */}
                    <View
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTopWidth: 1,
                        borderTopColor: colors.line,
                      }}
                    >
                      <Body muted style={{ fontSize: 12.5, lineHeight: 18 }}>
                        {service.minMeals === service.maxMeals
                          ? t('Take exactly {n} meals — ৳{total} for the month.', {
                              n: n(service.minMeals),
                              total: n(service.rate * service.minMeals),
                            })
                          : t('Take {min} to {max} meals — ৳{low} to ৳{high}.', {
                              min: n(service.minMeals),
                              max: n(service.maxMeals),
                              low: n(service.rate * service.minMeals),
                              high: n(service.rate * service.maxMeals),
                            })}
                        {service.month ? ` ${t('Booking {month}.', { month: monthLabel(service.month) })}` : ''}
                      </Body>
                    </View>
                  </Panel>
                </Pressable>
              </Reveal>
            ))}
          </View>
        )}

        <Body
          muted
          style={{ marginTop: 22, marginBottom: 26, fontSize: 12, lineHeight: 18 }}
        >
          {t('You choose which days and which meals — breakfast, lunch or dinner — as long as the total lands inside the kitchen’s range. Payment is taken up front and held; each meal is released to the cook only after you confirm it arrived.')}
        </Body>
      </Container>
    </Screen>
  );
}
