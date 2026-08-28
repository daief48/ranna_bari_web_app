import { NextResponse } from 'next/server';

import { viewerFor, jsonError, unauthorized, readJson } from '@/lib/api';
import { openThread, threadsFor, unreadTotal } from '@/lib/logic/chat';
import { publish } from '@/lib/realtime';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The inbox.
 *
 * `threadsFor` composes the viewer's visibility clause into the query itself,
 * so this handler has no authorisation code of its own and cannot forget any.
 */
export async function GET(request: Request) {
  const viewer = await viewerFor(request);
  if (!viewer) return unauthorized();

  const url = new URL(request.url);
  const [threads, unread] = await Promise.all([
    threadsFor(viewer, {
      status: url.searchParams.get('status') ?? undefined,
      kind: url.searchParams.get('kind') ?? undefined,
    }),
    unreadTotal(viewer),
  ]);

  return NextResponse.json({
    threads: threads.map((thread) => shapeThread(thread, viewer.side)),
    unread,
  });
}

/** Open a thread, or hand back the one that already covers this subject. */
export async function POST(request: Request) {
  const viewer = await viewerFor(request);
  if (!viewer) return unauthorized();

  const body = await readJson<{
    kind?: 'order' | 'request' | 'support';
    orderId?: string;
    requestId?: string;
    kitchenId?: string;
    subject?: string;
  }>(request);

  if (!body?.kind) return jsonError('name-required');

  const spec =
    body.kind === 'order'
      ? ({ kind: 'order', orderId: String(body.orderId) } as const)
      : body.kind === 'request'
        ? ({
            kind: 'request',
            requestId: String(body.requestId),
            kitchenId: String(body.kitchenId),
          } as const)
        : ({ kind: 'support', subject: body.subject } as const);

  const out = await openThread(viewer, spec);
  if (!out.ok) return jsonError(out.error, out.error === 'admin-forbidden' ? 403 : 400);

  const thread = await db.chatThread.findUnique({
    where: { id: out.result.threadId },
    include: { order: { select: { id: true, code: true, title: true, status: true } } },
  });
  if (!thread) return jsonError('order-missing', 404);

  /* A brand-new thread is pushed to the other side straight away. Otherwise a
     support desk only learns a conversation exists when the first message
     lands, which is a second of dead air on every new case. */
  if (out.result.created) {
    publish(
      { customerKey: thread.customerKey, kitchenId: thread.kitchenId },
      { type: 'thread', thread: shapeThread(thread, 'admin') },
    );
  }

  return NextResponse.json({
    thread: shapeThread(thread, viewer.side),
    created: out.result.created,
  });
}

type ThreadRow = {
  id: string;
  code: string;
  kind: string;
  orderId: string | null;
  requestId: string | null;
  customerKey: string;
  kitchenId: string | null;
  subject: string;
  status: string;
  lastMessageAt: Date;
  lastMessageBody: string;
  lastMessageFrom: string;
  unreadCustomer: number;
  unreadCook: number;
  unreadAdmin: number;
  createdAt: Date;
  order?: { id: string; code: string; title: string; status: string } | null;
};

/**
 * One thread, from one side's point of view.
 *
 * The unread count is flattened to *this viewer's* number rather than sending
 * all three. A customer has no business knowing how far behind the support
 * desk is, and a client that has to work out which of three counters is
 * theirs is a client that will eventually pick the wrong one.
 */
export function shapeThread(thread: ThreadRow, side: 'customer' | 'cook' | 'admin') {
  return {
    id: thread.id,
    code: thread.code,
    kind: thread.kind,
    orderId: thread.orderId,
    requestId: thread.requestId,
    subject: thread.subject,
    status: thread.status,
    lastMessageAt: thread.lastMessageAt,
    lastMessageBody: thread.lastMessageBody,
    lastMessageFrom: thread.lastMessageFrom,
    unread:
      side === 'customer'
        ? thread.unreadCustomer
        : side === 'cook'
          ? thread.unreadCook
          : thread.unreadAdmin,
    order: thread.order ?? null,
    createdAt: thread.createdAt,
    // Only the desk needs to know which two parties these are.
    ...(side === 'admin'
      ? { customerKey: thread.customerKey, kitchenId: thread.kitchenId }
      : {}),
  };
}

/** Preflight. The headers themselves come from `next.config.ts`. */
export function OPTIONS() {
  return new Response(null, { status: 204 });
}
