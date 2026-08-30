/**
 * Ask for something nobody has listed.
 *
 * The one decision that changes what happens next is at the top: one cook,
 * or everyone who could make it. Everything below is description, and the
 * budget field is optional on purpose -- naming a number first anchors every
 * offer to it, which is sometimes what you want and sometimes exactly what
 * you do not.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import FloatLabelInput, { FormNote } from '../../src/components/FloatLabelInput';
import { Body, Heading } from '../../src/components/Typography';
import { errorText } from '../../src/components/MealBits';
import { Label } from '../../src/components/RequestBits';
import { QtyStepper } from '../../src/components/StoreBits';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useChefs } from '../../src/data';
import { DEMO_REQUEST } from '../../src/lib/demoData';
import { useCommerce } from '../../src/store/CommerceContext';
import { customerKeyOf } from '../../src/lib/ledger';
import { addDays, dayKey } from '../../src/store/CommerceContext';
import { useLang } from '../../src/i18n/LanguageContext';
import { useAlert } from '../../src/components/Alert';

export default function NewRequest() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const alert = useAlert();
  const r = useResponsive();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { account } = useAuth();
  const chefs = useChefs();
  const shop = useCommerce();

  /* Arriving from a kitchen page means that cook is already the target. */
  const incoming = typeof params.cook === 'string' ? params.cook : null;

  const [target, setTarget] = useState(incoming ?? 'all');
  const [title, setTitle] = useState(DEMO_REQUEST.title);
  /* The lines added so far. The box above holds whatever is being typed. */
  const [items, setItems] = useState([]);
  const [details, setDetails] = useState(DEMO_REQUEST.description);
  const [quantity, setQuantity] = useState('1');
  const [budget, setBudget] = useState(DEMO_REQUEST.budget);
  const [categoryId, setCategoryId] = useState(null);
  const [wantedDate, setWantedDate] = useState(dayKey(addDays(1)));
  const [note, setNote] = useState(null);

  const origin = useMemo(
    () =>
      typeof account?.lat === 'number' && typeof account?.lng === 'number'
        ? { lat: account.lat, lng: account.lng }
        : null,
    [account],
  );

  const eligible = useMemo(() => shop.eligibleKitchens(origin), [shop, origin]);

  /* Only cooks who could actually take it: asking a kitchen that will not
     deliver to you is a message nobody can act on. */
  const reachable = useMemo(
    () => chefs.filter((c) => eligible.includes(String(c.id))),
    [chefs, eligible],
  );

  const days = useMemo(
    () =>
      [1, 2, 3, 4, 5].map((offset) => {
        const date = addDays(offset);
        return {
          key: dayKey(date),
          label:
            offset === 1
              ? t('Tomorrow')
              : date.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                }),
        };
      }),
    [t, lang],
  );

  /** Move what is typed into the list, and clear the box for the next one. */
  const addItem = () => {
    const name = title.trim();
    if (!name) return;
    setItems((prev) => [...prev, { name, qty: 1 }]);
    setTitle('');
  };

  const setItemQty = (index, qty) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, qty } : item)));

  const removeItem = (index) => setItems((prev) => prev.filter((_, i) => i !== index));

  const submit = async () => {
    /*
     * Whatever is still in the box counts.
     *
     * Somebody who wants one thing types it and taps the button at the bottom
     * — they have no reason to notice a separate "add" step, and losing their
     * request to a rule about it would be indefensible. So the typed line is
     * folded in here rather than being demanded first.
     */
    const pending = title.trim();
    const list = pending ? [...items, { name: pending, qty: 1 }] : items;

    if (!list.length) {
      alert.error(t('Say what you are looking for.'));
      return;
    }

    const out = await shop.createRequest(
      {
        customerKey: customerKeyOf(account),
        customerName: account?.name ?? '',
        phone: account?.phone ?? '',
        address: account?.address ?? account?.area ?? '',
        items: list,
        /* The headline the server composes from `items` is what every reader
           of a request shows; this is the fallback for anything that has not
           learned about the list yet. */
        title: list.map((i) => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name)).join(', '),
        details: details.trim(),
        categoryId,
        quantity,
        wantedDate,
        budget: budget.trim() ? budget : null,
        target,
        lat: account?.lat ?? null,
        lng: account?.lng ?? null,
      },
      eligible,
    );
    if (!out.ok) {
      alert.error(errorText(out.error, t, n, out));
      return;
    }
    router.replace(`/requests/${out.result.id}`);
  };

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/requests'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 18,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.primary} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.primary,
            }}
          >
            {t('Your requests')}
          </Text>
        </Pressable>

        <Reveal delay={1}>
          <Heading size={30} style={{ letterSpacing: -0.6 }}>
            {t('Ask for something')}
          </Heading>
          <Body muted size={15} style={{ marginTop: 4, marginBottom: 24 }}>
            {t('Describe what you want. Cooks answer with their own price, and you pick.')}
          </Body>
        </Reveal>

        {/* ---- who to ask ---- */}
        <Reveal delay={2}>
          <Label text={t('Who should see this')} />
          <View style={{ gap: 10, marginBottom: 22 }}>
            <Choice
              icon="sparkles"
              title={t('Every cook who can reach you')}
              sub={t('{n} kitchens right now. You compare their prices.', {
                n: n(reachable.length),
              })}
              active={target === 'all'}
              onPress={() => setTarget('all')}
            />
            <Choice
              icon="chefHat"
              title={t('One cook')}
              sub={
                target !== 'all'
                  ? reachable.find((c) => String(c.id) === String(target))?.name ??
                    t('Pick a kitchen below')
                  : t('Pick a kitchen below')
              }
              active={target !== 'all'}
              onPress={() => setTarget(reachable[0] ? String(reachable[0].id) : 'all')}
            />
          </View>

          {target !== 'all' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingBottom: 6 }}
              style={{ marginBottom: 22 }}
            >
              {reachable.map((c) => {
                const on = String(target) === String(c.id);
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    aria-pressed={on}
                    accessibilityState={{ selected: on }}
                    onPress={() => setTarget(String(c.id))}
                    style={({ pressed }) => [
                      {
                        alignItems: 'center',
                        gap: 6,
                        width: 84,
                        paddingVertical: 10,
                        borderRadius: radius.sm,
                        backgroundColor: on ? colors.primary50 : colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: on ? colors.primary : colors.line,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      },
                      shadow.xs,
                    ]}
                  >
                    <Image
                      source={{ uri: c.avatar }}
                      contentFit="cover"
                      transition={200}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 14,
                        backgroundColor: colors.sunken,
                      }}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 11,
                        color: on ? colors.primary : colors.text,
                      }}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </Reveal>

        {/* ---- what ---- */}
        <Reveal delay={3}>
          <View style={{ gap: 14 }}>
            {/*
             * What you want, as a list.
             *
             * It was one line, which meant a party — a cake *and* twenty
             * samosas *and* a tray of biryani — had to be squeezed into one
             * sentence for a cook to read, parse and price as a lump. Adding
             * them one at a time lets a cook see the shape of the job, and
             * lets you change your mind about one thing without retyping the
             * rest.
             *
             * The typed line is still submitted if it was never added, so
             * somebody who wants one thing and taps straight to the bottom is
             * not stopped by a step they had no reason to notice.
             */}
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <FloatLabelInput
                  label={t('What do you want?')}
                  value={title}
                  onChangeText={setTitle}
                  placeholder={t('2 pound chocolate cake')}
                  onSubmitEditing={addItem}
                  returnKeyType={items.length ? 'done' : 'next'}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Add this item')}
                  onPress={addItem}
                  disabled={!title.trim()}
                  style={({ pressed }) => ({
                    width: 52,
                    height: 56,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.sm,
                    backgroundColor: title.trim() ? colors.primary50 : colors.sunken,
                    borderWidth: 1,
                    borderColor: title.trim() ? colors.primary100 : colors.line,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Icon
                    name="plus"
                    size={20}
                    color={title.trim() ? colors.primary : colors.textLight}
                    strokeWidth={2.4}
                  />
                </Pressable>
              </View>

              {items.length ? (
                <View style={{ gap: 8 }}>
                  {items.map((item, i) => (
                    <View
                      key={`${item.name}-${i}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: radius.sm,
                        backgroundColor: colors.sunken,
                        borderWidth: 1,
                        borderColor: colors.line,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontFamily: font.ui,
                          fontSize: type.sm + 1,
                          color: colors.text,
                        }}
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>

                      {/* Per item, because "two cakes and one tray" is the
                          normal shape of an order like this. */}
                      <QtyStepper
                        small
                        value={item.qty}
                        min={1}
                        max={99}
                        onChange={(qty) => setItemQty(i, qty)}
                      />

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('Remove {name}', { name: item.name })}
                        hitSlop={8}
                        onPress={() => removeItem(i)}
                      >
                        <Icon name="x" size={16} color={colors.textLight} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <FloatLabelInput
              label={t('Anything the cook should know')}
              value={details}
              onChangeText={setDetails}
              placeholder={t('No nuts. Written on top: Happy Birthday.')}
              multiline
            />
            {/* Side by side where there is room, stacked where there is not.
                Two fields sharing a 320px screen leave about 145px each, and
                "Budget (optional)" does not fit in that — the label was being
                ellipsised, which on a form is the one place a reader cannot
                guess what was cut. */}
            <View
              style={{
                flexDirection: r.xs ? 'column' : 'row',
                gap: 12,
              }}
            >
              <FloatLabelInput
                label={t('How many')}
                value={quantity}
                onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={r.xs ? undefined : { flex: 1 }}
              />
              <FloatLabelInput
                label={t('Budget (optional)')}
                value={budget}
                onChangeText={(v) => setBudget(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder={t('Leave blank')}
                style={r.xs ? undefined : { flex: 1 }}
              />
            </View>
          </View>
        </Reveal>

        {/* ---- category, from the platform's own list ---- */}
        <Reveal delay={4}>
          <View style={{ marginTop: 24 }}>
            <Label text={t('Category')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {shop.taxonomy.map((c) => {
                const on = categoryId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    aria-pressed={on}
                    accessibilityState={{ selected: on }}
                    onPress={() => setCategoryId(on ? null : c.id)}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 9,
                        paddingHorizontal: 14,
                        borderRadius: radius.pill,
                        backgroundColor: on ? colors.primary : colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: on ? colors.primary : colors.line,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      },
                      shadow.xs,
                    ]}
                  >
                    {c.emoji ? <Text style={{ fontSize: 12 }}>{c.emoji}</Text> : null}
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 12,
                        color: on ? '#FFFFFF' : colors.text,
                      }}
                    >
                      {t(c.label)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Reveal>

        {/* ---- when ---- */}
        <Reveal delay={5}>
          <View style={{ marginTop: 24 }}>
            <Label text={t('When do you need it')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {days.map((d) => {
                const on = wantedDate === d.key;
                return (
                  <Pressable
                    key={d.key}
                    accessibilityRole="button"
                    aria-pressed={on}
                    accessibilityState={{ selected: on }}
                    onPress={() => setWantedDate(d.key)}
                    style={({ pressed }) => [
                      {
                        paddingVertical: 10,
                        paddingHorizontal: 15,
                        borderRadius: radius.pill,
                        backgroundColor: on ? colors.primary : colors.surfaceSolid,
                        borderWidth: 1,
                        borderColor: on ? colors.primary : colors.line,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      },
                      shadow.xs,
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: 13,
                        color: on ? '#FFFFFF' : colors.text,
                      }}
                    >
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Reveal>

        {note ? (
          <View style={{ marginTop: 20 }}>
            <FormNote text={note} />
          </View>
        ) : null}

        <Reveal delay={6}>
          <Button
            label={target === 'all' ? t('Ask every cook') : t('Send the request')}
            icon="arrowRight"
            block
            onPress={submit}
            style={{ marginTop: 24 }}
          />
          <Text
            style={{
              fontFamily: font.ui,
              fontSize: type.xs,
              lineHeight: type.xs * 1.6,
              textAlign: 'center',
              color: colors.textLight,
              marginTop: 12,
            }}
          >
            {t('Nothing is charged until you agree a price and pay.')}
          </Text>
        </Reveal>
      </Container>
    </Screen>
  );
}

function Choice({ icon, title, sub, active, onPress }) {
  const { colors, shadow } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      aria-pressed={!!active}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 16,
          borderRadius: radius.sm,
          backgroundColor: active ? colors.primary50 : colors.surfaceSolid,
          borderWidth: 1,
          borderColor: active ? colors.primary : colors.line,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        shadow.xs,
      ]}
    >
      <Icon name={icon} size={18} color={active ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: type.sm + 2,
            color: active ? colors.primary : colors.text,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
          {sub}
        </Text>
      </View>
      {active ? <Icon name="check" size={16} color={colors.primary} strokeWidth={2.4} /> : null}
    </Pressable>
  );
}
