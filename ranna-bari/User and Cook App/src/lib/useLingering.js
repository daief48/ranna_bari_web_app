import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * Let a card that has just left a list say where it went.
 *
 * A board is cut by status, so moving an order one step makes it leave the
 * list it was in and arrive in another one the cook is not looking at. From
 * where they stand the card simply vanished: no word, no trail, and an empty
 * lane that reads as if the order had been lost. Nothing was wrong — the order
 * was fine, one tab over — and that is exactly why it needs saying.
 *
 * This watches a list. When a row disappears *and the order still exists with
 * a different status*, it keeps a short-lived stand-in at the same position —
 * "moved to Cooking" — and lets it go after `ms`. The reason is not the point:
 * the cook's own tap, the same order moved from another tab, a customer
 * closing it, and the poll catching up all look the same from here, and all
 * deserve the same courtesy.
 *
 * Switching to another view (`viewKey` changes) resets it: nothing "left" a
 * list that was never on screen.
 *
 * It does not keep a row whose order is gone, and it drops a stand-in the
 * moment its order is back in the list (a refused step that was put back).
 *
 * @param {object[]} rows       What the list shows now, in order.
 * @param {(id: string) => object | undefined} lookup  The order as it is now.
 * @param {string} viewKey      Identifies the list; a change resets.
 * @param {number} [ms]         How long a stand-in stays.
 * @returns {{ id: string, order: object, ghost?: {from: object} }[]}
 *   The rows, with stand-ins in the places their cards left. A row with a
 *   `ghost` is a stand-in: `order` is the order as it is now, `ghost.from` as
 *   it was.
 */
export function useLingering(rows, lookup, viewKey, ms = 2600) {
  const last = useRef({ key: viewKey, rows: [] });
  const timers = useRef(new Map());
  const [ghosts, setGhosts] = useState([]);

  const drop = useCallback((id) => {
    timers.current.delete(id);
    setGhosts((all) => all.filter((g) => g.id !== id));
  }, []);

  /* Before paint, so the stand-in replaces the card in the same frame it
     leaves — an effect after paint would show the gap it exists to hide. */
  useLayoutEffect(() => {
    const before = last.current;
    last.current = { key: viewKey, rows };

    if (before.key !== viewKey) {
      setGhosts((all) => (all.length ? [] : all));
      return;
    }

    const here = new Set(rows.map((o) => String(o.id)));
    const left = [];
    before.rows.forEach((o, index) => {
      const id = String(o.id);
      if (here.has(id)) return;
      const now = lookup(id);
      if (now && now.status !== o.status) left.push({ id, index, from: o, to: now });
    });
    if (!left.length) return;

    setGhosts((all) => [...all.filter((g) => !left.some((l) => l.id === g.id)), ...left]);
    for (const g of left) {
      clearTimeout(timers.current.get(g.id));
      timers.current.set(g.id, setTimeout(() => drop(g.id), ms));
    }
    // `lookup` is a fresh closure every render; the rows are what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, viewKey]);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    },
    [],
  );

  return useMemo(() => {
    const out = rows.map((order) => ({ id: String(order.id), order }));
    const here = new Set(out.map((r) => r.id));
    const stand = ghosts
      .filter((g) => !here.has(g.id))
      .sort((a, b) => a.index - b.index);
    for (const g of stand) {
      out.splice(Math.min(g.index, out.length), 0, {
        id: g.id,
        order: g.to,
        ghost: { from: g.from },
      });
    }
    return out;
  }, [rows, ghosts]);
}
