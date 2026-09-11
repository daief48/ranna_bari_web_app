import { randomInt } from 'node:crypto';

import { EmailOtpChallenge } from '../models/index.js';
import { isProd, mailIsLive } from '../config/env.js';

import { hashCode, verifyCode } from './app-auth.js';
import { sendEmailOtp } from './mail.js';

/**
 * Email codes for the cook flow — registration proof and password resets.
 *
 * Deliberately a sibling of the phone path in `app-auth.ts` rather than a
 * variant of it: the challenge is keyed on an address, carries a `purpose`,
 * and answers with a machine-readable `code` alongside the sentence, because
 * its callers drive screens (a resend button with a countdown) rather than
 * just printing an error.
 *
 * The limits are the phone path's, plus one the phone path never needed:
 * a **cooldown** between sends. Email shows the sender's address to the
 * recipient, and a flow that can fire five in a minute is a flow that gets a
 * Gmail account rate-limited by lunchtime.
 */

export const EMAIL_COOLDOWN_SECONDS = 60;
const EMAIL_OTP_TTL_MINUTES = 5;
const EMAIL_OTP_MAX_ATTEMPTS = 5;
const EMAIL_OTP_MAX_PER_HOUR = 5;

/* ------------------------------------------------------------------ *
 * addresses
 * ------------------------------------------------------------------ */

/** One canonical form: trimmed, lowercased, something@something.tld. */
export function normaliseEmail(input: string): string | null {
  const email = String(input ?? '').trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * Why an address was refused, in a sentence somebody can act on — the email
 * twin of `phoneProblem`. Most mistyped addresses are one of three mistakes,
 * and each has a different fix.
 */
export function emailProblem(input: string): string {
  const email = String(input ?? '').trim();

  if (!email) return 'Enter your email address.';
  if (!email.includes('@')) return 'That email is missing an @ — check it and try again.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'That email does not look complete — something like you@gmail.com.';
  }
  return 'That email address does not look right.';
}

/* ------------------------------------------------------------------ *
 * codes
 * ------------------------------------------------------------------ */

export type EmailOtpResult =
  | { ok: true; expiresAt: Date; cooldownSeconds: number; devCode?: string }
  | {
      ok: false;
      code: 'email-invalid' | 'otp-cooldown' | 'otp-rate-limited' | 'otp-send-failed';
      error: string;
      retryAfterSeconds?: number;
    };

/**
 * Issue an emailed code.
 *
 * Without SMTP configured the code comes back in the response and the log,
 * exactly as the phone path does with SMS off — a missing variable fails
 * closed into a dev branch, not into a quietly undeliverable code. In
 * production without SMTP there is nothing useful to hand back, so it throws.
 */
export async function requestEmailOtp(
  rawEmail: string,
  purpose: 'register' | 'reset',
  ip?: string | null,
): Promise<EmailOtpResult> {
  const email = normaliseEmail(rawEmail);
  if (!email) {
    return { ok: false, code: 'email-invalid', error: emailProblem(rawEmail) };
  }

  const recent = await EmailOtpChallenge.countDocuments({
    email,
    purpose,
    createdAt: { $gte: new Date(Date.now() - 3_600_000) },
  });
  if (recent >= EMAIL_OTP_MAX_PER_HOUR) {
    return {
      ok: false,
      code: 'otp-rate-limited',
      error: 'Too many codes requested. Try again in an hour.',
      retryAfterSeconds: 3600,
    };
  }

  /* One code a minute per address. The newest row decides — delivered or
     not — because the point is that the inbox cannot be flooded. */
  const newest = await EmailOtpChallenge.findOne({ email, purpose }).sort({ createdAt: -1 });
  if (newest) {
    const elapsed = Date.now() - newest.createdAt.getTime();
    if (elapsed < EMAIL_COOLDOWN_SECONDS * 1000) {
      return {
        ok: false,
        code: 'otp-cooldown',
        error: 'Please wait a minute before asking for another code.',
        retryAfterSeconds: Math.ceil((EMAIL_COOLDOWN_SECONDS * 1000 - elapsed) / 1000),
      };
    }
  }

  /* Any code still outstanding is spent. Two live codes for one inbox doubles
     the guessing surface for no benefit. */
  await EmailOtpChallenge.updateMany(
    { email, purpose, consumedAt: null },
    { consumedAt: new Date() },
  );

  // randomInt is the CSPRNG. Math.random() here would be guessable.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MINUTES * 60_000);

  const challenge = await EmailOtpChallenge.create({
    email,
    purpose,
    codeHash: await hashCode(code),
    expiresAt,
    ip: ip ?? null,
  });

  if (mailIsLive()) {
    try {
      await sendEmailOtp(email, code);
    } catch (err) {
      console.log(`[otp:email] send to ${email} failed: ${(err as Error)?.message ?? err}`);
      /* The row was never delivered, so it is not evidence and must not trip
         the cooldown on the retry it is about to cause. */
      await EmailOtpChallenge.deleteOne({ _id: challenge._id });
      return {
        ok: false,
        code: 'otp-send-failed',
        error: 'We could not send the email right now. Try again in a minute.',
      };
    }
  } else {
    if (isProd()) {
      throw new Error('SMTP is not configured, so no mail can leave this service.');
    }
    console.log(`[otp:email] ${email} → ${code} (dev mode; no SMTP configured)`);
  }

  return {
    ok: true,
    expiresAt,
    cooldownSeconds: EMAIL_COOLDOWN_SECONDS,
    ...(isProd() ? {} : { devCode: code }),
  };
}

export type EmailOtpVerifyResult = { ok: true } | { ok: false; error: string };

/**
 * Spend an emailed code. Mirrors the phone path's rules: one message for
 * "no code outstanding" and "wrong code" (telling them apart tells an
 * attacker which inboxes have a flow in flight), and the attempt cap
 * consumes the row.
 */
export async function verifyEmailOtp(
  rawEmail: string,
  rawCode: string,
  purpose: 'register' | 'reset',
): Promise<EmailOtpVerifyResult> {
  const email = normaliseEmail(rawEmail);
  if (!email) return { ok: false, error: emailProblem(rawEmail) };

  const challenge = await EmailOtpChallenge.findOne({
    email,
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  const generic = 'That code is wrong or has expired.';
  if (!challenge) return { ok: false, error: generic };

  if (challenge.attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
    await EmailOtpChallenge.updateOne({ _id: challenge._id }, { consumedAt: new Date() });
    return { ok: false, error: 'Too many wrong tries. Ask for a new code.' };
  }

  if (!(await verifyCode(String(rawCode ?? '').replace(/\D/g, ''), challenge.codeHash))) {
    await EmailOtpChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    return { ok: false, error: generic };
  }

  await EmailOtpChallenge.updateOne({ _id: challenge._id }, { consumedAt: new Date() });
  return { ok: true };
}
