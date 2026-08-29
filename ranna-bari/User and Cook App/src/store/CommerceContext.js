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

import { distanceKm } from '../lib/geo';
import { deliversTo } from '../lib/kitchen';
import * as L from '../lib/mealLogic';
import * as S from '../lib/storeLogic';
import * as R from '../lib/requestLogic';
import * as X from '../lib/taxonomy';
import { isOpenNow } from '../lib/kitchen';
import { useKitchen } from './KitchenContext';
import { useSession } from './SessionContext';
import { api, hasServer } from '../lib/server';

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
 * offer simulation (uses live backend kitchens)
 * ------------------------------------------------------------------ */

function simulateOffers(state, request, { localKitchenId, now, chefs = [] }) {
  if (request.target !== 'all') return state;

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

    const base = request.budget ?? 450 * (request.quantity || 1);
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
  const { token, isVerified } = useSession();
  const [state, setState] = useState(L.EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [serverWallet, setServerWallet] = useState(null);
  /* Server kitchen list for eligibleKitchens — loaded from the cache that
     useServerChefs writes, so the two stay in sync without an extra fetch. */
  const [serverChefs, setServerChefs] = useState([]);

  useEffect(() => {
    AsyncStorage.getItem('rannabari_server_chefs')
      .then((raw) => { if (raw) setServerChefs(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

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
   * Fetch the real wallet balance from the server when signed in.
   *
   * The local ledger still works offline; this supplements it with the
   * authoritative balance so a reinstall or a second device sees the right
   * number. `serverWallet` merges into the value below without touching any
   * of the local commerce state.
   */
  useEffect(() => {
    if (!isVerified || !hasServer) return;
    api('/wallet', { token }).then((out) => {
      if (out && typeof out.balance === 'number') {
        setServerWallet(out);
      }
    }).catch(() => {});
  }, [isVerified, token]);

  /**
   * Run one transition and report what happened.
   *
   * Synchronous on purpose: the caller needs the verdict to decide what to
   * show, and an async result would let a second tap through in the gap.
   */
  const mutate = useCallback((fn, args) => {
    const out = fn(live.current, { ...args, now: Date.now() });
    if (out.ok && out.state !== live.current) {
      live.current = out.state;
      setState(out.state);
    }
    return out;
  }, []);

  const value = useMemo(() => {
    /* The local ledger balance for offline use; the server balance wins when
       we have it, because it is the canonical source after a reinstall or
       a multi-device session. */
    const localWallet = L.balances(state.ledger);
    const wallet = serverWallet
      ? {
          ...localWallet,
          balance: serverWallet.balance,
          held: serverWallet.held ?? localWallet.held,
          earnings: serverWallet.earnings ?? localWallet.earnings,
          serverEntries: serverWallet.entries ?? [],
        }
      : localWallet;

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
       * far. Uses live server kitchen list (from AsyncStorage cache / live API).
       * The same rule browse uses, so a request cannot go to a cook the customer
       * was never shown.
       */
      eligibleKitchens: (origin) => {
        const allChefs = serverChefs ?? [];
        return [
          ...(kitchen ? [kitchen] : []),
          ...allChefs,
        ]
          .filter((c) => isOpenNow(c))
          .filter((c) => {
            if (!origin || typeof c.lat !== 'number') return true;
            return deliversTo(c, distanceKm(origin, { lat: c.lat, lng: c.lng }));
          })
          .map((c) => String(c.id));
      },

      /* ---- food requests: writes ---- */
      createRequest: (request, eligible) => {
        const out = mutate(R.createRequest, { request, eligible });
        if (!out.ok) return out;
        /* Simulated offers from live MongoDB kitchens */
        const withOffers = simulateOffers(live.current, out.result, {
          localKitchenId: kitchen?.id,
          now: Date.now(),
          chefs: serverChefs ?? [],
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
  }, [state, hydrated, mutate, kitchen, serverWallet, serverChefs]);

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce() {
  const ctx = useContext(CommerceContext);
  if (!ctx) throw new Error('useCommerce must be used inside CommerceProvider');
  return ctx;
}
