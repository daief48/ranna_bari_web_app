/*
 * No `server-only` guard, deliberately.
 *
 * `server.ts` runs outside the Next bundle and has to authenticate a
 * WebSocket upgrade before it will hand out a socket, so it imports this
 * module directly — and `server-only` throws in that context.
 *
 * What keeps this off a client instead is that it opens the database:
 * importing it into a browser bundle fails on Prisma long before anything
 * here could leak.
 */
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, randomInt, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { db } from './db';

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * Authentication for app accounts — customers and cooks.
 *
 * Deliberately separate from `lib/auth.ts`, which authenticates operators.
 * The two must never be interchangeable: an admin session opening a customer
 * endpoint, or a customer token reaching the panel, is the kind of thing that
 * is obvious in hindsight and invisible in a shared module. Different secret,
 * different claim shape, different verifier.
 *
 * The app has nothing today. `signIn(demoAccount(id))` builds an account out
 * of whatever string was typed and discards the password. That is fine for a
 * demo on one device, and unusable the moment two strangers can message each
 * other — a chat is exactly where impersonation pays.
 *
 * Phone plus a one-time code, not a password: the account is already keyed on
 * a phone number, this is Bangladesh, and a password is one more thing to
 * lose.
 */

const TOKEN_TTL_DAYS = 30;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
/** How many codes one number may ask for in an hour. */
const OTP_MAX_PER_HOUR = 5;

function secret(): Uint8Array {
  const value = process.env.APP_AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      'APP_AUTH_SECRET is missing or too short. Set a 32+ character secret in .env.',
    );
  }
  return new TextEncoder().encode(value);
}

/* ------------------------------------------------------------------ *
 * phone numbers
 * ------------------------------------------------------------------ */

/**
 * One canonical form for a Bangladeshi mobile number: `+8801XXXXXXXXX`.
 *
 * People type `01712...`, `8801712...`, `+8801712...` and `01712-345678`.
 * All four are the same handset, and a chat that treats them as four accounts
 * is a chat where half the messages go nowhere.
 */
export function normalisePhone(input: string): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');

  // 01712345678 (11) → drop the leading 0
  // 8801712345678 (13) → already has the country code
  // 1712345678 (10) → bare national number
  let national: string;
  if (digits.length === 13 && digits.startsWith('880')) national = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return null;

  // Every BD mobile is 1 followed by an operator digit (3-9) and eight more.
  if (!/^1[3-9]\d{8}$/.test(national)) return null;
  return `+880${national}`;
}

/** "+8801712345678" → "+8801712•••678", for anything an operator can see. */
export const maskPhone = (phone: string) =>
  phone.length < 8 ? phone : `${phone.slice(0, 8)}•••${phone.slice(-3)}`;

/* ------------------------------------------------------------------ *
 * one-time codes
 * ------------------------------------------------------------------ */

async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(code, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyCode(code: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = await scrypt(code, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export type OtpResult =
  | { ok: true; expiresAt: Date; devCode?: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Issue a code.
 *
 * There is no SMS provider wired in, so in development the code comes back in
 * the response and is printed to the server log. In production that branch is
 * off and the code only exists in the message — `SMS_PROVIDER` gates it, and
 * it defaults to off so a missing env var fails closed.
 */
export async function requestOtp(
  rawPhone: string,
  ip?: string | null,
): Promise<OtpResult> {
  const phone = normalisePhone(rawPhone);
  if (!phone) return { ok: false, error: 'That is not a Bangladeshi mobile number.' };

  const hourAgo = new Date(Date.now() - 3_600_000);
  const recent = await db.otpChallenge.count({
    where: { phone, createdAt: { gte: hourAgo } },
  });
  if (recent >= OTP_MAX_PER_HOUR) {
    return {
      ok: false,
      error: 'Too many codes requested. Try again in an hour.',
      retryAfterSeconds: 3600,
    };
  }

  /* Any code still outstanding for this number is spent. Two live codes for
     one handset doubles the guessing surface for no benefit. */
  await db.otpChallenge.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  // randomInt is the CSPRNG. Math.random() here would be guessable.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await db.otpChallenge.create({
    data: { phone, codeHash: await hashCode(code), expiresAt, ip: ip ?? null },
  });

  const live = process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== 'none';
  if (live) {
    // A real provider goes here. Failing to send must fail the request rather
    // than leaving somebody waiting for a code that was never sent.
    throw new Error(`SMS provider "${process.env.SMS_PROVIDER}" is not implemented yet.`);
  }

  console.log(`[otp] ${phone} → ${code} (dev mode; no SMS provider configured)`);
  return { ok: true, expiresAt, devCode: code };
}

export type VerifyResult =
  | { ok: true; token: string; account: AppIdentity; expiresAt: Date }
  | { ok: false; error: string };

/**
 * Spend a code and hand back a token.
 *
 * Creates the account on first verification: a phone that proves it holds the
 * handset *is* the account. Nothing else about a person is worth blocking a
 * sign-in on.
 */
export async function verifyOtp(
  rawPhone: string,
  code: string,
  device?: { name?: string; platform?: string },
): Promise<VerifyResult> {
  const phone = normalisePhone(rawPhone);
  if (!phone) return { ok: false, error: 'That is not a Bangladeshi mobile number.' };

  const challenge = await db.otpChallenge.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  // One message for "no code outstanding" and "wrong code". Telling them
  // apart tells an attacker which numbers have a sign-in in flight.
  const generic = 'That code is wrong or has expired.';
  if (!challenge) return { ok: false, error: generic };

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await db.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, error: 'Too many wrong tries. Ask for a new code.' };
  }

  if (!(await verifyCode(code.replace(/\D/g, ''), challenge.codeHash))) {
    await db.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: generic };
  }

  await db.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  /**
   * Find the account this handset already belongs to, or make one.
   *
   * `customerKey` is whatever the app derived first — the app's own rule is
   * `(email || phone).toLowerCase()`, so a cook who signed up with an email
   * has an email key with their phone in another column. Keying purely on
   * the phone would hand that cook a brand-new empty account on their first
   * verification, detaching them from their own kitchen and every order they
   * ever cooked. So the phone column is searched first, and only somebody
   * genuinely new gets an account keyed on their number.
   */
  const existing = await db.account.findFirst({
    where: { OR: [{ phone }, { customerKey: phone }] },
    // Oldest wins, so a duplicate created by an earlier bug never steals the
    // real account's history.
    orderBy: { createdAt: 'asc' },
    include: { kitchen: { select: { id: true, name: true, suspended: true } } },
  });

  const account = existing
    ? await db.account.update({
        where: { id: existing.id },
        data: { phone, phoneVerifiedAt: new Date(), signedInAt: new Date() },
        include: { kitchen: { select: { id: true, name: true, suspended: true } } },
      })
    : await db.account.create({
        data: {
          customerKey: phone,
          role: 'user',
          name: '',
          phone,
          phoneVerifiedAt: new Date(),
          signedInAt: new Date(),
        },
        include: { kitchen: { select: { id: true, name: true, suspended: true } } },
      });

  if (account.suspended) {
    return { ok: false, error: 'This account is suspended. Contact support.' };
  }

  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000);
  const tokenId = randomBytes(16).toString('hex');

  await db.appSession.create({
    data: {
      accountId: account.id,
      tokenId,
      device: device?.name ?? '',
      platform: device?.platform ?? '',
      expiresAt,
    },
  });

  const identity = toIdentity(account, account.kitchen);
  const token = await mintToken(identity, tokenId, account.tokenVersion, expiresAt);

  return { ok: true, token, account: identity, expiresAt };
}

