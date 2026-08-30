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
 * A cook who has just signed up exists before the server has confirmed
 * them, so they need somewhere to live for those few seconds. This context
 * is that place: one record shaped like a kitchen from the API plus a
 * `dishes` array, so `useChefs()` can drop it into the customer-facing list
 * without any of the consumers knowing the difference.
 *
 * The id is deliberately not a Mongo id. Everything compares with String(),
 * and the prefix makes a not-yet-saved record obvious in a route param.
 */
export const LOCAL_KITCHEN_ID = 'local-1';

/** The delivery radius the range slider in signup defaults to. */
const DEFAULT_RADIUS_KM = 3;

/**
 * The kinds of cooking the signup step offers.
 *
 * This was `Object.keys(STARTER_DISHES)` — a map that also carried three
 * complete dishes per specialty, with names, prices and photographs, and
 * every new kitchen was opened holding them. They were invented in this file
 * and then synced to the server like real listings, so a cook who had listed
 * nothing at all still had "Shorshe Ilish, ৳520" on their page and a row for
 * it in the database. A kitchen now starts with an empty menu and the cook
 * lists their own food.
 *
 * The names themselves stay, because they are a fixed set the interface
 * offers rather than records about anybody — the same job `KNOWN_AREAS` does
 * for neighbourhoods.
 */
export const SPECIALTIES = [
  'Traditional Heritage',
  'Coastal Seafood',
  'Street & Snacks',
  'Biryani & Rice',
  'Vegetarian & Bhorta',
  'Desserts & Pitha',
];

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
  const specialty = account?.specialty || SPECIALTIES[0];
  /* Nothing on the menu until the cook puts something there. */
  const dishes = [];

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
  const { token, getToken, identity, isVerified } = useSession();

  /* The state copy is a render behind whenever signup calls straight through
     to `ensureKitchen`, so every request below asks for the live one. */
  const auth = useCallback(() => getToken() || token, [getToken, token]);

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
    const bearer = auth();
    if (!bearer || !hasServer) return null;
    const out = await call('/kitchens/mine', { token: bearer });
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
      const bearer = auth();
      if (!bearer) return { ok: false, error: 'unauthenticated' };
      setSaving(true);
      try {
        const out = await call('/kitchens/mine', { method: 'POST', token: bearer, body: patch });
        if (!out.ok) return out;
        await reload();
        return { ok: true, result: out.result };
      } finally {
        setSaving(false);
      }
    },
    [auth, reload],
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
