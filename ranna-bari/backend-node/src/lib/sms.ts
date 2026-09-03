/**
 * Sending an SMS, without committing to a vendor.
 *
 * Every gateway in this market is the same shape — an HTTPS call with the
 * number, the text and an API key — and they differ only in field names and
 * where the key goes. So rather than pick one and wire its SDK, the transport
 * is described by environment variables and the provider becomes configuration.
 *
 *   SMS_PROVIDER=none      log the message and report it undelivered. The
 *                          default, so a missing variable fails closed rather
 *                          than pretending to have sent something.
 *   SMS_PROVIDER=http      POST or GET to SMS_URL. SMS_BODY is a template with
 *                          {to} and {text} in it; SMS_AUTH, when set, is sent
 *                          as the Authorization header.
 *
 * Anything else throws on the first send. An unrecognised provider name is a
 * typo in a deployment, and quietly falling back to "log it" would mean an
 * operator believing codes are going out while nobody receives one.
 */
import { loadEnv, smsIsLive } from '../config/env.js';

export type SmsResult =
  /** Handed to a provider that accepted it. */
  | { ok: true; delivered: true }
  /** No provider configured; the text was logged instead. */
  | { ok: true; delivered: false }
  | { ok: false; error: string };

/** Fill {to} and {text} in a template, encoding for the transport that carries it. */
const fill = (template: string, to: string, text: string, encode: boolean) =>
  template
    .replaceAll('{to}', encode ? encodeURIComponent(to) : to)
    .replaceAll('{text}', encode ? encodeURIComponent(text) : text);

/**
 * Send one message.
 *
 * Never throws for a delivery failure — the caller decides whether a failed
 * SMS should fail the thing it was attached to. Requesting a login code should
 * (there is no point leaving somebody waiting for a code that was never sent);
 * telling a neighbourhood about a new meal should not.
 */
export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const env = loadEnv();

  if (!smsIsLive()) {
    console.log(`[sms] ${to} → ${text} (no provider configured; not sent)`);
    return { ok: true, delivered: false };
  }

  if (env.SMS_PROVIDER !== 'http') {
    throw new Error(
      `SMS_PROVIDER "${env.SMS_PROVIDER}" is not a transport this build knows. ` +
        'Use "http" with SMS_URL and SMS_BODY, or "none".',
    );
  }

  if (!env.SMS_URL) {
    throw new Error('SMS_PROVIDER is "http" but SMS_URL is not set.');
  }

  const method = (env.SMS_METHOD || 'POST').toUpperCase();
  const url = fill(env.SMS_URL, to, text, true);

  try {
    /* A gateway that has not answered in ten seconds is not going to. Without
       a deadline one slow provider holds a request open until the client
       gives up, which reads to the user as the app being broken. */
    const response = await fetch(url, {
      method,
      headers: {
        ...(env.SMS_AUTH ? { authorization: env.SMS_AUTH } : {}),
        ...(method === 'POST' ? { 'content-type': env.SMS_CONTENT_TYPE || 'application/json' } : {}),
      },
      body: method === 'POST' && env.SMS_BODY ? fill(env.SMS_BODY, to, text, false) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      /* The body usually says why — a bad key, no credit, a blocked number —
         and losing it makes every failure look identical. */
      const detail = await response.text().catch(() => '');
      return { ok: false, error: `gateway ${response.status}: ${detail.slice(0, 200)}` };
    }

    return { ok: true, delivered: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Send to many, and report how it went.
 *
 * Sequential rather than parallel: these gateways rate-limit, and forty
 * simultaneous requests is how an account gets throttled for the rest of the
 * hour. One failure does not stop the rest — a wrong number in the middle of a
 * neighbourhood should not silence the other thirty-nine.
 */
export async function sendSmsToMany(
  numbers: string[],
  text: string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const to of numbers) {
    const out = await sendSms(to, text).catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }));
    if (out.ok) sent += 1;
    else {
      failed += 1;
      console.warn(`[sms] ${to} failed: ${out.error}`);
    }
  }

  return { sent, failed };
}
