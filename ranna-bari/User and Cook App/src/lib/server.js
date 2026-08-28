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

const PORT = 3100;

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
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || inferHost();

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
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
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
