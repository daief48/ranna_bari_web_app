import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import SectionHeader from '../../../src/components/SectionHeader';
import { IconTile } from '../../../src/components/Surfaces';
import { statusMeta } from '../../../src/components/CookBits';
import { Body, Heading, Price } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
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
  const [lane, setLane] = useState(null);
  const { t, n } = useLang();

  const mine = ordersForKitchen(kitchen?.id);

  const counts = useMemo(() => {
    const out = {};
    for (const l of LANES) out[l.key] = mine.filter((o) => l.match(o.status)).length;
    return out;
  }, [mine]);

  /*
   * Open on the lane that has something in it.
   *
   * It always opened on New, which is empty most of the time — a kitchen with
   * three orders cooking and twenty in history greeted its cook with "No new
   * orders" and a screen of nothing. LANES is already in the order a cook
   * cares about, so the first non-empty one is the right answer; New still
   * wins whenever anything is actually waiting.
   *
   * A tap pins the choice — `lane` stops being null and this stops deciding.
   */
  const shown = lane ?? (LANES.find((l) => counts[l.key] > 0)?.key ?? 'new');

  const rows = useMemo(() => {
    const active = LANES.find((l) => l.key === shown);
    const list = mine.filter((o) => active.match(o.status));
    /* Work lanes put the longest wait first -- that is the one going cold.
       History reads newest-first like any log. */
    return list.sort((a, b) =>
      shown === 'history'
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : new Date(a.createdAt) - new Date(b.createdAt),
    );
  }, [mine, shown]);

  return (
    <CookScreen>
      <Container>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SectionHeader
              /* Sentence case, not the shouted caps every other section
                 header uses: this is the page a cook lives on, and a heading
                 that stops shouting is one less thing competing with the
                 order card underneath it. */
              lead={t('Order')}
              accent={t('Board')}
              subtitle={
                counts.new
                  ? t(
                      counts.new === 1
                        ? '{n} order waiting to be accepted.'
                        : '{n} orders waiting to be accepted.',
                      { n: n(counts.new) },
                    )
                  : counts.cooking || counts.delivering
                    ? t('{c} cooking, {d} out for delivery.', {
                        c: n(counts.cooking),
                        d: n(counts.delivering),
                      })
                    : t('Nothing in the kitchen right now.')
              }
              style={{ marginBottom: 18 }}
            />
          </View>

          <Cloche />
        </View>

        {/*
          * Four lanes as one control.
          *
          * They were separate pills in a horizontal scroller — right for the
          * browse chips, which are an open-ended list of areas, and wrong
          * here: this is a fixed set of four and the fourth, History, sat off
          * the right edge where a cook had to discover it by dragging.
          */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'stretch',
            padding: 4,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          {LANES.map((l, i) => {
            const active = shown === l.key;
            const prevActive = i > 0 && shown === LANES[i - 1].key;
            const count = counts[l.key];

            return (
              <React.Fragment key={l.key}>
                {/* A hairline between two quiet segments. Next to the filled
                    one it would only fight the pill's edge. */}
                {i > 0 ? (
                  <View
                    style={{
                      width: 1,
                      marginVertical: 7,
                      backgroundColor: active || prevActive ? 'transparent' : colors.line,
                    }}
                  />
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${t(l.label)}, ${t(count === 1 ? '{n} order so far' : '{n} orders', { n: n(count) })}`}
                  onPress={() => setLane(l.key)}
                  style={({ pressed }) => ({
                    flexGrow: 1,
                    flexBasis: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    /* Tight, because four labels and two badges have to fit a
                       360px phone without "COOKING" becoming "COOK…". The
                       segments are equal width, so the widest content decides
                       the size of all of them. */
                    gap: 4,
                    paddingVertical: 9,
                    paddingHorizontal: 3,
                    borderRadius: radius.pill,
                    backgroundColor: active ? colors.sage : 'transparent',
                    opacity: pressed && !active ? 0.6 : 1,
                  })}
                >
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.1}
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 10.5,
                      letterSpacing: 0.2,
                      textTransform: 'uppercase',
                      color: active ? '#FFFFFF' : colors.textMuted,
                    }}
                  >
                    {t(l.label)}
                  </Text>

                  {/* History's total is a log, not a queue — nothing is owed
                      on it, and its badge was the width that pushed the
                      longest label into "HIST…". The three lanes that are
                      work keep theirs. */}
                  {count > 0 && l.key !== 'history' ? (
                    <View
                      style={{
                        minWidth: 16,
                        paddingHorizontal: 4,
                        paddingVertical: 1,
                        borderRadius: radius.pill,
                        alignItems: 'center',
                        backgroundColor: active ? 'rgba(255, 255, 255, 0.3)' : colors.sunken,
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={1.1}
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 10,
                          color: active ? '#FFFFFF' : colors.textMuted,
                        }}
                      >
                        {n(count)}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      </Container>

      <Container style={{ marginTop: 18 }}>
        {!rows.length ? (
          <View style={{ alignItems: 'center', gap: 16, paddingVertical: 44 }}>
            <IconTile name={shown === 'history' ? 'receipt' : 'pot'} variant="sage" large />
            <Heading size={19} style={{ textAlign: 'center' }}>
              {shown === 'new'
                ? t('No new orders')
                : shown === 'history'
                  ? t('Nothing finished yet')
                  : t(shown === 'cooking' ? 'Nothing on the stove' : 'Nothing out for delivery')}
            </Heading>
            <Body muted size={14} style={{ textAlign: 'center' }}>
              {shown === 'new'
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
                <OrderCard order={order} onOpen={() => router.push(`/cook/order/${order.id}`)} />
              </Reveal>
            ))}
          </View>
        )}

        {/* Only where it is advice rather than decoration: a note about
            answering quickly, on the lane that has something unanswered, and
            pointing at the one that has waited longest. */}
        {shown === 'new' && rows.length ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('Open the order that has waited longest')}
            onPress={() => router.push(`/cook/order/${rows[0].id}`)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              marginTop: 16,
              padding: 15,
              borderRadius: radius.lg,
              backgroundColor: pressed ? colors.sage100 : colors.sage50,
            })}
          >
            <Icon name="shieldCheck" size={22} color={colors.sage} strokeWidth={1.9} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}
              >
                {t('Tip: Accept orders quickly')}
              </Text>
              <Text
                style={{
                  marginTop: 1,
                  fontFamily: font.ui,
                  fontSize: type.xs,
                  lineHeight: 18,
                  color: colors.textMuted,
                }}
              >
                {t('Fast response improves customer satisfaction.')}
              </Text>
            </View>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.sage100,
              }}
            >
              <Icon name="chevronRight" size={14} color={colors.sage} strokeWidth={2.4} />
            </View>
          </Pressable>
        ) : null}
      </Container>
    </CookScreen>
  );
}

/**
 * The serving dome beside the title.
 *
 * Decoration, and marked as such: `accessibilityElementsHidden` keeps it out
 * of the reading order, because a screen reader announcing "pot, sparkles,
 * leaf" before the order list is noise standing where information should be.
 */
function Cloche() {
  const { colors } = useTheme();

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 92, height: 78, marginTop: 2 }}
    >
      <View style={{ position: 'absolute', right: 2, bottom: 6 }}>
        <Icon name="pot" size={62} color={colors.saffron100} strokeWidth={1.4} />
      </View>
      <View style={{ position: 'absolute', left: 0, top: 8 }}>
        <Icon name="sparkles" size={18} color={colors.saffron} strokeWidth={1.7} />
      </View>
      <View style={{ position: 'absolute', right: 4, top: 0 }}>
        <Icon name="sparkles" size={13} color={colors.saffron100} strokeWidth={1.7} />
      </View>
      <View style={{ position: 'absolute', right: 0, bottom: 2 }}>
        <Icon name="leaf" size={17} color={colors.sage100} strokeWidth={1.7} />
      </View>
    </View>
  );
}

/**
 * One order, as a card a cook can act on without opening it.
 *
 * The whole surface opens the order; the two buttons at the foot are the
 * decision itself, so a cook working a queue never has to leave the board.
 */
function OrderCard({ order, onOpen }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const { advanceOrder } = useOrders();
  const [copied, setCopied] = useState(false);

  const meta = statusMeta(order.status, colors);
  const next = NEXT_STEP[order.status];
  const isNew = order.status === 'placed';
  const count = order.items.reduce((s, it) => s + it.qty, 0);

  /* The code is what a cook reads to a rider or pastes into a message, so it
     is worth one tap rather than a careful retype of eight characters. */
  const copyCode = async () => {
    if (!order.code) return;
    Haptics.selectionAsync().catch(() => {});
    await Clipboard.setStringAsync(order.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: isNew ? colors.primary100 : colors.line,
          overflow: 'hidden',
        },
        shadow.sm,
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t('Order')} ${order.code ?? ''}, ${t(meta.label)}`}
        onPress={onOpen}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingTop: 15,
          backgroundColor: pressed ? colors.sunken : 'transparent',
        })}
      >
        {/* ---- status, age, and the code ---- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 4,
              paddingHorizontal: 9,
              borderRadius: radius.pill,
              backgroundColor: meta.bg,
            }}
          >
            <Icon name={meta.icon} size={11} color={meta.fg} strokeWidth={2.2} />
            <Text
              maxFontSizeMultiplier={1.2}
              style={{
                fontFamily: font.uiBold,
                fontSize: 10,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: meta.fg,
              }}
            >
              {t(meta.label)}
            </Text>
          </View>

          <Text
            numberOfLines={1}
            style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
          >
            {timeAgo(order.createdAt, t, n)}
          </Text>

          <View style={{ flex: 1 }} />

          {order.code ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Copy order ID {code}', { code: order.code })}
              onPress={copyCode}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <Text
                numberOfLines={1}
                style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textLight }}
              >
                {t('Order ID:')}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.xs,
                  letterSpacing: 0.4,
                  color: colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {order.code}
              </Text>
              <Icon
                name={copied ? 'check' : 'copy'}
                size={14}
                color={copied ? colors.sage : colors.textLight}
                strokeWidth={2}
              />
            </Pressable>
          ) : null}
        </View>

        {/* ---- who, where, and the cook's share ---- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <Image
            source={{ uri: order.items[0]?.image }}
            contentFit="cover"
            transition={150}
            style={{
              width: 54,
              height: 54,
              borderRadius: radius.sm,
              backgroundColor: colors.sunken,
            }}
          />

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.displayBold,
                fontSize: 17,
                letterSpacing: -0.2,
                color: colors.text,
              }}
            >
              {order.contact?.name ?? t('A customer')}
            </Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
            >
              <Icon name="pin" size={12} color={colors.textLight} />
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
              >
                {t(count === 1 ? '{n} item' : '{n} items', { n: n(count) })}
                {order.address?.area ? ` • ${order.address.area}` : ''}
              </Text>
            </View>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Price size={19}>৳{n(cookPayout(order))}</Price>
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 9.5,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: colors.sage,
              }}
            >
              {t('Your cut')}
            </Text>
          </View>
        </View>

        {/* A dashed rule, because what is above it is the order and what is
            below it is the food — related, but not the same reading. */}
        <View
          style={{
            marginTop: 13,
            borderTopWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.line,
          }}
        />

        <Text
          numberOfLines={2}
          style={{
            marginTop: 11,
            fontFamily: font.ui,
            fontSize: type.sm,
            lineHeight: 20,
            color: colors.textMuted,
          }}
        >
          {order.items.map((it) => `${n(it.qty)}×  ${it.name}`).join(',  ')}
        </Text>
      </Pressable>

      {next ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 16,
          }}
        >
          {/* Rejecting needs a reason, and the reason list is on the order
              screen -- so this opens it rather than deciding here. */}
          {isNew ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Reject')}
              onPress={onOpen}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                paddingVertical: 12,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.primary100,
                backgroundColor: pressed ? colors.primary50 : 'transparent',
              })}
            >
              <Icon name="x" size={15} color={colors.primary} strokeWidth={2.4} />
              <Text
                style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.primary }}
              >
                {t('Reject')}
              </Text>
            </Pressable>
          ) : null}

          {/*
            * Green, and it is the only green button on the screen.
            *
            * This was the same vermilion as Reject, so the two decisions on a
            * new order looked alike at a glance and the destructive one had
            * no less weight than the one a cook makes forty times a day.
            */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(meta.action)}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              advanceOrder(order.id);
            }}
            style={({ pressed }) => ({
              flex: isNew ? 1.35 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 12,
              borderRadius: radius.pill,
              backgroundColor: pressed ? colors.sage100 : colors.sage,
            })}
          >
            <Icon name="check" size={15} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: '#FFFFFF' }}>
              {t(meta.action)}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {order.status === 'rejected' && order.rejectReason ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 9,
            paddingHorizontal: 16,
            paddingBottom: 16,
          }}
        >
          <Icon name="alertCircle" size={15} color={colors.textLight} />
          <Text
            style={{
              flex: 1,
              fontFamily: font.ui,
              fontSize: type.xs,
              lineHeight: 18,
              color: colors.textMuted,
            }}
          >
            {order.rejectReason}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
