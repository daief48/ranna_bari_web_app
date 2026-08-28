import { NextResponse } from 'next/server';

import { identifyRequest } from '@/lib/app-auth';
import { unauthorized } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Who this token is.
 *
 * The app calls it on launch to decide whether the stored token is still
 * good — a token can be perfectly well-signed and still dead, because the
 * session was revoked or the account suspended.
 */
export async function GET(request: Request) {
  const account = await identifyRequest(request);
  if (!account) return unauthorized();
  return NextResponse.json({ account });
}

/** Preflight. The headers themselves come from `next.config.ts`. */
export function OPTIONS() {
  return new Response(null, { status: 204 });
}
