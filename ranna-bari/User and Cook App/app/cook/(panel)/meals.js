/**
 * The meals to cook today, in the order the day happens.
 *
 * The screen a cook opens in the morning. It answers one question — what am I
 * making, how many, and for whom — and it is a *day*, not a catalogue: a month
 * somebody booked is thirty separate plates, and only today's are work.
 *
 * ## Why there is a week strip
 *
 * Bookings are sparse by design: a customer takes three to seven days out of
 * thirty, so most days are empty and the empty day is the common case. Stepping
 * one day at a time meant a cook on the 7th tapped through three blank screens
 * to find out about the 10th. The strip carries a plate count per day, and when
 * today is empty the screen says outright which day is not.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import { Body } from '../../../src/components/Typography';
import { useAlert } from '../../../src/components/Alert';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius } from '../../../src/theme/tokens';
import { useSession } from '../../../src/store/SessionContext';
import { useOrders } from '../../../src/store/OrdersContext';
import { useLang } from '../../../src/i18n/LanguageContext';

import { Empty, GroupLabel, Loading, Panel, Row } from '../../../src/features/meal-plan/components';
import { fetchMealOrders } from '../../../src/features/meal-plan/api';
import {
  SLOTS,
  SLOT_LABEL,
  dateLabel,
  dayParts,
  todayKey,
} from '../../../src/features/meal-plan/format';

/** A day either side. Yesterday matters: a late handover is ordinary. */
function shiftDay(date, delta) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + delta);
  return at.toISOString().slice(0, 10);
}

