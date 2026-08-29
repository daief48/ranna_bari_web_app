import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { normaliseArea } from '../lib/areas';
import { call, hasServer } from '../lib/server';
import { useSession } from './SessionContext';

const KEY = 'rannabari_kitchen';

/**
 * The signed-in cook's own kitchen.
 *
 * chefs.json is a bundled asset and cannot be written to, so a cook who
 * signs up needs somewhere else to live. This context is that place: one
 * record, shaped exactly like a row of chefs.json plus a `dishes` array, so
 * `useChefs()` can drop it into the customer-facing list without any of the
 * consumers knowing the difference.
 *
 * The id is a string while every seeded chef's id is a number -- both sides
 * compare with String(), and the prefix makes a local record obvious in a
 * route param.
 */
export const LOCAL_KITCHEN_ID = 'local-1';

/** The delivery radius the range slider in signup defaults to. */
const DEFAULT_RADIUS_KM = 3;

/**
 * A new kitchen opens with three dishes already listed rather than an empty
 * menu -- an empty kitchen cannot take an order, so the cook would have to
 * finish onboarding before the app does anything. Keyed by the six
 * specialties the signup step offers.
 */
const STARTER_DISHES = {
  'Traditional Heritage': [
    {
      name: 'Shorshe Ilish',
      description: 'Hilsa steamed in raw mustard paste, wrapped in banana leaf.',
      price: 520,
      image:
        'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=200&h=200&fit=crop',
      tags: ['lunch', 'dinner', 'heritage'],
    },
    {
      name: 'Mutton Bhuna',
      description: 'Slow-cooked mutton, grandmother spicing, no shortcuts.',
      price: 600,
      image:
        'https://images.unsplash.com/photo-1606491048802-8342506d6471?w=200&h=200&fit=crop',
      tags: ['dinner', 'spicy'],
    },
    {
      name: 'Dal Bhat Thali',
      description: 'Rice, thick masoor dal, aloo bhorta and a fried egg.',
      price: 220,
      image:
        'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=200&h=200&fit=crop',
      tags: ['lunch', 'comfort', 'budget'],
    },
  ],
  'Coastal Seafood': [
    {
      name: 'Chingri Malai Curry',
      description: 'Prawns in a thin coconut gravy, cooked down slowly.',
      price: 560,
      image:
        'https://images.unsplash.com/photo-1559847844-5315695dadae?w=200&h=200&fit=crop',
      tags: ['lunch', 'dinner', 'seafood'],
    },
    {
      name: 'Rui Macher Jhol',
      description: 'Everyday rohu curry with potato and nigella seed.',
      price: 380,
      image:
        'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?w=200&h=200&fit=crop',
      tags: ['lunch', 'seafood'],
    },
    {
      name: 'Fish Fry Platter',
      description: 'Market-fresh fish, semolina crust, kasundi on the side.',
      price: 320,
      image:
        'https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?w=200&h=200&fit=crop',
      tags: ['snacks', 'seafood'],
    },
  ],
  'Street & Snacks': [
    {
      name: 'Fuchka (12 pcs)',
      description: 'Crisp shells, tamarind water, no compromise on the masala.',
      price: 140,
      image:
        'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=200&h=200&fit=crop',
      tags: ['snacks', 'spicy'],
    },
    {
      name: 'Beef Chaap',
      description: 'Flat-fried, spice-heavy, the way the old shops do it.',
      price: 260,
      image:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=200&fit=crop',
      tags: ['snacks', 'dinner', 'spicy'],
    },
    {
      name: 'Chotpoti Bowl',
      description: 'Chickpea and potato, tamarind, boiled egg on top.',
      price: 120,
      image:
        'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=200&h=200&fit=crop',
      tags: ['snacks', 'budget'],
    },
  ],
  'Biryani & Rice': [
    {
      name: 'Kacchi Biryani',
      description: 'Mutton and rice sealed in one pot, cooked from raw.',
      price: 480,
      image:
        'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=200&h=200&fit=crop',
      tags: ['lunch', 'dinner', 'heritage'],
    },
    {
      name: 'Morog Polao',
      description: 'Chicken and ghee rice, mild enough for the whole table.',
      price: 340,
      image:
        'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=200&h=200&fit=crop',
      tags: ['lunch', 'dinner'],
    },
    {
      name: 'Tehari Box',
      description: 'Beef tehari packed for one, with salad and borhani.',
      price: 260,
      image:
        'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=200&h=200&fit=crop',
      tags: ['lunch', 'budget'],
    },
  ],
  'Vegetarian & Bhorta': [
    {
      name: 'Seven Bhorta Thali',
      description: 'Seven mashes, rice, dal and a green chilli each.',
      price: 240,
      image:
        'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=200&h=200&fit=crop',
      tags: ['lunch', 'vegan', 'budget'],
    },
    {
      name: 'Shukto',
      description: 'Bitter-first mixed vegetables, the way lunch should open.',
      price: 200,
      image:
        'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=200&h=200&fit=crop',
      tags: ['lunch', 'healthy', 'vegan'],
    },
    {
      name: 'Labra with Khichuri',
      description: 'Rainy-day khichuri and a five-vegetable labra.',
      price: 260,
      image:
        'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=200&h=200&fit=crop',
      tags: ['lunch', 'comfort', 'vegan'],
    },
  ],
  'Desserts & Pitha': [
    {
      name: 'Pitha Platter',
      description: 'Bhapa, patishapta and chitoi, made to order.',
      price: 250,
      image:
        'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=200&h=200&fit=crop',
      tags: ['breakfast', 'snacks', 'sweet'],
    },
    {
      name: 'Nolen Gur Payesh',
      description: 'Date-palm jaggery rice pudding, cooked down for hours.',
      price: 180,
      image:
        'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=200&h=200&fit=crop',
      tags: ['sweet', 'dessert'],
    },
    {
      name: 'Mishti Doi',
      description: 'Set yoghurt in a clay pot, caramelised and cold.',
      price: 120,
      image:
        'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=200&h=200&fit=crop',
      tags: ['sweet', 'dessert'],
    },
  ],
};

