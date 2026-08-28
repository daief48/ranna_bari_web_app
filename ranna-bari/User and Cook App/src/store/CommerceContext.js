/**
 * Everything the app sells, in one document.
 *
 * Pre-booked meals and the cook stores are two ways to sell food, but they
 * are one wallet, one escrow and one set of earnings -- so they are one
 * document. Splitting them would give a customer two balances and a cook two
 * answers to "have I been paid".
 *
 * It is also what makes the operations that matter indivisible. Checking a
 * store basket out has to debit a wallet, decrement stock, create orders and
 * file the cook's notification; several AsyncStorage keys could leave half
 * of that done, and one cannot.
 *
 * Mutations run through `mutate`, which applies a pure transition to the
 * *live* state -- the ref, not the render snapshot -- and returns its verdict
 * synchronously. That is what makes a double-tapped "Confirm order" produce
 * one order rather than two: the second call validates against a state that
 * already contains the first.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import chefs from '../data/chefs.json';
import menus from '../data/menus.json';
import { distanceKm } from '../lib/geo';
import { deliversTo } from '../lib/kitchen';
import * as L from '../lib/mealLogic';
import * as S from '../lib/storeLogic';
import * as R from '../lib/requestLogic';
import * as X from '../lib/taxonomy';
import { isOpenNow } from '../lib/kitchen';
import { useKitchen } from './KitchenContext';

const KEY = 'rannabari_meals';

/* ------------------------------------------------------------------ *
 * dates
 * ------------------------------------------------------------------ */

/** Local calendar day, not UTC -- "tomorrow" is a thing you eat, not a timestamp. */
export function dayKey(date = new Date()) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const addDays = (n, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return d;
};

export const todayKey = () => dayKey();
export const tomorrowKey = () => dayKey(addDays(1));

/** When each service is eaten, and when ordering for it shuts. */
export const SLOTS = [
  { key: 'breakfast', label: 'Breakfast', serveHour: 8, cutoffHour: 7 },
  { key: 'lunch', label: 'Lunch', serveHour: 13, cutoffHour: 10 },
  { key: 'dinner', label: 'Dinner', serveHour: 20, cutoffHour: 17 },
];

export const slotMeta = (key) => SLOTS.find((s) => s.key === key) ?? SLOTS[1];

/** The default cut-off for a service: a few hours before it is eaten. */
export function defaultDeadline(serveDate, slot) {
  const [y, m, d] = String(serveDate).split('-').map(Number);
  const at = new Date(y, (m ?? 1) - 1, d ?? 1, slotMeta(slot).cutoffHour, 0, 0, 0);
  return at.toISOString();
}

/* ------------------------------------------------------------------ *
 * demo seed
 * ------------------------------------------------------------------ */

/**
 * Meals for tomorrow from kitchens that are not this device.
 *
 * Without these the customer half of the system has nothing to look at until
 * you have been a cook first, and "tomorrow's meals near you" is the part
 * worth seeing. Seeded silently: these were not published just now, so
 * announcing them would put five fake alerts in the notification list on
 * first launch.
 */
function seedMeals(state) {
  const picks = [0, 3, 5, 8, 12, 15];
  const serveDate = tomorrowKey();
  const now = Date.now();
  let next = { ...state, seeded: true };

  picks.forEach((index, i) => {
    const chef = chefs[index];
    if (!chef) return;
    const menu = menus.find((m) => String(m.chefId) === String(chef.id));
    const dish = menu?.items?.[i % (menu?.items?.length || 1)];
    if (!dish) return;

    const slot = SLOTS[i % 3].key;
    next = L.publishMeal(next, {
      meal: {
        kitchenId: chef.id,
        cookName: chef.name,
        title: dish.name,
        description: dish.description,
        image: dish.image,
        price: dish.price,
        capacity: 8 + i * 4,
        serveDate,
        slot,
        deadline: defaultDeadline(serveDate, slot),
        handover: i % 4 === 3 ? 'pickup' : 'delivery',
        handoverNote:
          i % 4 === 3 ? 'Collect from the kitchen door.' : 'Delivered to your address.',
        area: chef.area,
        lat: chef.lat,
        lng: chef.lng,
        deliveryRadiusKm: chef.deliveryRadiusKm,
      },
      notifyNearby: false,
      now,
    }).state;
  });

  return next;
}

/**
 * One demo storefront, so the customer half of the store system has
 * something to walk into before you have been a cook.
 *
 * Deliberately a seeded kitchen rather than this device's own: a cook
 * building their first store should see an empty one, and a customer
 * browsing should see a full one. Seeded silently, for the same reason the
 * meals are -- these were not published a moment ago.
 */
