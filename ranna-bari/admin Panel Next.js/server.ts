/**
 * The server.
 *
 * Next 16 ships its own, and `next start` is enough for everything except the
 * one thing chat needs: a socket that stays open. A custom server is the
 * documented way to eject just far enough — Next still handles every HTTP
 * request; this file only claims the `upgrade` event.
 *
 * ## Why WebSocket and not SSE or polling
 *
 * React Native has `WebSocket` as a built-in global, polyfilled in
 * `setUpXHR.js`, working identically on iOS, Android and Expo web. It has no
 * `EventSource`, so server-sent events would mean shipping a polyfill to add
 * a transport that is one-directional anyway — sending would still be a POST.
 * Polling a chat is a request per user per second to say "nothing happened".
 *
 * ## What this means for hosting
 *
 * A long-lived socket needs a long-lived process. Vercel's serverless
 * functions cannot hold one, so this file is only meaningful on a host that
 * runs Node continuously — a VPS, Railway, Render, Fly. That is already the
 * shape this project is in, because SQLite needs a filesystem that survives
 * between requests too.
 */
import { createServer } from 'node:http';
import { parse } from 'node:url';
import { randomUUID } from 'node:crypto';

import next from 'next';
import { WebSocketServer, type WebSocket } from 'ws';

import { identify } from './lib/app-auth';
/* `auth-shared` rather than `lib/auth`: the latter carries the `server-only`
   guard and pulls in `next/headers`, neither of which survives outside the
   Next bundle. This file needs the token verifier and nothing else. */
import { readSession, sessionCookieFrom } from './lib/auth-shared';
import {
  publishToThread,
  register,
  subscribe,
  unregister,
  type ClientEvent,
  type SocketIdentity,
} from './lib/realtime';
import { threadFor, type Viewer } from './lib/logic/chat';

const port = parseInt(process.env.PORT || '3100', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

/** How long a socket may stay silent before we assume the network went away. */
const HEARTBEAT_MS = 30_000;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url ?? '', true));
  });

  /* `noServer` rather than `{ server }`: Next's dev server also uses the
     upgrade event, for hot reload over its own socket. Claiming every
     upgrade would break HMR, so this routes on pathname instead. */
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    const { pathname, query } = parse(request.url ?? '', true);

    if (pathname !== '/ws') return; // not ours — leave it for Next's HMR

    const identity = await authenticate(request.headers, query);
    if (!identity) {
      // 401 before the handshake completes, so a bad token never becomes a
      // socket we then have to police.
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      attach(ws, identity);
    });
  });

  server.listen(port, () => {
    console.log(
      `> RannaBari admin on http://localhost:${port}  ·  chat socket on ws://localhost:${port}/ws`,
    );
  });
});

/* ------------------------------------------------------------------ *
 * handshake
 * ------------------------------------------------------------------ */

/**
 * Decide who is on the other end, once.
 *
 * Two kinds of caller, two credentials. The app sends its bearer token —
 * browsers cannot set headers on a WebSocket, so Expo web falls back to a
 * query parameter, which is why the token is short-lived and revocable. An
 * operator arrives with the same session cookie the panel uses.
 *
 * Identity is fixed here and never re-read from the wire. A socket cannot
 * later claim to be somebody else, because nothing downstream ever asks it.
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
    const fromQuery = query.token;
    return typeof fromQuery === 'string' ? fromQuery : undefined;
  })();

  if (bearer) {
    const account = await identify(bearer);
    if (!account) return null;

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

  const cookie = typeof headers.cookie === 'string' ? headers.cookie : undefined;
  const operator = await readSession(sessionCookieFrom(cookie));
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
     TCP connection simply stops answering, and without this the server holds
     a dead entry that still looks deliverable. */
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
       message is an HTTP POST, not a frame: it has to be transactional, it
       has to be idempotent on `clientId`, and it has to be able to fail with
       a status the offline outbox can act on. A socket is for delivery, and
       trying to make it the write path is how you end up with messages that
       exist on one side of the wire and nowhere else. */
    if (event.type === 'subscribe' && typeof event.threadId === 'string') {
      const viewer = asViewer(identity);
      const thread = await threadFor(viewer, event.threadId);
      // Subscribing to a thread you are not on is simply ignored.
      if (thread) subscribe(id, event.threadId);
      return;
    }

    if (event.type === 'typing' && typeof event.threadId === 'string') {
      const viewer = asViewer(identity);
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

  ws.on('close', () => {
    clearInterval(heartbeat);
    unregister(id);
  });

  ws.on('error', () => {
    clearInterval(heartbeat);
    unregister(id);
  });
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
