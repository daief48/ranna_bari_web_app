import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Keep a screen current, and let somebody pull it down to say "now".
 *
 * Three ways a page gets fresh data, all funnelled through one call so they
 * cannot fight each other:
 *
 *   - **On focus.** Coming back to a screen re-reads it. Navigating away and
 *     back is the most common way somebody asks for fresh data, and it used
 *     to hand them whatever was in memory from before.
 *   - **On a timer**, while the screen is the visible one.
 *   - **By hand**, from the pull-to-refresh spinner.
 *
 * ## Why the guard matters
 *
 * `running` is not politeness, it is the thing that keeps this from being a
 * request storm. The timer, a focus event and a pull can all land inside the
 * same second — a tab change while a poll is in flight does exactly that —
 * and every one of them calls the same `refresh`, which on the customer side
 * fans out to several endpoints. Without the flag those overlap, race to set
 * the same state, and the last one to answer wins regardless of which was
 * asked first. With it, a refresh already in flight absorbs the others.
 *
 * ## Why the interval is not a few seconds
 *
 * `ChatContext` polls at 6s because a conversation is worth that. A dashboard
 * is not: the same 6s across every screen would be ten times the traffic for
 * data that changes a handful of times an hour, on phones where the radio is
 * the battery. 30s is frequent enough that an order status or a wallet
 * balance is never meaningfully stale, and the timer is paused whenever the
 * screen is not focused or the app is not in the foreground — so a backgrounded
 * app polls nothing at all.
 *
 * The contexts already refresh themselves when the app returns to the
 * foreground (`CommerceContext`, `ChatContext`, `KitchenContext` each listen
 * for it), so this deliberately does not add a fourth foreground listener —
 * it only checks `AppState` to decide whether a tick should fire.
 */
export const LIVE_REFRESH_MS = 30_000;

export default function useLiveRefresh(
  refresh,
  { interval = LIVE_REFRESH_MS, enabled = true } = {},
) {
  const [refreshing, setRefreshing] = useState(false);

  /* The in-flight flag, as a ref rather than state: it gates the very next
     call, and a state update that lands a render later would be read stale by
     exactly the overlapping call it exists to stop. */
  const running = useRef(false);

  /* The callback, held in a ref so a screen may pass an inline arrow function
     without restarting the timer on every render. */
  const fn = useRef(refresh);
  fn.current = refresh;

  const run = useCallback(async (visible) => {
    if (!fn.current || running.current) return;
    running.current = true;
    /* Only a pull shows the spinner. A background tick that flashed it would
       make the page look like it was reloading under the reader's hands. */
    if (visible) setRefreshing(true);
    try {
      await fn.current();
    } catch {
      /* A failed refresh is the old data staying put, not an error to throw
         at somebody who did not ask for anything. */
    } finally {
      running.current = false;
      if (visible) setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(() => run(true), [run]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !fn.current) return undefined;

      /* Focus is itself a request for current data. */
      run(false);

      const id = setInterval(() => {
        if (AppState.currentState === 'active') run(false);
      }, interval);

      return () => clearInterval(id);
    }, [enabled, interval, run]),
  );

  /* A screen unmounting mid-refresh must not leave the flag set: the ref
     survives the unmount when the hook instance is reused by a remount. */
  useEffect(
    () => () => {
      running.current = false;
    },
    [],
  );

  return { refreshing, onRefresh };
}
