import { RateLimit } from '../models/index.js';

/**
 * A fixed-window counter, shared by every container.
 *
 * Returns how many hits the bucket has taken in the current window, this one
 * included. The window number is baked into the key, so there is nothing to
 * reset: the next window simply reads a different row.
 *
 * Fails open. A rate limiter that takes sign-in down when the counter write
 * hiccups has made the attack it guards against easier, not harder — the
 * per-code attempt cap on the OTP rows is the hard stop, this is the net
 * around it.
 */
export async function hit(bucket: string, windowSeconds: number): Promise<number> {
  const now = Date.now();
  const window = Math.floor(now / (windowSeconds * 1000));
  const key = `${bucket}:${window}`;
  const expiresAt = new Date((window + 1) * windowSeconds * 1000 + 60_000);

  const bump = () =>
    RateLimit.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true },
    ).lean();

  try {
    const row = await bump().catch(async (err: { code?: number }) => {
      // Two first hits racing to create the row: one loses the unique index.
      if (err?.code === 11000) return bump();
      throw err;
    });
    return row?.count ?? 1;
  } catch (err) {
    console.log(`[rate-limit] counter write failed, letting the request through: ${err}`);
    return 0;
  }
}

/** The limits, by route. A path is matched on its tail so the prefix may change. */
export type Limit = { tail: string; per: 'ip' | 'email'; max: number; windowSeconds: number };

/*
 * Per-IP numbers are generous on purpose: mobile carriers in Bangladesh put a
 * great many handsets behind one address, and a limit that locks a whole
 * neighbourhood out is its own outage. What stops OTP guessing is the attempt
 * cap on each code; these stop the volume around it — mail-bombing, scrypt
 * CPU burn, and code farming.
 */
export const LIMITS: Limit[] = [
  { tail: '/auth/request-otp', per: 'ip', max: 30, windowSeconds: 3600 },
  { tail: '/auth/verify-otp', per: 'ip', max: 60, windowSeconds: 600 },
  { tail: '/auth/cook/register', per: 'ip', max: 20, windowSeconds: 3600 },
  { tail: '/auth/cook/resend-otp', per: 'ip', max: 20, windowSeconds: 3600 },
  { tail: '/auth/cook/forgot-password', per: 'ip', max: 20, windowSeconds: 3600 },
  { tail: '/auth/cook/verify-email', per: 'ip', max: 60, windowSeconds: 600 },
  { tail: '/auth/cook/reset-password', per: 'ip', max: 60, windowSeconds: 600 },
  { tail: '/auth/cook/sign-in', per: 'ip', max: 60, windowSeconds: 600 },
  // Operators all arrive from the panel server's one address, so key on who is
  // signing in rather than where from.
  { tail: '/api/admin/v1/auth/sign-in', per: 'email', max: 10, windowSeconds: 600 },
  // And the credential being guessed, whatever address the guesses come from.
  { tail: '/auth/cook/sign-in', per: 'email', max: 10, windowSeconds: 600 },
];
