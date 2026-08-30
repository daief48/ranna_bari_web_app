/**
 * The server.
 *
 * Next 16 ships its own, and `next start` is enough for everything except the
 * one thing chat needs: a socket that stays open. A custom server is the
 * documented way to eject just far enough — Next still handles every HTTP
 * request; this file only claims the `upgrade` event.
 *
 * ## What this socket is now
 *
 * It used to be a hub: it held its own registry of connections, read threads
 * out of the panel's database, and fanned messages out itself. That worked
 * while the panel *was* the server. It is not any more — the app authenticates
 * against `backend-node`, posts its messages there, and opens its own socket
 * there. So every message from a customer was published into the backend's
 * hub, and the panel's hub, having no publisher left, sat silent. An operator
 * with the desk open saw nothing until they reloaded the page, because a
 * reload is a fresh read and the read was never the broken part.
 *
 * So this is a relay. One desk connection in, one connection to the backend's
 * hub out, frames copied both ways without inspection. The panel is a client
 * of the backend here exactly as it is over HTTP.
 *
 * ## Why relay rather than let the browser connect to the backend
 *
 * The operator's session is an httpOnly cookie, which means page scripts
 * cannot read it — that is the point of the flag. A browser cannot set an
 * Authorization header on a WebSocket either, so a direct connection would
 * mean putting the token in a URL the page has to know, and a token the page
 * can read is a token that survives being stolen and replayed from anywhere.
 *
 * Relaying keeps it server-side. The upgrade arrives with the cookie, this
 * process reads it, and the token goes upstream in a header the browser never
 * sees.
 *
 * ## What this means for hosting
 *
 * A long-lived socket needs a long-lived process. Vercel's serverless
 * functions cannot hold one, so this file is only meaningful on a host that
 * runs Node continuously — a VPS, Railway, Render, Fly.
 */
import { createServer } from 'node:http';
import { parse } from 'node:url';

import next from 'next';
/* `WebSocket` as a value, not just a type: this file is a socket *client* as
   well as a server now, and needs the constructor. */
import { WebSocket, WebSocketServer } from 'ws';

/* `auth-shared` rather than `lib/auth`: the latter carries the `server-only`
   guard and pulls in `next/headers`, neither of which survives outside the
   Next bundle. This file needs the token verifier and nothing else. */
import { readSession, sessionCookieFrom } from './lib/auth-shared';

const port = parseInt(process.env.PORT || '3100', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

/** The backend's hub — the one place chat traffic actually lives. */
const BACKEND_WS = `${(process.env.BACKEND_URL ?? 'https://ranna-bari-backend.netlify.app')
  .replace(/\/$/, '')
  .replace(/^http/, 'ws')}/ws`;

/** How long a desk may stay silent before we assume the network went away. */
const HEARTBEAT_MS = 30_000;

/** How long to wait for the backend to accept the upstream connection. */
const UPSTREAM_TIMEOUT_MS = 10_000;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url ?? '', true));
  });

  /* `noServer` rather than `{ server }`: Next's dev server also uses the
     upgrade event, for hot reload over its own socket. Claiming every
     upgrade would break HMR, so this routes on pathname instead. */
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    const { pathname } = parse(request.url ?? '', true);

    if (pathname !== '/ws') return; // not ours — leave it for Next's HMR

    /* Only an operator gets through here. The app never connects to this
       origin — it holds the backend's address and goes straight there — so
       there is no app-token branch to keep, and a bearer arriving on this
       port is not something to start honouring. */
    const token = sessionCookieFrom(
      typeof request.headers.cookie === 'string' ? request.headers.cookie : undefined,
    );
    const operator = await readSession(token);

    if (!operator || !token) {
      // 401 before the handshake completes, so a bad session never becomes a
      // socket we then have to police.
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    /* Open the upstream leg *before* completing the handshake, so the desk's
       connected indicator means what it says. A socket that opens and then
       discovers it has nowhere to forward to would show a green dot over a
       dead line, which is worse than showing red. */
    let upstream: WebSocket;
    try {
      upstream = await connectUpstream(token);
    } catch {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (desk) => {
      relay(desk, upstream);
    });
  });

  server.listen(port, () => {
    console.log(
      `> RannaBari admin on http://localhost:${port}  ·  chat relayed to ${BACKEND_WS}`,
    );
  });
});

/* ------------------------------------------------------------------ *
 * upstream
 * ------------------------------------------------------------------ */

/**
 * Connect to the backend's hub as this operator.
 *
 * The token goes in an Authorization header rather than the query string.
 * Both work — the backend reads either, because Expo web has no way to set
 * headers — but a header stays out of access logs and out of anything that
 * records a URL, and here there is no browser limitation forcing the worse
 * option.
 */
function connectUpstream(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(BACKEND_WS, {
      headers: { authorization: `Bearer ${token}` },
    });

    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('backend-timeout'));
    }, UPSTREAM_TIMEOUT_MS);

    socket.once('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    /* A rejected upgrade — the backend down, or the session it will not
       accept — arrives as an error, not a close. Either way there is nothing
       to relay. */
    socket.once('error', (error) => {
      clearTimeout(timer);
      socket.terminate();
      reject(error);
    });
  });
}

/* ------------------------------------------------------------------ *
 * one connection
 * ------------------------------------------------------------------ */

/**
 * Copy frames between the desk and the backend until either end goes away.
 *
 * Deliberately not parsed. `subscribe`, `typing` and `ping` are the backend's
 * to answer, and it already does; re-implementing them here would be a second
 * set of rules to keep in step with the first. The one thing this leg adds is
 * liveness, because a desk on a laptop that gets closed does not send a close
 * frame — the connection simply stops answering, and without a heartbeat both
 * this socket and the upstream one leak.
 */
function relay(desk: WebSocket, upstream: WebSocket) {
  let alive = true;
  desk.on('pong', () => {
    alive = true;
  });

  const heartbeat = setInterval(() => {
    if (!alive) {
      desk.terminate();
      return;
    }
    alive = false;
    desk.ping();
  }, HEARTBEAT_MS);

  desk.on('message', (raw) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(String(raw));
  });

  upstream.on('message', (raw) => {
    if (desk.readyState === WebSocket.OPEN) desk.send(String(raw));
  });

  /* The two legs live and die together. Half a relay delivers nothing, and a
     desk left holding an open socket to a closed upstream would show itself
     as connected forever; closing lets the desk's own backoff reconnect. */
  const shut = () => {
    clearInterval(heartbeat);
    if (desk.readyState <= WebSocket.OPEN) desk.close();
    if (upstream.readyState <= WebSocket.OPEN) upstream.close();
  };

  desk.on('close', shut);
  desk.on('error', shut);
  upstream.on('close', shut);
  upstream.on('error', shut);
}
