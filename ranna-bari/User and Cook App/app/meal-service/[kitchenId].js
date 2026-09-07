/**
 * One kitchen's month, and the meals you are choosing off it.
 *
 * The screen the whole monthly system exists for. Three rules meet here and
 * all three have to be legible while somebody is tapping:
 *
 *   - any date, any of breakfast/lunch/dinner, in any combination;
 *   - the total has to land inside the kitchen's range;
 *   - the whole thing is paid up front, out of the wallet.
 *
 * So the running total is pinned to the bottom rather than living at the end
 * of a thirty-day scroll. A customer four taps in needs to know whether they
 * are over the maximum *now*, not after scrolling back down — and the button
 * that takes their money says what it will take before it is pressed.
 *
 * A slot with no dish on it cannot be picked, and neither can one already
 * bought. Both are drawn as unavailable rather than hidden: a customer looking
 * for Tuesday dinner should find out it is not offered, not fail to find
 * Tuesday.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Button from '../../src/components/Button';
import SectionHeader from '../../src/components/SectionHeader';
import { Body } from '../../src/components/Typography';
import { useAlert } from '../../src/components/Alert';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius } from '../../src/theme/tokens';
import { useSession } from '../../src/store/SessionContext';
import { useCommerce } from '../../src/store/CommerceContext';
import { useAuth } from '../../src/store/AuthContext';
import { useLang } from '../../src/i18n/LanguageContext';
import { errorText } from '../../src/lib/errors';

import { Chip, Divider, Loading, MonthPicker, Panel, Row } from '../../src/features/meal-plan/components';
import { bookMeals, fetchMealService } from '../../src/features/meal-plan/api';
import {
  SLOTS,
  SLOT_LABEL,
  currentMonth,
  dayParts,
  daysByDate,
  monthDays,
  monthLabel,
  todayKey,
} from '../../src/features/meal-plan/format';

const keyOf = (date, slot) => `${date}|${slot}`;

export default function MealServiceScreen() {
  const { kitchenId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useSession();
  const { wallet, reloadWallet, reloadOrders } = useCommerce();
  const { account } = useAuth();
  const { t, n } = useLang();
  const alert = useAlert();

  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !kitchenId) return;
    setData(null);
    const out = await fetchMealService(token, String(kitchenId), month);
    setData(out.ok ? out.result : { error: out.message ?? 'Could not load this kitchen.' });
    /* A selection belongs to the month it was made in. Carrying it across
       would price meals the customer cannot see. */
    setPicked(new Set());
  }, [token, kitchenId, month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const service = data?.service ?? null;
  const planned = useMemo(() => daysByDate(data?.days ?? []), [data]);

  /* Slots this customer already owns for this month, so they cannot be sold
     the same Tuesday twice. */
  const owned = useMemo(() => {
    const out = new Set();
    for (const row of data?.booked ?? []) out.add(keyOf(row.date, row.slot));
    return out;
  }, [data]);

  const today = todayKey();
  const allDays = useMemo(() => monthDays(month), [month]);

  /*
   * Days you can still buy, and the ones that have gone.
   *
   * Opened mid-month the calendar led with a full screen of greyed rows nobody
   * can book — six dead days before the first live one. The past is kept, since
   * "is the 3rd really gone" is a fair question, but it is behind a line rather
   * than in front of the month.
   */
  const [showPast, setShowPast] = useState(false);
  const pastDays = useMemo(() => allDays.filter((d) => d < today), [allDays, today]);
  const days = useMemo(
    () => (showPast ? allDays : allDays.filter((d) => d >= today)),
    [allDays, showPast, today],
  );

  const toggle = (date, slot) => {
    const key = keyOf(date, slot);
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /**
   * Take one sitting across the month, up to the maximum.
   *
   * "Lunch every day" is the commonest shape of a meal plan and it took twenty
   * taps down a long scroll. Capped at the maximum rather than refused after
   * the fact: the rule is the kitchen's, so the shortcut should respect it
   * instead of building a basket the button then rejects.
   */
  const takeSlot = (slot) => {
    const room = max - picked.size;
    if (room <= 0) return;

    const additions = [];
    for (const date of allDays) {
      if (date < today) continue;
      const key = keyOf(date, slot);
      if (picked.has(key) || owned.has(key)) continue;
      if (!String(planned.get(date)?.[slot] ?? '').trim()) continue;
      additions.push(key);
      if (additions.length >= room) break;
    }

    if (!additions.length) return;
    setPicked((current) => new Set([...current, ...additions]));
  };

  const count = picked.size;
  const rate = service?.rate ?? 0;
  const total = count * rate;
  const min = service?.minMeals ?? 1;
  const max = service?.maxMeals ?? 1;
  const balance = wallet?.customer ?? 0;

  /*
   * Where a month of meals gets delivered.
   *
   * Sent with the booking and snapshotted onto every order it creates, the
   * same way checkout does it. Without this each meal reached the cook's day
   * with `address: null` on it — thirty plates and nowhere to take them — and
   * nothing in the flow ever asked, because a month is bought from a calendar
   * rather than through a checkout form.
   */
  const address = account?.addressDetail
    ? {
        label: account.addressLabel || 'Home',
        line: account.addressDetail,
        area: account.area || '',
        lat: account.lat ?? null,
        lng: account.lng ?? null,
      }
    : null;

  /* Said in the order a customer hits them, and only one at a time: three
     complaints stacked under a button is a button nobody reads. */
  const problem =
    count === 0
      ? null
      : count < min
        ? t('Pick at least {n} meals.', { n: n(min) })
        : count > max
          ? t('That is {over} over the most this kitchen takes.', { over: n(count - max) })
          : !address
            ? t('Add a delivery address before booking a month.')
            : total > balance
              ? t('Your wallet is ৳{short} short.', { short: n(total - balance) })
              : null;

  const ready =
    count >= min && count <= max && total <= balance && total > 0 && !!address;

  const confirm = () => {
    const selections = [...picked].map((key) => {
      const [date, slot] = key.split('|');
      return { date, slot };
    });

    alert.confirm({
      title: t('Pay ৳{total} now?', { total: n(total) }),
      body: t(
        '{n} meals from {kitchen} in {month}. The money is held by the platform and released to the cook one meal at a time, as you confirm each one arrived.',
        {
          n: n(count),
          kitchen: service.kitchenName,
          month: monthLabel(month),
        },
      ),
      confirmLabel: t('Pay and book'),
      onConfirm: async () => {
        setBusy(true);
        const out = await bookMeals(token, {
          kitchenId: String(kitchenId),
          month,
          selections,
          address,
        });
        setBusy(false);

        if (!out.ok) {
          /* `errorText` rather than the server's sentence: several refusals
             here are templates the app fills in from `detail`, and the range
             one is the likeliest to be seen. */
          alert.error(errorText(out.error, t, n, { detail: out.detail }), t('Not booked'));
          /* The refusal is usually about what somebody else did in the last
             minute, so the calendar is re-read rather than left stale. */
          load();
          return;
        }
        /* The wallet is a balance the next screen shows, and the orders list
           just gained however many meals were bought. */
        await Promise.all([reloadWallet(), reloadOrders()]);
        alert.success(
          t('{n} meals booked. ৳{total} is held until you confirm each one.', {
            n: n(count),
            total: n(total),
          }),
          t('Booked'),
        );
        router.replace(`/meal-booking/${out.result.bookingId}`);
      },
    });
  };

  if (!data) {
    return (
      <Screen>
        <Container>
          <Loading label={t('Reading the calendar…')} />
        </Container>
      </Screen>
    );
  }

  if (!service) {
    return (
      <Screen>
        <Container>
          <SectionHeader lead={t('MEAL')} accent={t('PLAN')} style={{ marginTop: 16 }} />
          <Panel style={{ marginTop: 20 }}>
            <Body>{data.error ?? t('This kitchen is not taking meal bookings.')}</Body>
            <Button
              label={t('Find another kitchen')}
              block
              style={{ marginTop: 14 }}
              onPress={() => router.replace('/meals')}
            />
          </Panel>
        </Container>
      </Screen>
    );
  }

  const anyPlanned = (data.days ?? []).length > 0;

  /*
   * The running total, pinned — through `Screen`'s own `footer` slot.
   *
   * It began as a `position: absolute` view inside a `ScrollView` of this
   * screen's own, which was wrong twice: `Screen` already scrolls, so that
   * nested a second scroller inside the first, and an absolute child of a
   * scrolling box is positioned against the *content*. The one element that
   * has to be true at every moment of a thirty-day scroll was therefore
   * sitting at the bottom of it, thirty days down. `footer` renders as a
   * sibling of the scroll view, which is what actually pins it — the same
   * slot `CartBar` uses.
   */
  const totalBar = (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 26,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.surfaceSolid,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.ui, fontSize: 13, color: colors.textMuted }}>
          {count === 0
            ? t('Nothing picked yet')
            : t('{n} meals × ৳{rate}', { n: n(count), rate: n(rate) })}
        </Text>
        <Text style={{ fontFamily: font.displayBold, fontSize: 20, color: colors.text }}>
          ৳{n(total)}
        </Text>
      </View>

      {problem ? (
        <Text style={{ fontFamily: font.ui, fontSize: 12.5, color: colors.primary }}>
          {problem}
        </Text>
      ) : null}

      {!address && count > 0 ? (
        <Button
          label={t('Add a delivery address')}
          variant="glass"
          block
          onPress={() => router.push('/addresses')}
        />
      ) : total > balance && count > 0 ? (
        <Button
          label={t('Top up my wallet')}
          variant="glass"
          block
          onPress={() => router.push('/wallet')}
        />
      ) : (
        <Button
          label={
            busy
              ? t('Booking…')
              : count === 0
                ? t('Pick your meals')
                : t('Pay ৳{total} and book', { total: n(total) })
          }
          block
          disabled={busy || !ready}
          onPress={confirm}
        />
      )}
    </View>
  );

  return (
    <Screen footer={totalBar} contentStyle={{ paddingBottom: 250 }}>
      <Container>
          <SectionHeader
            lead={service.kitchenName}
            accent={t('CALENDAR')}
            subtitle={t('Tick the meals you want. {label} · ৳{rate} each.', {
              label: t(service.categoryLabel || service.categoryKey),
              rate: n(rate),
            })}
            style={{ marginTop: 16 }}
          />

          <View style={{ marginTop: 18 }}>
            <MonthPicker month={month} onChange={setMonth} disabled={busy} />
          </View>

          <Panel style={{ marginTop: 16 }}>
            <Row
              label={t('You must take')}
              value={
                min === max
                  ? t('exactly {n} meals', { n: n(min) })
                  : t('{min} to {max} meals', { min: n(min), max: n(max) })
              }
              strong
            />
            <Row label={t('Wallet balance')} value={`৳${n(balance)}`} />
          </Panel>

          {!anyPlanned ? (
            <Panel style={{ marginTop: 16 }} tone="warn">
              <Body>{t('No menu is published for {month}.', { month: monthLabel(month) })}</Body>
              <Body muted style={{ marginTop: 6, lineHeight: 19 }}>
                {t('Try the next month — a kitchen usually publishes one at a time.')}
              </Body>
            </Panel>
          ) : (
            <View style={{ marginTop: 18 }}>
              {/* Whole-month shortcuts. "Lunch every day" is the commonest
                  shape of a meal plan and it was twenty taps down a scroll. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SLOTS.map((slot) => (
                  <Chip
                    key={slot}
                    label={t('Every {slot}', { slot: t(SLOT_LABEL[slot]).toLowerCase() })}
                    onPress={() => takeSlot(slot)}
                    disabled={count >= max}
                  />
                ))}
                {count > 0 ? (
                  <Chip label={t('Clear')} onPress={() => setPicked(new Set())} />
                ) : null}
              </View>

              {pastDays.length && !showPast ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPast(true)}
                  style={({ pressed }) => ({ paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ fontFamily: font.ui, fontSize: 12.5, color: colors.textMuted }}>
                    {t('{n} earlier days have gone — show them', { n: n(pastDays.length) })}
                  </Text>
                </Pressable>
              ) : null}

              {days.map((date) => {
                const plan = planned.get(date) ?? {};
                const parts = dayParts(date);
                const past = date < today;
                const offered = SLOTS.filter((slot) => String(plan[slot] ?? '').trim());
                if (!offered.length) return null;

                /* How many of this day the customer has taken, so a day reads
                   without opening it. */
                const takenHere = offered.filter((slot) => picked.has(keyOf(date, slot))).length;

                return (
                  <View
                    key={date}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.line,
                      opacity: past ? 0.4 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text
                        style={{
                          fontFamily: font.displayBold,
                          fontSize: 17,
                          color: parts.weekend ? colors.primary : colors.text,
                        }}
                      >
                        {n(parts.day)}
                      </Text>
                      <Text
                        style={{ fontFamily: font.ui, fontSize: 12, color: colors.textMuted }}
                      >
                        {parts.weekday}
                      </Text>
                      {past ? (
                        <Text
                          style={{ fontFamily: font.ui, fontSize: 11.5, color: colors.textMuted }}
                        >
                          {t('gone')}
                        </Text>
                      ) : null}
                      {takenHere ? (
                        <Text
                          style={{
                            marginLeft: 'auto',
                            fontFamily: font.uiBold,
                            fontSize: 11.5,
                            color: colors.sage,
                          }}
                        >
                          {t('{n} picked', { n: n(takenHere) })}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{ gap: 6, marginTop: 6 }}>
                      {offered.map((slot) => {
                        const key = keyOf(date, slot);
                        const taken = picked.has(key);
                        const already = owned.has(key);
                        const locked = past || already;

                        return (
                          <Pressable
                            key={slot}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: taken, disabled: locked }}
                            accessibilityLabel={`${SLOT_LABEL[slot]} ${date}: ${plan[slot]}`}
                            onPress={locked ? undefined : () => toggle(date, slot)}
                            style={({ pressed }) => ({
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              borderRadius: radius.md,
                              borderWidth: 1,
                              borderColor: taken ? colors.sage : colors.line,
                              backgroundColor: taken ? colors.sage50 : colors.sunken,
                              opacity: locked ? 0.55 : pressed ? 0.8 : 1,
                            })}
                          >
                            <View
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                borderWidth: 1.5,
                                borderColor: taken ? colors.sage : colors.line2,
                                backgroundColor: taken ? colors.sage : 'transparent',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {taken ? <Icon name="check" size={13} color="#FFFFFF" /> : null}
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text
                                numberOfLines={1}
                                style={{ fontFamily: font.ui, fontSize: 14, color: colors.text }}
                              >
                                {plan[slot]}
                              </Text>
                              <Text
                                style={{
                                  fontFamily: font.ui,
                                  fontSize: 11.5,
                                  color: colors.textMuted,
                                }}
                              >
                                {t(SLOT_LABEL[slot])}
                                {already ? ` · ${t('already booked')}` : ''}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Container>
    </Screen>
  );
}
