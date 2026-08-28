import { NextResponse } from 'next/server';

import { identifyRequest } from '@/lib/app-auth';
import { jsonError, unauthorized, readJson } from '@/lib/api';
import { registerKitchen } from '@/lib/logic/sync';

export const dynamic = 'force-dynamic';

/**
 * Register the caller's own kitchen.
 *
 * A cook's kitchen is created offline by `KitchenContext` and lives on that
 * device as `local-1`. Nothing here knows it exists, so nobody can message
 * it and no order naming it can be recorded. This is how it arrives.
 *
 * It arrives unverified, and nothing in the body can change that: a kitchen
 * appearing because somebody typed a name into their phone has proved
 * nothing, and the KYC queue is where the rest gets checked.
 */
export async function POST(request: Request) {
  const caller = await identifyRequest(request);
  if (!caller) return unauthorized();

  const body = await readJson<Parameters<typeof registerKitchen>[1]>(request);
  if (!body) return jsonError('name-required');

  const out = await registerKitchen(caller, body);
  if (!out.ok) return jsonError(out.error);

  return NextResponse.json(out.result);
}

/** Preflight. The headers themselves come from `next.config.ts`. */
export function OPTIONS() {
  return new Response(null, { status: 204 });
}
