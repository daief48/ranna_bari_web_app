/**
 * The order you are waiting on, wherever you are in the app.
 *
 * "Where is my food" is the single most repeated thing anybody does in a
 * delivery app, and until now it was Profile → Your orders → the order: three
 * taps, from a screen that gave no hint an order was even in flight. The Cart
 * badge counts items in a basket, not orders on their way, so nothing on the
 * bar said anything was happening.
 *
 * So: one line above the tab bar whenever something is not yet finished,
 * carrying the kitchen, the state, and — for the customer — whether the ball
 * is in their court. It disappears the moment the last order settles, which is
 * why it is nothing at all when there is nothing to say.
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from './Icon';
import PulseDot from './PulseDot';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useAuth } from '../store/AuthContext';
import { useCommerce } from '../store/CommerceContext';
import {
  customerKeyOf,
  isFinished,
  awaitingReceipt,
  flowFor,
} from '../lib/ledger';
import { useLang } from '../i18n/LanguageContext';

/** Where an order of each kind opens. */
const HREF = {
  meal: (id) => `/meal-order/${id}`,
  store: (id) => `/store-order/${id}`,
  request: (id) => `/request-order/${id}`,
};

const hrefFor = (order) => (HREF[order.kind] ?? ((id) => `/order/${id}`))(order.id);

/**
 * What to call an order's current step.
 *
 * Straight off `flowFor`, so the strip and the tracker it opens never
 * disagree — and so a collection says "Collected" rather than promising a
 * delivery. The one word this adds is for `delivered`, where the tracker's
 * label states a fact and the strip has to ask for something: the money does
 * not move until the customer confirms it arrived.
 */
function stepLabel(order) {
  if (awaitingReceipt(order)) return 'Did it arrive?';

  const flow = flowFor(order.handover, { preorder: order.preorder });
  return flow.find((step) => step.key === order.status)?.label ?? order.status;
}

export default function LiveOrderStrip({ bottom = 0 }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, isSignedIn } = useAuth();
  const { orders } = useCommerce();

  const key = customerKeyOf(account);

  /*
   * The one worth showing, and how many others there are.
   *
   * An order waiting on the customer to confirm receipt outranks one still
   * being cooked: the first is a job for them, the second is a job for the
   * kitchen. Otherwise the most recent wins.
   */
  const { live, extra } = useMemo(() => {
    if (!isSignedIn) return { live: null, extra: 0 };

    const mine = (orders ?? []).filter(
      (o) => o.customerKey === key && !isFinished(o.status),
    );
    if (!mine.length) return { live: null, extra: 0 };

    const sorted = [...mine].sort((a, b) => {
      const aWaiting = awaitingReceipt(a) ? 1 : 0;
      const bWaiting = awaitingReceipt(b) ? 1 : 0;
      if (aWaiting !== bWaiting) return bWaiting - aWaiting;
      return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    });

    return { live: sorted[0], extra: sorted.length - 1 };
  }, [orders, key, isSignedIn]);

  if (!live) return null;

  const waiting = awaitingReceipt(live);
  const tone = waiting ? colors.saffron : colors.primary;
  const toneBg = waiting ? colors.saffron50 : colors.primary50;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        /* Sits directly on top of the floating bar, sharing its inset. */
        bottom: bottom + insets.bottom,
        zIndex: 20,
      }}
    >
      <Pressable
        onPress={() => router.push(hrefFor(live))}
        accessibilityRole="link"
        accessibilityLabel={t('{name}, {state}. Open your order.', {
          name: live.chefName ?? live.cookName ?? t('Your order'),
          state: t(stepLabel(live)),
        })}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: pressed ? tone : colors.line,
          },
          shadow.md,
        ]}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: toneBg,
          }}
        >
          {waiting ? (
            <Icon name="check" size={13} color={tone} />
          ) : (
            <PulseDot size={7} />
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.uiSemi, fontSize: type.xs + 1, color: colors.text }}
          >
            {live.chefName ?? live.cookName ?? t('Your order')}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.ui, fontSize: type.xs, color: tone }}
          >
            {t(stepLabel(live))}
            {extra ? ` · ${t('+{n} more', { n: n(extra) })}` : ''}
          </Text>
        </View>

        <Icon name="chevronRight" size={15} color={colors.textLight} />
      </Pressable>
    </View>
  );
}
