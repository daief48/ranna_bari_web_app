import { randomUUID } from 'node:crypto';
import { parse } from 'node:url';

import { WebSocketServer, type WebSocket } from 'ws';

import { buildApp } from './app.js';
import { connect, disconnect, supportsTransactions } from './config/db.js';
import { loadEnv } from './config/env.js';
import { identify } from './auth/app-auth.js';
import { readSession } from './auth/admin-auth.js';
import { threadFor, type Viewer } from './logic/chat.js';
import {
  publishToThread,
  register,
  subscribe,
  unregister,
  type ClientEvent,
  type SocketIdentity,
} from './realtime/hub.js';

/**
 * The process.
 *
 * Fastify handles every HTTP request; the WebSocket server claims only the
 * `upgrade` event on `/ws`. One process, one port, because the socket has to
 * see the same fan-out registry the HTTP handlers publish into.
 *
 * ## What this means for hosting
 *
 * A long-lived socket needs a long-lived process. Serverless functions cannot
 * hold one, so this only runs on a host that keeps Node up — a VPS, Railway,
 * Render, Fly. That is the same constraint MongoDB Atlas connection pooling
 * already implies.
 */

const HEARTBEAT_MS = 30_000;

async function main() {
  const env = loadEnv();

  await connect();

  if (!supportsTransactions()) {
    /* Loud, not fatal: a standalone mongod is a perfectly good local
       playground for reads. But every money transition will fail at commit,
       and finding that out from a customer is worse than from a log line. */
    console.warn(
      '[warn] This MongoDB is not a replica set. Transactions will fail — ' +
        'money transitions cannot work. Use Atlas or a local replica set.',
    );
  }

  const app = await buildApp();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  /* `noServer`, then route on pathname. Claiming every upgrade would break
     anything else that wants one. */
  const wss = new WebSocketServer({ noServer: true });

  app.server.on('upgrade', async (request, socket, head) => {
    const { pathname, query } = parse(request.url ?? '', true);
    if (pathname !== '/ws') return;

    const identity = await authenticate(request.headers, query);
    if (!identity) {
      // 401 before the handshake completes, so a bad token never becomes a
      // socket we then have to police.
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => attach(ws, identity));
  });

  console.log(
    `> RannaBari backend on http://localhost:${env.PORT}  ·  chat socket on ws://localhost:${env.PORT}/ws`,
  );

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} — closing`);
    wss.close();
    await app.close();
    await disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

/* ------------------------------------------------------------------ *
 * handshake
 * ------------------------------------------------------------------ */

/**
 * Decide who is on the other end, once.
 *
 * Two kinds of caller, two credentials. The app sends its bearer token —
 * browsers cannot set headers on a WebSocket, so Expo web falls back to a
 * query parameter, which is why the token is short-lived and revocable. An
 * operator arrives with the panel's session.
 *
 * Identity is fixed here and never re-read from the wire, so a socket cannot
 * later claim to be somebody else — nothing downstream ever asks it.
 */
async function authenticate(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, string | string[] | undefined>,
): Promise<SocketIdentity | null> {
  const bearer = (() => {
    const header = headers.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7).trim();
    }
    return typeof query.token === 'string' ? query.token : undefined;
  })();

  if (bearer) {
    const account = await identify(bearer);
    if (account) {
      if (account.role === 'cook' && account.kitchenId) {
        return {
          side: 'cook',
          kitchenId: account.kitchenId,
          customerKey: account.customerKey,
          name: account.kitchenName || account.name || 'Kitchen',
        };
      }
      return {
        side: 'customer',
        customerKey: account.customerKey,
        name: account.name || 'Customer',
      };
    }

    /* Not an app token. It may be an operator's — the panel connects with a
       bearer too, since it is not on this origin and has no cookie here. */
    const operator = await readSession(bearer);
    if (operator) return { side: 'admin', email: operator.email, name: operator.name };
    return null;
  }

  const cookie = typeof headers.cookie === 'string' ? headers.cookie : '';
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('rb_admin_session='))
    ?.slice('rb_admin_session='.length);

  const operator = await readSession(token);
  if (!operator) return null;
  return { side: 'admin', email: operator.email, name: operator.name };
}

/* ------------------------------------------------------------------ *
 * one connection
 * ------------------------------------------------------------------ */

function attach(ws: WebSocket, identity: SocketIdentity) {
  const id = randomUUID();
  register(id, ws, identity);

  /* Liveness. A phone that walks into a lift does not close its socket — the
     connection simply stops answering, and without this the server holds a
     dead entry that still looks deliverable. */
  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, HEARTBEAT_MS);

  ws.on('message', async (raw) => {
    let event: ClientEvent;
    try {
      event = JSON.parse(String(raw));
    } catch {
      return; // garbage in, silence out
    }

    if (event.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    /* Only two client events reach the server over the socket. Sending a
       message is an HTTP POST, not a frame: it has to be transactional,
       idempotent on `clientId`, and able to fail with a status the offline
       outbox can act on. A socket is for delivery. */
    const viewer = asViewer(identity);

    if (event.type === 'subscribe' && typeof event.threadId === 'string') {
      // Subscribing to a thread you are not on is simply ignored.
      if (await threadFor(viewer, event.threadId)) subscribe(id, event.threadId);
      return;
    }

    if (event.type === 'typing' && typeof event.threadId === 'string') {
      const thread = await threadFor(viewer, event.threadId);
      if (!thread) return;
      publishToThread(
        event.threadId,
        { customerKey: thread.customerKey, kitchenId: thread.kitchenId },
        { type: 'typing', threadId: event.threadId, side: identity.side, name: identity.name },
        id,
      );
    }
  });

  const close = () => {
    clearInterval(heartbeat);
    unregister(id);
  };
  ws.on('close', close);
  ws.on('error', close);
}

/** The socket's identity, in the shape the chat rules read. */
function asViewer(identity: SocketIdentity): Viewer {
  if (identity.side === 'admin') {
    return { side: 'admin', email: identity.email, name: identity.name };
  }
  if (identity.side === 'cook') {
    return {
      side: 'cook',
      kitchenId: identity.kitchenId,
      customerKey: identity.customerKey,
      name: identity.name,
    };
  }
  return { side: 'customer', customerKey: identity.customerKey, name: identity.name };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