export default function CookMeals() {
  const { colors } = useTheme();
  const router = useRouter();
  const { token } = useSession();
  const { advanceOrder } = useOrders();
  const { t, n } = useLang();
  const alert = useAlert();

  const [date, setDate] = useState(todayKey());
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    const out = await fetchMealOrders(token, date);
    setData(out.ok ? out.result : { orders: [], week: [], next: null });
  }, [token, date]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const orders = data?.orders ?? null;

  /* Grouped by sitting rather than listed flat: a cook cooks breakfast, then
     lunch, then dinner, and a list that interleaves them is read three times. */
  const bySlot = useMemo(() => {
    const out = new Map(SLOTS.map((slot) => [slot, []]));
    for (const order of orders ?? []) {
      if (!out.has(order.slot)) out.set(order.slot, []);
      out.get(order.slot).push(order);
    }
    return out;
  }, [orders]);

  const deliver = async (order) => {
    setBusy(order.id);
    const out = await advanceOrder(order.id);
    setBusy(null);
    /* A refusal here is almost always "somebody already moved it" — worth
       saying, not worth a dialog that blocks the next plate. */
    if (out && out.ok === false) {
      alert.error(out.message ?? t('That did not work.'), t('Not updated'));
      return;
    }
    await load();
  };

  const total = orders?.length ?? 0;
  const delivered = (orders ?? []).filter(
    (o) => o.status === 'delivered' || o.status === 'completed',
  ).length;
  const today = todayKey();

  const DayButton = ({ delta, icon }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta < 0 ? t('Previous day') : t('Next day')}
      onPress={() => setDate((d) => shiftDay(d, delta))}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.sunken,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={15} color={colors.text} strokeWidth={2} />
    </Pressable>
  );

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('TODAY’S')}
          accent={t('MEALS')}
          subtitle={t('What to cook, how many, and who is waiting.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <DayButton delta={-1} icon="arrowLeft" />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.displayBold, fontSize: 17, color: colors.text }}>
              {date === today ? t('Today') : dateLabel(date)}
            </Text>
            {date !== today ? (
              <Body muted style={{ fontSize: 11.5 }}>
                {dayParts(date).weekday}
              </Body>
            ) : null}
          </View>
          <DayButton delta={1} icon="arrowRight" />
        </View>

        {/* The week, with a plate count under each day. */}
        {data?.week?.length ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
            {data.week.map((day) => {
              const on = day.date === date;
              return (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t('{date}, {n} plates', {
                    date: dateLabel(day.date),
                    n: n(day.count),
                  })}
                  onPress={() => setDate(day.date)}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 8,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: on ? colors.sage : colors.line,
                    backgroundColor: on ? colors.sage50 : colors.sunken,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: 10.5,
                      color: colors.textMuted,
                    }}
                  >
                    {dayParts(day.date).weekday}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 14,
                      marginTop: 1,
                      color: on ? colors.sage : colors.text,
                    }}
                  >
                    {n(dayParts(day.date).day)}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: 10.5,
                      marginTop: 2,
                      color: day.count ? colors.primary : colors.textMuted,
                    }}
                  >
                    {day.count ? n(day.count) : '·'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {orders === null ? (
          <Loading label={t('Reading your day…')} />
        ) : total === 0 ? (
          <View style={{ marginTop: 20 }}>
            <Empty
              title={t('Nothing booked for this day')}
              hint={t('Meals appear here when a customer books a month that includes this date.')}
            />
            {data?.next ? (
              <Button
                label={t('Next cooking day — {date}', { date: dateLabel(data.next) })}
                block
                style={{ marginTop: 14 }}
                onPress={() => setDate(data.next)}
              />
            ) : null}
            <Button
              label={t('Open my monthly menu')}
              variant="glass"
              block
              style={{ marginTop: 10 }}
              onPress={() => router.push('/cook/meal-plan')}
            />
          </View>
        ) : (
          <>
            <Reveal delay={1}>
              <Panel style={{ marginTop: 18 }} tone={delivered === total ? 'good' : undefined}>
                <Row label={t('Plates today')} value={n(total)} strong />
                <Row
                  label={t('Handed over')}
                  value={t('{done} of {total}', { done: n(delivered), total: n(total) })}
                  tone={delivered === total ? 'good' : 'warn'}
                />
              </Panel>
            </Reveal>

            {SLOTS.map((slot, i) => {
              const rows = bySlot.get(slot) ?? [];
              if (!rows.length) return null;

              return (
                <Reveal key={slot} delay={i + 2}>
                  <GroupLabel
                    text={`${t(SLOT_LABEL[slot])} · ${n(rows.length)}`}
                    style={{ marginTop: 26 }}
                  />
                  <View style={{ gap: 10, marginTop: 12 }}>
                    {rows.map((order) => {
                      const done =
                        order.status === 'delivered' || order.status === 'completed';
                      return (
                        <Panel key={order.id} tone={done ? 'good' : undefined}>
                          <View
                            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontFamily: font.uiBold,
                                  fontSize: 15,
                                  color: colors.text,
                                }}
                              >
                                {order.title}
                              </Text>
                              <Body muted style={{ fontSize: 12.5, marginTop: 2 }}>
                                {order.customerName || order.customerKey}
                              </Body>
                              {/* The street line, not just the area: this is the
                                  screen a plate is handed over from. */}
                              {order.address?.line || order.address?.area ? (
                                <Body muted style={{ fontSize: 12, marginTop: 2 }}>
                                  {[order.address.line, order.address.area]
                                    .filter(Boolean)
                                    .join(', ')}
                                </Body>
                              ) : (
                                <Body
                                  style={{ fontSize: 12, marginTop: 2, color: colors.primary }}
                                >
                                  {t('No delivery address on this order')}
                                </Body>
                              )}
                              {order.phone ? (
                                <Body muted style={{ fontSize: 12, marginTop: 1 }}>
                                  {order.phone}
                                </Body>
                              ) : null}
                            </View>
                            <Text
                              style={{
                                fontFamily: font.uiBold,
                                fontSize: 14,
                                color: colors.sage,
                              }}
                            >
                              ৳{n(order.amount)}
                            </Text>
                          </View>

                          {done ? (
                            <Body
                              muted
                              style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18 }}
                            >
                              {order.status === 'completed'
                                ? t('The customer confirmed this one. Payment is with the platform to release.')
                                : t('Handed over. The money moves when the customer confirms they got it.')}
                            </Body>
                          ) : (
                            <Button
                              label={busy === order.id ? t('Updating…') : t('Mark delivered')}
                              block
                              disabled={busy === order.id}
                              style={{ marginTop: 12 }}
                              onPress={() => deliver(order)}
                            />
                          )}
                        </Panel>
                      );
                    })}
                  </View>
                </Reveal>
              );
            })}

            <Body
              muted
              style={{ marginTop: 22, marginBottom: 26, fontSize: 12, lineHeight: 18 }}
            >
              {t('Marking a meal delivered does not pay you for it. The customer confirms they received it, and the platform releases that meal’s money — one plate at a time, so a good Monday is paid whatever happens on Tuesday.')}
            </Body>
          </>
        )}
      </Container>
    </CookScreen>
  );
}
