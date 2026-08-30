import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import FilterSheet, {
  DEFAULT_FILTERS,
  DIETS,
  RATINGS,
  SORTS,
  activeCount,
  priceBand,
} from '../../src/components/FilterSheet';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useAreas, useChefs, useMenus } from '../../src/data';
import { useAuth } from '../../src/store/AuthContext';
import { distanceKm, formatDistance } from '../../src/lib/geo';
import { deliversTo, isOpenNow } from '../../src/lib/kitchen';
import { RANK, makeMatcher } from '../../src/lib/search';
import useRecentSearches from '../../src/lib/useRecentSearches';
import { Placeholder } from '../../src/components/StoreBits';
import { serviceLabel } from '../../src/components/MealBits';
import { useCommerce } from '../../src/store/CommerceContext';
import { call, hasServer } from '../../src/lib/server';
import { useLang } from '../../src/i18n/LanguageContext';

/** How many rows a section shows before "See more", and how many each tap adds. */
const PAGE = 5;
const STEP = 10;

/**
 * Categories that only ever apply to something a cook makes to order, so
 * they never match a listed dish and would only ever show an empty browse.
 */
const REQUEST_ONLY = ['cake', 'pitha', 'achar', 'gift'];

/** Tags the sheet owns, so a mood pill naming one lands there instead. */
const DIET_KEYS = DIETS.map((d) => d.key);

/**
 * The other three things the app sells.
 *
 * Search used to see dishes and kitchens, which is two of five. A customer
 * typing "achar" was told the app has none while a shop three streets away
 * sold two kinds of it, and "biryani" never surfaced tomorrow's biryani even
 * with the meal sitting on the board. That is not a missing feature — it is
 * the search telling the customer something untrue about the catalogue.
 *
 * Kept separate from `runSearch` rather than folded into it: that function
 * exists to be re-run with one constraint lifted at a time, and its cost is
 * the reason the empty state can explain itself. These three lists are ranked
 * against the query and nothing else, so they do not need to take part in
 * that, and folding them in would multiply the work the relaxation loop does
 * by four for no answer it could give.
 */
function searchExtras({ meals, stores, products, query, kmOf, filters, area }) {
  const matcher = makeMatcher(query);
  if (!matcher) return { meals: [], stores: [], products: [] };

  const byRank = (a, b) => a.rank - b.rank || (a.km ?? Infinity) - (b.km ?? Infinity);
  const inArea = (row) => area === 'all' || row.area === area;

  /* ---- tomorrow's meals ---- */
  const mealRows = [];
  for (const meal of meals) {
    if (meal.status !== 'published') continue;
    if (!inArea(meal)) continue;

    const away = kmOf(meal);
    if (!deliversTo(meal, away)) continue;

    const rank = matcher.rank({
      name: meal.title,
      tags: [meal.slot, meal.area],
      text: meal.description,
    });
    if (rank === RANK.NONE) continue;
    mealRows.push({ meal, km: away, rank });
  }

  /* ---- shops ---- */
  const storeRows = [];
  const storeById = new Map(stores.map((s) => [String(s.id), s]));
  for (const store of stores) {
    if (!store.isOpen || !inArea(store)) continue;
    if (filters.freeDelivery && !store.freeDeliveryOver && store.deliveryFee) continue;

    const away = kmOf(store);
    if (!deliversTo(store, away)) continue;

    const rank = matcher.rank({
      name: store.name,
      tags: [store.area],
      text: `${store.tagline ?? ''} ${store.description ?? ''}`,
    });
    if (rank === RANK.NONE) continue;
    storeRows.push({ store, km: away, rank });
  }

  /* ---- things on a shelf ---- */
  const band = priceBand(filters.price);
  const productRows = [];
  for (const product of products) {
    if (!product.active) continue;
    if (product.price < band.min || product.price > band.max) continue;
    /* A pre-order is a request the cook has to accept, not a thing on a
       shelf. Somebody who turned this off wants what they can have today. */
    if (filters.includePreorder === false && product.preorder) continue;

    /* A product is only reachable through its shop, so a shop that is shut,
       out of range or outside the chosen area takes its shelf with it. */
    const store = storeById.get(String(product.storeId));
    if (!store || !store.isOpen || !inArea(store)) continue;

    const away = kmOf(store);
    if (!deliversTo(store, away)) continue;

    const rank = matcher.rank({
      name: product.name,
      tags: [store.name, store.area],
      text: product.description,
    });
    if (rank === RANK.NONE) continue;
    productRows.push({ product, store, km: away, rank });
  }

  return {
    meals: mealRows.sort(byRank),
    stores: storeRows.sort(byRank),
    products: productRows.sort(byRank),
  };
}

