/**
 * The meal system's one store.
 *
 * Meals, orders, the wallet ledger and the notification list all live in a
 * single persisted document, because the operations that matter touch
 * several of them at once. Confirming an order has to debit a wallet, create
 * an order, count it against the meal's capacity and file the cook's
 * notification, and there must be no instant where some of that happened and
 * the rest did not. Four contexts with four AsyncStorage keys cannot promise
 * that; one document can.
 *
 * Mutations run through `mutate`, which applies a pure transition from
 * `mealLogic` to the *live* state -- the ref, not the render snapshot -- and
 * returns its verdict synchronously. That is what makes a double-tapped
 * "Confirm order" produce one order rather than two: the second call
 * validates against a state that already contains the first.
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

/* ------------------------------------------------------------------ *
 * provider
 * ------------------------------------------------------------------ */

const MealsContext = createContext(null);

export function MealsProvider({ children }) {
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
        if (!loaded.seeded) loaded = seedMeals(loaded);
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

    const out = L.remindReceipts(live.current, { now: Date.now(), today });
    if (out.ok && out.state !== live.current) {
      live.current = out.state;
      setState(out.state);
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
    };
  }, [state, hydrated, mutate]);

  return <MealsContext.Provider value={value}>{children}</MealsContext.Provider>;
}

export function useMeals() {
  const ctx = useContext(MealsContext);
  if (!ctx) throw new Error('useMeals must be used inside MealsProvider');
  return ctx;
}
