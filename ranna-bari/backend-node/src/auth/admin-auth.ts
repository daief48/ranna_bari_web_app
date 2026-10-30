import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { AdminUser } from '../models/index.js';
import { loadEnv } from '../config/env.js';
import { can, type Role } from '../lib/domain.js';

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * Authentication for operators.
 *
 * The other realm. It shares no secret and no claim shape with `app-auth.ts`,
 * and `config/env.ts` refuses to boot if the two secrets are equal — one
 * secret would make an operator session verify as a customer token, which is
 * the exact confusion the split exists to prevent.
 */

const SESSION_TTL = 60 * 60 * 8; // eight hours — one shift

const secret = () => new TextEncoder().encode(loadEnv().ADMIN_AUTH_SECRET);

export type AdminSession = {
  sub: string;
  email: string;
  name: string;
  role: Role;
};

/* ------------------------------------------------------------------ *
 * passwords
 * ------------------------------------------------------------------ */

/**
 * scrypt, stored as `salt:hash`.
 *
 * Node's own crypto rather than bcrypt: no native build step, and scrypt is
 * memory-hard where bcrypt is not.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
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
 * sessions
 * ------------------------------------------------------------------ */

export async function createSession(user: AdminSession): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(secret());
}

/**
 * The operator as the database has them *now*, not as the token remembered
 * them.
 *
 * A session lives eight hours and a role change or a deactivation has to land
 * before it expires — an operator switched off at nine must not keep moving
 * money until five. So every admin request pays one indexed lookup: by `_id`
 * when the claim carries one, by the unique email when it does not (the panel
 * forwards whatever its cookie held, and a script may assert an email alone).
 *
 * A row that is there and inactive is refused outright. A row that is not
 * there is the caller's problem to decide: a token the backend itself issued
 * always has one, so `required` refuses; a panel-asserted actor is believed
 * only because the service token was valid, and a test or a script asserting
 * an email with no account behind it has always been let through on that
 * basis — `required: false` keeps that, and still takes the role from the
 * row whenever one exists.
 */
export async function resolveActor(
  claim: AdminSession,
  opts: { required: boolean },
): Promise<AdminSession | null> {
  const select = { email: 1, name: 1, role: 1, active: 1 } as const;
  const row = /^[a-f\d]{24}$/i.test(claim.sub)
    ? await AdminUser.findById(claim.sub).select(select).lean()
    : await AdminUser.findOne({ email: claim.email.trim().toLowerCase() }).select(select).lean();

  if (!row) return opts.required ? null : claim;
  if (row.active === false) return null;

  return {
    sub: String(row._id),
    email: row.email,
    name: row.name,
    role: row.role as Role,
  };
}

export async function readSession(token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    /* The signature proves who signed in; the row says whether they still
       may. Role comes from the row for the same reason — the token is a
       snapshot, and a demotion that waits for expiry is not a demotion. */
    return resolveActor(
      {
        sub: String(payload.sub),
        email: String(payload.email),
        name: String(payload.name),
        role: payload.role as Role,
      },
      { required: true },
    );
  } catch {
    return null;
  }
}

export type SignInResult =
  | { ok: true; token: string; session: AdminSession }
  | { ok: false; error: string; needsTotp?: boolean };

export async function signIn(
  email: string,
  password: string,
  totp?: string,
): Promise<SignInResult> {
  const user = await AdminUser.findOne({ email: email.trim().toLowerCase() });

  /* One message for "no such account" and "wrong password". Distinguishing
     them tells an attacker which emails are real. */
  const generic = 'Those details do not match an active account.';
  if (!user || !user.active) return { ok: false, error: generic };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: generic };
  }

  if (user.totpEnabled && user.totpSecret) {
    if (!totp) return { ok: false, error: 'Enter your authenticator code.', needsTotp: true };
    if (!(await verifyTotp(user.totpSecret, totp))) {
      return { ok: false, error: 'That code is not valid.', needsTotp: true };
    }
  }

  await AdminUser.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

  const session: AdminSession = {
    sub: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };

  return { ok: true, token: await createSession(session), session };
}

/* ------------------------------------------------------------------ *
 * service-to-service
 * ------------------------------------------------------------------ */

/**
 * The admin panel proving it is the admin panel.
 *
 * The panel forwards *who is acting* — an operator's email and role — and the
 * backend must not take its word for that without this. A compromised or
 * misconfigured panel should not be able to escalate by asserting a role, and
 * "the caller says they are finance" is not authorisation.
 */
export function isService(token: string | undefined): boolean {
  if (!token) return false;
  const expected = loadEnv().BACKEND_SERVICE_TOKEN;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  // Constant-time, and length-checked first because timingSafeEqual throws
  // on a mismatch rather than returning false.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True when this session may do `capability`. Authorisation lives here. */
export const may = (session: AdminSession | null, capability: string) =>
  !!session && can(session.role, capability);

/* ------------------------------------------------------------------ *
 * TOTP
 * ------------------------------------------------------------------ */

export async function newTotpSecret(email: string) {
  const { Secret, TOTP } = await import('otpauth');
  const value = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: 'RannaBari Admin',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: value,
  });
  return { secret: value.base32, uri: totp.toString() };
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
