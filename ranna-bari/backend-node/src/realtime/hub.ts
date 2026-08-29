/**
 * The fan-out hub.
 *
 * Holds no database access and no secrets — just a registry of open sockets
 * and the rules for who is allowed to hear what.
 *
 * ## The one seam that matters
 *
 * `publish()` is the only thing that decides where an event goes. Today the
 * registry is a Map in this process, which is true and sufficient while there
 * is one instance. The moment there are two behind a load balancer it stops
 * being true — a message posted on A has to reach a socket held by B — and
 * `publish()` becomes a Redis PUBLISH with a subscriber on boot. Nothing else
 * should have to change, which is why nothing else touches the Maps.
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
 * The indexes make delivery O(recipients) rather than O(everyone connected) —
 * a support desk with two operators should not iterate ten thousand customer
 * sockets to deliver one reply.
 */
const connections = new Map<string, Connection>();
const byCustomer = new Map<string, Set<string>>();
const byKitchen = new Map<string, Set<string>>();
const admins = new Set<string>();

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
