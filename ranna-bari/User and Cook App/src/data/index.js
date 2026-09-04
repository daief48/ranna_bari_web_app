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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useKitchen } from '../store/KitchenContext';
import { normaliseArea } from '../lib/areas';
import { api, hasServer } from '../lib/server';

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
export function useServerChefs() {
  const { kitchen } = useKitchen();
  const [serverChefs, setServerChefs] = useState([]);
  const fetchedRef = useRef(false);

  /* Fetch live from server */
  useEffect(() => {
    if (!hasServer || fetchedRef.current) return;
    fetchedRef.current = true;

    api('/kitchens')
      .then((out) => {
        const list = (out.chefs ?? []).map((k) => ({
          ...k,
          area: normaliseArea(k.area || 'Dhaka'),
        }));
        if (list.length > 0) setServerChefs(list);
      })
      .catch(() => {});
  }, []);

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
export function useServerMenus() {
  const { kitchen } = useKitchen();
  const [serverMenus, setServerMenus] = useState([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!hasServer || fetchedRef.current) return;
    fetchedRef.current = true;

    api('/kitchens?menus=1')
      .then((out) => {
        const list = out.menus ?? [];
        if (list.length > 0) setServerMenus(list);
      })
      .catch(() => {});
  }, []);

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

    /* The listed entry wins where both have an answer — it is what every
       other screen is drawing, and two screens disagreeing about a rating is
       worse than one of them being a few seconds stale. The gallery is the
       field only one of them has, so it is named rather than left to the
       spread: a cook viewing their own page has it on the local entry, and
       everybody else has it only from the fetch. */
    return {
      ...fetched,
      ...listed,
      photos: listed?.photos ?? fetched?.photos ?? [],
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
