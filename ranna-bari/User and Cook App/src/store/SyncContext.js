import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, hasServer } from '../lib/server';
import { useSession } from './SessionContext';
import { useKitchen } from './KitchenContext';

const SyncContext = createContext(null);

/**
 * Telling the server about the one thing still built on the device.
 *
 * This module used to mirror orders upward. It no longer has to: orders are
 * created by the server now, and the id the app holds is the server's own, so
 * there is no second id space to reconcile and nothing to replay.
 *
 * A kitchen is different. A cook signing up builds one before there is any
 * account for it to belong to, and until it is registered here nothing can be
 * addressed to it — no order naming it, and no customer messaging it. So this
 * is what is left: one upward push, idempotent on the account, run when
 * signing in or when the local kitchen changes.
 */
export function SyncProvider({ children }) {
  const { token, isVerified } = useSession();
  const { kitchen } = useKitchen();

  const [serverKitchenId, setServerKitchenId] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const lastRunRef = useRef(0);

  /**
   * Register the cook's own kitchen, if there is one.
   *
   * A kitchen built offline has the id `local-1`, which is meaningful only on
   * the device that made it. Until it is registered here nothing can be
   * addressed to it — no order naming it can be recorded, and no customer can
   * message it.
   */
  const syncKitchen = useCallback(async () => {
    if (!token || !kitchen) return null;
    try {
      const out = await api('/kitchens/mine', {
        method: 'POST',
        token,
        body: {
          name: kitchen.name,
          ownerName: kitchen.ownerName,
          avatar: kitchen.avatar,
          coverImage: kitchen.coverImage,
          /*
           * The gallery, which this payload used to leave behind.
           *
           * Registration makes these photographs mandatory and the cook
           * kept seeing them afterwards, so nothing looked wrong — they
           * were in the account on the device. They just never left it.
           * Every kitchen in the database has photos: [], and the KYC queue
           * has been approving kitchens nobody could see.
           */
          photos: kitchen.photos,
          specialty: kitchen.specialty,
          /* Dropped for the same reason, since the picker went multi-select:
             the primary above is one of these, and the rest were lost. */
          specialties: kitchen.specialties,
          description: kitchen.description,
          tags: kitchen.tags,
          area: kitchen.area,
          lat: kitchen.lat,
          lng: kitchen.lng,
          deliveryRadiusKm: kitchen.deliveryRadiusKm,
          isOpen: kitchen.isOpen,
        },
      });
      setServerKitchenId(out.kitchenId);
      return out.kitchenId;
    } catch {
      return null;
    }
  }, [token, kitchen]);

  /**
   * Sync what still needs syncing.
   *
   * Orders used to be pushed from here: the app created them in AsyncStorage
   * and announced them upward, and `serverIds` mapped the device's code to
   * whatever the server called it. None of that applies now — `placeOrder`
   * posts to `/orders` and the id it gets back *is* the order's id, so there
   * are no longer two id spaces to reconcile.
   *
   * The kitchen is still pushed, because a cook's kitchen is still built on
   * the device before it exists anywhere else.
   */
  const sync = useCallback(async () => {
    if (!isVerified || !hasServer) return;
    if (Date.now() - lastRunRef.current < 3000) return;
    lastRunRef.current = Date.now();

    setSyncing(true);
    try {
      await syncKitchen();
    } finally {
      setSyncing(false);
    }
  }, [isVerified, syncKitchen]);

  useEffect(() => {
    if (isVerified) sync();
  }, [isVerified, kitchen?.id, sync]);

  /**
   * The server's id for an order.
   *
   * Kept as a function, and kept async, because the chat launcher calls it
   * that way — but there is nothing left to look up. An order id in this app
   * is the server's id, because the server is where the order was created.
   */
  const serverOrderId = useCallback(async (orderId) => orderId ?? null, []);

  const value = useMemo(
    () => ({
      serverKitchenId,
      syncing,
      sync,
      syncKitchen,
      serverOrderId,
    }),
    [serverKitchenId, syncing, sync, syncKitchen, serverOrderId],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}