function seedStores(state) {
  const chef = chefs.find((c) => c.name === 'Nusrat J.') ?? chefs[5];
  if (!chef) return state;
  const now = Date.now();

  let next = S.saveStore(state, {
    kitchenId: chef.id,
    patch: {
      name: 'Nusrat’s Homemade Kitchen',
      tagline: 'Cakes, pitha and achar, made at home',
      description:
        'Everything here is baked or bottled in my own kitchen, in small batches, the day before it reaches you. Cakes need a day’s notice; the achar keeps for months.',
      logo: chef.avatar,
      cover: chef.coverImage,
      phone: '01700 000000',
      area: chef.area,
      lat: chef.lat,
      lng: chef.lng,
      deliveryRadiusKm: chef.deliveryRadiusKm,
      deliveryFee: 60,
      freeDeliveryOver: 1500,
      isOpen: true,
    },
    now,
  }).state;

  const store = S.storeForKitchen(next, chef.id);

  /* The requirement's own example, so the flow it describes can be walked
     through end to end: something in stock, something to pre-order, and
     something with a size to choose. */
  const groups = [
    {
      name: 'Cake',
      emoji: '🎂',
      products: [
        {
          name: 'Chocolate Cake',
          description: 'Dark chocolate sponge with ganache. Baked to order.',
          price: 800,
          stock: 5,
          prepTime: '24 hours',
          preorder: true,
          maxQty: 3,
          options: {
            name: 'Size',
            choices: [
              { label: '1kg', priceDelta: 0 },
              { label: '2kg', priceDelta: 600 },
            ],
          },
          images: ['https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&h=600&fit=crop'],
        },
        {
          name: 'Red Velvet Cake',
          description: 'Cream cheese frosting, no artificial colour.',
          price: 950,
          stock: 0,
          prepTime: '2 days',
          preorder: true,
          images: ['https://images.unsplash.com/photo-1586788680434-30d324b2d46f?w=800&h=600&fit=crop'],
        },
      ],
    },
    {
      name: 'Traditional Pitha',
      emoji: '🥮',
      products: [
        {
          name: 'Bhapa Pitha',
          description: 'Steamed rice cakes with date molasses and coconut.',
          price: 80,
          stock: 0,
          minQty: 4,
          prepTime: '1 day',
          preorder: true,
          images: ['https://images.unsplash.com/photo-1519676867240-f03562e64548?w=800&h=600&fit=crop'],
        },
        {
          name: 'Chitoi Pitha',
          description: 'Plain rice cakes, best with the bhorta set.',
          price: 60,
          stock: 24,
          minQty: 4,
          images: ['https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&h=600&fit=crop'],
        },
      ],
    },
    {
      name: 'Achar',
      emoji: '🫙',
      products: [
        {
          name: 'Mango Achar',
          description: 'Sun-dried mango in mustard oil. Keeps for a year.',
          price: 350,
          stock: 10,
          maxQty: 4,
          images: ['https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&h=600&fit=crop'],
        },
        {
          name: 'Olive Achar',
          description: 'Tart and hot, the way it is made in Sylhet.',
          price: 320,
          stock: 6,
          images: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&h=600&fit=crop'],
        },
      ],
    },
  ];

  for (const group of groups) {
    const made = S.addCategory(next, {
      storeId: store.id,
      name: group.name,
      emoji: group.emoji,
      now,
    });
    next = made.state;
    for (const product of group.products) {
      next = S.saveProduct(next, {
        storeId: store.id,
        patch: { ...product, categoryId: made.result.id },
        now,
      }).state;
    }
  }

  return next;
}

/* ------------------------------------------------------------------ *
 * competing cooks
 * ------------------------------------------------------------------ */

/**
 * Answers from the seeded kitchens when a request goes out to everyone.
 *
 * This is the one part of the bidding system that is simulated rather than
 * real, and it has to be: comparing offers is the entire feature, and on a
 * single device there is exactly one cook who can actually answer. The
 * seeded kitchens bid the way the seeded reviews review and the seeded
 * orders arrive -- the demo's other actors, behaving.
 *
 * The device's own kitchen is deliberately excluded. That cook is real and
 * answers for themselves, which is what makes the cook side of this worth
 * looking at.
 *
 * Prices are deterministic, not random: the same request always produces the
 * same board, so a screenshot and a test agree with each other. They spread
 * around whatever the customer said they expected to pay, or around what
 * that kitchen's menu costs when they said nothing.
 */
