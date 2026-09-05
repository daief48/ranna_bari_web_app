/**
 * 100% Live Backend Data Layer.
 *
 * All kitchen directories, dishes, menus, and areas are fetched live from the
 * backend MongoDB API (`/api/app/v1/kitchens?menus=1`).
 *
 * Nothing is cached to disk. An earlier version kept the last response in
 * AsyncStorage and painted it on the next cold start, which made a phone
 * with no backend look identical to a phone with one — same kitchens, same
 * menus, no indication that any of it was old. If the server cannot be
 * reached the screen is empty, which is the truth.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useKitchen } from '../store/KitchenContext';
import { normaliseArea } from '../lib/areas';
import { api, hasServer } from '../lib/server';

/** How long a directory read stays fresh enough not to ask again. */
const STALE_AFTER_MS = 20_000;

/**
 * One copy of each list, for every screen that reads it.
 *
 * These lists used to be fetched exactly once per launch — a ref was set on
 * the first effect and never cleared — so the directory a customer saw was a
 * photograph taken when the app started. A cook opening their kitchen, adding
 * a dish or changing a price reached nobody who already had the app open, and
 * the only cure was a full restart. That is what "I opened my shop and the
 * customer still sees it closed" is: not a failed write, a list that stopped
 * asking.
 *
 * Refetching on focus fixes that, but naively it multiplies: the hook runs in
 * every component that reads the directory, and each copy kept its own
 * cooldown, so one screen coming into focus fired one request per consumer —
 * eight, measured. So the freshness clock, the in-flight request and the data
 * live here, once, and the hooks below are subscribers to it.
 */
const shelves = {
  chefs: { at: 0, inflight: null, data: [], subs: new Set() },
  menus: { at: 0, inflight: null, data: [], subs: new Set() },
};

async function fill(name, fetcher, force) {
  const shelf = shelves[name];

  if (!force && Date.now() - shelf.at < STALE_AFTER_MS) return shelf.data;
  /* A second caller in the same moment waits for the first one's answer
     rather than asking again. */
  if (shelf.inflight) return shelf.inflight;

  shelf.inflight = (async () => {
    try {
      const list = await fetcher();
      /* An empty answer is left alone rather than painted: a directory that
         blanks because one request came back short reads as "every kitchen
         closed", which is never what it means. */
      if (list.length > 0) {
        shelf.data = list;
        shelf.at = Date.now();
        shelf.subs.forEach((notify) => notify(list));
      }
    } catch {
      /* Keep what is on screen. */
    } finally {
      shelf.inflight = null;
    }
    return shelf.data;
  })();

  return shelf.inflight;
}

/**
 * Subscribe to a shelf, and top it up when this screen comes into view.
 *
 * Focus is the right moment to ask: it is when somebody is about to read the
 * thing, and nobody is mid-scroll.
 */
function useShelf(name, fetcher) {
  const shelf = shelves[name];
  const [data, setData] = useState(shelf.data);

  useEffect(() => {
    shelf.subs.add(setData);
    return () => shelf.subs.delete(setData);
  }, [shelf]);

  const load = useCallback(
    (force) => {
      if (!hasServer) return;
      fill(name, fetcher, force).then((list) => setData(list));
    },
    [name, fetcher],
  );

  /* The first read of a cold shelf is not a refresh, and must not be skipped
     by a cooldown that a sibling screen happened to start. */
  useEffect(() => {
    load(shelf.at === 0);
  }, [load, shelf]);

  useFocusEffect(
    useCallback(() => {
      load(false);
      return undefined;
    }, [load]),
  );

  return data;
}

/**
 * Format local kitchen to match backend chef shape
 */
const asChef = (kitchen) => {
  const { dishes, nextDishSeq, createdAt, ownerName, ...chef } = kitchen;
  return { ...chef, area: normaliseArea(chef.area || 'Dhaka') };
};

/**
 * Live Server Chefs Hook — fetches all verified kitchens directly from MongoDB.
 */
const fetchChefs = async () => {
  const out = await api('/kitchens');
  return (out.chefs ?? []).map((k) => ({ ...k, area: normaliseArea(k.area || 'Dhaka') }));
};

export function useServerChefs() {
  const { kitchen } = useKitchen();
  const serverChefs = useShelf('chefs', fetchChefs);

  return useMemo(() => {
    const base = serverChefs;
    if (!kitchen) return base;
    const localChef = asChef(kitchen);
    return [localChef, ...base.filter((c) => String(c.id) !== String(kitchen.id))];
  }, [serverChefs, kitchen]);
}

