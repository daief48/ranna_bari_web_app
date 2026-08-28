import 'server-only';

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { db } from './db';
import { can, type Role } from './domain';

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export { SESSION_COOKIE } from './auth-shared';
import { SESSION_COOKIE } from './auth-shared';
const MAX_AGE = 60 * 60 * 8; // eight hours — one shift

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or too short. Set a 32+ character secret in .env.',
    );
  }
  return new TextEncoder().encode(value);
}

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

export type Session = {
  sub: string;
  email: string;
  name: string;
  role: Role;
};

export async function createSession(user: Session): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
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

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
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
  | { ok: true; session: Session }
  | { ok: false; error: string; needsTotp?: boolean };

export async function signIn(
  email: string,
  password: string,
  totp?: string,
): Promise<SignInResult> {
  const user = await db.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });

  // One message for "no such account" and "wrong password". Distinguishing
  // them tells an attacker which emails are real.
  if (!user || !user.active) return { ok: false, error: 'Those details do not match an active account.' };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: 'Those details do not match an active account.' };
  }

  if (user.totpEnabled && user.totpSecret) {
    if (!totp) return { ok: false, error: 'Enter your authenticator code.', needsTotp: true };
    const valid = await verifyTotp(user.totpSecret, totp);
    if (!valid) return { ok: false, error: 'That code is not valid.', needsTotp: true };
  }

  await db.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    ok: true,
    session: { sub: user.id, email: user.email, name: user.name, role: user.role as Role },
  };
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
