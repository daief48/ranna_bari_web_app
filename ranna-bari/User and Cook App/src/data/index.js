/**
 * The web build fetches these three files over HTTP at runtime (`js/app.js`
 * DB map). Bundling them instead keeps the same shape and the same records,
 * so every screen reads exactly the data the HTML pages did.
 *
 * On top of that sits one record the bundle cannot hold: the kitchen of the
 * cook signed in on this device. It lives in KitchenContext because it has to
 * be writable, and the hooks below merge it in so Browse, Map and the kitchen
 * page see one list and never learn the difference. A dish a cook adds in the
 * cook panel is on the customer side the moment they switch modes.
 *
 * `useServerChefs` and `useServerMenus` are the live equivalents: they fetch
 * from the backend and fall back to the bundled data when the server is
 * unreachable. Both follow the same offline-first pattern as the rest of the
 * app: show what you have, update when the server answers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import chefs from './chefs.json';
import menus from './menus.json';
import reviews from './reviews.json';
import { useKitchen } from '../store/KitchenContext';
import { normaliseArea } from '../lib/areas';
import { api, hasServer } from '../lib/server';

export { chefs, menus, reviews };

/* ---------------- static lookups, over the bundled data only ---------------- */

export const getChef = (id) => chefs.find((c) => String(c.id) === String(id));

export const getMenu = (chefId) =>
  menus.find((m) => String(m.chefId) === String(chefId))?.items ?? [];

export const getReviews = (chefId) =>
  reviews.filter((r) => String(r.chefId) === String(chefId));

/** Areas present in the bundled data, for the browse-screen picker. */
export const AREAS = ['all', ...Array.from(new Set(chefs.map((c) => c.area)))];

/** Aggregate score for the testimonials header chip. */
export const reviewSummary = () => {
  const total = reviews.reduce((s, r) => s + r.rating, 0);
  return {
    average: reviews.length ? total / reviews.length : 0,
    count: reviews.length,
  };
};

/* ---------------- live lookups, bundled data + the local kitchen ---------------- */

/**
 * Strip the cook-only fields off a kitchen record so what reaches a customer
 * surface is shaped exactly like a row of chefs.json — nothing downstream
 * should have to branch on where a chef came from.
 */
const asChef = (kitchen) => {
  const { dishes, nextDishSeq, createdAt, ownerName, ...chef } = kitchen;
  /* The cook's area came from a reverse geocode, which answers with a postal
     address. Left alone it put "Lane 11 East, 1212 Dhaka, Bangladesh" into
     the area filter next to "Dhanmondi" — a filter of one, matching nothing
     anyone would think to look for. Normalising here rather than only at
     signup also repairs kitchens already saved on the device. */
  return { ...chef, area: normaliseArea(chef.area) };
};

/**
 * Every kitchen a customer can see — live from the server, local cook first.
 *
 * Delegates to `useServerChefs` which fetches from MongoDB with bundled JSON
 * as the offline fallback. All screens that imported `useChefs` now get live
 * data without any change at the call site.
 */
export function useChefs() {
  return useServerChefs();
}

/**
 * Every menu — live from the server, local kitchen menu merged in.
 *
 * Delegates to `useServerMenus` which fetches kitchens with their dishes in
 * one request. Bundled menus.json is the offline fallback.
 */
export function useMenus() {
  return useServerMenus();
}

/** One kitchen by id — checks server data first, then bundled. */
export function useChef(id) {
  return useServerChef(id);
}

/**
 * A kitchen's menu — live from server.
 *
 * The local cook's kitchen always shows only available dishes; server menus
 * are whatever the backend returned.
 */
export function useMenu(chefId) {
  return useServerMenu(chefId);
}

/**
 * One dish and the kitchen that cooks it — searched across live menus.
 *
 * A dish id is only unique in the context of its menu, so the lookup walks
 * the full (server) menu list rather than indexing by dish id.
 */
export function useDish(id) {
  const allMenus = useServerMenus();
  const allChefs = useServerChefs();

  return useMemo(() => {
    if (!id) return null;
    const key = String(id);
    for (const menu of allMenus) {
      const dish = (menu.items ?? []).find((d) => String(d.id) === key);
      if (!dish) continue;
      const chef = allChefs.find((c) => String(c.id) === String(menu.chefId));
      return chef ? { dish, chef } : null;
    }
    return null;
  }, [id, allMenus, allChefs]);
}

