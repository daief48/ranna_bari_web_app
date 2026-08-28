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

export function KitchenProvider({ children }) {
  const [kitchen, setKitchen] = useState(null);
  const [hydrated, setHydrated] = useState(false);

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

  // Persist after hydration only, so the initial null never clears a stored
  // kitchen during the first render pass.
  useEffect(() => {
    if (!hydrated) return;
    if (kitchen) AsyncStorage.setItem(KEY, JSON.stringify(kitchen)).catch(() => {});
    else AsyncStorage.removeItem(KEY).catch(() => {});
  }, [kitchen, hydrated]);

  /**
   * Create the kitchen from a freshly signed-in cook account, once. Calling
   * it again with a kitchen already stored is a no-op -- signing back in
   * must not wipe a menu.
   */
  const ensureKitchen = useCallback((account) => {
    let created = null;
    setKitchen((prev) => {
      if (prev) return prev;
      created = kitchenFromAccount(account);
      return created;
    });
    return created;
  }, []);

  const updateKitchen = useCallback((patch) => {
    setKitchen((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const toggleOpen = useCallback(() => {
    setKitchen((prev) => (prev ? { ...prev, isOpen: !prev.isOpen } : prev));
  }, []);

  const addDish = useCallback((dish) => {
    setKitchen((prev) => {
      if (!prev) return prev;
      const seq = prev.nextDishSeq ?? prev.dishes.length + 1;
      const next = {
        ...dish,
        id: `${LOCAL_KITCHEN_ID}-${seq}`,
        available: dish.available ?? true,
      };
      const dishes = [...prev.dishes, next];
      return { ...prev, dishes, tags: tagsFromDishes(dishes), nextDishSeq: seq + 1 };
    });
  }, []);

  const updateDish = useCallback((id, patch) => {
    setKitchen((prev) => {
      if (!prev) return prev;
      const dishes = prev.dishes.map((d) => (d.id === id ? { ...d, ...patch } : d));
      return { ...prev, dishes, tags: tagsFromDishes(dishes) };
    });
  }, []);

  const removeDish = useCallback((id) => {
    setKitchen((prev) => {
      if (!prev) return prev;
      const dishes = prev.dishes.filter((d) => d.id !== id);
      return { ...prev, dishes, tags: tagsFromDishes(dishes) };
    });
  }, []);

  /** Sold out for today, without deleting the dish. */
  const toggleDish = useCallback((id) => {
    setKitchen((prev) => {
      if (!prev) return prev;
      const dishes = prev.dishes.map((d) =>
        d.id === id ? { ...d, available: !d.available } : d,
      );
      return { ...prev, dishes };
    });
  }, []);

  /** Signing out of a cook account drops the kitchen from this device. */
  const clearKitchen = useCallback(() => setKitchen(null), []);

  const value = useMemo(
    () => ({
      kitchen,
      hydrated,
      /** Only a listed, available dish reaches a customer. */
      liveDishes: kitchen ? kitchen.dishes.filter((d) => d.available) : [],
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
