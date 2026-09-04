/**
 * The two things about a kitchen that only its cook may read.
 *
 * Both are fetched where they are shown rather than kept in `KitchenContext`
 * beside the kitchen itself. That context is loaded on every cold start by
 * every screen in the panel, and neither of these is needed to run a service:
 * a cook opens their reviews when they wonder why the score moved, and their
 * payouts when they wonder whether Sunday's money arrived. Putting them in
 * the always-loaded object would buy two requests on every launch for two
 * screens most sessions never open.
 */
import { useCallback, useEffect, useState } from 'react';

import { call, hasServer } from '../lib/server';
import { useSession } from '../store/SessionContext';

/**
 * One cook-scoped GET, with the three states a screen actually has to draw.
 *
 * `loaded` is separate from `data.length` on purpose. "No reviews yet" and
 * "we have not asked yet" are different sentences and only one of them is
 * ever true at a time; a list that renders its empty state while the request
 * is still in flight tells a cook with forty reviews that they have none.
 */
function useCookResource(path, key) {
  const { token, getToken, isVerified } = useSession();

  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const bearer = getToken() || token;
    if (!bearer || !hasServer) return;

    setBusy(true);
    try {
      const out = await call(path, { token: bearer });
      /* Left alone on a failure. Replacing a list that is on screen with an
         empty one because the network blinked reads as "your reviews were
         deleted", which is the one thing it never means. */
      if (out.ok) {
        setData(out.result?.[key] ?? []);
        setLoaded(true);
      }
    } finally {
      setBusy(false);
    }
  }, [path, key, token, getToken]);

  useEffect(() => {
    if (isVerified) reload();
  }, [isVerified, reload]);

  return { data, loaded, busy, reload };
}

/**
 * What customers wrote, newest first.
 *
 * A cook could read their score and not one word behind it — `rating` and
 * `reviewCount` were on the wire and the reviews were not. A number moving
 * from 4.8 to 4.1 tells them something happened; only the words say what.
 */
export function useCookReviews() {
  const { data, loaded, busy, reload } = useCookResource('/kitchens/mine/reviews', 'reviews');
  return { reviews: data, loaded, busy, reload };
}

/**
 * Money that actually left the platform, as opposed to money owed.
 *
 * The earnings screen adds up delivered orders and calls the total a payout,
 * which is the cook's *balance* wearing the word. This is the other thing: a
 * run an operator marked paid, the method it went by, and when.
 */
export function useCookPayouts() {
  const { data, loaded, busy, reload } = useCookResource('/kitchens/mine/payouts', 'payouts');
  return { payouts: data, loaded, busy, reload };
}
