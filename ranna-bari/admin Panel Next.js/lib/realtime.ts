/**
 * The fan-out hub.
 *
 * Deliberately *not* `server-only`: this module is imported both by Next
 * route handlers and by `server.ts`, which runs outside the Next bundle.
 * It holds no database access and no secrets — just a registry of open
 * sockets and the rules for who is allowed to hear what.
 *
 * ## Why a process-local registry
 *
 * One Node process serves both Next and the WebSocket upgrade, and the
 * database is SQLite, which is single-writer anyway. So "every connection I
 * need to reach is in this process" is true today, and a Map is the whole
 * implementation.
 *
 * It stops being true the moment there are two instances behind a load
 * balancer, because a message posted on instance A has to reach a socket held
 * by instance B. `publish()` is the single seam where that changes: swap its
 * body for a Redis `PUBLISH` and subscribe on boot. Nothing else in the
 * codebase knows this is in-memory.
 */

export type Side = 'customer' | 'cook' | 'admin';

/** Who a socket belongs to, decided once at handshake and never re-read. */
export type SocketIdentity =
  | { side: 'customer'; customerKey: string; name: string }
  | { side: 'cook'; kitchenId: string; customerKey: string; name: string }
  | { side: 'admin'; email: string; name: string };

/** What goes down the wire. */
export type ServerEvent =
  | { type: 'ready'; identity: { side: Side; name: string } }
  | { type: 'message'; threadId: string; message: unknown }
  | { type: 'thread'; thread: unknown }
  | { type: 'read'; threadId: string; side: Side; at: string }
  | { type: 'typing'; threadId: string; side: Side; name: string }
  | { type: 'presence'; side: Side; online: boolean }
  | { type: 'error'; error: string }
  | { type: 'pong' };

export type ClientEvent =
  | { type: 'subscribe'; threadId: string }
  | { type: 'typing'; threadId: string }
  | { type: 'ping' };

/** Anything that can be written to. Keeps `ws` out of this module's types. */
export type Sink = {
  send: (data: string) => void;
  readyState: number;
};

type Connection = {
  id: string;
  sink: Sink;
  identity: SocketIdentity;
  /** Threads this socket has opened. Typing events only go to these. */
  subscribed: Set<string>;
};

const OPEN = 1;

/**
 * Every live socket, and three indexes into it.
 *
 * The indexes are what make delivery O(recipients) rather than O(everyone
 * connected) — a support desk with two operators should not iterate ten
 * thousand customer sockets to deliver one reply.
 *
 * ## Why this hangs off globalThis
 *
 * There are two copies of this module in one process, and they are not the
 * same module. `server.ts` loads it through Node, and registers sockets into
 * it. The route handler that posts a message loads it through the Next
 * bundle, which resolved and compiled its own instance. Two instances mean
 * two Maps: the sender's copy is empty, `publish()` finds nobody, and every
 * message is delivered perfectly to zero recipients — with no error anywhere,
 * because writing to an empty set is not a failure.
 *
 * Parking the state on globalThis is what makes them one registry again. It
 * is the same trick `lib/db.ts` uses to keep one Prisma client across dev
 * reloads, for the same underlying reason: module identity is not process
 * identity.
 */
type Registry = {
  connections: Map<string, Connection>;
  byCustomer: Map<string, Set<string>>;
  byKitchen: Map<string, Set<string>>;
  admins: Set<string>;
};

const REGISTRY = Symbol.for('rannabari.realtime.registry');
const globalStore = globalThis as unknown as Record<symbol, Registry | undefined>;

const registry: Registry = (globalStore[REGISTRY] ??= {
  connections: new Map(),
  byCustomer: new Map(),
  byKitchen: new Map(),
  admins: new Set(),
});

const { connections, byCustomer, byKitchen, admins } = registry;

const addTo = (index: Map<string, Set<string>>, key: string, id: string) => {
  const bucket = index.get(key) ?? new Set<string>();
  bucket.add(id);
  index.set(key, bucket);
};