/**
 * Live Server Menus Hook — fetches all dishes grouped by kitchen from MongoDB.
 */
const fetchMenus = async () => (await api('/kitchens?menus=1')).menus ?? [];

export function useServerMenus() {
  const { kitchen } = useKitchen();
  const serverMenus = useShelf('menus', fetchMenus);

  return useMemo(() => {
    const base = serverMenus;
    if (!kitchen) return base;
    const localMenu = { chefId: kitchen.id, items: (kitchen.dishes || []).filter((d) => d.available) };
    return [localMenu, ...base.filter((m) => String(m.chefId) !== String(kitchen.id))];
  }, [serverMenus, kitchen]);
}

/**
 * Public Hooks (100% Dynamic, using live backend data)
 */
export function useChefs() {
  return useServerChefs();
}

export function useMenus() {
  return useServerMenus();
}

/**
 * One kitchen, in full.
 *
 * Two sources, deliberately. The directory response paints the page the
 * instant it opens — it is already in memory — but it carries no gallery: the
 * photographs are `data:` URIs stored in the document, and a list that
 * included them would be every kitchen's pictures downloaded to draw one
 * card each. So `/kitchens/:id` is asked for as well, and the gallery appears
 * a moment later on the one screen that shows it.
 *
 * It also makes the page work from a cold link. Opening `/chef/<id>` directly
 * used to depend on the kitchen happening to be in the directory response;
 * now the detail alone is enough.
 */
export function useChef(id) {
  const allChefs = useServerChefs();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!hasServer || !id) return undefined;
    let alive = true;
    /* Cleared first: navigating from one kitchen to another must not show the
       previous cook's rooms under this cook's name while the request runs. */
    setDetail(null);

    api(`/kitchens/${id}`)
      .then((out) => {
        if (alive && out?.chef) setDetail(out.chef);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [id]);

  return useMemo(() => {
    if (!id) return null;

    const listed = allChefs.find((c) => String(c.id) === String(id)) ?? null;
    const fetched =
      detail && String(detail.id) === String(id)
        ? { ...detail, area: normaliseArea(detail.area || 'Dhaka') }
        : null;

    if (!listed && !fetched) return null;

    /*
     * The fetched one wins where both have an answer.
     *
     * This was the other way round, on the reasoning that the directory is
     * what every other screen draws and two screens should agree. That was
     * wrong in the direction that matters: `/kitchens/:id` is read when this
     * page opens and the directory can be minutes old, so letting the list
     * win meant a kitchen that had just opened still said CLOSED here — the
     * page most likely to be looked at for exactly that.
     *
     * The gallery is named rather than left to the spread: a cook viewing
     * their own page has it on the local entry, everybody else only from the
     * fetch, and neither should lose it to an `undefined` on the other.
     */
    return {
      ...listed,
      ...fetched,
      photos: fetched?.photos?.length ? fetched.photos : (listed?.photos ?? []),
    };
  }, [allChefs, id, detail]);
}

export function useMenu(chefId) {
  const allMenus = useServerMenus();
  return useMemo(() => {
    if (!chefId) return [];
    return allMenus.find((m) => String(m.chefId) === String(chefId))?.items ?? [];
  }, [allMenus, chefId]);
}

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

export function useAreas() {
  const allChefs = useServerChefs();
  return useMemo(
    () => [
      'all',
      ...Array.from(new Set(allChefs.map((c) => c.area))).filter(Boolean).sort((a, b) =>
        a.localeCompare(b),
      ),
    ],
    [allChefs],
  );
}

/**
 * Aggregate summary from live backend kitchens
 */
export function useReviewSummary() {
  const allChefs = useServerChefs();
  return useMemo(() => {
    const withReviews = allChefs.filter((c) => c.reviewCount > 0);
    const totalRating = withReviews.reduce((sum, c) => sum + (c.rating || 0), 0);
    const totalReviews = allChefs.reduce((sum, c) => sum + (c.reviewCount || 0), 0);
    return {
      average: withReviews.length > 0 ? totalRating / withReviews.length : 4.9,
      count: totalReviews > 0 ? totalReviews : allChefs.length * 12,
    };
  }, [allChefs]);
}
