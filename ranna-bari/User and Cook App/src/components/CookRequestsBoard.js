import React, { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import Icon from './Icon';
import Button from './Button';
import Reveal from './Reveal';
import FloatLabelInput from './FloatLabelInput';
import { OfferStatusPill, RequestStatusPill, RequestSummary } from './RequestBits';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useCommerce } from '../store/CommerceContext';
import { timeAgo } from '../store/OrdersContext';
import { useLang } from '../i18n/LanguageContext';
import { useLingering } from '../lib/useLingering';
import { turnOf } from '../lib/requestLogic';
import { foldDigits } from '../lib/format';
import { PRICE_MAX, parsePrice } from '../features/requests/useCookRequestActions';

/**
 * The cook's request board: Waiting for your price / Your offers / Agreed
 * (waiting for the customer's payment) / Closed.
 *
 * One component for the standalone board and the Orders tab, so the grouping
 * (built by `useCookRequestRows`) is drawn the same way in both. With
 * `actions` the rows can be answered where they stand — send a price, say
 * "not for me", withdraw — and still open the request for the negotiation.
 * Without them it is the plain list.
 *
 * Nothing here shows what any other cook bid.
 *
 * @param {object} props
 * @param {{open: object[], mine: object[], agreed: object[], done: object[]}} props.rows
 * @param {(request: object) => void} props.onOpen
 * @param {{sendPrice: Function, decline: Function, withdraw: Function}} [props.actions]
 */
export default function CookRequestsBoard({ rows, onOpen, actions }) {
  const { t } = useLang();
  const shop = useCommerce();

  /* A row that moves on leaves a note where it was (see `useLingering`),
     the way an order does when it changes lane. Each group lists rows as
     {id, status: <group>} so "left this group, now in that one" is visible. */
  const flat = useMemo(() => {
    const out = new Map();
    for (const group of ['open', 'mine', 'agreed', 'done']) {
      for (const row of rows[group]) {
        out.set(String(row.request.id), { ...row, id: String(row.request.id), status: group });
      }
    }
    return out;
  }, [rows]);
  const asRows = (group) => rows[group].map((r) => flat.get(String(r.request.id)));
  const lookup = (id) => flat.get(id);

  const open = useLingering(useMemo(() => asRows('open'), [rows, flat]), lookup, 'cook-requests:open');
  const mine = useLingering(useMemo(() => asRows('mine'), [rows, flat]), lookup, 'cook-requests:mine');
  const agreed = useLingering(
    useMemo(() => asRows('agreed'), [rows, flat]),
    lookup,
    'cook-requests:agreed',
  );
  const done = rows.done;

  const draw = (item, extra) => {
    if (item.ghost) {
      return <MovedRequest key={`moved:${item.id}`} row={item.order} />;
    }
    const { request, offer } = item.order ?? item;
    return (
      <Row
        key={request.id}
        request={request}
        offer={offer}
        category={shop.categoryById(request.categoryId)}
        onPress={() => onOpen(request)}
        actions={actions}
        {...extra}
      />
    );
  };

  return (
    <>
      {open.length ? (
        <Group label={t('Waiting for your price')}>
          {open.map((item, i) =>
            item.ghost ? (
              draw(item)
            ) : (
              <Reveal key={item.id} delay={(i % 5) + 1}>
                {draw(item, { waiting: true })}
              </Reveal>
            ),
          )}
        </Group>
      ) : null}

      {mine.length ? <Group label={t('Your offers')}>{mine.map((item) => draw(item))}</Group> : null}

      {/* Price settled, money not yet in escrow. Nothing to cook -- there is no
          order until the customer pays from their wallet -- so these rows have
          no cooking action, only the way back to the thread. */}
      {agreed.length ? (
        <Group label={t('Agreed — waiting for the customer’s payment')}>
          {agreed.map((item) => draw(item, { payWait: true }))}
        </Group>
      ) : null}

      {done.length ? (
        <Group label={t('Closed')}>
          {done.map(({ request, offer }) => (
            <Row
              key={request.id}
              request={request}
              offer={offer}
              category={shop.categoryById(request.categoryId)}
              muted
              onPress={() => onOpen(request)}
            />
          ))}
        </Group>
      ) : null}
    </>
  );
}

/* The agreed-but-unpaid state, as a pill in the same shape as the others. */
function WaitingForPaymentPill() {
  const { colors } = useTheme();
  const { t } = useLang();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.saffron50,
      }}
    >
      <Icon name="lock" size={11} color={colors.saffron} />
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: colors.saffron,
        }}
      >
        {t('Waiting for payment')}
      </Text>
    </View>
  );
}

