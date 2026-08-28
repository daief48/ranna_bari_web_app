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
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, type } from '../../src/theme/tokens';
import { useAuth } from '../../src/store/AuthContext';
import { useChefs } from '../../src/data';
import { useCommerce } from '../../src/store/CommerceContext';
import { customerKeyOf } from '../../src/lib/ledger';
import { addDays, dayKey } from '../../src/store/CommerceContext';
import { useLang } from '../../src/i18n/LanguageContext';

export default function NewRequest() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const r = useResponsive();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { account } = useAuth();
  const chefs = useChefs();
  const shop = useCommerce();

  /* Arriving from a kitchen page means that cook is already the target. */
  const incoming = typeof params.cook === 'string' ? params.cook : null;

  const [target, setTarget] = useState(incoming ?? 'all');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [budget, setBudget] = useState('');
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

  const submit = () => {
    if (!title.trim()) {
      setNote(t('Say what you are looking for.'));
      return;
    }
    const out = shop.createRequest(
      {
        customerKey: customerKeyOf(account),
        customerName: account?.name ?? '',
        phone: account?.phone ?? '',
        address: account?.address ?? account?.area ?? '',
        title: title.trim(),
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
      setNote(errorText(out.error, t, n, out));
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
            <FloatLabelInput
              label={t('What do you want?')}
              value={title}
              onChangeText={setTitle}
              placeholder={t('2 pound chocolate cake')}
            />
            <FloatLabelInput
              label={t('Anything the cook should know')}
              value={details}
              onChangeText={setDetails}
              placeholder={t('No nuts. Written on top: Happy Birthday.')}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <FloatLabelInput
                label={t('How many')}
                value={quantity}
                onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={{ flex: 1 }}
              />
              <FloatLabelInput
                label={t('Budget (optional)')}
                value={budget}
                onChangeText={(v) => setBudget(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder={t('Leave blank')}
                style={{ flex: 1 }}
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
