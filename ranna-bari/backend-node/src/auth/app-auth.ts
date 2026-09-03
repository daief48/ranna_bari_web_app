import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, randomInt, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { Account, AppSession, Kitchen, OtpChallenge } from '../models/index.js';
import { loadEnv, smsIsLive } from '../config/env.js';
import { sendSms } from '../lib/sms.js';

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * Authentication for app accounts — customers and cooks.
 *
 * Deliberately separate from `admin-auth.ts`. Different secret, different
 * claim shape, different verifier: an admin session opening a customer
 * endpoint, or a customer token reaching the panel, is the kind of thing that
 * is obvious in hindsight and invisible in a shared module.
 *
 * The app has nothing of its own. `signIn(demoAccount(id))` builds an account
 * out of whatever string was typed and discards the password — fine for a
 * demo on one device, unusable the moment two strangers can message each
 * other, because a chat is exactly where impersonation pays.
 *
 * Phone plus a one-time code, not a password: the account is already keyed on
 * a phone number and a password is one more thing to lose.
 */

const TOKEN_TTL_DAYS = 30;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 5;

const secret = () => new TextEncoder().encode(loadEnv().APP_AUTH_SECRET);

/* ------------------------------------------------------------------ *
 * phone numbers
 * ------------------------------------------------------------------ */

/**
 * One canonical form: `+8801XXXXXXXXX`.
 *
 * People type `01712…`, `8801712…`, `+8801712…` and `01712-345678`. All four
 * are the same handset, and a chat that treats them as four accounts is a
 * chat where three quarters of the messages go nowhere.
 */
export function normalisePhone(input: string): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');

  let national: string;
  if (digits.length === 13 && digits.startsWith('880')) national = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return null;

  // Every BD mobile is 1, an operator digit (3-9), then eight more.
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
  return `${salt}:${(await scrypt(code, salt, 64)).toString('hex')}`;
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
 * the response and is logged. `SMS_PROVIDER` gates that branch and defaults
 * to `none`, so a missing environment variable fails closed rather than
 * quietly handing out codes in production.
 */
export async function requestOtp(
  rawPhone: string,
  ip?: string | null,
): Promise<OtpResult> {
  const phone = normalisePhone(rawPhone);
  if (!phone) return { ok: false, error: 'That is not a Bangladeshi mobile number.' };

  const recent = await OtpChallenge.countDocuments({
    phone,
    createdAt: { $gte: new Date(Date.now() - 3_600_000) },
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
  await OtpChallenge.updateMany(
    { phone, consumedAt: null },
    { consumedAt: new Date() },
  );

  // randomInt is the CSPRNG. Math.random() here would be guessable.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await OtpChallenge.create({
    phone,
    codeHash: await hashCode(code),
    expiresAt,
    ip: ip ?? null,
  });

  if (smsIsLive()) {
    /* Failing to send fails the request. Anything else leaves somebody
       staring at a code entry box waiting for a message that is not coming,
       and the code is already spent in the database either way. */
    const out = await sendSms(phone, `${code} is your RannaBari code. It expires in ${OTP_TTL_MINUTES} minutes.`);
    if (!out.ok) {
      return { ok: false, error: 'We could not send the code. Please try again.' };
    }
    /* No devCode in the response once a provider is live — that field is the
       development convenience, and returning it in production would hand the
       code to anyone who can call the endpoint. */
    return { ok: true, expiresAt };
  }

  console.log(`[otp] ${phone} → ${code} (dev mode; no SMS provider configured)`);
  return { ok: true, expiresAt, devCode: code };
}

/* ------------------------------------------------------------------ *
 * identity
 * ------------------------------------------------------------------ */

export type AppIdentity = {
  accountId: string;
  customerKey: string;
  role: 'user' | 'cook';
  name: string;
  phone: string;
  kitchenId: string | null;
  kitchenName: string | null;
};

export type VerifyResult =
  | { ok: true; token: string; account: AppIdentity; expiresAt: Date }
  | { ok: false; error: string };

/**
 * Spend a code and hand back a token.
 *
 * The account is found **by phone first**, not by `customerKey`. The app
 * derives its key as `(email || phone).toLowerCase()`, so a cook who signed
 * up with an email has an email key with their phone in another column.
 * Keying purely on the phone would hand that cook a brand-new empty account
 * on their first verification, detaching them from their own kitchen and
 * every order they ever cooked.
 */
