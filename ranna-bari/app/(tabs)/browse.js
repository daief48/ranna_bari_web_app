import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import ChefCard from '../../src/components/ChefCard';
import Reveal from '../../src/components/Reveal';
import { Price } from '../../src/components/Typography';
import SectionHeader from '../../src/components/SectionHeader';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useAreas, useChefs, useMenus } from '../../src/data';
import { useAuth } from '../../src/store/AuthContext';
import { distanceKm, formatDistance } from '../../src/lib/geo';
import { useLang } from '../../src/i18n/LanguageContext';


/** The five chips on browsecook.html, in order. */
const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'breakfast', label: 'Morning' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Evening' },
  { key: 'healthy', label: 'Healthy' },
];

export default function BrowseScreen() {
  const chefs = useChefs();
  const menus = useMenus();
  const { t, n } = useLang();
  const { account } = useAuth();
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const router = useRouter();
  const params = useLocalSearchParams();

  // Both entry points from the home screen: a mood pill sends `filter`,
  // the hero search sends `q`.
  const [filter, setFilter] = useState(
    typeof params.filter === 'string' ? params.filter : 'all',
  );
  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const [area, setArea] = useState('all');
  const [areaOpen, setAreaOpen] = useState(false);

  /**
   * Where "near" is measured from: the address on the account, which is the
   * one checkout delivers to. Not the device GPS -- that would put a
   * permission prompt in front of a search box, and the answer people
   * actually want is "how far from where my food is going".
   *
   * A guest, or an account with no pin, simply gets no distances: an invented
   * origin would put confident numbers on the screen that are wrong.
   */
  const origin = useMemo(() => {
    if (typeof account?.lat !== 'number' || typeof account?.lng !== 'number') {
      return null;
    }
    return { lat: account.lat, lng: account.lng };
  }, [account]);

  const kmTo = useMemo(() => {
    if (!origin) return () => null;
    return (chef) =>
      typeof chef?.lat === 'number' && typeof chef?.lng === 'number'
        ? distanceKm(origin, { lat: chef.lat, lng: chef.lng })
        : null;
  }, [origin]);

  /** Every dish paired with the kitchen that cooks it, flattened once. */
  const dishIndex = useMemo(() => {
    const byId = new Map(chefs.map((c) => [String(c.id), c]));
    return menus
      .flatMap((m) =>
        (m.items ?? []).map((dish) => ({ dish, chef: byId.get(String(m.chefId)) })),
      )
      .filter((row) => row.chef);
  }, [menus, chefs]);

  /** Distance ascending, with kitchens that have no pin at the back. */
  const byDistance = (a, b) => {
    const x = a.km ?? Infinity;
    const y = b.km ?? Infinity;
    return x - y;
  };

  /**
   * Two result sets from one box.
   *
   * Searching "biryani" used to return nothing, because the query only ever
   * touched the kitchen record -- name, specialty, area, tags -- and a dish
   * lives one level down. People search for the food, so dishes are matched
   * too and shown first, each carrying the kitchen it belongs to; a dish
   * without that line is useless, since ordering means opening a kitchen.
   *
   * A kitchen reached only through one of its dishes still appears in the
   * kitchen list, so the two sections agree with each other.
   *
   * Rank puts a name hit above a tag hit above a description hit, so typing
   * "mustard" surfaces the dish actually called mustard-something before the
   * ones that merely mention it.
   */
  const { kitchens, dishes } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inCategory = (tags) => filter === 'all' || tags.includes(filter);
    const inArea = (chef) => area === 'all' || chef.area === area;

    if (!q) {
      const list = chefs
        .filter((c) => inCategory(c.tags) && inArea(c))
        .map((c) => ({ chef: c, km: kmTo(c) }));
      if (origin) list.sort(byDistance);
      return { kitchens: list, dishes: [] };
    }

    const rank = (dish) => {
      const name = dish.name.toLowerCase();
      if (name.startsWith(q)) return 0;
      if (name.includes(q)) return 1;
      if ((dish.tags ?? []).some((tag) => tag.toLowerCase().includes(q))) return 2;
      if ((dish.description ?? '').toLowerCase().includes(q)) return 3;
      return -1;
    };

    /* Nearest first once there is an address to measure from -- the food you
       can actually get tonight beats the better-worded match across town.
       Relevance breaks ties, and carries the whole order when there is no
       origin to sort by. */
    const dishHits = dishIndex
      .filter(({ dish, chef }) => inCategory(dish.tags ?? []) && inArea(chef))
      .map((row) => ({ ...row, rank: rank(row.dish), km: kmTo(row.chef) }))
      .filter((row) => row.rank >= 0)
      .sort((a, b) =>
        origin
          ? byDistance(a, b) || a.rank - b.rank
          : a.rank - b.rank || a.dish.name.localeCompare(b.dish.name),
      );

    const matchesKitchen = (chef) =>
      chef.name.toLowerCase().includes(q) ||
      chef.specialty.toLowerCase().includes(q) ||
      chef.area.toLowerCase().includes(q) ||
      chef.tags.some((tag) => tag.toLowerCase().includes(q));

    const eligible = chefs.filter((c) => inCategory(c.tags) && inArea(c));
    const direct = eligible.filter(matchesKitchen);

    const seen = new Set(direct.map((c) => String(c.id)));
    const kitchenHits = direct.map((c) => ({ chef: c, km: kmTo(c) }));
    for (const { chef, km } of dishHits) {
      if (seen.has(String(chef.id))) continue;
      seen.add(String(chef.id));
      kitchenHits.push({ chef, km });
    }
    if (origin) kitchenHits.sort(byDistance);

    return { kitchens: kitchenHits, dishes: dishHits };
  }, [filter, query, area, chefs, dishIndex, origin, kmTo]);

  /* A chip that is active but absent from the five defaults (a mood pill sent
     us here) still needs somewhere to show, so it is appended to the row. */
  const chips = useMemo(() => {
    if (filter === 'all' || CHIPS.some((c) => c.key === filter)) return CHIPS;
    return [...CHIPS, { key: filter, label: filter }];
  }, [filter]);

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead={t('DISCOVER')}
          accent={t('ARTISANS')}
          subtitle={t('Find the perfect meal curated by local chefs.')}
          style={{ marginBottom: 24 }}
        />

        {/* ---- FILTER BAR ----
            On phones the card chrome is dropped: pills inside a pill-shaped
            card reads as clutter and costs ~32px of width, so each control
            carries its own surface.

              search
              area | map
              chips -> -> -> */}
        <View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              height: 52,
              paddingRight: 6,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              marginBottom: 10,
            },
            shadow.sm,
          ]}
        >
          <Icon
            name="search"
            size={18}
            color={colors.textMuted}
            style={{ marginLeft: 16 }}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search a dish, kitchen or area…')}
            placeholderTextColor={colors.textLight}
            returnKeyType="search"
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: font.ui,
              fontSize: 16,
              color: colors.text,
              paddingHorizontal: 12,
            }}
          />
          {query ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('Clear search')}
              style={{ paddingHorizontal: 8 }}
            >
              <Icon name="x" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('Filter by area, currently')} ${area === 'all' ? t('All Areas') : area}`}
            onPress={() => setAreaOpen(true)}
            style={({ pressed }) => [
              {
                flex: 1,
                height: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: pressed ? colors.primary200 : colors.line,
              },
              shadow.sm,
            ]}
          >
            <Icon name="pin" size={17} color={colors.textMuted} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: font.uiSemi,
                fontSize: 16,
                color: colors.text,
              }}
            >
              {area === 'all' ? t('All Areas') : area}
            </Text>
            <Icon name="chevronDown" size={16} color={colors.textMuted} />
          </Pressable>

          {/* The one visual call to action on the page: a solid accent button */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="View kitchens on the map"
            onPress={() => router.push('/map')}
            style={({ pressed }) => [
              {
                width: 52,
                height: 52,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
              shadow.primary,
            ]}
          >
            <Icon name="map" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </Container>

      {/* Chips bleed to the screen edges so a part-cut chip is an honest
          "there is more, scroll me" signal. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 8,
          paddingHorizontal: r.gutter,
          paddingVertical: 2,
        }}
      >
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(c.key)}
              style={({ pressed }) => [
                {
                  paddingVertical: 11,
                  paddingHorizontal: 18,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.line,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
                active ? shadow.primary : shadow.xs,
              ]}
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
                {t(c.label)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Container style={{ paddingTop: 24 }}>
        {/* ---- Dishes ----
            First, because a query that matched a dish is a query about food.
            Every row names its kitchen: the dish is what you wanted, but the
            kitchen is what you have to open to order it. */}
        {dishes.length ? (
          <View style={{ marginBottom: 32 }}>
            <ResultLabel
              text={t(dishes.length === 1 ? '{n} dish' : '{n} dishes', {
                n: n(dishes.length),
              })}
            />
            <View style={{ gap: 12 }}>
              {dishes.slice(0, 12).map(({ dish, chef, km }, i) => (
                <Reveal key={`${chef.id}-${dish.id}`} delay={(i % 5) + 1}>
                  <DishResult
                    dish={dish}
                    chef={chef}
                    km={km}
                    /* The dish, not the kitchen: you searched for the food,
                       so that is the page the result opens. The kitchen is
                       named on it, one tap further. */
                    onPress={() => router.push(`/dish/${dish.id}`)}
                  />
                </Reveal>
              ))}
            </View>
          </View>
        ) : null}

        {kitchens.length ? (
          <>
            <ResultLabel
              text={
                query.trim()
                  ? t(kitchens.length === 1 ? '{n} kitchen' : '{n} kitchens', {
                      n: n(kitchens.length),
                    })
                  : `${n(kitchens.length)} ${t('Artisans Curated For You')}`
              }
            />
            <View style={{ gap: 16 }}>
              {kitchens.map(({ chef }, i) => (
                <ChefCard key={chef.id} chef={chef} index={i} />
              ))}
            </View>
          </>
        ) : null}

        {!kitchens.length && !dishes.length ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
            <Icon name="searchCheck" size={32} color={colors.textLight} />
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.sm + 1,
                textAlign: 'center',
                color: colors.textMuted,
              }}
            >
              {t('No artisans found matching your criteria.')}
            </Text>
          </View>
        ) : null}
      </Container>

      <AreaPicker
        open={areaOpen}
        value={area}
        onSelect={(v) => {
          setArea(v);
          setAreaOpen(false);
        }}
        onClose={() => setAreaOpen(false)}
      />
    </Screen>
  );
}

/** The uppercase count line above each group of results. */
function ResultLabel({ text }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: font.uiBold,
        fontSize: type.sm,
        letterSpacing: type.sm * tracking.label,
        textTransform: 'uppercase',
        color: colors.textMuted,
        marginBottom: 16,
      }}
    >
      {text}
    </Text>
  );
}

/**
 * One dish that matched the search.
 *
 * The kitchen line is the point of the row, not decoration: a dish on its
 * own cannot be ordered, and without it there is no way to tell which of
 * twenty kitchens the biryani you just found belongs to. Tapping opens that
 * kitchen, where the dish can actually be added.
 */
function DishResult({ dish, chef, km, onPress }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const away = formatDistance(km, t, n);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${dish.name}, ৳${n(dish.price)}, ${t('From')} ${chef.name}${
        away ? `, ${away}` : ''
      }`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 12,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? colors.primary200 : colors.line,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        shadow.sm,
      ]}
    >
      <Image
        source={{ uri: dish.image }}
        contentFit="cover"
        transition={200}
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          backgroundColor: colors.sunken,
        }}
      />

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
          {dish.name}
        </Text>

        {/* Which kitchen this is under. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            marginTop: 3,
          }}
        >
          <Icon name="chefHat" size={12} color={colors.primary} />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: font.uiSemi,
              fontSize: type.xs,
              color: colors.primary,
            }}
          >
            {chef.name}
          </Text>
        </View>

        {/* Area, and how far that is from the address this would ship to. */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}
        >
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontFamily: font.ui,
              fontSize: type.xs,
              color: colors.textMuted,
            }}
          >
            {chef.area}
          </Text>

          {away ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingVertical: 2,
                paddingHorizontal: 7,
                borderRadius: radius.pill,
                backgroundColor: colors.sage50,
              }}
            >
              <Icon name="navigation" size={9} color={colors.sage} />
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 10,
                  color: colors.sage,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {away}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Price size={17}>৳{n(dish.price)}</Price>
        <Icon name="chevronRight" size={16} color={colors.textLight} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