const removeFrom = (index: Map<string, Set<string>>, key: string, id: string) => {
  const bucket = index.get(key);
  if (!bucket) return;
  bucket.delete(id);
  if (bucket.size === 0) index.delete(key);
};

export function register(id: string, sink: Sink, identity: SocketIdentity) {
  connections.set(id, { id, sink, identity, subscribed: new Set() });

  if (identity.side === 'customer') addTo(byCustomer, identity.customerKey, id);
  if (identity.side === 'cook') {
    addTo(byKitchen, identity.kitchenId, id);
    // A cook is also a person, and their own support thread reaches them by
    // customerKey rather than by kitchen.
    addTo(byCustomer, identity.customerKey, id);
  }
  if (identity.side === 'admin') admins.add(id);

  send(id, { type: 'ready', identity: { side: identity.side, name: identity.name } });
}

export function unregister(id: string) {
  const connection = connections.get(id);
  if (!connection) return;

  const { identity } = connection;
  if (identity.side === 'customer') removeFrom(byCustomer, identity.customerKey, id);
  if (identity.side === 'cook') {
    removeFrom(byKitchen, identity.kitchenId, id);
    removeFrom(byCustomer, identity.customerKey, id);
  }
  if (identity.side === 'admin') admins.delete(id);

  connections.delete(id);
}

export const connectionCount = () => connections.size;

export function isOnline(target: { customerKey?: string; kitchenId?: string }) {
  if (target.customerKey && (byCustomer.get(target.customerKey)?.size ?? 0) > 0) return true;
  if (target.kitchenId && (byKitchen.get(target.kitchenId)?.size ?? 0) > 0) return true;
  return false;
}

export function subscribe(id: string, threadId: string) {
  connections.get(id)?.subscribed.add(threadId);
}

function send(id: string, event: ServerEvent) {
  const connection = connections.get(id);
  if (!connection || connection.sink.readyState !== OPEN) return;
  try {
    connection.sink.send(JSON.stringify(event));
  } catch {
    // A socket that throws on write is a socket that is already gone. The
    // close handler will unregister it; dropping this frame is correct.
  }
}

/**
 * Deliver an event to the two sides of a thread, and to the operators.
 *
 * `exceptConnection` skips the socket that caused the event — the sender
 * already rendered their own message optimistically, and echoing it back
 * makes it appear twice for the length of one round trip.
 */
export function publish(
  audience: { customerKey?: string | null; kitchenId?: string | null; admins?: boolean },
  event: ServerEvent,
  exceptConnection?: string,
) {
  const targets = new Set<string>();

  if (audience.customerKey) {
    for (const id of byCustomer.get(audience.customerKey) ?? []) targets.add(id);
  }
  if (audience.kitchenId) {
    for (const id of byKitchen.get(audience.kitchenId) ?? []) targets.add(id);
  }
  // Operators hear everything: support is the third side of every thread.
  if (audience.admins !== false) {
    for (const id of admins) targets.add(id);
  }

  if (exceptConnection) targets.delete(exceptConnection);
  for (const id of targets) send(id, event);
}

/** Only the sockets that have this thread open. Typing is not worth a badge. */
export function publishToThread(
  threadId: string,
  audience: { customerKey?: string | null; kitchenId?: string | null },
  event: ServerEvent,
  exceptConnection?: string,
) {
  const targets = new Set<string>();
  if (audience.customerKey) {
    for (const id of byCustomer.get(audience.customerKey) ?? []) targets.add(id);
  }
  if (audience.kitchenId) {
    for (const id of byKitchen.get(audience.kitchenId) ?? []) targets.add(id);
  }
  for (const id of admins) targets.add(id);
  if (exceptConnection) targets.delete(exceptConnection);

  for (const id of targets) {
    if (connections.get(id)?.subscribed.has(threadId)) send(id, event);
  }
}

export const identityOf = (id: string) => connections.get(id)?.identity ?? null;
