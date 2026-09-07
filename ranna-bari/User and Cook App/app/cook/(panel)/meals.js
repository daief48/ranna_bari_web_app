/**
 * The meals to cook today, in the order the day happens.
 *
 * The screen a cook opens in the morning. It answers one question — what am I
 * making, how many, and for whom — and it is a *day*, not a catalogue: a month
 * somebody booked is thirty separate plates, and only today's are work.
 *
 * The previous version of this file listed published meals off the per-plate
 * board, which the monthly meal system replaced. Its endpoints are gone; this
 * reads the cook's own day off `/meal-orders`.
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

import {
  Empty,
  GroupLabel,
  Loading,
  Panel,
  Row,
} from '../../../src/features/meal-plan/components';
import { fetchMealOrders } from '../../../src/features/meal-plan/api';
import {
  SLOTS,
  SLOT_LABEL,
  dateLabel,
  todayKey,
} from '../../../src/features/meal-plan/format';

/** A day either side of today. Yesterday matters: a late delivery is normal. */
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
  const alert = useAlert();

  const [date, setDate] = useState(todayKey());
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    const out = await fetchMealOrders(token, date);
    setOrders(out.ok ? (out.result.orders ?? []) : []);
  }, [token, date]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /* Grouped by sitting rather than listed flat: a cook cooks breakfast, then
     lunch, then dinner, and a list that interleaves them is a list that has to
     be re-read three times. */
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
    /* `advanceOrder` answers the shop's verdict shape, and a refusal here is
       almost always "somebody already moved it" — worth saying, not worth a
       dialog that blocks the next plate. */
    if (out && out.ok === false) {
      alert.error(out.message ?? 'That did not work.', 'Not updated');
      return;
    }
    await load();
  };

  const total = orders?.length ?? 0;
  const delivered = (orders ?? []).filter(
    (o) => o.status === 'delivered' || o.status === 'completed',
  ).length;

  const DayButton = ({ delta, label }) => (
    <Pressable
      accessibilityRole="button"
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
      <Icon name={label} size={15} color={colors.text} strokeWidth={2} />
    </Pressable>
  );

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead="TODAY'S"
          accent="MEALS"
          subtitle="What to cook, how many, and who is waiting."
          style={{ marginTop: 16 }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginTop: 18,
          }}
        >
          <DayButton delta={-1} label="arrowLeft" />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.displayBold, fontSize: 17, color: colors.text }}>
              {date === todayKey() ? 'Today' : dateLabel(date)}
            </Text>
            {date !== todayKey() ? (
              <Body muted style={{ fontSize: 11.5 }}>
                {dateLabel(todayKey()) === dateLabel(date) ? '' : date}
              </Body>
            ) : null}
          </View>
          <DayButton delta={1} label="arrowRight" />
        </View>

        {orders === null ? (
          <Loading label="Reading your day…" />
        ) : total === 0 ? (
          <View style={{ marginTop: 22 }}>
            <Empty
              title="Nothing booked for this day"
              hint="Meals appear here when a customer books a month that includes this date."
            />
            <Button
              label="Open my calendar"
              variant="glass"
              block
              style={{ marginTop: 14 }}
              onPress={() => router.push('/cook/meal-plan')}
            />
          </View>
        ) : (
          <>
            <Reveal delay={1}>
              <Panel style={{ marginTop: 18 }} tone={delivered === total ? 'good' : undefined}>
                <Row label="Plates today" value={String(total)} strong />
                <Row
                  label="Handed over"
                  value={`${delivered} of ${total}`}
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
                    text={`${SLOT_LABEL[slot]} · ${rows.length}`}
                    style={{ marginTop: 26 }}
                  />
                  <View style={{ gap: 10, marginTop: 12 }}>
                    {rows.map((order) => {
                      const done =
                        order.status === 'delivered' || order.status === 'completed';
                      return (
                        <Panel key={order.id} tone={done ? 'good' : undefined}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'flex-start',
                              gap: 12,
                            }}
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
                              {/* The street line, not just the area. This is
                                  the screen a cook cooks and hands over from,
                                  and an area alone is not somewhere you can
                                  take a plate. */}
                              {order.address?.line || order.address?.area ? (
                                <Body muted style={{ fontSize: 12, marginTop: 2 }}>
                                  {[order.address.line, order.address.area]
                                    .filter(Boolean)
                                    .join(', ')}
                                </Body>
                              ) : (
                                <Body style={{ fontSize: 12, marginTop: 2, color: colors.primary }}>
                                  No delivery address on this order
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
                              ৳{order.amount}
                            </Text>
                          </View>

                          {done ? (
                            <Body
                              muted
                              style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18 }}
                            >
                              {order.status === 'completed'
                                ? 'The customer confirmed this one. Payment is with the platform to release.'
                                : 'Handed over. The money moves when the customer confirms they got it.'}
                            </Body>
                          ) : (
                            <Button
                              label={busy === order.id ? 'Updating…' : 'Mark delivered'}
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
              Marking a meal delivered does not pay you for it. The customer confirms
              they received it, and the platform releases that meal&rsquo;s money — one
              plate at a time, so a good Monday is paid whatever happens on Tuesday.
            </Body>
          </>
        )}
      </Container>
    </CookScreen>
  );
}