/** Bottom sheet standing in for the web build's native <select>. */
function AreaPicker({ open, value, onSelect, onClose }) {
  const { colors, shadow } = useTheme();
  const areas = useAreas();
  const { t, n } = useLang();
  const [q, setQ] = useState('');

  /* The list is as long as the number of neighbourhoods on the platform and
     grows with every kitchen that signs up, so scrolling to find one stops
     working quickly. Reset on close, or reopening lands on a filtered list
     with no memory of why. */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return areas;
    // "All Areas" is a command, not a place, so it only shows unfiltered.
    return areas.filter((a) => a !== 'all' && a.toLowerCase().includes(needle));
  }, [areas, q]);

  const close = () => {
    setQ('');
    onClose();
  };

  const choose = (a) => {
    setQ('');
    onSelect(a);
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <Pressable
        onPress={close}
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(20, 16, 14, 0.45)',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              margin: 12,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              overflow: 'hidden',
            },
            shadow.lg,
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.line2,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontFamily: font.uiSemi,
                fontSize: 11,
                letterSpacing: 11 * tracking.label,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {t('Choose an area')}
            </Text>
            <Pressable onPress={close} hitSlop={10} accessibilityLabel={t('Close')}>
              <Icon name="x" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Type to narrow the list. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginHorizontal: 12,
              marginTop: 12,
              paddingHorizontal: 14,
              height: 46,
              borderRadius: radius.pill,
              backgroundColor: colors.sunken,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Icon name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              autoFocus
              placeholder={t('Type an area')}
              placeholderTextColor={colors.textLight}
              returnKeyType="search"
              onSubmitEditing={() => {
                // Enter takes the only remaining match, which is what you
                // were reaching for by the time you had typed enough.
                if (filtered.length === 1) choose(filtered[0]);
              }}
              style={[
                {
                  flex: 1,
                  minWidth: 0,
                  fontFamily: font.ui,
                  // 16px keeps iOS from zooming the viewport on focus
                  fontSize: 16,
                  color: colors.text,
                  paddingVertical: 0,
                },
                /* The field takes focus the moment the sheet opens, so on web
                   the browser's default focus ring would be drawn around it
                   immediately -- a hard black rectangle inside a rounded pill.
                   The pill's own border is the focus affordance here. */
                Platform.OS === 'web' ? { outlineStyle: 'none' } : null,
              ]}
            />
            {q ? (
              <Pressable
                onPress={() => setQ('')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('Clear search')}
              >
                <Icon name="x" size={15} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* A fixed height, not a max one. The sheet is anchored to the
              bottom of the screen, so a list that shrinks as you type would
              drag the whole panel — header, field and the cursor you are
              typing into — downwards on every keystroke. */}
          <ScrollView
            style={{ height: 340 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              filtered.length ? null : { flexGrow: 1, justifyContent: 'center' }
            }
          >
            {!filtered.length ? (
              <View style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
                <Icon name="pin" size={24} color={colors.textLight} />
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.sm,
                    textAlign: 'center',
                    color: colors.textMuted,
                  }}
                >
                  {t('No area matches that.')}
                </Text>
              </View>
            ) : null}

            {filtered.map((a) => {
              const active = a === value;
              return (
                <Pressable
                  key={a}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => choose(a)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    backgroundColor:
                      active || pressed ? colors.primary50 : 'transparent',
                  })}
                >
                  <Icon
                    name="pin"
                    size={17}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: active ? font.uiSemi : font.ui,
                      fontSize: 16,
                      color: active ? colors.primary : colors.text,
                    }}
                  >
                    {a === 'all' ? t('All Areas') : a}
                  </Text>
                  {active ? (
                    <Icon name="check" size={17} color={colors.primary} strokeWidth={2.2} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
