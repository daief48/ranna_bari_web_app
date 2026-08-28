import { NextResponse } from 'next/server';

import { verifyOtp } from '@/lib/app-auth';
import { readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Spend a code, get a token. Creates the account on first use. */
export async function POST(request: Request) {
  const body = await readJson<{
    phone?: string;
    code?: string;
    device?: { name?: string; platform?: string };
  }>(request);

  if (!body?.phone || !body?.code) {
    return NextResponse.json({ error: 'phone-and-code-required' }, { status: 400 });
  }

  const out = await verifyOtp(body.phone, body.code, body.device);
  if (!out.ok) {
    return NextResponse.json({ error: 'otp-invalid', message: out.error }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    token: out.token,
    expiresAt: out.expiresAt,
    account: out.account,
  });
}

/** Preflight. The headers themselves come from `next.config.ts`. */
export function OPTIONS() {
  return new Response(null, { status: 204 });
}
