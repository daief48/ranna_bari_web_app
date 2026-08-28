import { SignJWT, jwtVerify } from 'jose';

import type { Role } from './domain';

/**
 * The operator-session pieces that have to work outside the Next bundle.
 *
 * Three callers need them and only one is a normal server component:
 *
 *   - `proxy.ts`, the request gate
 *   - `server.ts`, the custom server, authenticating a WebSocket upgrade
 *   - `lib/auth.ts`, which adds the cookie jar and the database
 *
 * So this module carries no `server-only`, touches no cookies and opens no
 * database — just `jose` and a secret. Everything that needs a request
 * context lives in `lib/auth.ts`, which still has the guard.
 */

export const SESSION_COOKIE = 'rb_admin_session';

/** Eight hours — one shift. */
export const SESSION_MAX_AGE = 60 * 60 * 8;

export type Session = {
  sub: string;
  email: string;
  name: string;
  role: Role;
};

export function sessionSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or too short. Set a 32+ character secret in .env.',
    );
  }
  return new TextEncoder().encode(value);
}

export async function createSession(user: Session): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(sessionSecret());
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/** Pull the session cookie out of a raw `Cookie:` header. */
export function sessionCookieFrom(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
