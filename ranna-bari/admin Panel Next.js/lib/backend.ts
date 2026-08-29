import 'server-only';

import { currentUser, type Session } from './auth';
import { errText } from './domain';

/**
 * The panel's client for `backend-node`.
 *
 * The panel is becoming a *client* of the backend rather than a second thing
 * that opens the database. Everything that used to reach for Prisma comes
 * through here instead, one module at a time.
 *
 * ## How the backend knows who is acting
 *
 * Two headers, and they do different jobs. `x-service-token` authenticates
 * *the panel* — it is a shared secret and the backend rejects the request
 * without it. `x-actor` then asserts *which operator* is behind this request,
 * and is only believed because the service token was valid.
 *
 * That split matters. If the backend took `x-actor` on its own, anybody who
 * could reach the port would be a superadmin, because "the caller says they
 * are finance" is not authorisation. There is a test for exactly that in
 * `backend-node/tests/api.test.ts`.
 *
 * Server-only, obviously: the service token is a credential, and a client
 * bundle that carried it would hand every visitor the whole platform.
 */

const BASE = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/** How long to wait before deciding the backend is not going to answer. */
const TIMEOUT_MS = 15_000;

export class BackendError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.code = code;
  }

  /** Anything that never reached the backend is worth retrying. A 4xx is not. */
  get retryable() {
    return this.status === 0 || this.status >= 500;
  }
}

function serviceToken(): string {
  const token = process.env.BACKEND_SERVICE_TOKEN;
  if (!token || token.length < 32) {
    throw new Error(
      'BACKEND_SERVICE_TOKEN is missing or too short. The backend will refuse every request.',
    );
  }
  return token;
}

/** The operator, base64 JSON, as the backend's `actorOf()` expects. */
const encodeActor = (user: Session) =>
  Buffer.from(
    JSON.stringify({ sub: user.sub, email: user.email, name: user.name, role: user.role }),
  ).toString('base64');

type Options = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  /** Pass a session explicitly where there is no request context to read one. */
  actor?: Session | null;
  /** Seconds of cache. Omit for anything that must be fresh. */
  revalidate?: number;
};

/**
 * One call to the backend.
 *
 * Everything is `/api/admin/v1/...`. The app-facing routes are deliberately
 * not reachable from here — they authenticate a customer, and the panel has
 * no business presenting itself as one.
 */
export async function backend<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const user = opts.actor === undefined ? await currentUser() : opts.actor;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE}/api/admin/v1${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        'x-service-token': serviceToken(),
        ...(user ? { 'x-actor': encodeActor(user) } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
      /* Reads may cache briefly; writes never do. An operator who presses a
         button and sees a stale list assumes the button did not work. */
      ...(opts.revalidate != null && (opts.method ?? 'GET') === 'GET'
        ? { next: { revalidate: opts.revalidate } }
        : { cache: 'no-store' as const }),
    });

    const payload = await response.json().catch(() => ({}) as Record<string, unknown>);

    if (!response.ok) {
      const code = String((payload as { error?: string }).error ?? 'server-error');
      const message = String((payload as { message?: string }).message ?? errText(code));
      throw new BackendError(message, response.status, code);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof BackendError) throw error;
    /* AbortError, a refused connection, DNS. The backend not being up is the
       overwhelmingly common case in development, so the message says so
       rather than leaving somebody reading a stack trace. */
    throw new BackendError(
      `Could not reach the backend at ${BASE}. Is it running?`,
      0,
      'backend-unreachable',
    );
  } finally {
    clearTimeout(timer);
  }
}

export const get = <T>(path: string, revalidate?: number) =>
  backend<T>(path, { method: 'GET', revalidate });

export const post = <T>(path: string, body?: unknown) =>
  backend<T>(path, { method: 'POST', body });

export const patch = <T>(path: string, body?: unknown) =>
  backend<T>(path, { method: 'PATCH', body });

/**
 * Is the backend there?
 *
 * Used by the pages that have migrated, so a dead backend degrades into a
 * banner rather than a stack trace on a blank screen.
 */
export async function backendUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const BACKEND_URL = BASE;