/** Tags a kitchen advertises on its card, derived from what it actually lists. */
const tagsFromDishes = (dishes) =>
  Array.from(new Set(dishes.flatMap((d) => d.tags ?? []))).slice(0, 6);

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1595475207225-428b62bda831?w=200&h=200&fit=crop';
const FALLBACK_COVER =
  'https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=1200&h=400&fit=crop';

/**
 * Build the kitchen record a cook's account implies. Every field the signup
 * flow collected is reused; the rest gets a sensible opening value.
 */
export function kitchenFromAccount(account) {
  const specialty = account?.specialty || 'Traditional Heritage';
  const starters = STARTER_DISHES[specialty] ?? STARTER_DISHES['Traditional Heritage'];
  const dishes = starters.map((d, i) => ({
    ...d,
    id: `${LOCAL_KITCHEN_ID}-${i + 1}`,
    available: true,
  }));

  return {
    id: LOCAL_KITCHEN_ID,
    name: account?.kitchen?.trim() || account?.name?.trim() || 'My Kitchen',
    ownerName: account?.name?.trim() || '',
    avatar: account?.avatar || FALLBACK_AVATAR,
    coverImage: FALLBACK_COVER,
    specialty,
    description:
      'A home kitchen on RannaBari. Cooked to order, packed the moment it is ready.',
    /* A kitchen with no reviews should not claim a score. The card reads
       "New" until the first one lands. */
    rating: 0,
    reviewCount: 0,
    tags: tagsFromDishes(dishes),
    ecoBadge: 'Eco-Packaging',
    isVerified: false,
    /* The signup map hands back a full postal address; a kitchen's area is
       a neighbourhood, and that is what every filter and card expects. */
    area: normaliseArea(account?.area || 'Dhanmondi'),
    lat: account?.lat ?? 23.7461,
    lng: account?.lng ?? 90.3742,
    deliveryRadiusKm: account?.deliveryRadiusKm ?? DEFAULT_RADIUS_KM,
    /* A kitchen opens closed: the cook decides when they are ready to cook,
       and an order arriving before they have looked at the menu is worse
       than no order. */
    isOpen: false,
    dishes,
    /* Monotonic, so a dish id is never reused after a delete. */
    nextDishSeq: dishes.length + 1,
    createdAt: new Date().toISOString(),
  };
}

const KitchenContext = createContext(null);

/**
 * The cook's kitchen, as the server holds it.
 *
 * This used to be a record that existed only on the device, with dish ids
 * like `local-1-3` that meant nothing anywhere else. That is why a customer
 * could not message a cook who had not "registered" — there was nothing to
 * address. The kitchen is a server row now, and the menu with it, so a dish
 * the cook adds is on the directory the moment it saves.
 *
 * `GET /kitchens/mine` is a separate endpoint from `/kitchens?menus=1` for one
 * reason: the shopper's view filters to available dishes, and the cook needs
 * to see the ones they have taken off in order to put them back.
 */