/**
 * One pass of the whole pipeline.
 *
 * Pure, and outside the component, because the empty state has to run it
 * again several times -- once per active constraint, with that constraint
 * lifted -- to work out which one is responsible for the empty screen.
 */
function runSearch({ chefs, dishIndex, query, filter, area, filters, kmOf }) {
  const matcher = makeMatcher(query);
  const band = priceBand(filters.price);
  const { diet, openOnly, minRating, sort } = filters;

  const km = new Map(chefs.map((c) => [String(c.id), kmOf(c)]));

  /* Dish-level constraints. When any is on, a kitchen only earns its place in
     the kitchen list by having a dish that survives them -- picking "Vegan"
     and being shown a kitchen with nothing vegan on it is the filter lying. */
  const dishConstrained =
    filter !== 'all' || filters.price !== 'any' || diet.length > 0;

  const dishPasses = (dish) => {
    const tags = dish.tags ?? [];
    if (filter !== 'all' && !tags.includes(filter)) return false;
    if (dish.price < band.min || dish.price > band.max) return false;
    if (diet.length && !diet.some((d) => tags.includes(d))) return false;
    return true;
  };

  /* Everything about the kitchen except whether it will come this far, which
     is counted separately so the screen can own up to what it hid. */
  const chefPasses = (chef) => {
    if (area !== 'all' && chef.area !== area) return false;
    if (openOnly && !isOpenNow(chef)) return false;
    if (minRating > 0 && !(chef.rating >= minRating)) return false;
    if (filters.verifiedOnly && !chef.isVerified) return false;
    return true;
  };

  const dishes = [];
  const passingByChef = new Map();
  let outOfRange = 0;

  for (const { dish, chef } of dishIndex) {
    const id = String(chef.id);
    const away = km.get(id);
    if (!chefPasses(chef) || !deliversTo(chef, away)) continue;
    if (!dishPasses(dish)) continue;

    const seen = passingByChef.get(id);
    if (!seen) passingByChef.set(id, { low: dish.price, high: dish.price });
    else {
      if (dish.price < seen.low) seen.low = dish.price;
      if (dish.price > seen.high) seen.high = dish.price;
    }

    const rank = matcher
      ? matcher.rank({ name: dish.name, tags: dish.tags, text: dish.description })
      : 0;
    if (rank === RANK.NONE) continue;

    dishes.push({
      dish,
      chef,
      km: away,
      rank,
      priceLow: dish.price,
      priceHigh: dish.price,
    });
  }

  const viaDish = new Set(dishes.map((d) => String(d.chef.id)));

  const kitchens = [];
  for (const chef of chefs) {
    const id = String(chef.id);
    const away = km.get(id);
    if (!chefPasses(chef)) continue;
    if (!deliversTo(chef, away)) {
      outOfRange++;
      continue;
    }
    if (dishConstrained && !passingByChef.has(id)) continue;

    /* Specialty and area ride along as tags: they are how people describe a
       kitchen, and a "Sylheti" or "Uttara" query should find one. */
    const direct = matcher
      ? matcher.rank({
          name: chef.name,
          tags: [...(chef.tags ?? []), chef.specialty, chef.area],
          text: chef.description,
        })
      : 0;

    /* Reached only through one of its dishes -- listed, but never above a
       kitchen the query actually named. */
    const reached = viaDish.has(id);
    if (matcher && direct === RANK.NONE && !reached) continue;

    const prices = passingByChef.get(id);
    kitchens.push({
      chef,
      km: away,
      rank: direct === RANK.NONE ? RANK.FUZZY + 1 : direct,
      priceLow: prices?.low ?? Infinity,
      priceHigh: prices?.high ?? 0,
    });
  }

  /* ---- ordering ---- */
  const hasOrigin = !!kmOf.hasOrigin;
  const byRank = (a, b) => a.rank - b.rank;
  const byRating = (a, b) => (b.chef.rating ?? 0) - (a.chef.rating ?? 0);

  let compare;
  if (sort === 'rating') compare = (a, b) => byRating(a, b) || byRank(a, b);
  else if (sort === 'priceAsc')
    compare = (a, b) => a.priceLow - b.priceLow || byRank(a, b);
  else if (sort === 'priceDesc')
    compare = (a, b) => b.priceHigh - a.priceHigh || byRank(a, b);
  else if (hasOrigin)
    compare = (a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || byRank(a, b);
  // Nothing to measure from: relevance carries the whole order.
  else compare = (a, b) => byRank(a, b) || byRating(a, b);

  dishes.sort(compare);
  kitchens.sort(compare);

  /* Every dish of one kitchen sits at the same distance and under the same
     rating, so those two orderings hand the first five slots of the default
     feed to whichever kitchen wins -- a discovery feed that opens on one
     shop's menu. Taking one dish per kitchen in turn keeps the order between
     kitchens while showing five different ones.

     Only with no query. Someone who typed "biryani" asked for the nearest
     biryani, not for one biryani from each kitchen in turn, and interleaving
     their results would put a 3.3km match above a 2.4km one. Price
     orderings are left alone for the same reason: their key is genuinely
     per-dish, so shuffling them would be a lie. */
  const spread =
    !matcher && (sort === 'rating' || (sort === 'nearest' && hasOrigin));

  return {
    kitchens,
    dishes: spread ? interleaveByKitchen(dishes) : dishes,
    outOfRange,
  };
}

/** Round-robin over the kitchens, preserving the order they first appear in. */
function interleaveByKitchen(rows) {
  const queues = new Map();
  for (const row of rows) {
    const id = String(row.chef.id);
    if (!queues.has(id)) queues.set(id, []);
    queues.get(id).push(row);
  }
  const lists = [...queues.values()];
  const out = [];
  for (let round = 0; out.length < rows.length; round++) {
    for (const list of lists) {
      if (list[round]) out.push(list[round]);
    }
  }
  return out;
}

export default function BrowseScreen() {
  const chefs = useChefs();
  const menus = useMenus();
  const { t, n, lang } = useLang();
  const { account, isSignedIn } = useAuth();
  const shop = useCommerce();
  const { taxonomy } = shop;
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const router = useRouter();
  const params = useLocalSearchParams();

  /* Both entry points from the home screen: a mood pill sends `filter`, the
     hero search sends `q`. A pill naming a dietary tag is a constraint rather
     than a mood, so it opens as one. */
  const incoming = typeof params.filter === 'string' ? params.filter : 'all';
  const [filter, setFilter] = useState(
    DIET_KEYS.includes(incoming) ? 'all' : incoming,
  );
  const [filters, setFilters] = useState(() =>
    DIET_KEYS.includes(incoming)
      ? { ...DEFAULT_FILTERS, diet: [incoming] }
      : DEFAULT_FILTERS,
  );

  /* `draft` is what the field shows, `query` is what the list is built from.
     They are the same value a moment apart: matching eighty menus with an
     edit-distance fallback on every keystroke is work worth not doing while
     someone is still in the middle of the word. */
  const [draft, setDraft] = useState(typeof params.q === 'string' ? params.q : '');
  const [query, setQuery] = useState(draft);

  const [area, setArea] = useState('all');
  const [areaOpen, setAreaOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const { recent, remember, forget, clear } = useRecentSearches();

  useEffect(() => {
    const handle = setTimeout(() => setQuery(draft), 180);
    return () => clearTimeout(handle);
  }, [draft]);

  /* Five of each to start with. Enough to show what the section holds, few
     enough that the kitchens below stay reachable without a long scroll. */
  const [dishLimit, setDishLimit] = useState(PAGE);
  const [kitchenLimit, setKitchenLimit] = useState(PAGE);
  /* Meals, shops and shelf items share one limit: three short sections that
     each hold a handful, rather than three separate "see more" states. */
  const [extraLimit, setExtraLimit] = useState(PAGE);

  // A new query is a new list; carrying an expanded limit into it would drop
  // someone into the middle of results they have not seen the top of.
  useEffect(() => {
    setDishLimit(PAGE);
    setKitchenLimit(PAGE);
    setExtraLimit(PAGE);
  }, [query, filter, area, filters]);

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

  const kmOf = useMemo(() => {
    const fn = origin
      ? (chef) =>
          typeof chef?.lat === 'number' && typeof chef?.lng === 'number'
            ? distanceKm(origin, { lat: chef.lat, lng: chef.lng })
            : null
      : () => null;
    /* Carried on the function so runSearch can tell "too far" from "nowhere
       to measure from" without a second argument threaded through. */
    fn.hasOrigin = !!origin;
    return fn;
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

  /**
   * The results, and -- when there are none -- what to do about it.
   *
   * An empty screen under six controls is a puzzle: the one that emptied it
   * is not visible from the outcome. So each active constraint is lifted in
   * turn and the pipeline re-run, which is cheap over eighty dishes, and
   * "No artisans found" becomes a list of the specific things that would
   * bring results back, largest first.
   */
  const { kitchens, dishes, outOfRange, relaxations } = useMemo(() => {
    const base = { chefs, dishIndex, kmOf };
    const main = runSearch({ ...base, query, filter, area, filters });

    if (main.dishes.length || main.kitchens.length) {
      return { ...main, relaxations: [] };
    }

    const tries = [];
    if (filter !== 'all') tries.push({ id: 'filter', patch: { filter: 'all' } });
    if (area !== 'all') tries.push({ id: 'area', patch: { area: 'all' } });
    if (filters.openOnly)
      tries.push({
        id: 'openOnly',
        patch: { filters: { ...filters, openOnly: false } },
      });
    if (filters.price !== 'any')
      tries.push({ id: 'price', patch: { filters: { ...filters, price: 'any' } } });
    if (filters.diet.length)
      tries.push({ id: 'diet', patch: { filters: { ...filters, diet: [] } } });
    if (filters.minRating > 0)
      tries.push({
        id: 'minRating',
        patch: { filters: { ...filters, minRating: 0 } },
      });
    if (query.trim()) tries.push({ id: 'query', patch: { query: '' } });

    const scored = tries
      .map((attempt) => {
        const out = runSearch({
          ...base,
          query,
          filter,
          area,
          filters,
          ...attempt.patch,
        });
        return { ...attempt, count: out.dishes.length + out.kitchens.length };
      })
      .filter((attempt) => attempt.count > 0)
      /* Dropping the search term is the blunt option -- it answers a
         different question than the one that was asked -- so it sits below
         any filter that would have done the job. */
      .sort(
        (a, b) =>
          (a.id === 'query' ? 1 : 0) - (b.id === 'query' ? 1 : 0) ||
          b.count - a.count,
      )
      .slice(0, 3);

    return { ...main, relaxations: scored };
  }, [chefs, dishIndex, kmOf, query, filter, area, filters]);

  /**
   * Names worth offering while the word is still half-typed.
   *
   * Built from `draft`, not `query` — the whole point is to answer before the
   * debounce that the results wait for, so the box responds on the keystroke
   * rather than 180ms after the last one.
   *
   * Prefix matches only, and deliberately: the ranked list below already
   * forgives spelling, transliterates Bengali and tolerates typos. A dropdown
   * that did the same would offer "Fuchka" to somebody typing "fu" and mean
   * three different things by it. This is a completion, so it completes.
   */
  const suggestions = useMemo(() => {
    const typed = draft.trim().toLowerCase();
    // Two letters is where a prefix stops matching most of the catalogue.
    if (typed.length < 2) return [];

    const seen = new Set();
    const out = [];

    const offer = (text, kind, label, icon) => {
      const key = String(text ?? '').trim();
      if (!key || out.length >= 6) return;
      const lower = key.toLowerCase();
      if (lower === typed || seen.has(lower)) return;
      if (!lower.startsWith(typed)) return;
      seen.add(lower);
      out.push({ text: key, kind, label, icon });
    };

    /* Dishes first: a query that names food is what this box is mostly for.
       Then the things you could put in a basket, then who sells them. */
    for (const { dish } of dishIndex) offer(dish.name, 'dish', 'Dish', 'utensils');
    for (const product of shop.products) offer(product.name, 'product', 'Shop item', 'cart');
    for (const meal of shop.meals) offer(meal.title, 'meal', 'Meal', 'pot');
    for (const chef of chefs) offer(chef.name, 'kitchen', 'Kitchen', 'chefHat');
    for (const store of shop.stores) offer(store.name, 'store', 'Shop', 'box');

    return out;
  }, [draft, dishIndex, chefs, shop.products, shop.meals, shop.stores]);

  /** Meals, shops and shop goods — the rest of what the app sells. */
  const extras = useMemo(
    () =>
      searchExtras({
        meals: shop.meals,
        stores: shop.stores,
        products: shop.products,
        query,
        kmOf,
        filters,
        area,
      }),
    [shop.meals, shop.stores, shop.products, query, kmOf, filters, area],
  );

  const total =
    dishes.length +
    kitchens.length +
    extras.meals.length +
    extras.stores.length +
    extras.products.length;

  /* Remembered once the typing stops and the query turned out to lead
     somewhere -- a term that found nothing is not worth offering back. */
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || !total) return undefined;
    const handle = setTimeout(() => remember(term), 1200);
    return () => clearTimeout(handle);
  }, [query, total, remember]);

  /**
   * Tell the platform what was looked for.
   *
   * Deliberately *including* the searches that found nothing — those are the
   * whole point. A term searched forty times in Uttara that returns zero
   * every time is a cook to recruit, and it is written down nowhere else: the
   * customer who found nothing places no order, so no other collection on the
   * platform ever hears they were here.
   *
   * Fire-and-forget, after the same pause that gates the search itself, so
   * one word is one row rather than one row per keystroke.
   */
  const recorded = useRef(new Set());
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || !hasServer) return undefined;

    const handle = setTimeout(() => {
      const key = `${term.toLowerCase()}:${total}`;
      if (recorded.current.has(key)) return;
      recorded.current.add(key);

      call('/search-terms', {
        method: 'POST',
        body: { term, results: total, area: account?.area ?? null },
      }).catch(() => {});
    }, 1400);

    return () => clearTimeout(handle);
  }, [query, total, account?.area]);

  /**
   * The chip row, read from the platform's category list rather than a
   * constant in this file -- the same list a food request picks from, so the
   * two cannot drift apart.
   *
   * A chip that is active but absent from the row (a mood pill sent us to a
   * tag the row does not carry) is appended, so the screen can always show
   * what is selected.
   */
  const chips = useMemo(() => {
    const base = [
      { key: 'all', label: 'All' },
      ...taxonomy
        .filter((c) => !REQUEST_ONLY.includes(c.key))
        .map((c) => ({ key: c.key, label: c.label })),
    ];
    if (filter === 'all' || base.some((c) => c.key === filter)) return base;
    return [...base, { key: filter, label: filter }];
  }, [taxonomy, filter]);

  const chipLabel = (key) => chips.find((c) => c.key === key)?.label ?? key;

  const filterCount = activeCount(filters);
  const sortLabel = SORTS.find((s) => s.key === filters.sort)?.label;

  /** Turn one of the empty state's suggestions into the state change it names. */
  const applyRelaxation = useCallback((id) => {
    if (id === 'filter') setFilter('all');
    else if (id === 'area') setArea('all');
    else if (id === 'query') {
      setDraft('');
      setQuery('');
    } else if (id === 'openOnly') setFilters((f) => ({ ...f, openOnly: false }));
    else if (id === 'price') setFilters((f) => ({ ...f, price: 'any' }));
    else if (id === 'diet') setFilters((f) => ({ ...f, diet: [] }));
    else if (id === 'minRating') setFilters((f) => ({ ...f, minRating: 0 }));
  }, []);

  /** What the suggestion buttons in the empty state are called. */
  const relaxLabel = (id) => {
    if (id === 'filter') return t(chipLabel(filter));
    if (id === 'area') return area;
    if (id === 'query') return `“${query.trim()}”`;
    if (id === 'openOnly') return t('Open now');
    if (id === 'price') return t(priceBand(filters.price).label);
    if (id === 'diet') {
      return filters.diet
        .map((d) => t(DIETS.find((x) => x.key === d)?.label ?? d))
        .join(', ');
    }
    if (id === 'minRating') {
      return n(RATINGS.find((x) => x.key === filters.minRating)?.label ?? '');
    }
    return '';
  };

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
              area | filters | map
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
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => {
              setQuery(draft);
              remember(draft);
            }}
            /* The full sentence is cut off mid-word in a 320px field, which
                     reads as a rendering fault rather than as a hint. */
                placeholder={r.xs ? t('Search food or kitchens…') : t('Search a dish, kitchen or area…')}
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
          {draft ? (
            <Pressable
              onPress={() => {
                setDraft('');
                setQuery('');
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('Clear search')}
              style={{ paddingHorizontal: 8 }}
            >
              <Icon name="x" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* ---- What you might mean ----
            Offered while the word is still half-typed, from names already in
            memory. The value is not saving keystrokes so much as showing the
            catalogue: somebody who types "bir" and sees "Kacchi Biryani" and
            "Beef Biryani" learns what is here, which an empty box never
            teaches. Names only, never a result — tapping one runs the search
            it spells, so the ranked list below is still what decides. */}
        {suggestions.length ? (
          <View
            style={[
              {
                marginBottom: 10,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
                overflow: 'hidden',
              },
              shadow.sm,
            ]}
          >
            {suggestions.map((row, i) => (
              <Pressable
                key={`${row.kind}-${row.text}`}
                accessibilityRole="button"
                onPress={() => {
                  setDraft(row.text);
                  setQuery(row.text);
                  remember(row.text);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 11,
                  paddingHorizontal: 14,
                  backgroundColor: pressed ? colors.sunken : 'transparent',
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.line2,
                })}
              >
                <Icon name={row.icon} size={14} color={colors.textLight} />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontFamily: font.ui,
                    fontSize: type.sm + 1,
                    color: colors.text,
                  }}
                >
                  {row.text}
                </Text>
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 10,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: colors.textLight,
                  }}
                >
                  {t(row.label)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

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

          {/* Filters, carrying how many are on. Without that count an active
              filter is invisible from the results screen, and a list that is
              quietly narrower than it looks is worse than no filter at all. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              filterCount ? `${t('Filters')}, ${n(filterCount)}` : t('Filters')
            }
            onPress={() => setFilterOpen(true)}
            style={({ pressed }) => [
              {
                width: 52,
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.pill,
                backgroundColor: filterCount ? colors.primary50 : colors.surfaceSolid,
                borderWidth: 1,
                borderColor:
                  filterCount || pressed ? colors.primary200 : colors.line,
              },
              shadow.sm,
            ]}
          >
            <Icon
              name="sliders"
              size={19}
              color={filterCount ? colors.primary : colors.textMuted}
            />
            {filterCount ? (
              <View
                style={{
                  position: 'absolute',
                  top: 3,
                  right: 3,
                  minWidth: 17,
                  height: 17,
                  paddingHorizontal: 4,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                }}
              >
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 10,
                    color: '#FFFFFF',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {n(filterCount)}
                </Text>
              </View>
            ) : null}
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
              /* `selected` reaches the DOM as nothing on a button, so which
                 chip is on was invisible to a screen reader. A chip is a
                 toggle, and `pressed` is the state a toggle has. */
              aria-pressed={active}
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

      {/* ---- Recent searches ----
          Only with an empty box: once there is a query these are answers to
          a question nobody is asking any more. */}
      {!draft && recent.length ? (
        <Container style={{ paddingTop: 18 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}
          >
            <Text
              style={{
                flex: 1,
                fontFamily: font.uiBold,
                fontSize: type.xs + 1,
                letterSpacing: (type.xs + 1) * tracking.label,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {t('Recent searches')}
            </Text>
            <Pressable onPress={clear} hitSlop={8} accessibilityRole="button">
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: type.xs + 1,
                  color: colors.primary,
                }}
              >
                {t('Clear')}
              </Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {recent.map((term) => (
              <View
                key={term}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('Search again')} ${term}`}
                  onPress={() => {
                    setDraft(term);
                    setQuery(term);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 9,
                    paddingLeft: 13,
                  }}
                >
                  <Icon name="clock" size={12} color={colors.textLight} />
                  <Text style={{ fontFamily: font.ui, fontSize: 13, color: colors.text }}>
                    {term}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('Remove')} ${term}`}
                  onPress={() => forget(term)}
                  hitSlop={6}
                  style={{ paddingHorizontal: 10, paddingVertical: 9 }}
                >
                  <Icon name="x" size={12} color={colors.textLight} />
                </Pressable>
              </View>
            ))}
          </View>
        </Container>
      ) : null}

      <Container style={{ paddingTop: 24 }}>
        {/* ---- Food first ----
            A query that matched a dish is a query about food. Every row names
            its kitchen: the dish is what you wanted, but the kitchen is what
            has to be open to cook it. */}
        {dishes.length ? (
          <View style={{ marginBottom: 32 }}>
            <ResultLabel
              text={t(dishes.length === 1 ? '{n} dish' : '{n} dishes', {
                n: n(dishes.length),
              })}
              note={sortLabel ? t(sortLabel) : null}
            />
            <View style={{ gap: 12 }}>
              {dishes.slice(0, dishLimit).map(({ dish, chef, km }, i) => (
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

            <SeeMore
              remaining={dishes.length - dishLimit}
              onPress={() => setDishLimit((v) => v + STEP)}
            />
          </View>
        ) : null}

        {/* ---- Meals somebody is cooking for a named day ----
            Above the shops because a meal expires: it is cooked once, for one
            sitting, and a customer who scrolls past it has missed it. A jar
            of achar will still be there tomorrow. */}
        {extras.meals.length ? (
          <View style={{ marginBottom: 32 }}>
            <ResultLabel
              text={t(extras.meals.length === 1 ? '{n} meal' : '{n} meals', {
                n: n(extras.meals.length),
              })}
              note={t('Booked ahead')}
            />
            <View style={{ gap: 12 }}>
              {extras.meals.slice(0, extraLimit).map(({ meal, km }, i) => (
                <Reveal key={meal.id} delay={(i % 5) + 1}>
                  <ExtraResult
                    title={meal.title}
                    subtitle={serviceLabel(meal, t, lang)}
                    image={meal.image}
                    price={meal.price}
                    km={km}
                    onPress={() => router.push(`/meals/${meal.id}`)}
                  />
                </Reveal>
              ))}
            </View>
            <SeeMore
              remaining={extras.meals.length - extraLimit}
              onPress={() => setExtraLimit((v) => v + STEP)}
            />
          </View>
        ) : null}

        {/* ---- Things on a shelf ----
            The gap this whole section exists to close: "achar" used to return
            nothing while two shops sold it. */}
        {extras.products.length ? (
          <View style={{ marginBottom: 32 }}>
            <ResultLabel
              text={t(extras.products.length === 1 ? '{n} shop item' : '{n} shop items', {
                n: n(extras.products.length),
              })}
            />
            <View style={{ gap: 12 }}>
              {extras.products.slice(0, extraLimit).map(({ product, store, km }, i) => (
                <Reveal key={product.id} delay={(i % 5) + 1}>
                  <ExtraResult
                    title={product.name}
                    subtitle={store.name}
                    image={product.images?.[0]}
                    price={product.price}
                    km={km}
                    onPress={() => router.push(`/product/${product.id}`)}
                  />
                </Reveal>
              ))}
            </View>
            <SeeMore
              remaining={extras.products.length - extraLimit}
              onPress={() => setExtraLimit((v) => v + STEP)}
            />
          </View>
        ) : null}

        {/* ---- The shops themselves ---- */}
        {extras.stores.length ? (
          <View style={{ marginBottom: 32 }}>
            <ResultLabel
              text={t(extras.stores.length === 1 ? '{n} shop' : '{n} shops', {
                n: n(extras.stores.length),
              })}
            />
            <View style={{ gap: 12 }}>
              {extras.stores.slice(0, extraLimit).map(({ store, km }, i) => (
                <Reveal key={store.id} delay={(i % 5) + 1}>
                  <ExtraResult
                    title={store.name}
                    subtitle={store.tagline || store.area}
                    image={store.logo}
                    km={km}
                    onPress={() => router.push(`/stores/${store.id}`)}
                  />
                </Reveal>
              ))}
            </View>
            <SeeMore
              remaining={extras.stores.length - extraLimit}
              onPress={() => setExtraLimit((v) => v + STEP)}
            />
          </View>
        ) : null}

        {/* ---- Then the kitchens they come from ---- */}
        {kitchens.length ? (
          <>
            <ResultLabel
              text={t(kitchens.length === 1 ? '{n} kitchen' : '{n} kitchens', {
                n: n(kitchens.length),
              })}
            />
            <View style={{ gap: 16 }}>
              {kitchens.slice(0, kitchenLimit).map(({ chef }, i) => (
                <ChefCard key={chef.id} chef={chef} index={i} />
              ))}
            </View>

            <SeeMore
              remaining={kitchens.length - kitchenLimit}
              onPress={() => setKitchenLimit((v) => v + STEP)}
            />
          </>
        ) : null}

        {/* ---- What the delivery radius took out ----
            Every cook sets one, and signup promises them that only customers
            inside it will see their kitchen. Honouring that quietly would
            leave a shorter list with no explanation, so it says so -- and
            offers the one thing that actually changes the answer.

            Held back when a filter is what emptied the screen: pointing at
            the distance then would blame the wrong thing, and the empty
            state below already names the real culprit. It does still show
            when nothing else can be lifted, because then distance really is
            the answer. */}
        {outOfRange && (total > 0 || !relaxations.length) ? (
          <Pressable
            accessibilityRole={isSignedIn ? 'link' : 'text'}
            disabled={!isSignedIn}
            onPress={() => router.push('/edit-profile')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginTop: 20,
              padding: 14,
              borderRadius: radius.sm,
              backgroundColor: colors.sunken,
              borderWidth: 1,
              borderColor: colors.line2,
            }}
          >
            <Icon name="route" size={16} color={colors.textMuted} />
            <Text
              style={{
                flex: 1,
                fontFamily: font.ui,
                fontSize: type.xs + 1,
                lineHeight: (type.xs + 1) * 1.5,
                color: colors.textMuted,
              }}
            >
              {t(
                outOfRange === 1
                  ? '{n} kitchen does not deliver to your address.'
                  : '{n} kitchens do not deliver to your address.',
                { n: n(outOfRange) },
              )}
            </Text>
            {isSignedIn ? (
              <Icon name="chevronRight" size={15} color={colors.textLight} />
            ) : null}
          </Pressable>
        ) : null}

        {/* ---- Nothing matched ----
            Naming the constraint that emptied the screen, next to the tap
            that lifts it. */}
        {!total ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 14 }}>
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

            {relaxations.length ? (
              <>
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: type.xs + 1,
                    letterSpacing: (type.xs + 1) * tracking.label,
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    color: colors.textLight,
                    marginTop: 4,
                  }}
                >
                  {t('Try removing')}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {relaxations.map((rx) => (
                    <Pressable
                      key={rx.id}
                      accessibilityRole="button"
                      onPress={() => applyRelaxation(rx.id)}
                      style={({ pressed }) => [
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 7,
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderRadius: radius.pill,
                          backgroundColor: pressed
                            ? colors.primary50
                            : colors.surfaceSolid,
                          borderWidth: 1,
                          borderColor: colors.line,
                        },
                        shadow.xs,
                      ]}
                    >
                      <Icon name="x" size={12} color={colors.primary} />
                      <Text
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: 13,
                          color: colors.text,
                        }}
                      >
                        {relaxLabel(rx.id)}
                      </Text>
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: 11,
                          color: colors.primary,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {t('+{n}', { n: n(rx.count) })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
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

      <FilterSheet
        open={filterOpen}
        value={filters}
        onChange={setFilters}
        onClose={() => setFilterOpen(false)}
        resultCount={total}
        canSortByDistance={!!origin}
      />
    </Screen>
  );
}

/**
 * The control that lengthens a section.
 *
 * It carries the number still hidden rather than a bare "See more", because
 * the useful question at the bottom of five rows is whether there are three
 * more or seventy — that is what decides between tapping and searching.
 * Renders nothing once the section is fully shown.
 */
/**
 * One row for a meal, a shop or something on a shelf.
 *
 * Three result types, one row, because they are three answers to the same
 * question and a customer scanning results should not have to learn three
 * layouts to read them. What differs is carried in the subtitle — a serving
 * time, a shop name, a tagline — which is the one line that says *why this
 * row is this kind of thing*.
 *
 * `DishResult` above stays its own component: a dish carries a rating and a
 * kitchen and is the densest row on the screen, and flattening it into this
 * would cost the three simple cases more than it saved the one complex one.
 */
function ExtraResult({ title, subtitle, image, price, km, onPress }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const away = formatDistance(km, t, n);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 10,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: pressed ? colors.primary200 : colors.line,
        },
        shadow.xs,
      ]}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          contentFit="cover"
          transition={200}
          style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: colors.sunken }}
        />
      ) : (
        <Placeholder name={title} height={58} radius={16} style={{ width: 58 }} />
      )}

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {/* A search result is scanned, so the name is the one thing that has
            to survive. After a 58px thumbnail this column is about 210px on a
            320px phone — "Brown Rice & Fish Curry" needs 268 and was losing
            the dish. Two lines each, one wherever they fit. */}
        <Text
          numberOfLines={2}
          style={{
            fontFamily: font.displayBold,
            fontSize: 15.5,
            lineHeight: 19,
            color: colors.text,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
            style={{
              fontFamily: font.ui,
              fontSize: type.xs + 1,
              lineHeight: (type.xs + 1) * 1.4,
              color: colors.textMuted,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
        {away ? (
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
        ) : null}
      </View>

      {typeof price === 'number' ? <Price size={17}>৳{n(price)}</Price> : null}
      <Icon name="chevronRight" size={15} color={colors.textLight} />
    </Pressable>
  );
}

function SeeMore({ remaining, onPress }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  if (remaining <= 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('See {n} more', { n: n(remaining) })}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 14,
        paddingVertical: 13,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.primary50 : colors.surfaceSolid,
        borderWidth: 1,
        borderColor: colors.line,
      })}
    >
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.xs + 1,
          letterSpacing: (type.xs + 1) * tracking.label,
          textTransform: 'uppercase',
          color: colors.primary,
        }}
      >
        {t('See {n} more', { n: n(remaining) })}
      </Text>
      <Icon name="chevronDown" size={15} color={colors.primary} strokeWidth={2.2} />
    </Pressable>
  );
}