function simulateOffers(state, request, { localKitchenId, now }) {
  if (request.target !== 'all') return state;

  const menuAverage = (chefId) => {
    const menu = menus.find((m) => String(m.chefId) === String(chefId));
    const items = menu?.items ?? [];
    if (!items.length) return 400;
    return Math.round(items.reduce((sum, d) => sum + d.price, 0) / items.length);
  };

  /* A small, stable per-cook offset. Anything random here would make the
     board move under the customer between renders.
     
     FNV-1a rather than a plain rolling sum: kitchen ids differ by one
     character, and a hash without avalanche gave neighbouring ids offsets
     0.001 apart -- which rounded to the same price and put three cooks on
     the comparison screen all bidding exactly ৳1140. */
  const wobble = (key) => {
    let h = 2166136261;
    for (const ch of String(key)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  };

  const NOTES = [
    'I make these to order, fresh on the day.',
    'Happy to do it. I can adjust the sweetness if you like.',
    'I have done this many times. Delivery included in my price.',
    'Can do, but I would need the morning to get it right.',
  ];
  const TIMES = ['24 hours', '1 day', 'Same day if ordered by noon', '2 days'];

  let next = state;
  let i = 0;

  for (const id of request.eligible) {
    if (String(id) === String(localKitchenId)) continue;
    const chef = chefs.find((c) => String(c.id) === String(id));
    if (!chef) continue;

    const base = request.budget ?? menuAverage(chef.id) * (request.quantity || 1);
    const spread = 0.85 + wobble(`${request.id}:${chef.id}`) * 0.35;
    const price = Math.max(50, Math.round((base * spread) / 10) * 10);

    next = R.submitOffer(next, {
      requestId: request.id,
      cook: {
        kitchenId: chef.id,
        name: chef.name,
        avatar: chef.avatar,
        rating: chef.rating,
        reviewCount: chef.reviewCount,
        area: chef.area,
        lat: chef.lat,
        lng: chef.lng,
      },
      price,
      note: NOTES[i % NOTES.length],
      prepTime: TIMES[i % TIMES.length],
      now: now + i + 1,
    }).state;
    i += 1;
  }

  return next;
}

/* ------------------------------------------------------------------ *
 * provider
 * ------------------------------------------------------------------ */

const CommerceContext = createContext(null);

export function CommerceProvider({ children }) {
  /* This provider sits inside KitchenProvider, so it can ask who is cooking
     on this device -- which is the one kitchen that must never be answered
     for automatically. */
  const { kitchen } = useKitchen();
  const [state, setState] = useState(L.EMPTY);
  const [hydrated, setHydrated] = useState(false);

  /* The authoritative copy. React state is for rendering; this is what
     validation reads, so two taps in the same frame cannot both see a world
     in which the money is still there. */
  const live = useRef(L.EMPTY);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive) return;
        let loaded = L.EMPTY;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') loaded = { ...L.EMPTY, ...parsed };
        }
        if (!loaded.seeded) loaded = seedStores(seedMeals(loaded));
        // Categories are data now, so they have to exist before anything reads them.
        loaded = X.seedTaxonomy(loaded);
        live.current = loaded;
        setState(loaded);
      })
      .catch(() => {})
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  /**
   * Nudge anyone sitting on a delivered order, once a day.
   *
   * Held money is the worst state in the system: the customer has paid, the
   * cook has cooked, and neither has what they are owed. The reminder's key
   * carries the date, so opening the app five times today produces one
   * notification and tomorrow produces another.
   */
  const remindedRef = useRef(null);
  useEffect(() => {
    if (!hydrated) return;
    const today = todayKey();
    if (remindedRef.current === today) return;
    remindedRef.current = today;

    let next = live.current;
    const reminded = L.remindReceipts(next, { now: Date.now(), today });
    if (reminded.ok) next = reminded.state;
    const expired = R.expireRequests(next, { today, now: Date.now() });
    if (expired.ok) next = expired.state;

    if (next !== live.current) {
      live.current = next;
      setState(next);
    }
  }, [hydrated]);

  /**
   * Run one transition and report what happened.
   *
   * Synchronous on purpose: the caller needs the verdict to decide what to
   * show, and an async result would let a second tap through in the gap.
   */
  const mutate = useCallback((fn, args) => {
    const out = fn(live.current, { ...args, now: Date.now() });
    if (out.ok) {
      live.current = out.state;
      setState(out.state);
    }
    return out;
  }, []);

  const value = useMemo(() => {
    const wallet = L.balances(state.ledger);

    return {
      hydrated,
      state,
      wallet,
      ledger: state.ledger,
      meals: state.meals,
      orders: state.orders,

      /* ---- reads ---- */
      mealById: (id) => state.meals.find((m) => m.id === id) ?? null,
      remaining: (meal) => L.remaining(state, meal),
      confirmedCount: (mealId) => L.confirmedCount(state, mealId),
      ordersForMeal: (mealId) => L.ordersForMeal(state, mealId),
      isOpen: (meal) => L.mealOpen(state, meal, Date.now()),
      pendingEarnings: () => L.pendingEarnings(state),

      /** Meals a customer at `origin` can actually be delivered, still open. */
      mealsNearby: (origin, { day } = {}) =>
        state.meals
          .filter((m) => m.status === 'published')
          .filter((m) => (day ? m.serveDate === day : true))
          .map((m) => ({
            meal: m,
            km:
              origin && typeof m.lat === 'number'
                ? distanceKm(origin, { lat: m.lat, lng: m.lng })
                : null,
          }))
          .filter(({ meal, km }) => deliversTo(meal, km))
          .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)),

      mealsForKitchen: (kitchenId) =>
        state.meals.filter((m) => String(m.kitchenId) === String(kitchenId)),

      ordersForCustomer: (key) => state.orders.filter((o) => o.customerKey === key),

      ordersForKitchen: (kitchenId) =>
        state.orders.filter((o) => String(o.kitchenId) === String(kitchenId)),

      notificationsFor: (audience) =>
        state.notifications.filter((nt) => nt.audience === audience),
      unreadFor: (audience) => L.unreadFor(state, audience),

      /* ---- writes ---- */
      publishMeal: (meal, notifyNearby) =>
        mutate(L.publishMeal, { meal, notifyNearby }),
      closeMeal: (mealId) => mutate(L.closeMeal, { mealId }),
      cancelMeal: (mealId, reason) => mutate(L.cancelMeal, { mealId, reason }),
      toggleInterest: (mealId, customerKey) =>
        mutate(L.toggleInterest, { mealId, customerKey }),
      confirmOrder: (mealId, customer) => mutate(L.confirmOrder, { mealId, customer }),
      advanceOrder: (orderId) => mutate(L.advanceOrder, { orderId }),
      confirmReceived: (orderId) => mutate(L.confirmReceived, { orderId }),
      cancelOrder: (orderId, by, reason) =>
        mutate(L.cancelOrder, { orderId, by, reason }),
      topUp: (amount, method) => mutate(L.topUp, { amount, method }),
      markRead: (audience) => mutate(L.markRead, { audience }),
      clearNotifications: (audience) => mutate(L.clearNotifications, { audience }),
      remindReceipts: () => mutate(L.remindReceipts, { today: todayKey() }),

      /* ---- cook stores: reads ---- */
      stores: state.stores,
      products: state.products,
      storeForKitchen: (kitchenId) => S.storeForKitchen(state, kitchenId),
      storeById: (id) => S.storeById(state, id),
      categoriesOf: (storeId) => S.categoriesOf(state, storeId),
      productsOf: (storeId, categoryId) => S.productsOf(state, storeId, categoryId),
      productById: (id) => S.productById(state, id),
      availability: (product, store) => S.availability(product, store),
      unitPriceOf: S.unitPriceOf,
      storeOverview: (store) => S.storeOverview(state, store),
      pendingPreorders: (kitchenId) => S.pendingPreorders(state, kitchenId),
      storeOrders: (storeId) =>
        state.orders.filter((o) => o.kind === 'store' && o.storeId === storeId),

      /** Shops a customer at `origin` can be delivered from, nearest first. */
      storesNearby: (origin) =>
        state.stores
          .map((store) => ({
            store,
            km:
              origin && typeof store.lat === 'number'
                ? distanceKm(origin, { lat: store.lat, lng: store.lng })
                : null,
            products: state.products.filter(
              (p) => p.storeId === store.id && p.active,
            ).length,
          }))
          .filter(({ store, km }) => deliversTo(store, km))
          .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)),

      /* ---- cook stores: the basket ---- */
      cartOf: (customerKey) => S.cartOf(state, customerKey),
      priceCart: (customerKey) => S.priceCart(state, customerKey),

      /* ---- cook stores: writes ---- */
      saveStore: (kitchenId, patch) => mutate(S.saveStore, { kitchenId, patch }),
      toggleStoreOpen: (storeId) => mutate(S.toggleStoreOpen, { storeId }),
      addCategory: (storeId, name, emoji) =>
        mutate(S.addCategory, { storeId, name, emoji }),
      updateCategory: (categoryId, patch) =>
        mutate(S.updateCategory, { categoryId, patch }),
      removeCategory: (categoryId) => mutate(S.removeCategory, { categoryId }),
      moveCategory: (categoryId, delta) => mutate(S.moveCategory, { categoryId, delta }),
      saveProduct: (args) => mutate(S.saveProduct, args),
      removeProduct: (productId) => mutate(S.removeProduct, { productId }),
      setStock: (productId, stock) => mutate(S.setStock, { productId, stock }),
      toggleProduct: (productId) => mutate(S.toggleProduct, { productId }),
      togglePreorder: (productId) => mutate(S.togglePreorder, { productId }),
      addToCart: (customerKey, productId, qty, option) =>
        mutate(S.addToCart, { customerKey, productId, qty, option }),
      setCartQty: (customerKey, key, qty) => mutate(S.setCartQty, { customerKey, key, qty }),
      removeFromCart: (customerKey, key) => mutate(S.removeFromCart, { customerKey, key }),
      clearCart: (customerKey) => mutate(S.clearCart, { customerKey }),
      checkout: (customerKey, customer) => mutate(S.checkout, { customerKey, customer }),
      acceptPreorder: (orderId) => mutate(S.acceptPreorder, { orderId }),
      rejectPreorder: (orderId, reason) => mutate(S.rejectPreorder, { orderId, reason }),

      /* ---- categories, as data ---- */
      taxonomy: X.taxonomyOf(state),
      categoryById: (id) => X.categoryById(state, id),
      categoryByKey: (key) => X.categoryByKey(state, key),

      /* ---- food requests: reads ---- */
      requests: state.requests,
      offers: state.offers,
      requestById: (id) => R.requestById(state, id),
      requestsForCustomer: (key) => R.requestsForCustomer(state, key),
      requestsForCook: (kitchenId) => R.requestsForCook(state, kitchenId),
      offersForRequest: (requestId) => R.offersForRequest(state, requestId),
      /** A cook's own offer, and never anybody else's -- see requestLogic. */
      offerForCook: (requestId, kitchenId) => R.offerForCook(state, requestId, kitchenId),
      offerSummary: (requestId) => R.offerSummary(state, requestId),

      /**
       * Kitchens a broadcast should reach: open, and willing to come this
       * far. The same rule browse uses, so a request cannot go to a cook
       * whose food the customer could never have been shown.
       */
      eligibleKitchens: (origin) =>
        [
          ...(kitchen ? [kitchen] : []),
          ...chefs,
        ]
          .filter((c) => isOpenNow(c))
          .filter((c) => {
            if (!origin || typeof c.lat !== 'number') return true;
            return deliversTo(c, distanceKm(origin, { lat: c.lat, lng: c.lng }));
          })
          .map((c) => String(c.id)),

      /* ---- food requests: writes ---- */
      createRequest: (request, eligible) => {
        const out = mutate(R.createRequest, { request, eligible });
        if (!out.ok) return out;
        /* The seeded kitchens answer straight away. A real deployment would
           have them trickle in over the evening; here they arrive at once so
           the comparison screen has something to compare. */
        const withOffers = simulateOffers(live.current, out.result, {
          localKitchenId: kitchen?.id,
          now: Date.now(),
        });
        if (withOffers !== live.current) {
          live.current = withOffers;
          setState(withOffers);
        }
        return out;
      },
      cancelRequest: (requestId) => mutate(R.cancelRequest, { requestId }),
      submitOffer: (requestId, cook, price, note, prepTime) =>
        mutate(R.submitOffer, { requestId, cook, price, note, prepTime }),
      withdrawOffer: (offerId) => mutate(R.withdrawOffer, { offerId }),
      selectOffer: (requestId, offerId) => mutate(R.selectOffer, { requestId, offerId }),
      counterOffer: (offerId, by, amount) => mutate(R.counterOffer, { offerId, by, amount }),
      acceptPrice: (offerId, by) => mutate(R.acceptPrice, { offerId, by }),
      payForRequest: (requestId, customer) => mutate(R.payForRequest, { requestId, customer }),
      declineRequest: (requestId, kitchenId) =>
        mutate(R.declineRequest, { requestId, kitchenId }),
      rejectOffer: (offerId, reason) => mutate(R.rejectOffer, { offerId, reason }),
    };
  }, [state, hydrated, mutate, kitchen]);

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce() {
  const ctx = useContext(CommerceContext);
  if (!ctx) throw new Error('useCommerce must be used inside CommerceProvider');
  return ctx;
}
