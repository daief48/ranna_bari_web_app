import { NextResponse } from 'next/server';

import { identifyRequest } from '@/lib/app-auth';
import { jsonError, unauthorized, readJson } from '@/lib/api';
import { recordOrder, ordersFor, type OrderDraft } from '@/lib/logic/sync';

export const dynamic = 'force-dynamic';

/** Every order this caller is on, as customer or as kitchen. */
export async function GET(request: Request) {
  const caller = await identifyRequest(request);
  if (!caller) return unauthorized();
  return NextResponse.json({ orders: await ordersFor(caller) });
}

/**
 * Record an order the app placed.
 *
 * The app still creates orders on the device — that is what makes it work
 * offline — but a chat about an order needs the server to know independently
 * that the order is real and who is on it. Idempotent on the app's own order
 * code, so the sync queue can retry blindly.
 */
export async function POST(request: Request) {
  const caller = await identifyRequest(request);
  if (!caller) return unauthorized();

  const body = await readJson<{ orders?: OrderDraft[]; order?: OrderDraft }>(request);
  const drafts = body?.orders ?? (body?.order ? [body.order] : []);
  if (!drafts.length) return jsonError('name-required');

  /* A basket spanning two kitchens is two orders, so the app sends them
     together. One failing must not lose the other, and the reply says what
     happened to each rather than collapsing to a single status. */
  const results = [];
  for (const draft of drafts) {
    const out = await recordOrder(caller, draft);
    results.push(
      out.ok
        ? { ok: true, ...out.result }
        : { code: draft.code, ok: false, error: out.error },
    );
  }

  return NextResponse.json({ results });
}

/** Preflight. The headers themselves come from `next.config.ts`. */
export function OPTIONS() {
  return new Response(null, { status: 204 });
}
