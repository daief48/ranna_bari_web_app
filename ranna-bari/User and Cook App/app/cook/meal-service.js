import React, { useCallback, useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import { Body } from '../../src/components/Typography';
import { useAlert } from '../../src/components/Alert';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius } from '../../src/theme/tokens';
import { useSession } from '../../src/store/SessionContext';
import { useKitchen } from '../../src/store/KitchenContext';
import { useLang } from '../../src/i18n/LanguageContext';

import { Chip, Divider, GroupLabel, Loading, Panel, Row } from '../../src/features/meal-plan/components';
import { Explainer } from '../../src/features/meal-plan/editor';
import { fetchMyService, saveMyService } from '../../src/features/meal-plan/api';

/**
 * The cook's meal service — what they serve, for how much, and how many.
 *
 * Four decisions, and they are not equal. The category decides which calendar
 * this kitchen cooks from. The rate is either the platform's or the cook's, and
 * those are different promises: taking the default means following the platform
 * when it moves, which is a choice and not an absence of one. The range is the
 * contract with the customer. And `active` is the switch, separate from all of
 * it, because setting a service up and offering it are two decisions and only
 * the second needs the kitchen approved.
 *
 * The preview at the foot is the card a customer actually compares against
 * other kitchens. A cook pricing themselves was previously typing numbers into
 * a form with no idea what those numbers looked like on the other side.
 */
