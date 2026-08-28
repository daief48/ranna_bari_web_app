import { NextResponse } from 'next/server';

import { viewerFor, jsonError, unauthorized, readJson } from '@/lib/api';
import { markRead, threadFor } from '@/lib/logic/chat';
import { publish } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

/**
 * Mark a thread read, and tell the other side.
 *
 * The read receipt is fanned out because "they have seen it" is most of what
 * a person wants from a chat after "it sent" — and on a marketplace it is
 * also the difference between a cook who is ignoring you and a cook who is
 * cooking.
 */
export async function POST(request: Request) {
  const viewer = await viewerFor(request);
  if (!viewer) return unauthorized();

  const body = await readJson<{ threadId?: string }>(request);
  if (!body?.threadId) return jsonError('name-required');

  const thread = await threadFor(viewer, body.threadId);
  if (!thread) return jsonError('admin-forbidden', 403);

  const out = await markRead(viewer, body.threadId);
  if (!out.ok) return jsonError(out.error, 403);

  publish(
    { customerKey: thread.customerKey, kitchenId: thread.kitchenId },
    { type: 'read', threadId: thread.id, side: viewer.side, at: new Date().toISOString() },
  );

  return NextResponse.json({ ok: true });
}

/** Preflight. The headers themselves come from `next.config.ts`. */
export function OPTIONS() {
  return new Response(null, { status: 204 });
}
