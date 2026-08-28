import { NextResponse } from 'next/server';

import { viewerFor, jsonError, unauthorized, readJson } from '@/lib/api';
import { messagesFor, sendMessage, threadFor } from '@/lib/logic/chat';
import { publish } from '@/lib/realtime';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** The transcript, oldest first, paged backwards with `before`. */
export async function GET(request: Request) {
  const viewer = await viewerFor(request);
  if (!viewer) return unauthorized();

  const url = new URL(request.url);
  const threadId = url.searchParams.get('threadId');
  if (!threadId) return jsonError('name-required');

  const before = url.searchParams.get('before');
  const out = await messagesFor(viewer, threadId, {
    before: before ? new Date(before) : undefined,
    take: Math.min(100, Number(url.searchParams.get('take') ?? 50) || 50),
  });

  if (!out.ok) return jsonError(out.error, 403);
  return NextResponse.json(out.result);
}

/**
 * Send one message.
 *
 * Over HTTP rather than down the socket, deliberately. A send has to be
 * transactional, has to be idempotent on `clientId`, and has to be able to
 * fail with a status the app's offline outbox can act on — retry this, drop
 * that. A WebSocket frame has no reply and no status code, so making it the
 * write path means messages that exist on one side of the wire and nowhere
 * else. The socket is for *delivery*; this is for the truth.
 */
export async function POST(request: Request) {
  const viewer = await viewerFor(request);
  if (!viewer) return unauthorized();

  const body = await readJson<{
    threadId?: string;
    body?: string;
    clientId?: string;
    attachments?: unknown[];
    /** The socket that sent it, so the echo skips its own sender. */
    connectionId?: string;
  }>(request);

  if (!body?.threadId || !body?.clientId) return jsonError('name-required');

  const out = await sendMessage(viewer, {
    threadId: body.threadId,
    body: body.body ?? '',
    clientId: body.clientId,
    attachments: body.attachments,
  });

  if (!out.ok) {
    return jsonError(out.error, out.error === 'admin-forbidden' ? 403 : 400);
  }

  /* A replay of a message already stored is answered with the stored one and
     fanned out to nobody — the recipients saw it the first time, and a second
     delivery would show it twice. */
  if (!out.result.duplicate) {
    const thread = await threadFor(viewer, body.threadId);
    if (thread) {
      publish(
        { customerKey: thread.customerKey, kitchenId: thread.kitchenId },
        { type: 'message', threadId: thread.id, message: out.result.message },
        body.connectionId,
      );

      /* Whoever was not connected gets the same event as a notification, in
         the app's own dedupe shape — one unread row per thread rather than
         one per message, so a ten-message burst is one badge. */
      await queueOfflineNotice(thread, viewer.side, out.result.message.body);
    }
  }

  return NextResponse.json({
    message: out.result.message,
    duplicate: out.result.duplicate,
  });
}

/**
 * File a notification for a side that is not currently connected.
 *
 * Keyed on the thread, not the message: the app's `notify()` refuses a
 * duplicate while one is still unread, so a burst collapses to one row. That
 * is the same contract the rest of the app's notifications hold, and breaking
 * it here would put forty rows in somebody's list for one conversation.
 */
async function queueOfflineNotice(
  thread: { id: string; kind: string; customerKey: string; kitchenId: string | null; subject: string },
  from: 'customer' | 'cook' | 'admin',
  preview: string,
) {
  const { isOnline } = await import('@/lib/realtime');

  const targets: { audience: 'customer' | 'cook'; customerKey?: string; kitchenId?: string }[] = [];

  if (from !== 'customer' && !isOnline({ customerKey: thread.customerKey })) {
    targets.push({ audience: 'customer', customerKey: thread.customerKey });
  }
  if (from !== 'cook' && thread.kitchenId && !isOnline({ kitchenId: thread.kitchenId })) {
    targets.push({ audience: 'cook', kitchenId: thread.kitchenId });
  }

  for (const target of targets) {
    const key = `${target.audience}:chat:${thread.id}`;
    const existing = await db.notification.findFirst({ where: { key, read: false } });
    if (existing) continue;

    await db.notification
      .create({
        data: {
          key,
          audience: target.audience,
          kind: 'chat-message',
          title: thread.kind === 'support' ? 'Support replied' : 'New message',
          body: preview.slice(0, 140) || 'You have a new message.',
          customerKey: target.customerKey ?? null,
          kitchenId: target.kitchenId ?? null,
        },
      })
      .catch(() => {});
  }
}

/** Preflight. The headers themselves come from `next.config.ts`. */
export function OPTIONS() {
  return new Response(null, { status: 204 });
}
