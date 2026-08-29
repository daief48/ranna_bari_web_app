import 'server-only';

import { cookies } from 'next/headers';
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { backend, BackendError } from './backend';
import { can, type Role } from './domain';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSession,
  readSession,
  type Session,
} from './auth-shared';

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/* The token primitives live in `auth-shared` so the custom server and the
   request gate can verify a session without pulling in cookies or Prisma. */
export { SESSION_COOKIE, createSession, readSession };
export type { Session };

/* ------------------------------------------------------------------ *
 * passwords
 * ------------------------------------------------------------------ */

/**
 * scrypt, stored as `salt:hash`.
 *
 * Node's own crypto rather than bcrypt: no native build step, which matters
 * on a Windows dev box, and scrypt is memory-hard where bcrypt is not.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  // Lengths must match before timingSafeEqual, which throws on a mismatch.
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

/* ------------------------------------------------------------------ *
 * session
 * ------------------------------------------------------------------ */

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** The signed-in operator, or null. */
export async function currentUser(): Promise<Session | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * The signed-in operator, or throw.
 *
 * Every server action starts here. Middleware already redirects an
 * unauthenticated browser, but an action can be POSTed directly and must not
 * trust that it was.
 */
export async function requireUser(): Promise<Session> {
  const user = await currentUser();
  if (!user) throw new Error('admin-unauthenticated');
  return user;
}

/**
 * The signed-in operator, or throw unless they hold `capability`.
 *
 * Authorisation is a server decision. A hidden button is a courtesy; this is
 * the actual rule.
 */
export async function requireCapability(capability: string): Promise<Session> {
  const user = await requireUser();
  if (!can(user.role, capability)) {
    throw new Error(`admin-forbidden:${capability}`);
  }
  return user;
}

/* ------------------------------------------------------------------ *
 * sign-in
 * ------------------------------------------------------------------ */

export type SignInResult =
  /* The backend's own token, not a re-signed copy: it is what the cookie
     carries and what the chat socket is opened with. */
  | { ok: true; session: Session; token: string }
  | { ok: false; error: string; needsTotp?: boolean };

/**
 * Sign in, against the backend.
 *
 * The operator lived in the panel's own database and this function checked
 * the password here. Both moved: the backend holds the account, hashes the
 * password, enforces TOTP, stamps `lastLoginAt` and issues the session — and
 * the token it returns is the one this panel then presents on every admin
 * request *and* on the chat socket.
 *
 * That last part is why the move mattered rather than being tidiness. The
 * desk authenticates its WebSocket with this token; while the panel minted
 * its own, the backend could not read it, so a message sent from the app
 * reached the database and never reached the open desk. It only appeared on
 * refresh, because a refresh is a fresh read.
 *
 * The returned token is handed back rather than the session alone, because
 * the cookie has to carry the backend's own token — a re-signed copy would
 * put the two realms back out of step.
 */
export async function signIn(
  email: string,
  password: string,
  totp?: string,
): Promise<SignInResult> {
  try {
    const out = await backend<{ token: string; session: Session }>('/auth/sign-in', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password, ...(totp ? { totp } : {}) },
      /* No actor header: nobody is signed in yet, and this is the one admin
         route that authenticates rather than authorises. */
      actor: null,
    });

    return { ok: true, session: out.session, token: out.token };
  } catch (error) {
    if (error instanceof BackendError) {
      /* One message for "no such account" and "wrong password" — the backend
         collapses them for the same reason, so that distinguishing them
         cannot tell an attacker which emails are real. `needsTotp` is not a
         leak: it is only ever returned once the password was right. */
      const needsTotp = /totp|authenticator/i.test(error.message);
      return {
        ok: false,
        error: needsTotp
          ? 'Enter your authenticator code.'
          : 'Those details do not match an active account.',
        needsTotp,
      };
    }
    return {
      ok: false,
      error: 'The backend is not answering. Start it and try again.',
    };
  }
}

/* ------------------------------------------------------------------ *
 * TOTP
 * ------------------------------------------------------------------ */

/** A new base32 secret for enrolment, plus the otpauth:// URI for the QR. */
export async function newTotpSecret(email: string) {
  const { Secret, TOTP } = await import('otpauth');
  const secretValue = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: 'RannaBari Admin',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secretValue,
  });
  return { secret: secretValue.base32, uri: totp.toString() };
}

export async function verifyTotp(base32: string, token: string): Promise<boolean> {
  try {
    const { Secret, TOTP } = await import('otpauth');
    const totp = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(base32),
    });
    // window:1 tolerates one 30s step of clock drift either way.
    return totp.validate({ token: token.replace(/\s/g, ''), window: 1 }) !== null;
  } catch {
    return false;
  }
}
