/**
 * Everything the app sells, read from the server.
 *
 * This used to be a local state machine: `mealLogic`, `storeLogic` and
 * `requestLogic` applied pure transitions to one AsyncStorage document, and
 * the header above them said what that was for -- "when a backend arrives,
 * these transitions are its specification". The backend arrived, and it is a
 * port of exactly those modules. So this file changed sides.
 *
 * ## What moved and what did not
 *
 * The **writes** are gone. Every transition now happens on the server, inside
 * a transaction, against a ledger no client can rewrite. What used to be
 * `mutate(L.confirmOrder, ...)` is a `POST /meals/:id/confirm`.
 *
 * The **reads** did not move, and deliberately. `S.productsOf`,
 * `R.offersForRequest`, `L.ordersForMeal` and the rest are pure functions of
 * the state shape -- they never knew where the document came from. Projecting
 * the server's responses back into that same shape means every one of them,
 * and every screen built on them, keeps working untouched.
 *
 * ## Why the verdicts still look the same
 *
 * Screens branch on `{ ok, result, error }` and hand `error` to `errorText()`.
 * The backend answers in the app's own error vocabulary -- `meal-sold-out`,
 * `wallet-low-balance`, `offer-not-your-turn` -- because it was ported from
 * here. `call()` in `lib/server.js` turns an HTTP refusal into that shape, so
 * a screen cannot tell which side refused, and does not need to.
 *
 * The one thing that did change is that a verdict now arrives over a network,
 * so every write is `async` and every caller awaits it.
 *
 * ## Offline
 *
 * Reads are cached: the last good projection is written to AsyncStorage and
 * painted immediately on the next cold start, so the app opens to content
 * rather than to a spinner, and keeps showing it on a dead network. Writes
 * are not queued -- money moving is not something to guess about, and a
 * refusal the customer never saw is worse than a button that says it could
 * not reach the server.
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
import { isOpenNow } from '../lib/kitchen';
import { useKitchen } from './KitchenContext';
import { useSession } from './SessionContext';
import { call, hasServer } from '../lib/server';

const CACHE_KEY = 'rannabari_commerce_cache_v3';

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
 * the projection
 * ------------------------------------------------------------------ */

/**
 * The same shape `mealLogic.EMPTY` had, because the read helpers still expect
 * it -- plus the few fields the server computes better than the device can.
 *
 * `wallet`, `summaries` and `overviews` are the server's own answers to
 * questions the local modules used to fold out of the whole document. Folding
 * them here would mean folding a *page* of orders and calling it a total.
 */
const EMPTY = {
  meals: [],
  stores: [],
  categories: [],
  products: [],
  cart: { lines: [], subtotal: 0, delivery: 0, total: 0, hasPreorder: false, problems: [] },
  taxonomy: [],
  requests: [],
  offers: [],
  orders: [],
  preorders: [],
  ledger: [],
  notifications: [],
  wallet: { balance: 0, held: 0, earnings: 0 },
  /** requestId -> the server's offer summary for it. */
  summaries: {},
  /** storeId -> the cook's own dashboard counts. */
  overviews: {},
  /** Store ids whose catalogue has been fetched, so a miss is not a blank shop. */
  loadedStores: [],
};

/**
 * Merge a store's catalogue into the flat `categories` / `products` arrays.
 *
 * The server returns a shop's shelves nested under the shop; the read helpers
 * expect them flat and filter by `storeId`. Replacing this store's rows rather
 * than appending is what makes a second fetch a refresh instead of a
 * duplicate -- a product the cook deleted has to actually disappear.
 */
function withCatalogue(state, storeId, { categories, products, overview }) {
  const id = String(storeId);
  return {
    ...state,
    categories: [
      ...state.categories.filter((c) => String(c.storeId) !== id),
      ...(categories ?? []),
    ],
    products: [
      ...state.products.filter((p) => String(p.storeId) !== id),
      ...(products ?? []),
    ],
    overviews: overview ? { ...state.overviews, [id]: overview } : state.overviews,
    loadedStores: state.loadedStores.includes(id)
      ? state.loadedStores
      : [...state.loadedStores, id],
  };
}

