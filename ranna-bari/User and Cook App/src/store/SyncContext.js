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

import { api, hasServer, ApiError } from '../lib/server';
import { useSession } from './SessionContext';
import { useOrders } from './OrdersContext';
import { useKitchen } from './KitchenContext';

const MAP_KEY = 'rannabari_order_server_ids';

const SyncContext = createContext(null);

/**
 * Telling the server about what happened on the device.
 *
 * The app places orders into AsyncStorage and always has. That is not a
 * limitation to be fixed — it is why the thing works on a plane — and none of
 * this changes it. The device is still where an order is created.
 *
 * But a chat between a customer and their cook needs the server to know,
 * independently, that the order is real and who is on it. Otherwise "message
 * the kitchen" is a string anybody can post at any kitchen. So orders are
 * *mirrored* here: created locally, announced upward, and the server's id for
 * each one is remembered so chat can name it.
 *
 * Everything is idempotent on the app's own order code, which means the queue
 * can retry blindly and a double-sync is free. That is the same contract the
 * chat outbox runs on, for the same reason: a phone's network is not a thing
 * you can reason about, only retry through.
 */
export function SyncProvider({ children }) {
  const { token, isVerified } = useSession();
  const { orders } = useOrders();
  const { kitchen } = useKitchen();

  /** local order code -> server order id */
  const [serverIds, setServerIds] = useState({});
  const [serverKitchenId, setServerKitchenId] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const busyRef = useRef(false);
  const lastRunRef = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(MAP_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setServerIds(parsed);
      })
      .catch(() => {});
  }, []);

  const remember = useCallback((additions) => {
    if (!Object.keys(additions).length) return;
    setServerIds((prev) => {
      const next = { ...prev, ...additions };
      AsyncStorage.setItem(MAP_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

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
          specialty: kitchen.specialty,
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
   * Push any order the server has not been told about.
   *
   * Only orders this device placed as a customer — a cook's queue is the same
   * rows from the other side, and sending them again would claim the cook
   * placed them.
   */
  const syncOrders = useCallback(async () => {
    if (!token || busyRef.current) return;

    const pending = orders.filter((order) => !serverIds[order.id] && !order.isDemo);
    if (!pending.length) return;

    busyRef.current = true;
    setSyncing(true);

    try {
      const out = await api('/orders', {
        method: 'POST',
        token,
        body: {
          orders: pending.map((order) => ({
            code: order.id,
            kind: 'cod',
            chefId: String(order.chefId ?? ''),
            chefName: order.chefName,
            title: order.items?.[0]?.name,
            image: order.items?.[0]?.image,
            items: order.items,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            platformFee: order.platformFee,
            total: order.total,
            status: order.status,
            contact: order.contact,
            address: order.address,
            createdAt: order.createdAt,
            history: order.history,
          })),
        },
      });

      const learned = {};
      for (const row of out.results ?? []) {
        if (row.ok && row.code && row.orderId) learned[row.code] = row.orderId;
        /* A refusal is remembered as a refusal rather than retried forever.
           The usual cause is a kitchen the server has never heard of — a cook
           who has not registered theirs — and that will not change by asking
           again in ten seconds. */
        else if (row.code) learned[row.code] = null;
      }
      remember(learned);
    } catch (error) {
      // Network. Leave everything unsynced; the next trigger tries again.
      if (!(error instanceof ApiError) || error.retryable) return;
    } finally {
      busyRef.current = false;
      setSyncing(false);
    }
  }, [token, orders, serverIds, remember]);

  /**
   * Sync everything, at most once every few seconds.
   *
   * Triggered by the things that change what needs syncing rather than by a
   * timer: signing in, placing an order, opening a chat.
   */
  const sync = useCallback(async () => {
    if (!isVerified || !hasServer) return;
    if (Date.now() - lastRunRef.current < 3000) return;
    lastRunRef.current = Date.now();

    await syncKitchen();
    await syncOrders();
  }, [isVerified, syncKitchen, syncOrders]);

  // Verifying, or placing an order, is the moment there is something to say.
  useEffect(() => {
    if (isVerified) sync();
  }, [isVerified, orders.length, kitchen?.id, sync]);

  /**
   * The server's id for a local order, syncing first if it has to.
   *
   * This is what the chat launcher calls. Returning null rather than throwing
   * lets the caller say something useful — the order has not reached the
   * server yet — instead of showing an error about an order the customer can
   * see in front of them.
   */
  const serverOrderId = useCallback(
    async (localId) => {
      const known = serverIds[localId];
      if (known) return known;
      if (known === null) return null; // refused before; do not spin

      lastRunRef.current = 0; // this one is worth jumping the throttle for
      await sync();

      const raw = await AsyncStorage.getItem(MAP_KEY).catch(() => null);
      const map = raw ? JSON.parse(raw) : {};
      return map[localId] ?? null;
    },
    [serverIds, sync],
  );

  const value = useMemo(
    () => ({
      serverIds,
      serverKitchenId,
      syncing,
      sync,
      syncKitchen,
      serverOrderId,
    }),
    [serverIds, serverKitchenId, syncing, sync, syncKitchen, serverOrderId],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}
