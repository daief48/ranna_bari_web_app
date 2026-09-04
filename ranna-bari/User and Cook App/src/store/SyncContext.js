import React, { createContext, useCallback, useContext, useMemo } from 'react';

const SyncContext = createContext(null);

/**
 * What is left of pushing device-built state upward: nothing.
 *
 * This module used to mirror two things. Orders went first: they are created
 * by the server now, and the id the app holds is the server's own, so there is
 * no second id space to reconcile and nothing to replay.
 *
 * The kitchen followed, and it is worth saying why, because removing an
 * upward push looks like removing a safety net.
 *
 * `syncKitchen` posted the device's copy of the kitchen to `/kitchens/mine`
 * whenever `isVerified` or the kitchen's id changed. That made sense while a
 * cook's kitchen was built on the handset and existed nowhere else. It stopped
 * making sense when the kitchen became a server row that `reload()` reads:
 * from then on the push could only ever send back what the server had just
 * handed over — except in the one case where it could not, which is the case
 * that mattered.
 *
 * `KitchenContext` caches the kitchen in AsyncStorage and does not drop it on
 * sign-out. So a device whose previous cook had a kitchen still held it, and a
 * *new* cook registering on that device tripped this effect the moment they
 * verified: the stale cache went up, `registerKitchen` upserts on the account,
 * and the new kitchen was created carrying the previous one's name and the
 * previous one's photographs. A cook who had typed their own name and chosen
 * their own pictures found somebody else's on every screen, and nothing in
 * the app had asked them for either.
 *
 * `ensureKitchen` exists for the registration job and does it correctly — it
 * asks the server before it writes, which is exactly the guard this had none
 * of. It is called from the signup screen and from the root layout, so there
 * was never a case only this covered.
 *
 * What remains is one pass-through the chat launcher calls.
 */
export function SyncProvider({ children }) {
  /**
   * The server's id for an order.
   *
   * Kept as a function, and kept async, because the chat launcher calls it
   * that way — but there is nothing left to look up. An order id in this app
   * is the server's id, because the server is where the order was created.
   */
  const serverOrderId = useCallback(async (orderId) => orderId ?? null, []);

  const value = useMemo(() => ({ serverOrderId }), [serverOrderId]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}
