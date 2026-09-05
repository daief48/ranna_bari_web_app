import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the server is, and how to talk to it.
 *
 * This is the app's first network dependency. Everything else in here runs
 * off AsyncStorage and works on a plane; chat cannot, so the whole module is
 * written on the assumption that the server is *usually* unreachable and the
 * app has to stay usable anyway.
 *
 * ## Finding the host in development
 *
 * A phone on the same wifi cannot reach `localhost` — that is the phone. Expo
 * already knows the machine's LAN address, because that is where it is
 * serving the bundle from, so the host is lifted off the packager URL rather
 * than hardcoded into a file somebody has to edit per machine.
 */

/**
 * The backend's port, not the admin panel's.
 *
 * This was 3100 when the panel was the only thing serving `/api/app/v1`.
 * `backend-node` owns that surface now and listens on 4000; the panel is a
 * client of it like everything else. Pointing the app at 3100 today reaches
 * a Next.js app that no longer answers for the whole API.
 */
const PORT = 4000;

function inferHost() {
  // Expo web: the app and the API can share an origin behind a proxy, but in
  // dev they are two ports on the same machine.
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    return `${location.protocol}//${location.hostname}:${PORT}`;
  }

  /* `hostUri` is "192.168.2.103:8081" — the machine serving this bundle,
     which is also the machine running the admin panel in development. */
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoClient?.hostUri;

  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : null;
  return host ? `http://${host}:${PORT}` : null;
}

/**
 * The API base.
 *
 * `EXPO_PUBLIC_API_URL` wins, so a real deployment points at a real host
 * without touching this file. Falling back to the packager's machine is a
 * development convenience and nothing more.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ||
  'https://ranna-bari-backend.netlify.app';

export const WS_URL = API_BASE
  ? `${API_BASE.replace(/^http/, 'ws')}/ws`
  : null;

/** True when there is somewhere to connect to at all. */
export const hasServer = !!API_BASE;

/* ------------------------------------------------------------------ *
 * fetch
 * ------------------------------------------------------------------ */

/** How long to wait before deciding the network is not going to answer. */
const TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.code = code ?? null;
    /* Anything that never reached the server can be retried by the outbox.
       A 4xx cannot — replaying a refused message just refuses again. */
    this.retryable = !status || status >= 500;
  }
}

/**
 * One request.
 *
 * Every failure comes back as an `ApiError` carrying the server's own error
 * code, so callers can branch on the same vocabulary the backend uses rather
 * than parsing sentences.
 */
/**
 * Who to tell when a token turns out to be dead.
 *
 * A set rather than one callback so a second subscriber cannot silently
 * replace the first, and module-level so `api` can reach it without every
 * caller having to thread a session through.
 */
const expiredWatchers = new Set();

/** Returns an unsubscribe, so a provider can clean up on unmount. */
export function onSessionExpired(fn) {
  expiredWatchers.add(fn);
  return () => expiredWatchers.delete(fn);
}

const notifyExpired = () => {
  expiredWatchers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* One bad listener must not stop the others, or swallow the request. */
    }
  });
};

export async function api(path, { method = 'GET', token, body, signal } = {}) {
  if (!API_BASE) {
    throw new ApiError('No server is configured.', {});
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Honour a caller's own cancellation as well as the timeout.
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${API_BASE}/api/app/v1${path}`, {
      method,
      headers: {
        /* Only when there is one. Half the writes in this app are a verb with
           no payload — mark a dish sold out, advance an order, empty the
           basket — and announcing a JSON body that was never sent makes the
           server reject the request before it reaches the handler. */
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      /*
       * A 401 on a request that carried a token means the token is dead, and
       * every other call this device makes is about to fail the same way.
       *
       * Only `/auth/me` used to notice, and only on a cold start — so a
       * session that died while the app was open (revoked, or the account
       * deleted out from under it) left somebody signed in on screen with
       * every action refused. The symptom is "I am logged in, why does
       * placing an order say unauthenticated": the app believed it, the
       * server did not.
       *
       * Announced rather than handled here, because this module knows nothing
       * about sessions. `SessionContext` subscribes and does the signing out.
       */
      if (response.status === 401 && token) notifyExpired();

      throw new ApiError(payload.message || 'That did not work.', {
        status: response.status,
        code: payload.error,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // AbortError, DNS failure, wifi that dropped mid-request.
    throw new ApiError('Could not reach the server.', {});
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* ------------------------------------------------------------------ *
 * verdicts
 * ------------------------------------------------------------------ */

/**
 * A request that answers instead of throwing.
 *
 * Every transition in `mealLogic`, `storeLogic` and `requestLogic` returns
 * `{ ok, result, error }`, and every screen branches on exactly that. The
 * backend was ported from those modules and answers in the same error
 * vocabulary — `meal-sold-out`, `wallet-low-balance`, `offer-not-your-turn` —
 * so a server refusal can be handed to the same `errorText()` the local
 * transition's refusal went to. This is the adapter that makes that true:
 * one shape in, one shape out, and no screen has to know which side decided.
 *
 * The one code the logic modules never produce is `network`, because on a
 * device the transition simply ran. It is separated out rather than folded
 * into a generic failure so a screen can say "you are offline" instead of
 * "that did not work", and so a caller can tell a refusal it should not retry
 * from a request that never arrived.
 */
export async function call(path, options = {}) {
  try {
    return { ok: true, result: await api(path, options) };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : null;
    return {
      ok: false,
      /* A refusal carries the server's own code; anything that never got an
         answer is the network, whatever the cause underneath. */
      error: code ?? 'network',
      message: error?.message ?? 'Could not reach the server.',
      status: error instanceof ApiError ? error.status : 0,
      retryable: error instanceof ApiError ? error.retryable : true,
    };
  }
}

/** `call`, for a request whose failure is not worth telling anybody about. */
export async function quiet(path, options = {}) {
  const out = await call(path, options);
  return out.ok ? out.result : null;
}