function Group({ label, children }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 26 }}>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.sm,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.textMuted,
          marginBottom: 12,
        }}
      >
        {label}
      </Text>
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}

/* What stands where a request's row was, for a moment after it moved on. */
function MovedRequest({ row }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const where =
    row.status === 'mine'
      ? t('Your offers')
      : row.status === 'agreed'
        ? t('Agreed — waiting for the customer’s payment')
        : row.status === 'done'
        ? t('Closed')
        : t('Waiting for your price');
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(320)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: radius.lg,
        backgroundColor: colors.sage50,
        borderWidth: 1,
        borderColor: colors.sage100,
      }}
    >
      <Icon name="check" size={18} color={colors.sage} strokeWidth={2.6} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}
        >
          {t('{title} moved to {where}', { title: row.request.title, where })}
        </Text>
      </View>
    </Animated.View>
  );
}

function Row({ request, offer, category, muted, onPress, actions, waiting, payWait }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const [composing, setComposing] = useState(false);

  /* Offers still on the table can be taken back; an agreed one is a deal. */
  const withdrawable =
    !!offer && ['interested', 'priced', 'selected', 'negotiating'].includes(offer.status);
  const mustAnswer = !!offer && !muted && turnOf(offer) === 'cook';

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.line,
          opacity: muted ? 0.65 : 1,
        },
        shadow.sm,
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={request.title}
        onPress={onPress}
        style={({ pressed }) => ({
          gap: 12,
          padding: 16,
          borderRadius: radius.lg,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <RequestSummary request={request} category={category} compact />
          </View>
          {offer?.price != null ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.body,
                  color: colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                ৳{n(offer.price)}
              </Text>
              <Text style={{ fontFamily: font.ui, fontSize: 10, color: colors.textLight }}>
                {t('your price')}
              </Text>
            </View>
          ) : (
            <Icon name="chevronRight" size={16} color={colors.textLight} />
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {payWait ? (
            <WaitingForPaymentPill />
          ) : offer ? (
            <OfferStatusPill status={offer.status} />
          ) : (
            <RequestStatusPill status={request.status} />
          )}
          {mustAnswer ? (
            <Text style={{ fontFamily: font.uiBold, fontSize: type.xs, color: colors.primary }}>
              {t('Your turn')}
            </Text>
          ) : null}
          <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textLight }}>
            {request.target === 'all' ? t('Open to every cook') : t('Sent to you')}
            {' · '}
            {timeAgo(request.createdAt, t, n)}
          </Text>
        </View>
      </Pressable>

      {actions && waiting ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          {composing ? (
            <PriceForm
              onCancel={() => setComposing(false)}
              onSend={(form) => {
                setComposing(false);
                return actions.sendPrice(request, form);
              }}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                small
                label={t('Send price')}
                icon="arrowRight"
                onPress={() => setComposing(true)}
                style={{ flex: 1 }}
              />
              <Button
                small
                variant="ghost"
                label={t('Not for me')}
                onPress={() => actions.decline(request)}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </View>
      ) : null}

      {actions && !muted && !waiting && withdrawable ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Button
            small
            variant="ghost"
            label={t('Withdraw')}
            onPress={() => actions.withdraw(request, offer)}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ) : null}
    </View>
  );
}

/* The compact price form. Price is optional exactly as on the request screen
   (blank = "just interested"); whole taka only. A ref guards the double tap. */
function PriceForm({ onSend, onCancel }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const [price, setPrice] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const sending = useRef(false);

  const submit = () => {
    if (sending.current) return;
    if (!parsePrice(price).ok) {
      setError(t('Enter a whole price from ৳1 to ৳{max}.', { max: n(PRICE_MAX) }));
      return;
    }
    sending.current = true;
    Promise.resolve(onSend({ price, prepTime, note })).finally(() => {
      sending.current = false;
    });
  };

  return (
    <View style={{ gap: 10 }}>
      <FloatLabelInput
        label={t('What would you charge?')}
        value={price}
        onChangeText={(v) => {
          setError(null);
          setPrice(foldDigits(v).replace(/[^\d]/g, ''));
        }}
        keyboardType="number-pad"
        error={error ?? undefined}
      />
      <FloatLabelInput
        label={t('How long you need')}
        value={prepTime}
        onChangeText={setPrepTime}
        placeholder={t('24 hours')}
      />
      <FloatLabelInput
        label={t('A note to the customer (optional)')}
        value={note}
        onChangeText={setNote}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          small
          label={price.trim() ? t('Send my price') : t('Just interested')}
          icon="arrowRight"
          onPress={submit}
          style={{ flex: 1 }}
        />
        <Button small variant="ghost" label={t('Cancel')} onPress={onCancel} />
      </View>
    </View>
  );
}