export function KitchenProvider({ children }) {
  const { token, identity, isVerified } = useSession();

  const [kitchen, setKitchen] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  /* Whether the server has actually answered, as opposed to not been asked. */
  const [loaded, setLoaded] = useState(false);

  /* Paint the cached kitchen first: a cook opening the panel on a bad
     connection should see their menu, not an empty one that reads as "your
     dishes are gone". */
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        setKitchen(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (kitchen) AsyncStorage.setItem(KEY, JSON.stringify(kitchen)).catch(() => {});
    else AsyncStorage.removeItem(KEY).catch(() => {});
  }, [kitchen, hydrated]);

  /**
   * Read the kitchen and its whole menu back.
   *
   * `loaded` is what the answer *was*, not whether one is on the way: until
   * the server has been asked, "no kitchen here" and "not asked yet" look
   * identical, and treating the second as the first is how a cook signing in
   * on a new device gets their kitchen overwritten by a blank one.
   */
  const reload = useCallback(async () => {
    if (!token || !hasServer) return null;
    const out = await call('/kitchens/mine', { token });
    if (!out.ok) return null;

    setLoaded(true);

    if (!out.result.kitchen) {
      setKitchen(null);
      return null;
    }

    const next = {
      ...out.result.kitchen,
      dishes: out.result.dishes ?? [],
      /* Derived from the menu rather than stored, so a cook who lists three
         biryanis is tagged for biryani without having said so. */
      tags: tagsFromDishes(out.result.dishes ?? []),
    };
    setKitchen(next);
    return next;
  }, [token]);

  /* The account's own kitchen changes when it is registered, and when a cook
     signs in on a second device. Both are `identity.kitchenId` moving. */
  useEffect(() => {
    if (!hydrated || !isVerified) return;
    reload();
  }, [hydrated, isVerified, identity?.kitchenId, reload]);

  /* ---------------- writes ---------------- */

  const save = useCallback(
    async (patch) => {
      if (!token) return { ok: false, error: 'unauthenticated' };
      setSaving(true);
      try {
        const out = await call('/kitchens/mine', { method: 'POST', token, body: patch });
        if (!out.ok) return out;
        await reload();
        return { ok: true, result: out.result };
      } finally {
        setSaving(false);
      }
    },
    [token, reload],
  );

  /**
   * Register the kitchen a freshly signed-up cook implies.
   *
   * `registerKitchen` upserts on the account, which is what makes calling
   * this twice safe — but an upsert is also why the server has to be *asked*
   * first. A cook signing in on a second device has a kitchen and an empty
   * `kitchen` here for as long as the first read takes, and posting a draft
   * built from their account in that window would rename the real one to
   * whatever their profile says.
   *
   * So: ask, and only register if the answer was genuinely nothing.
   */
  const ensureKitchen = useCallback(
    async (account) => {
      if (kitchen) return kitchen;

      const existing = await reload();
      if (existing) return existing;

      const { dishes, nextDishSeq, createdAt, id, ...draft } = kitchenFromAccount(account);
      const out = await save(draft);
      if (!out.ok) return null;

      /* The starter menu is what stops a new kitchen from being one that
         cannot take an order. Posted as real dishes rather than bundled onto
         the kitchen, because that is what they are now. */
      for (const dish of dishes) {
        await call('/kitchens/mine/dishes', {
          method: 'POST',
          token,
          body: {
            name: dish.name,
            description: dish.description,
            price: dish.price,
            image: dish.image,
            tags: dish.tags,
          },
        });
      }
      return reload();
    },
    [kitchen, reload, save, token],
  );

  const updateKitchen = useCallback((patch) => save(patch), [save]);

  const toggleOpen = useCallback(
    () => save({ isOpen: !(kitchen?.isOpen ?? false) }),
    [save, kitchen],
  );

  const dishWrite = useCallback(
    async (path, body) => {
      if (!token) return { ok: false, error: 'unauthenticated' };
      const out = await call(path, { method: 'POST', token, body });
      if (out.ok) await reload();
      return out;
    },
    [token, reload],
  );

  const addDish = useCallback((dish) => dishWrite('/kitchens/mine/dishes', dish), [dishWrite]);

  const updateDish = useCallback(
    (id, patch) => dishWrite('/kitchens/mine/dishes', { dishId: id, ...patch }),
    [dishWrite],
  );

  const removeDish = useCallback((id) => dishWrite(`/dishes/${id}/remove`), [dishWrite]);

  /** Sold out for today, without deleting the dish. */
  const toggleDish = useCallback((id) => dishWrite(`/dishes/${id}/toggle`), [dishWrite]);

  /** Signing out drops the cached copy. The kitchen itself stays on the
      server -- a listed kitchen does not close because its cook signed out. */
  const clearKitchen = useCallback(() => setKitchen(null), []);

  const value = useMemo(
    () => ({
      kitchen,
      hydrated,
      loaded,
      saving,
      reload,
      /** Only a listed, available dish reaches a customer. */
      liveDishes: kitchen ? (kitchen.dishes ?? []).filter((d) => d.available) : [],
      ensureKitchen,
      updateKitchen,
      toggleOpen,
      addDish,
      updateDish,
      removeDish,
      toggleDish,
      clearKitchen,
    }),
    [
      kitchen,
      hydrated,
      loaded,
      saving,
      reload,
      ensureKitchen,
      updateKitchen,
      toggleOpen,
      addDish,
      updateDish,
      removeDish,
      toggleDish,
      clearKitchen,
    ],
  );

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen() {
  const ctx = useContext(KitchenContext);
  if (!ctx) throw new Error('useKitchen must be used inside <KitchenProvider>');
  return ctx;
}

/** The specialty list, shared with the signup and profile editors. */
export const SPECIALTIES = Object.keys(STARTER_DISHES);