/**
 * Areas for the browse picker — derived from live server kitchen list.
 *
 * Delegates to `useServerAreas` which includes all MongoDB kitchens, not just
 * the twenty the bundle ships with.
 */
export function useAreas() {
  return useServerAreas();
}


/* ------------------------------------------------------------------ *
 * Live server hooks — backend data with bundled fallback
 * ------------------------------------------------------------------ */

const CHEFS_CACHE_KEY = 'rannabari_server_chefs';
const MENUS_CACHE_KEY = 'rannabari_server_menus';

/**
 * Every kitchen from the server, with the local cook's kitchen merged in.
 *
 * On first render returns the bundled list (or cached server list) so the
 * screen is never blank. Updates in the background when the server answers.
 *
 * The local kitchen leads the list — on this device it is the one kitchen
 * whose menu the cook can edit, and it should be first regardless of rating.
 */
export function useServerChefs() {
  const { kitchen } = useKitchen();
  const [serverChefs, setServerChefs] = useState(null);
  const fetchedRef = useRef(false);

  /* Restore cached server list on mount */
  useEffect(() => {
    AsyncStorage.getItem(CHEFS_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setServerChefs(parsed);
      })
      .catch(() => {});
  }, []);

  /* Fetch from server */
  useEffect(() => {
    if (!hasServer || fetchedRef.current) return;
    fetchedRef.current = true;

    api('/kitchens')
      .then((out) => {
        const list = (out.chefs ?? []).map((k) => ({
          ...k,
          area: normaliseArea(k.area || 'Dhaka'),
        }));
        setServerChefs(list);
        AsyncStorage.setItem(CHEFS_CACHE_KEY, JSON.stringify(list)).catch(() => {});
      })
      .catch(() => {
        /* Network down — bundled/cached data stays */
      });
  }, []);

  return useMemo(() => {
    const base = serverChefs ?? chefs;
    if (!kitchen) return base;
    const { dishes, nextDishSeq, createdAt, ownerName, ...localChef } = kitchen;
    const asChef = { ...localChef, area: normaliseArea(localChef.area) };
    return [asChef, ...base.filter((c) => String(c.id) !== String(kitchen.id))];
  }, [serverChefs, kitchen]);
}

/**
 * Menus from the server (kitchens + their dishes), local kitchen merged in.
 *
 * Uses `?menus=1` to get both chefs and their dishes in one request.
 */
export function useServerMenus() {
  const { kitchen } = useKitchen();
  const [serverMenus, setServerMenus] = useState(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(MENUS_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setServerMenus(parsed);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasServer || fetchedRef.current) return;
    fetchedRef.current = true;

    api('/kitchens?menus=1')
      .then((out) => {
        const list = out.menus ?? [];
        setServerMenus(list);
        AsyncStorage.setItem(MENUS_CACHE_KEY, JSON.stringify(list)).catch(() => {});
      })
      .catch(() => {});
  }, []);

  return useMemo(() => {
    const base = serverMenus ?? menus;
    if (!kitchen) return base;
    const localMenu = { chefId: kitchen.id, items: kitchen.dishes.filter((d) => d.available) };
    return [localMenu, ...base.filter((m) => String(m.chefId) !== String(kitchen.id))];
  }, [serverMenus, kitchen]);
}

/**
 * One kitchen by id, checking server data first, then bundled.
 */
export function useServerChef(id) {
  const allChefs = useServerChefs();
  return useMemo(() => {
    if (!id) return null;
    return allChefs.find((c) => String(c.id) === String(id)) ?? null;
  }, [allChefs, id]);
}

/**
 * One kitchen's menu from server data.
 */
export function useServerMenu(chefId) {
  const allMenus = useServerMenus();
  return useMemo(() => {
    if (!chefId) return [];
    return allMenus.find((m) => String(m.chefId) === String(chefId))?.items ?? [];
  }, [allMenus, chefId]);
}

/**
 * Areas from server kitchens (includes all MongoDB kitchens, not just bundled ones).
 */
export function useServerAreas() {
  const allChefs = useServerChefs();
  return useMemo(
    () => [
      'all',
      ...Array.from(new Set(allChefs.map((c) => c.area))).sort((a, b) =>
        a.localeCompare(b),
      ),
    ],
    [allChefs],
  );
}