/**
 * The uppercase count line above each group of results.
 *
 * `note` carries the ordering, which otherwise lives only inside a sheet
 * nobody has open: "5 dishes" says nothing about why these five.
 */
function ResultLabel({ text, note }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
      }}
    >
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.sm,
          letterSpacing: type.sm * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {text}
      </Text>
      {note ? (
        <>
          <View
            style={{
              width: 3,
              height: 3,
              borderRadius: 2,
              backgroundColor: colors.textLight,
            }}
          />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: font.ui,
              fontSize: type.xs,
              letterSpacing: type.xs * tracking.label,
              textTransform: 'uppercase',
              color: colors.textLight,
            }}
          >
            {note}
          </Text>
        </>
      ) : null}
    </View>
  );
}

/**
 * One dish that matched the search.
 *
 * The kitchen line is the point of the row, not decoration: a dish on its
 * own cannot be ordered, and without it there is no way to tell which of
 * twenty kitchens the biryani you just found belongs to.
 */
function DishResult({ dish, chef, km, onPress }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const away = formatDistance(km, t, n);
  const closed = !isOpenNow(chef);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${dish.name}, ৳${n(dish.price)}, ${t('From')} ${chef.name}${
        away ? `, ${away}` : ''
      }${closed ? `, ${t('Closed')}` : ''}`}
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

        {/* Which kitchen this is under, and whether it is cooking. */}
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
              flexShrink: 1,
              fontFamily: font.uiSemi,
              fontSize: type.xs,
              color: colors.primary,
            }}
          >
            {chef.name}
          </Text>

          {closed ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingVertical: 1,
                paddingHorizontal: 6,
                borderRadius: radius.pill,
                backgroundColor: colors.saffron50,
              }}
            >
              <Icon name="moon" size={8} color={colors.saffron} />
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 9,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: colors.saffron,
                }}
              >
                {t('Closed')}
              </Text>
            </View>
          ) : null}
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
  const { t } = useLang();
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
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
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
                    <Icon
                      name="check"
                      size={17}
                      color={colors.primary}
                      strokeWidth={2.2}
                    />
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