export async function verifyOtp(
  rawPhone: string,
  code: string,
  device?: { name?: string; platform?: string },
): Promise<VerifyResult> {
  const phone = normalisePhone(rawPhone);
  if (!phone) return { ok: false, error: 'That is not a Bangladeshi mobile number.' };

  const challenge = await OtpChallenge.findOne({
    phone,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  /* One message for "no code outstanding" and "wrong code". Telling them
     apart tells an attacker which numbers have a sign-in in flight. */
  const generic = 'That code is wrong or has expired.';
  if (!challenge) return { ok: false, error: generic };

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await OtpChallenge.updateOne({ _id: challenge._id }, { consumedAt: new Date() });
    return { ok: false, error: 'Too many wrong tries. Ask for a new code.' };
  }

  if (!(await verifyCode(code.replace(/\D/g, ''), challenge.codeHash))) {
    await OtpChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    return { ok: false, error: generic };
  }

  await OtpChallenge.updateOne({ _id: challenge._id }, { consumedAt: new Date() });

  const existing = await Account.findOne({
    $or: [{ phone }, { customerKey: phone }],
  }).sort({ createdAt: 1 }); // oldest wins, so a duplicate never steals history

  const account =
    existing ??
    (await Account.create({
      customerKey: phone,
      role: 'user',
      name: '',
      phone,
    }));

  if (account.suspended) {
    return { ok: false, error: 'This account is suspended. Contact support.' };
  }

  await Account.updateOne(
    { _id: account._id },
    { phone, phoneVerifiedAt: new Date(), signedInAt: new Date() },
  );

  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000);
  const tokenId = randomBytes(16).toString('hex');

  await AppSession.create({
    accountId: String(account._id),
    tokenId,
    device: device?.name ?? '',
    platform: device?.platform ?? '',
    expiresAt,
  });

  const identity = await toIdentity(account);
  const token = await mintToken(identity, tokenId, account.tokenVersion, expiresAt);

  return { ok: true, token, account: identity, expiresAt };
}

type AccountLike = {
  _id: unknown;
  customerKey: string;
  role: string;
  name: string;
  phone?: string | null;
};

async function toIdentity(account: AccountLike): Promise<AppIdentity> {
  const kitchen = await Kitchen.findOne({ accountId: String(account._id) })
    .select({ name: 1, suspended: 1 })
    .lean();

  // A suspended kitchen is not a kitchen this token can act as.
  const live = kitchen && !kitchen.suspended ? kitchen : null;

  return {
    accountId: String(account._id),
    customerKey: account.customerKey,
    role: live ? 'cook' : account.role === 'cook' ? 'cook' : 'user',
    name: account.name,
    phone: account.phone ?? '',
    kitchenId: live ? String(live._id) : null,
    kitchenName: live ? live.name : null,
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
 * Four things must hold and the signature is only the first. A revoked
 * session, a bumped `tokenVersion` and a suspended account all invalidate a
 * token that is otherwise perfectly valid — without that, "suspend this
 * account" means "suspend it in thirty days".
 */
export async function identify(token: string | undefined): Promise<AppIdentity | null> {
  if (!token) return null;

  let payload;
  try {
    ({ payload } = await jwtVerify(token, secret()));
  } catch {
    return null;
  }

  if (!payload.jti) return null;

  const session = await AppSession.findOne({ tokenId: String(payload.jti) });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const account = await Account.findById(session.accountId);
  if (!account || account.suspended) return null;
  if (account.tokenVersion !== Number(payload.v ?? 0)) return null;

  /* Touched at most once a minute. Writing on every message would make a busy
     chat a write per keystroke-batch on a row nobody reads. */
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await AppSession.updateOne({ _id: session._id }, { lastSeenAt: new Date() }).catch(
      () => {},
    );
  }

  return toIdentity(account);
}

export function bearerFrom(header: string | undefined): string | undefined {
  if (!header?.toLowerCase().startsWith('bearer ')) return undefined;
  return header.slice(7).trim() || undefined;
}

/** Sign one device out. The row stays so a stolen token can be traced. */
export async function revokeSession(tokenId: string) {
  await AppSession.updateOne({ tokenId, revokedAt: null }, { revokedAt: new Date() });
}

/** Sign every device out at once — a lost handset, or a suspension. */
export async function revokeAllSessions(accountId: string) {
  await Account.updateOne({ _id: accountId }, { $inc: { tokenVersion: 1 } });
  await AppSession.updateMany({ accountId, revokedAt: null }, { revokedAt: new Date() });
}