/* ------------------------------------------------------------------ *
 * provider
 * ------------------------------------------------------------------ */

const CommerceContext = createContext(null);

export function CommerceProvider({ children }) {
  /* The kitchen is still asked for here, but only for its id: the cook's own
     shop and board are server rows now, addressed by the kitchen the token
     carries. `identity.kitchenId` is the authoritative one; the local record
     is the fallback while a kitchen built offline is still registering. */
  const { kitchen } = useKitchen();
  const { token, identity, isVerified } = useSession();

  const kitchenId = identity?.kitchenId ?? kitchen?.id ?? null;

  const [state, setState] = useState(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  /* The authoritative copy. Writes read it to merge a server response into
     the newest state rather than into whatever the last render captured --
     two taps in the same frame would otherwise have the second overwrite the
     first's result with a state that predates it. */
  const live = useRef(EMPTY);

  const commit = useCallback((next) => {
    if (next === live.current) return;
    live.current = next;
    setState(next);
  }, []);

  const patch = useCallback(
    (fields) => commit({ ...live.current, ...fields }),
    [commit],
  );

  /* ---------------- cache ---------------- */

  /* Paint last known good immediately. A cold start on a slow network should
     show the food the customer was looking at yesterday, not an empty board. */
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          live.current = { ...EMPTY, ...parsed };
          setState(live.current);
        }
      })
      .catch(() => {})
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  /* Cache the directory and the boards, never the money. A stale balance
     shown as current is a lie the customer would act on; a stale menu is
     yesterday's menu, which is what a cache is for. */
  useEffect(() => {
    if (!hydrated) return;
    const { wallet, ledger, cart, ...cacheable } = state;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheable)).catch(() => {});
  }, [state, hydrated]);

  /* ---------------- loading ---------------- */

  /**
   * What anyone can read, signed in or not.
   *
   * The shop directory and the category vocabulary are what the browse and
   * home screens draw before there is a session, so gating them would mean
   * the app cannot render its first screen without one.
   */
  const loadPublic = useCallback(async () => {
    const [stores, taxonomy] = await Promise.all([
      call('/stores'),
      call('/taxonomy'),
    ]);

    const fields = {};
    if (stores.ok) fields.stores = stores.result.stores ?? [];
    if (taxonomy.ok) fields.taxonomy = taxonomy.result.taxonomy ?? [];
    if (Object.keys(fields).length) patch(fields);

    return stores.ok || taxonomy.ok;
  }, [patch]);

  /**
   * What this account can read.
   *
   * One pass, in parallel, because these are eight screens' worth of data and
   * doing them in series would be eight round trips deep on a phone network.
   * Each slice lands on its own: a `/preorders` that refuses because this
   * account has no kitchen must not cost the customer their meals board.
   */
  const loadPrivate = useCallback(async () => {
    if (!token) return false;
    const auth = { token };

    const [meals, orders, wallet, notifications, requests, cart, mine, offers, preorders] =
      await Promise.all([
        call('/meals', auth),
        call('/orders', auth),
        call('/wallet', auth),
        call('/notifications', auth),
        call('/requests', auth),
        call('/cart', auth),
        /* A cook's own board carries the closed and cancelled services the
           public list hides -- that is what their panel is about. */
        kitchenId ? call(`/meals?kitchenId=${encodeURIComponent(kitchenId)}`, auth) : null,
        kitchenId ? call('/offers', auth) : null,
        kitchenId ? call('/preorders', auth) : null,
      ]);

    const fields = {};

    /* The two meal lists are one board: the cook's own services plus
       everything else on offer, deduplicated by id with the cook's copy
       winning because it is the one carrying their cancelled rows. */
    if (meals.ok || mine?.ok) {
      const own = mine?.ok ? (mine.result.meals ?? []) : [];
      const ownIds = new Set(own.map((m) => String(m.id)));
      const rest = meals.ok
        ? (meals.result.meals ?? []).filter((m) => !ownIds.has(String(m.id)))
        : [];
      fields.meals = [...own, ...rest];
    }

    if (orders.ok) fields.orders = orders.result.orders ?? [];
    if (notifications.ok) fields.notifications = notifications.result.notifications ?? [];
    if (requests.ok) fields.requests = requests.result.requests ?? [];
    if (cart.ok) fields.cart = cart.result.cart ?? EMPTY.cart;
    if (offers?.ok) fields.offers = offers.result.offers ?? [];
    if (preorders?.ok) fields.preorders = preorders.result.preorders ?? [];

    if (wallet.ok) {
      fields.ledger = wallet.result.entries ?? [];
      fields.wallet = {
        balance: wallet.result.balance ?? 0,
        held: wallet.result.held ?? 0,
        earnings: wallet.result.earnings ?? 0,
      };
    }

    if (Object.keys(fields).length) patch(fields);

    return meals.ok || orders.ok || wallet.ok;
  }, [token, kitchenId, patch]);

  /** Everything, and a flag saying whether the server answered at all. */
  const refresh = useCallback(async () => {
    if (!hasServer) return false;
    setLoading(true);
    try {
      const [pub, priv] = await Promise.all([
        loadPublic(),
        isVerified ? loadPrivate() : Promise.resolve(false),
      ]);
      const reached = pub || priv;
      setOffline(!reached);
      return reached;
    } finally {
      setLoading(false);
    }
  }, [loadPublic, loadPrivate, isVerified]);

  /* Load on mount, and again whenever the account or its kitchen changes --
     signing in turns eight of these slices from refusals into content. */
  useEffect(() => {
    if (!hydrated) return;
    refresh();
  }, [hydrated, isVerified, kitchenId, refresh]);

  /* ---------------- detail hydration ---------------- */


  /**
   * A shop's shelves.
   *
   * The directory carries the shop and how many things are on sale in it; the
   * catalogue is a second request, made when somebody actually walks in. The
   * alternative is the directory costing one request per shop to render.
   */
  const inflight = useRef(new Map());

  const ensureStore = useCallback(
    async (storeId, { force = false } = {}) => {
      if (!storeId || !hasServer) return null;
      const id = String(storeId);
      if (!force && live.current.loadedStores.includes(id)) return live.current;

      const key = `store:${id}`;
      if (inflight.current.has(key)) return inflight.current.get(key);

      const promise = (async () => {
        const out = await call(`/stores/${id}`, { token });
        if (!out.ok) return null;
        const next = withCatalogue(live.current, id, out.result);
        /* The directory may not carry this shop -- a closed one, or the
           cook's own before it opened -- so the detail response is also how
           it gets into the list at all. */
        const known = next.stores.some((s) => String(s.id) === id);
        commit(
          known
            ? {
                ...next,
                stores: next.stores.map((s) =>
                  String(s.id) === id ? { ...s, ...out.result.store } : s,
                ),
              }
            : { ...next, stores: [...next.stores, out.result.store] },
        );
        return live.current;
      })().finally(() => inflight.current.delete(key));

      inflight.current.set(key, promise);
      return promise;
    },
    [token, commit],
  );

  /**
   * The cook's own shop, loaded without being asked for.
   *
   * Seven screens in the cook panel read the catalogue -- products,
   * categories, settings, the shelf editor -- and every one of them would
   * otherwise have to remember to fetch it first. One of them forgetting is
   * a blank shop that reads as "your products are gone", so it is fetched
   * here rather than seven times.
   *
   * A closed shop is absent from `/stores`, which lists open ones only, so
   * this looks it up by kitchen rather than searching the directory.
   */
  const ownStoreRef = useRef(null);
  useEffect(() => {
    if (!hydrated || !kitchenId || !token || !hasServer) return;
    if (ownStoreRef.current === kitchenId) return;
    ownStoreRef.current = kitchenId;

    (async () => {
      const out = await call(`/stores?kitchenId=${encodeURIComponent(kitchenId)}`, { token });
      const found = out.ok ? (out.result.stores ?? [])[0] : null;
      if (found) await ensureStore(found.id, { force: true });
      // A cook who has not opened a shop yet is not an error; there is
      // simply nothing to load, and the panel offers to open one.
      else ownStoreRef.current = null;
    })();
  }, [hydrated, kitchenId, token, ensureStore]);

  /**
   * One product, and the shop around it.
   *
   * The product screen is reachable by link, so it cannot assume the customer
   * walked in through the shop and has its catalogue loaded. Fetching the
   * shop as well is what makes `availability` right: a jar in stock in a shop
   * that is shut is not something anybody can buy.
   */
  const ensureProduct = useCallback(
    async (productId) => {
      if (!productId || !hasServer) return null;
      const id = String(productId);
      if (live.current.products.some((p) => String(p.id) === id)) return live.current;

      const out = await call(`/products/${id}`, { token });
      if (!out.ok) return null;

      const { product, store } = out.result;
      const storeId = String(store.id);
      commit({
        ...live.current,
        stores: live.current.stores.some((s) => String(s.id) === storeId)
          ? live.current.stores.map((s) => (String(s.id) === storeId ? { ...s, ...store } : s))
          : [...live.current.stores, store],
        products: [
          ...live.current.products.filter((p) => String(p.id) !== id),
          product,
        ],
      });
      return live.current;
    },
    [token, commit],
  );

  /**
   * One request, with the offers on it.
   *
   * Which offers come back is the server's decision, not a filter applied
   * here: a customer gets every price, a cook gets their own row and a count
   * of how many kitchens they are bidding against. The app renders whichever
   * it is handed.
   */
  const ensureRequest = useCallback(
    async (requestId) => {
      if (!requestId || !hasServer || !token) return null;
      const id = String(requestId);
      const key = `request:${id}`;
      if (inflight.current.has(key)) return inflight.current.get(key);

      const promise = (async () => {
        const out = await call(`/requests/${id}`, { token });
        if (!out.ok) return null;

        const { request, offers = [], summary, offer, competingOffers } = out.result;
        /* A cook's single offer arrives as `offer`; a customer's list arrives
           as `offers`. Both land in the same array, because that is what
           `offersForRequest` reads. */
        const rows = offer ? [offer] : offers;

        const next = {
          ...live.current,
          requests: live.current.requests.some((r) => String(r.id) === id)
            ? live.current.requests.map((r) => (String(r.id) === id ? request : r))
            : [...live.current.requests, request],
          offers: [
            ...live.current.offers.filter((o) => String(o.requestId) !== id),
            ...rows,
          ],
          summaries: {
            ...live.current.summaries,
            [id]: summary ?? {
              /* A cook is told how many rivals there are and nothing else, so
                 their summary has a count and no prices in it. */
              count: (competingOffers ?? 0) + (offer ? 1 : 0),
              low: null,
              high: null,
            },
          },
        };
        commit(next);
        return next;
      })().finally(() => inflight.current.delete(key));

      inflight.current.set(key, promise);
      return promise;
    },
    [token, commit],
  );

  /**
   * One order, for the tracker.
   *
   * The list is capped at fifty rows, so an order older than that is real,
   * openable by link, and absent from `state.orders`. Fetching it by id is
   * what stops a receipt from becoming a 404 because the customer has eaten
   * fifty times since.
   */
  const ensureOrder = useCallback(
    async (orderId) => {
      if (!orderId || !hasServer || !token) return null;
      const id = String(orderId);
      const out = await call(`/orders/${id}`, { token });
      if (!out.ok) return null;

      commit({
        ...live.current,
        orders: live.current.orders.some((o) => String(o.id) === id)
          ? live.current.orders.map((o) => (String(o.id) === id ? out.result.order : o))
          : [out.result.order, ...live.current.orders],
      });
      return out.result.order;
    },
    [token, commit],
  );

  /** One meal, for the screen that shows only it. */
  const ensureMeal = useCallback(
    async (mealId) => {
      if (!mealId || !hasServer || !token) return null;
      const id = String(mealId);
      const out = await call(`/meals/${id}`, { token });
      if (!out.ok) return null;

      commit({
        ...live.current,
        meals: live.current.meals.some((m) => String(m.id) === id)
          ? live.current.meals.map((m) => (String(m.id) === id ? out.result.meal : m))
          : [...live.current.meals, out.result.meal],
      });
      return out.result;
    },
    [token, commit],
  );

  /* ---------------- writes ---------------- */

  /**
   * One write.
   *
   * Sends it, and on success refreshes what it could have changed. The
   * refresh is deliberately not a merge of the response: a confirmed order
   * moves a balance, fills a capacity and files two notifications, and
   * guessing at which of those the server did is how a client's copy drifts
   * from the books. `after` names the slices worth re-reading; everything
   * else waits for the next full refresh.
   */
  const write = useCallback(
    async (path, { method = 'POST', body, after } = {}) => {
      if (!hasServer) {
        return { ok: false, error: 'network', message: 'No server is configured.' };
      }
      if (!token) {
        return { ok: false, error: 'unauthenticated', message: 'Sign in first.' };
      }

      const out = await call(path, { method, token, body });
      if (!out.ok) {
        if (out.error === 'network') setOffline(true);
        return out;
      }

      setOffline(false);
      if (after) await after(out.result);
      return { ok: true, result: out.result };
    },
    [token],
  );

  /* Named refreshers, so a write says what it invalidated rather than
     re-reading the whole world after every tap. */

  const reloadWallet = useCallback(async () => {
    const out = await call('/wallet', { token });
    if (!out.ok) return;
    patch({
      ledger: out.result.entries ?? [],
      wallet: {
        balance: out.result.balance ?? 0,
        held: out.result.held ?? 0,
        earnings: out.result.earnings ?? 0,
      },
    });
  }, [token, patch]);

  const reloadMeals = useCallback(async () => {
    const [all, mine] = await Promise.all([
      call('/meals', { token }),
      kitchenId ? call(`/meals?kitchenId=${encodeURIComponent(kitchenId)}`, { token }) : null,
    ]);
    if (!all.ok && !mine?.ok) return;
    const own = mine?.ok ? (mine.result.meals ?? []) : [];
    const ownIds = new Set(own.map((m) => String(m.id)));
    const rest = all.ok
      ? (all.result.meals ?? []).filter((m) => !ownIds.has(String(m.id)))
      : [];
    patch({ meals: [...own, ...rest] });
  }, [token, kitchenId, patch]);

  const reloadOrders = useCallback(async () => {
    const [orders, preorders] = await Promise.all([
      call('/orders', { token }),
      kitchenId ? call('/preorders', { token }) : null,
    ]);
    const fields = {};
    if (orders.ok) fields.orders = orders.result.orders ?? [];
    if (preorders?.ok) fields.preorders = preorders.result.preorders ?? [];
    if (Object.keys(fields).length) patch(fields);
  }, [token, kitchenId, patch]);

  const reloadRequests = useCallback(async () => {
    const [requests, offers] = await Promise.all([
      call('/requests', { token }),
      kitchenId ? call('/offers', { token }) : null,
    ]);
    const fields = {};
    if (requests.ok) fields.requests = requests.result.requests ?? [];
    if (offers?.ok) fields.offers = offers.result.offers ?? [];
    if (Object.keys(fields).length) patch(fields);
  }, [token, kitchenId, patch]);

  const reloadNotifications = useCallback(async () => {
    const out = await call('/notifications', { token });
    if (out.ok) patch({ notifications: out.result.notifications ?? [] });
  }, [token, patch]);

  /** The cook's own shop, refetched whole after any change to it. */
  const reloadMyStore = useCallback(async () => {
    const mine = live.current.stores.find(
      (s) => String(s.kitchenId) === String(kitchenId),
    );
    if (mine) await ensureStore(mine.id, { force: true });
    else {
      const out = await call(`/stores?kitchenId=${encodeURIComponent(kitchenId)}`, { token });
      const found = out.ok ? (out.result.stores ?? [])[0] : null;
      if (found) await ensureStore(found.id, { force: true });
    }
  }, [kitchenId, token, ensureStore]);

  const reloadCart = useCallback(async () => {
    const out = await call('/cart', { token });
    if (out.ok) patch({ cart: out.result.cart ?? EMPTY.cart });
  }, [token, patch]);

  /* Every cart write answers with the repriced basket, so the reply is the
     refresh -- no second round trip to find out what the tap cost. */
  const cartWrite = useCallback(
    (path, { method = 'POST', body } = {}) =>
      write(path, {
        method,
        body,
        after: (result) => {
          if (result?.cart) patch({ cart: result.cart });
        },
      }),
    [write, patch],
  );

  /* ---------------- the value ---------------- */

  const value = useMemo(() => {
    const mealById = (id) =>
      state.meals.find((m) => String(m.id) === String(id)) ?? null;

    return {
      hydrated,
      loading,
      offline,
      refresh,
      state,

      wallet: state.wallet,
      ledger: state.ledger,
      meals: state.meals,
      orders: state.orders,

      /* ---- hydration, for the screens that show one thing ---- */
      ensureStore,
      ensureProduct,
      ensureRequest,
      ensureMeal,
      ensureOrder,
      storeLoaded: (storeId) => state.loadedStores.includes(String(storeId)),

      /* ---- meals: reads ---- */
      mealById,
      /* The server counts these against every order in the collection; the
         local fold could only ever count the page it was sent. */
      remaining: (meal) => meal?.remaining ?? null,
      confirmedCount: (mealId) => mealById(mealId)?.confirmed ?? 0,
      interestCount: (mealId) => mealById(mealId)?.interestCount ?? 0,
      ordersForMeal: (mealId) => L.ordersForMeal(state, mealId),
      isOpen: (meal) => L.mealOpen(state, meal, Date.now()),
      pendingEarnings: () => state.wallet.held ?? 0,

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

      mealsForKitchen: (id) =>
        state.meals.filter((m) => String(m.kitchenId) === String(id)),

      /**
       * The two sides of the same list.
       *
       * `/orders` returns every row this account is on -- the ones they
       * placed and, for a cook, the ones their kitchen has to cook. Which is
       * which is a field on the row, so these are a split rather than the
       * access control they used to be on the device: the server already
       * decided nothing else is in the array.
       */
      ordersForCustomer: () =>
        state.orders.filter(
          (o) => !identity?.customerKey || o.customerKey === identity.customerKey,
        ),

      ordersForKitchen: (id) =>
        state.orders.filter((o) => String(o.kitchenId) === String(id)),

      orderById: (id) => state.orders.find((o) => String(o.id) === String(id)) ?? null,

      notificationsFor: (audience) =>
        state.notifications.filter((nt) => nt.audience === audience),
      unreadFor: (audience) =>
        state.notifications.filter((nt) => nt.audience === audience && !nt.read).length,

      /* ---- meals: writes ---- */
      publishMeal: (meal, notifyNearby) =>
        write('/meals', { body: { ...meal, notifyNearby }, after: reloadMeals }),
      closeMeal: (mealId) => write(`/meals/${mealId}/close`, { after: reloadMeals }),
      cancelMeal: (mealId, reason) =>
        write(`/meals/${mealId}/cancel`, {
          body: { reason },
          after: async () => {
            await Promise.all([reloadMeals(), reloadOrders(), reloadWallet()]);
          },
        }),
      toggleInterest: (mealId) =>
        write(`/meals/${mealId}/interest`, { after: reloadMeals }),
      confirmOrder: (mealId, customer) =>
        write(`/meals/${mealId}/confirm`, {
          body: customer,
          after: async () => {
            await Promise.all([reloadMeals(), reloadOrders(), reloadWallet()]);
          },
        }),
      advanceOrder: (orderId) =>
        write(`/orders/${orderId}/advance`, { after: reloadOrders }),
      confirmReceived: (orderId) =>
        write(`/orders/${orderId}/received`, {
          after: async () => {
            await Promise.all([reloadOrders(), reloadWallet(), reloadNotifications()]);
          },
        }),
      cancelOrder: (orderId, by, reason) =>
        write(`/orders/${orderId}/cancel`, {
          body: { by, reason },
          after: async () => {
            await Promise.all([reloadOrders(), reloadWallet()]);
          },
        }),
      topUp: (amount, method) =>
        write('/wallet/topup', { body: { amount, method }, after: reloadWallet }),
      markRead: (audience) =>
        write('/notifications/read', { body: { audience }, after: reloadNotifications }),
      clearNotifications: (audience) =>
        write('/notifications/clear', { body: { audience }, after: reloadNotifications }),

      /* ---- cook stores: reads ---- */
      stores: state.stores,
      products: state.products,
      storeForKitchen: (id) => S.storeForKitchen(state, id),
      storeById: (id) => S.storeById(state, id),
      categoriesOf: (storeId) => S.categoriesOf(state, storeId),
      productsOf: (storeId, categoryId) => S.productsOf(state, storeId, categoryId),
      productById: (id) => S.productById(state, id),
      /* The server computes this off the same three fields and sends it on
         the product, so the badge, the button and the checkout refusal are
         one reading rather than three. */
      availability: (product, store) => product?.availability ?? S.availability(product, store),
      unitPriceOf: S.unitPriceOf,
      storeOverview: (store) =>
        state.overviews[String(store?.id)] ?? S.storeOverview(state, store),
      pendingPreorders: () => state.preorders,
      storeOrders: (storeId) =>
        state.orders.filter((o) => o.kind === 'store' && String(o.storeId) === String(storeId)),

      /** Shops a customer at `origin` can be delivered from, nearest first. */
      storesNearby: (origin) =>
        state.stores
          .map((store) => ({
            store,
            km:
              origin && typeof store.lat === 'number'
                ? distanceKm(origin, { lat: store.lat, lng: store.lng })
                : null,
            /* Counted server-side across the whole shelf; counting the
               products loaded here would say "0 items" for every shop the
               customer has not opened yet. */
            products:
              store.productCount ??
              state.products.filter((p) => String(p.storeId) === String(store.id) && p.active)
                .length,
          }))
          .filter(({ store, km }) => deliversTo(store, km))
          .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)),

      /* ---- cook stores: the basket ---- */
      cartOf: () => state.cart.lines,
      priceCart: () => state.cart,

      /* ---- cook stores: writes ---- */
      saveStore: (id, patchBody) =>
        write('/stores/mine', { body: patchBody, after: reloadMyStore }),
      toggleStoreOpen: () => write('/stores/mine/open', { after: reloadMyStore }),
      addCategory: (storeId, name, emoji) =>
        write('/stores/mine/categories', { body: { name, emoji }, after: reloadMyStore }),
      updateCategory: (categoryId, patchBody) =>
        write(`/categories/${categoryId}`, {
          method: 'PATCH',
          body: patchBody,
          after: reloadMyStore,
        }),
      removeCategory: (categoryId) =>
        write(`/categories/${categoryId}/remove`, { after: reloadMyStore }),
      moveCategory: (categoryId, delta) =>
        write(`/categories/${categoryId}/move`, { body: { delta }, after: reloadMyStore }),
      saveProduct: ({ productId, patch: body }) =>
        write('/stores/mine/products', {
          body: { ...body, productId },
          after: reloadMyStore,
        }),
      removeProduct: (productId) =>
        write(`/products/${productId}/remove`, { after: reloadMyStore }),
      setStock: (productId, stock) =>
        write(`/products/${productId}/stock`, { body: { stock }, after: reloadMyStore }),
      toggleProduct: (productId) =>
        write(`/products/${productId}/toggle`, { after: reloadMyStore }),
      togglePreorder: (productId) =>
        write(`/products/${productId}/preorder-toggle`, { after: reloadMyStore }),

      addToCart: (key, productId, qty, option) =>
        cartWrite('/cart', { body: { productId, qty, option } }),
      setCartQty: (key, lineKey, qty) =>
        cartWrite('/cart', { method: 'PATCH', body: { key: lineKey, qty } }),
      removeFromCart: (key, lineKey) =>
        cartWrite('/cart/remove', { body: { key: lineKey } }),
      clearCart: () => cartWrite('/cart/clear'),

      checkout: (key, customer) =>
        write('/store-checkout', {
          body: customer,
          after: async () => {
            await Promise.all([reloadCart(), reloadOrders(), reloadWallet()]);
          },
        }),
      acceptPreorder: (orderId) =>
        write(`/preorders/${orderId}/accept`, {
          after: async () => {
            await Promise.all([reloadOrders(), reloadMyStore()]);
          },
        }),
      rejectPreorder: (orderId, reason) =>
        write(`/preorders/${orderId}/reject`, {
          body: { reason },
          after: async () => {
            await Promise.all([reloadOrders(), reloadWallet()]);
          },
        }),

      /* ---- categories, as data ---- */
      taxonomy: state.taxonomy,
      categoryById: (id) =>
        state.taxonomy.find((c) => String(c.id) === String(id)) ?? null,
      categoryByKey: (key) => state.taxonomy.find((c) => c.key === key) ?? null,

      /* ---- food requests: reads ---- */
      requests: state.requests,
      offers: state.offers,
      requestById: (id) => R.requestById(state, id),
      requestsForCustomer: () => state.requests,
      requestsForCook: () => state.requests,
      offersForRequest: (requestId) => R.offersForRequest(state, requestId),
      /** A cook's own offer, and never anybody else's -- enforced server-side. */
      offerForCook: (requestId) =>
        state.offers.find((o) => String(o.requestId) === String(requestId)) ?? null,
      offerSummary: (requestId) =>
        state.summaries[String(requestId)] ?? { count: 0, low: null, high: null },

      /**
       * Kitchens a broadcast should reach.
       *
       * The server recomputes and freezes this onto the request when it is
       * filed -- it is the layer that knows where every kitchen is. This is
       * the app's preview of that answer, used to tell the customer how many
       * cooks will see the request before they commit to filing it.
       */
      eligibleKitchens: (origin) =>
        state.stores
          .filter((s) => isOpenNow(s))
          .filter((s) => {
            if (!origin || typeof s.lat !== 'number') return true;
            return deliversTo(s, distanceKm(origin, { lat: s.lat, lng: s.lng }));
          })
          .map((s) => String(s.kitchenId)),

      /* ---- food requests: writes ---- */
      createRequest: (request) =>
        write('/requests', { body: { request }, after: reloadRequests }),
      cancelRequest: (requestId) =>
        write(`/requests/${requestId}/cancel`, { after: reloadRequests }),
      submitOffer: (requestId, cook, price, note, prepTime) =>
        write(`/requests/${requestId}/offers`, {
          body: { price, note, prepTime },
          after: async () => {
            await Promise.all([reloadRequests(), ensureRequest(requestId)]);
          },
        }),
      withdrawOffer: (offerId) =>
        write(`/offers/${offerId}/withdraw`, { after: reloadRequests }),
      selectOffer: (requestId, offerId) =>
        write(`/requests/${requestId}/select`, {
          body: { offerId },
          after: () => ensureRequest(requestId),
        }),
      counterOffer: (offerId, by, amount) =>
        write(`/offers/${offerId}/counter`, {
          body: { amount },
          after: reloadRequests,
        }),
      acceptPrice: (offerId) =>
        write(`/offers/${offerId}/accept`, { after: reloadRequests }),
      payForRequest: (requestId, customer) =>
        write(`/requests/${requestId}/pay`, {
          body: customer,
          after: async () => {
            await Promise.all([reloadRequests(), reloadOrders(), reloadWallet()]);
          },
        }),
      declineRequest: (requestId) =>
        write(`/requests/${requestId}/decline`, { after: reloadRequests }),
      rejectOffer: (offerId, reason) =>
        write(`/offers/${offerId}/reject`, { body: { reason }, after: reloadRequests }),
    };
  }, [
    state,
    hydrated,
    loading,
    offline,
    kitchenId,
    identity,
    refresh,
    write,
    cartWrite,
    ensureStore,
    ensureProduct,
    ensureRequest,
    ensureMeal,
    ensureOrder,
    reloadMeals,
    reloadOrders,
    reloadWallet,
    reloadRequests,
    reloadNotifications,
    reloadMyStore,
    reloadCart,
  ]);

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce() {
  const ctx = useContext(CommerceContext);
  if (!ctx) throw new Error('useCommerce must be used inside CommerceProvider');
  return ctx;
}
