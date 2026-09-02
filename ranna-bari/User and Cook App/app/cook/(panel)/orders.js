import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import { IconTile } from '../../../src/components/Surfaces';
import { StatusPill, statusMeta } from '../../../src/components/CookBits';
import { Body, Heading, Price } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import useResponsive from '../../../src/theme/useResponsive';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import {
  NEXT_STEP,
  cookPayout,
  isClosed,
  timeAgo,
  useOrders,
} from '../../../src/store/OrdersContext';
import { useLang } from '../../../src/i18n/LanguageContext';

/**
 * The board is cut by what the cook has to do next, not by the raw status:
 * "New" is a decision, "Cooking" is work, "Delivering" is a wait, and
 * "History" is everything already settled.
 */
const LANES = [
  { key: 'new', label: 'New', match: (s) => s === 'placed' },
  { key: 'cooking', label: 'Cooking', match: (s) => s === 'accepted' || s === 'cooking' },
  { key: 'delivering', label: 'Delivering', match: (s) => s === 'on_the_way' },
  { key: 'history', label: 'History', match: isClosed },
];

export default function CookOrders() {
  const { colors } = useTheme();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const { ordersForKitchen } = useOrders();
  const [lane, setLane] = useState('new');
  const { t, n } = useLang();

  const mine = ordersForKitchen(kitchen?.id);

  const counts = useMemo(() => {
    const out = {};
    for (const l of LANES) out[l.key] = mine.filter((o) => l.match(o.status)).length;
    return out;
  }, [mine]);

  const rows = useMemo(() => {
    const active = LANES.find((l) => l.key === lane);
    const list = mine.filter((o) => active.match(o.status));
    /* Work lanes put the longest wait first -- that is the one going cold.
       History reads newest-first like any log. */
    return list.sort((a, b) =>
      lane === 'history'
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : new Date(a.createdAt) - new Date(b.createdAt),
    );
  }, [mine, lane]);

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('ORDER')}
          accent={t('BOARD')}
          subtitle={
            counts.new
              ? t(counts.new === 1 ? '{n} order waiting to be accepted.' : '{n} orders waiting to be accepted.', { n: n(counts.new) })
              : t('Everything that comes through your kitchen.')
          }
        />
      </Container>

      {/* Lanes bleed to the screen edges, the same signal the browse chips use. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 2 }}
      >
        {LANES.map((l) => {
          const active = lane === l.key;
          const count = counts[l.key];

          return (
            <Pressable
              key={l.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${t(l.label)}, ${t(count === 1 ? '{n} order so far' : '{n} orders', { n: n(count) })}`}
              onPress={() => setLane(l.key)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.sage : colors.surfaceSolid,
                borderWidth: 1,
                borderColor: active ? colors.sage : colors.line,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: 13,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: active ? '#FFFFFF' : colors.textMuted,
                }}
              >
                {t(l.label)}
              </Text>
              {count > 0 ? (
                <View
                  style={{
                    minWidth: 19,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    backgroundColor: active
                      ? 'rgba(255, 255, 255, 0.28)'
                      : l.key === 'new'
                        ? colors.primary50
                        : colors.sunken,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 11,
                      color: active
                        ? '#FFFFFF'
                        : l.key === 'new'
                          ? colors.primary
                          : colors.textMuted,
                    }}
                  >
                    {n(count)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Container style={{ marginTop: 20 }}>
        {!rows.length ? (
          <View style={{ alignItems: 'center', gap: 16, paddingVertical: 44 }}>
            <IconTile
              name={lane === 'history' ? 'receipt' : 'pot'}
              variant="sage"
              large
            />
            <Heading size={19} style={{ textAlign: 'center' }}>
              {lane === 'new'
                ? t('No new orders')
                : lane === 'history'
                  ? t('Nothing finished yet')
                  : t(lane === 'cooking' ? 'Nothing on the stove' : 'Nothing out for delivery')}
            </Heading>
            <Body muted size={14} style={{ textAlign: 'center' }}>
              {lane === 'new'
                ? kitchen?.isOpen
                  ? t('Your kitchen is open. New orders land here first.')
                  : t('Your kitchen is closed, so nothing can come in.')
                : t('Orders move through here as you work them.')}
            </Body>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {rows.map((order, i) => (
              <Reveal key={order.id} delay={(i % 5) + 1}>
                <OrderCard
                  order={order}
                  onOpen={() => router.push(`/cook/order/${order.id}`)}
                />
              </Reveal>
            ))}
          </View>
        )}
      </Container>
    </CookScreen>
  );
}

/**
 * One order on the board.
 *
 * The primary action is on the card rather than behind a tap-through,
 * because the common case in a working kitchen is a cook with one free hand
 * moving five orders along without reading any of them twice.
 */
function OrderCard({ order, onOpen }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const r = useResponsive();
  const { advanceOrder } = useOrders();

  const meta = statusMeta(order.status, colors);
  const next = NEXT_STEP[order.status];
  const count = order.items.reduce((s, it) => s + it.qty, 0);
  // A new order needs two buttons; on a narrow phone they get their own rows.
  const stacked = r.sm && order.status === 'placed';

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: order.status === 'placed' ? colors.primary100 : colors.line,
          overflow: 'hidden',
        },
        shadow.sm,
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t('Order')} ${order.id}, ${t(meta.label)}`}
        onPress={onOpen}
        style={({ pressed }) => ({
          padding: 18,
          backgroundColor: pressed ? colors.sunken : 'transparent',
        })}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <StatusPill status={order.status} />
          <Text
            style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
          >
            {timeAgo(order.createdAt, t, n)}
          </Text>
          <View style={{ flex: 1 }} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 0.9,
              color: colors.textLight,
              fontVariant: ['tabular-nums'],
            }}
          >
            {order.id}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flexDirection: 'row' }}>
            {/* An order line carries no id of its own — the shape is
                { name, price, qty, image?, id? } and the id only survives when
                the line came from a listed dish. Name and position together
                are unique and stable for a list that never reorders, which is
                the same key the request lists already use. */}
            {order.items.slice(0, 3).map((it, k) => (
              <Image
                key={`${it.name}-${k}`}
                source={{ uri: it.image }}
                contentFit="cover"
                transition={150}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  marginLeft: k === 0 ? 0 : -12,
                  borderWidth: 2,
                  borderColor: colors.surfaceSolid,
                  backgroundColor: colors.sunken,
                }}
              />
            ))}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.displayBold,
                fontSize: 16,
                letterSpacing: -0.16,
                color: colors.text,
              }}
            >
              {order.contact?.name ?? t('A customer')}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
            >
              {t(count === 1 ? '{n} item' : '{n} items', { n: n(count) })} · {order.address?.area ?? ''}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Price size={17}>৳{n(cookPayout(order))}</Price>
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: 9.5,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: colors.textLight,
              }}
            >
              {t('Your cut')}
            </Text>
          </View>
        </View>

        {/* What is actually being cooked. Two lines is enough for a glance;
            the order screen has the full list. */}
        <Text
          numberOfLines={2}
          style={{
            marginTop: 12,
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: 20,
            color: colors.textMuted,
          }}
        >
          {order.items.map((it) => `${n(it.qty)}× ${it.name}`).join(', ')}
        </Text>
      </Pressable>

      {next ? (
        <View
          style={{
            flexDirection: stacked ? 'column' : 'row',
            gap: 10,
            paddingHorizontal: 18,
            paddingBottom: 18,
          }}
        >
          {/* Rejecting needs a reason, and the reason list is on the order
              screen -- so this opens it rather than deciding here. */}
          {order.status === 'placed' ? (
            <Button
              variant="glass"
              label={t('Reject')}
              small
              block={stacked}
              style={stacked ? null : { flex: 1 }}
              onPress={onOpen}
            />
          ) : null}
          <Button
            label={t(meta.action)}
            icon="arrowRight"
            small
            block={stacked}
            style={stacked ? null : { flex: 1 }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              advanceOrder(order.id);
            }}
          />
        </View>
      ) : null}

      {order.status === 'rejected' && order.rejectReason ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 9,
            paddingHorizontal: 18,
            paddingBottom: 18,
          }}
        >
          <Icon name="alertCircle" size={15} color={colors.textLight} />
          <Text
            style={{
              flex: 1,
              fontFamily: font.ui,
              fontSize: type.xs,
              lineHeight: 18,
              color: colors.textLight,
            }}
          >
            {t(order.rejectReason)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