export default function CookMealService() {
  const router = useRouter();
  const { token } = useSession();
  const { kitchen } = useKitchen();
  const { colors } = useTheme();
  const { t, n } = useLang();
  const alert = useAlert();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoryKey, setCategoryKey] = useState('');
  const [ownRate, setOwnRate] = useState(false);
  const [rate, setRate] = useState('');
  const [minMeals, setMinMeals] = useState('3');
  const [maxMeals, setMaxMeals] = useState('7');
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const out = await fetchMyService(token);
    if (out.ok) {
      const { service, categories: list } = out.result;
      setCategories(list ?? []);
      if (service) {
        setExisting(service);
        setCategoryKey(service.categoryKey);
        setOwnRate(service.rate != null);
        setRate(service.rate != null ? String(service.rate) : '');
        setMinMeals(String(service.minMeals));
        setMaxMeals(String(service.maxMeals));
        setActive(!!service.active);
      } else if (list?.length) {
        setCategoryKey(list[0].key);
      }
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const category = categories.find((c) => c.key === categoryKey) ?? null;
  const effective = ownRate ? Number(rate) || 0 : (category?.rate ?? 0);
  const min = Number(minMeals);
  const max = Number(maxMeals);

  /* Every refusal the server would give, said before the request rather than
     after it — a cook fixing a number should not wait for a round trip to
     find out which one. */
  const problem = !categoryKey
    ? t('Pick a category first.')
    : ownRate && !(Number(rate) > 0)
      ? t('Your own rate has to be a number above zero.')
      : !(min >= 1)
        ? t('The minimum has to be at least one meal.')
        : !(max >= min)
          ? t('The maximum cannot be below the minimum.')
          : null;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    const out = await saveMyService(token, {
      categoryKey,
      rate: ownRate ? Number(rate) : null,
      minMeals: min,
      maxMeals: max,
      active,
    });
    setBusy(false);

    if (!out.ok) {
      alert.error(out.message ?? t('That did not work.'), t('Not saved'));
      return;
    }
    setExisting(out.result.service);
    alert.success(
      active
        ? t('Customers can book a month from your calendar now.')
        : t('Nobody can book it until you switch it on.'),
      active ? t('Your meal service is live') : t('Saved'),
    );
  };

  const field = {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.sunken,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: font.ui,
    fontSize: 15,
    color: colors.text,
  };

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead={t('MEAL')}
          accent={t('SERVICE')}
          subtitle={t('What you serve, for how much, and how many meals a customer must take.')}
          style={{ marginTop: 16 }}
        />

        {loading ? (
          <Loading label={t('Reading your service…')} />
        ) : categories.length === 0 ? (
          <Panel style={{ marginTop: 24 }}>
            <Body>{t('The platform is not offering any meal categories yet.')}</Body>
            <Body muted style={{ marginTop: 6 }}>
              {t('A meal service belongs to a category, so there is nothing to start one under until an operator adds one.')}
            </Body>
          </Panel>
        ) : (
          <>
            {/* Category. Wrapped rather than scrolled: there are three, and a
                horizontal rail cut the third one in half at the screen edge
                with nothing to say it scrolled. */}
            <Reveal delay={1}>
              <GroupLabel text={t('Category')} style={{ marginTop: 26 }} />
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                {categories.map((c) => (
                  <Chip
                    key={c.key}
                    label={`${t(c.label)} · ৳${n(c.rate)}`}
                    active={c.key === categoryKey}
                    onPress={() => setCategoryKey(c.key)}
                  />
                ))}
              </View>
              <Explainer summary={t('The category sets your calendar. What that means →')}>
                {t('You cook from that category’s monthly calendar, and its rate is your default price. Changing it after a month is booked does not move that booking — it stores what was agreed — but your calendar starts again from the new category’s.')}
              </Explainer>
            </Reveal>

            {/* Rate. */}
            <Reveal delay={2}>
              <GroupLabel text={t('Your rate')} style={{ marginTop: 28 }} />
              <Panel style={{ marginTop: 12 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.uiBold, fontSize: 14, color: colors.text }}>
                      {t('Set my own price')}
                    </Text>
                    <Body muted style={{ fontSize: 12.5, marginTop: 2 }}>
                      {ownRate
                        ? t('Your number, fixed until you change it.')
                        : t('Follow the category — ৳{rate} today, and whatever it becomes.', {
                            rate: n(category?.rate ?? 0),
                          })}
                    </Body>
                  </View>
                  <Switch
                    value={ownRate}
                    onValueChange={setOwnRate}
                    trackColor={{ true: colors.sage, false: colors.line2 }}
                  />
                </View>

                {ownRate ? (
                  <TextInput
                    value={rate}
                    onChangeText={setRate}
                    keyboardType="number-pad"
                    placeholder={String(category?.rate ?? '')}
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel={t('Your rate per meal')}
                    style={[field, { marginTop: 12 }]}
                  />
                ) : null}

                <Divider />
                <Row
                  label={t('Customers pay, per meal')}
                  value={`৳${n(effective)}`}
                  strong
                  tone="good"
                />
              </Panel>
            </Reveal>

            {/* Range. */}
            <Reveal delay={3}>
              <GroupLabel text={t('Meals per month')} style={{ marginTop: 28 }} />
              <Panel style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Body muted style={{ fontSize: 12.5, marginBottom: 6 }}>
                      {t('Minimum')}
                    </Body>
                    <TextInput
                      value={minMeals}
                      onChangeText={setMinMeals}
                      keyboardType="number-pad"
                      accessibilityLabel={t('Minimum meals')}
                      style={field}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body muted style={{ fontSize: 12.5, marginBottom: 6 }}>
                      {t('Maximum')}
                    </Body>
                    <TextInput
                      value={maxMeals}
                      onChangeText={setMaxMeals}
                      keyboardType="number-pad"
                      accessibilityLabel={t('Maximum meals')}
                      style={field}
                    />
                  </View>
                </View>

                <Divider />
                <Row
                  label={t('A customer must take')}
                  value={
                    min && max && min === max
                      ? t('exactly {n} meals', { n: n(min) })
                      : min && max
                        ? t('{min} to {max} meals', { min: n(min), max: n(max) })
                        : '—'
                  }
                  strong
                />
                {min && max && min > 0 && max >= min ? (
                  <Row
                    label={t('So a month is worth')}
                    value={`৳${n(effective * min)} – ৳${n(effective * max)}`}
                    tone="good"
                  />
                ) : null}
              </Panel>
              <Body muted style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
                {t('A customer picks any dates and any of breakfast, lunch or dinner — the only rule is that the total lands in this range. Setting both to the same number means they choose which meals, but not how many.')}
              </Body>
            </Reveal>

            {/* The switch. */}
            <Reveal delay={4}>
              <GroupLabel text={t('Offering it')} style={{ marginTop: 28 }} />
              <Panel style={{ marginTop: 12 }} tone={active ? 'good' : undefined}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.uiBold, fontSize: 14, color: colors.text }}>
                      {active ? t('Open for bookings') : t('Not offered')}
                    </Text>
                    <Body muted style={{ fontSize: 12.5, marginTop: 2 }}>
                      {active
                        ? t('Customers can find your calendar and book a month.')
                        : t('Set everything up first, then switch it on.')}
                    </Body>
                  </View>
                  <Switch
                    value={active}
                    onValueChange={setActive}
                    trackColor={{ true: colors.sage, false: colors.line2 }}
                  />
                </View>
              </Panel>
            </Reveal>

            {/* The card a customer sees. Same shape the Meals tab draws, so a
                cook can check their own listing without leaving the form. */}
            <Reveal delay={5}>
              <GroupLabel text={t('How customers see it')} style={{ marginTop: 28 }} />
              <Panel style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: font.uiBold, fontSize: 15.5, color: colors.text }}
                    >
                      {kitchen?.name || t('Your kitchen')}
                    </Text>
                    <Body muted style={{ fontSize: 12.5, marginTop: 1 }}>
                      {[t(category?.label ?? ''), kitchen?.area].filter(Boolean).join(' · ')}
                    </Body>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{ fontFamily: font.displayBold, fontSize: 19, color: colors.sage }}
                    >
                      ৳{n(effective)}
                    </Text>
                    <Body muted style={{ fontSize: 11 }}>
                      {t('a meal')}
                    </Body>
                  </View>
                </View>
                <Divider />
                <Body muted style={{ fontSize: 12.5, lineHeight: 18 }}>
                  {min === max
                    ? t('Take exactly {n} meals — ৳{total} for the month.', {
                        n: n(min),
                        total: n(effective * min),
                      })
                    : t('Take {min} to {max} meals — ৳{low} to ৳{high}.', {
                        min: n(min),
                        max: n(max),
                        low: n(effective * min),
                        high: n(effective * max),
                      })}
                </Body>
                {!active ? (
                  <Body style={{ marginTop: 8, fontSize: 12, color: colors.saffron }}>
                    {t('Not visible to anyone while the switch above is off.')}
                  </Body>
                ) : null}
              </Panel>
            </Reveal>

            {problem ? (
              <Body style={{ marginTop: 14, color: colors.primary, fontSize: 12.5 }}>
                {problem}
              </Body>
            ) : null}

            <Button
              label={
                busy
                  ? t('Saving…')
                  : existing
                    ? t('Save changes')
                    : t('Start my meal service')
              }
              block
              disabled={busy || !!problem}
              style={{ marginTop: 18 }}
              onPress={save}
            />

            {existing ? (
              <Button
                label={t('Open my calendar')}
                variant="glass"
                block
                style={{ marginTop: 10, marginBottom: 26 }}
                onPress={() => router.push('/cook/meal-plan')}
              />
            ) : (
              <Body muted style={{ marginTop: 10, marginBottom: 26, fontSize: 12.5 }}>
                {t('Once this is saved you can write your monthly calendar, or cook from the platform’s as it is.')}
              </Body>
            )}
          </>
        )}
      </Container>
    </Screen>
  );
}
