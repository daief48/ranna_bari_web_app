import { NextResponse } from 'next/server';

import { requestOtp } from '@/lib/app-auth';
import { readJson, clientIp } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Ask for a code.
 *
 * Always answers the same way for a well-formed number, whether or not an
 * account exists. Distinguishing them turns this endpoint into a way to test
 * whether a phone number is registered.
 */
export async function POST(request: Request) {
  const body = await readJson<{ phone?: string }>(request);
  if (!body?.phone) {
    return NextResponse.json({ error: 'phone-required' }, { status: 400 });
  }

  const out = await requestOtp(body.phone, clientIp(request));

  if (!out.ok) {
    return NextResponse.json(
      { error: 'otp-refused', message: out.error },
      { status: out.retryAfterSeconds ? 429 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    expiresAt: out.expiresAt,
    /* Dev only. With no SMS provider configured there is no other way to
       receive the code, and `requestOtp` refuses to reach this branch once
       one is set. */
    ...(out.devCode ? { devCode: out.devCode } : {}),
  });
}

/** Preflight. The headers themselves come from `next.config.ts`. */
export function OPTIONS() {
  return new Response(null, { status: 204 });
}