/* ------------------------------------------------------------------ *
 * tokens
 * ------------------------------------------------------------------ */

export type AppIdentity = {
  accountId: string;
  customerKey: string;
  role: 'user' | 'cook';
  name: string;
  phone: string;
  /** Set only when this account owns a kitchen. */
  kitchenId: string | null;
  kitchenName: string | null;
};

type AccountRow = {
  id: string;
  customerKey: string;
  role: string;
  name: string;
  phone: string | null;
  tokenVersion: number;
};

function toIdentity(
  account: AccountRow,
  kitchen?: { id: string; name: string; suspended: boolean } | null,
): AppIdentity {
  return {
    accountId: account.id,
    customerKey: account.customerKey,
    role: account.role === 'cook' ? 'cook' : 'user',
    name: account.name,
    phone: account.phone ?? '',
    // A suspended kitchen is not a kitchen this token can act as.
    kitchenId: kitchen && !kitchen.suspended ? kitchen.id : null,
    kitchenName: kitchen && !kitchen.suspended ? kitchen.name : null,
  };
}

async function mintToken(
  identity: AppIdentity,
  tokenId: string,
  tokenVersion: number,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({
    key: identity.customerKey,
    role: identity.role,
    kid: identity.kitchenId,
    v: tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.accountId)
    .setJti(tokenId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
}

/**
 * Turn a token back into who is holding it.
 *
 * Four things have to hold, and the signature is only the first. A revoked
 * session, a bumped `tokenVersion` and a suspended account all have to invalidate
 * a token that is otherwise perfectly valid — otherwise "suspend this account"
 * means "suspend it in thirty days".
 */
export async function identify(token: string | undefined): Promise<AppIdentity | null> {
  if (!token) return null;

  let payload;
  try {
    ({ payload } = await jwtVerify(token, secret()));
  } catch {
    return null;
  }

  const tokenId = payload.jti;
  if (!tokenId) return null;

  const session = await db.appSession.findUnique({
    where: { tokenId: String(tokenId) },
    include: {
      account: {
        include: { kitchen: { select: { id: true, name: true, suspended: true } } },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const account = session.account;
  if (!account || account.suspended) return null;
  if (account.tokenVersion !== Number(payload.v ?? 0)) return null;

  /* Touched at most once a minute. Writing on every message would make a
     busy chat a write per keystroke-batch on a row nobody reads. */
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await db.appSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return toIdentity(account, account.kitchen);
}

/** Read the bearer token off a request. */
export function bearerFrom(request: Request): string | undefined {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return undefined;
  return header.slice(7).trim() || undefined;
}

/** Identify the caller of an HTTP request, or null. */
export const identifyRequest = (request: Request) => identify(bearerFrom(request));

/** Sign one device out. The row stays so a stolen token can be traced. */
export async function revokeSession(tokenId: string) {
  await db.appSession.updateMany({
    where: { tokenId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Sign every device out at once. Used when an operator suspends an account. */
export async function revokeAllSessions(accountId: string) {
  await db.$transaction([
    db.account.update({
      where: { id: accountId },
      data: { tokenVersion: { increment: 1 } },
    }),
    db.appSession.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
