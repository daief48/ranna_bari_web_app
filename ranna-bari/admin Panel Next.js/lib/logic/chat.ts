/*
 * No `server-only` guard, deliberately.
 *
 * `server.ts` runs outside the Next bundle and calls `threadFor()` to decide
 * whether a socket may subscribe to a thread, so it imports this module
 * directly — and `server-only` throws in that context.
 *
 * What keeps this off a client instead is that it opens the database:
 * importing it into a browser bundle fails on Prisma long before anything
 * here could leak.
 */
import type { Prisma } from '@prisma/client';

import { db } from '../db';
import { ERR, fail, ok, type Result } from '../domain';
import { makeCode } from '../format';
import { parseJson, toJson } from '../mappers';

/**
 * Chat.
 *
 * Three lanes, one shape:
 *
 *   order    — a customer and the cook, about one order
 *   request  — a customer and one cook, agreeing a bespoke job
 *   support  — either of them and the platform
 *
 * A thread is not a room with a membership list; it is a subject with two
 * sides, and who those sides are falls out of `customerKey` and `kitchenId`.
 * That is deliberate: it makes authorisation a *query predicate* rather than
 * a check somebody can forget to write. `threadsFor()` cannot return a thread
 * you are not on, so no caller downstream has to remember not to leak one —
 * the same trick `requestLogic.js` uses to keep one cook out of another's
 * offer.
 *
 * Messages are append-only in the sense that matters: no edit, no delete. A
 * chat that can be rewritten afterwards is not evidence, and these threads
 * are what a dispute gets settled on. A moderator can hide a message; the row
 * stays where it is.
 */

export type Viewer =
  | { side: 'customer'; customerKey: string; name: string }
  | { side: 'cook'; kitchenId: string; customerKey: string; name: string }
  | { side: 'admin'; email: string; name: string };

export const MAX_BODY = 2000;

/* ------------------------------------------------------------------ *
 * authorisation, as a predicate
 * ------------------------------------------------------------------ */

/**
 * The only threads this viewer may see.
 *
 * Everything that reads threads composes this in. An admin gets no clause —
 * support exists to read the conversation it is settling — but a customer is
 * pinned to their own key and a cook to their own kitchen, in the query
 * itself.
 */
export function visibleTo(viewer: Viewer): Prisma.ChatThreadWhereInput {
  switch (viewer.side) {
    case 'customer':
      return { customerKey: viewer.customerKey };
    case 'cook':
      /* A cook sees threads their kitchen is on. The `customerKey` clause is
         for the support thread a cook opened about themselves, where they are
         the customer side and no kitchen is attached. */
      return {
        OR: [
          { kitchenId: viewer.kitchenId },
          { kind: 'support', customerKey: viewer.customerKey, kitchenId: null },
        ],
      };
    case 'admin':
      return {};
  }
}

/** The unread counter that belongs to this viewer. */
const unreadField = (side: Viewer['side']) =>
  side === 'customer' ? 'unreadCustomer' : side === 'cook' ? 'unreadCook' : 'unreadAdmin';

/** The read stamp that belongs to this viewer. */
const readField = (side: Viewer['side']) =>
  side === 'customer'
    ? 'readByCustomerAt'
    : side === 'cook'
      ? 'readByCookAt'
      : 'readByAdminAt';

/* ------------------------------------------------------------------ *
 * reads
 * ------------------------------------------------------------------ */

export async function threadsFor(
  viewer: Viewer,
  opts: { status?: string; kind?: string; take?: number } = {},
) {
  return db.chatThread.findMany({
    where: {
      ...visibleTo(viewer),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.kind ? { kind: opts.kind } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    take: opts.take ?? 50,
    include: {
      order: { select: { id: true, code: true, title: true, status: true } },
    },
  });
}

/** One thread, or null — never somebody else's, whatever id was asked for. */
export async function threadFor(viewer: Viewer, threadId: string) {
  return db.chatThread.findFirst({
    where: { id: threadId, ...visibleTo(viewer) },
    include: {
      order: { select: { id: true, code: true, title: true, status: true } },
    },
  });
}

export async function messagesFor(
  viewer: Viewer,
  threadId: string,
  opts: { before?: Date; take?: number } = {},
): Promise<Result<{ messages: unknown[] }>> {
  const thread = await threadFor(viewer, threadId);
  if (!thread) return fail(ERR.FORBIDDEN);

  const rows = await db.chatMessage.findMany({
    where: {
      threadId,
      ...(opts.before ? { sentAt: { lt: opts.before } } : {}),
      /* A hidden message is gone for the two sides but still visible to an
         operator — hiding it is a moderation act, not a deletion, and the
         desk that hid it has to be able to see what it hid. */
      ...(viewer.side === 'admin' ? {} : { hidden: false }),
    },
    orderBy: { sentAt: 'desc' },
    take: opts.take ?? 50,
  });

  return ok({ messages: rows.reverse().map(shapeMessage) });
}

export const shapeMessage = (row: {
  id: string;
  threadId: string;
  senderType: string;
  senderRef: string | null;
  senderName: string;
  body: string;
  attachments: string;
  systemKind: string | null;
  clientId: string;
  sentAt: Date;
  hidden: boolean;
}) => ({
  id: row.id,
  threadId: row.threadId,
  senderType: row.senderType,
  senderRef: row.senderRef,
  senderName: row.senderName,
  body: row.hidden ? '' : row.body,
  attachments: row.hidden ? [] : parseJson<unknown[]>(row.attachments, []),
  systemKind: row.systemKind,
  clientId: row.clientId,
  sentAt: row.sentAt,
  hidden: row.hidden,
});

/** Total unread across every thread this viewer can see — the badge. */
export async function unreadTotal(viewer: Viewer): Promise<number> {
  const field = unreadField(viewer.side);
  const rows = await db.chatThread.aggregate({
    where: visibleTo(viewer),
    _sum: { [field]: true } as Record<string, boolean>,
  });
  return (rows._sum as Record<string, number | null>)[field] ?? 0;
}

/* ------------------------------------------------------------------ *
 * opening a thread
 * ------------------------------------------------------------------ */

/**
 * Find or create the thread for a subject.
 *
 * One thread per order, per request, and one open support thread per person —
 * not one per message. A customer who taps "message the cook" twice should
 * land back in the same conversation, and a support desk should not be
 * answering four threads from one confused person.
 */
export async function openThread(
  viewer: Viewer,
  spec:
    | { kind: 'order'; orderId: string }
    | { kind: 'request'; requestId: string; kitchenId: string }
    | { kind: 'support'; subject?: string },
): Promise<Result<{ threadId: string; created: boolean }>> {
  if (viewer.side === 'admin' && spec.kind !== 'support') {
    // An operator joins existing threads; they do not start an order chat
    // between two other people.
    return fail(ERR.FORBIDDEN);
  }

  if (spec.kind === 'order') {
    const order = await db.order.findUnique({
      where: { id: spec.orderId },
      select: { id: true, code: true, title: true, customerKey: true, kitchenId: true, cookName: true },
    });
    if (!order) return fail(ERR.NO_ORDER);

    // You may only open a chat about an order you are on.
    const allowed =
      (viewer.side === 'customer' && order.customerKey === viewer.customerKey) ||
      (viewer.side === 'cook' && order.kitchenId === viewer.kitchenId);
    if (!allowed) return fail(ERR.FORBIDDEN);

    const existing = await db.chatThread.findFirst({ where: { kind: 'order', orderId: order.id } });
    if (existing) return ok({ threadId: existing.id, created: false });

    const thread = await db.chatThread.create({
      data: {
        code: makeCode('CH'),
        kind: 'order',
        orderId: order.id,
        customerKey: order.customerKey,
        kitchenId: order.kitchenId,
        openedBy: viewer.side,
        subject: `${order.code} · ${order.title}`,
      },
    });
    return ok({ threadId: thread.id, created: true });
  }

  if (spec.kind === 'request') {
    const request = await db.request.findUnique({
      where: { id: spec.requestId },
      select: { id: true, code: true, title: true, customerKey: true },
    });
    if (!request) return fail(ERR.NO_REQUEST);

    const allowed =
      (viewer.side === 'customer' && request.customerKey === viewer.customerKey) ||
      (viewer.side === 'cook' && spec.kitchenId === viewer.kitchenId);
    if (!allowed) return fail(ERR.FORBIDDEN);

    /* Keyed on request *and* kitchen: a broadcast goes to several cooks, and
       a customer haggling with three of them needs three conversations, not
       one with everybody in it. */
    const existing = await db.chatThread.findFirst({
      where: { kind: 'request', requestId: request.id, kitchenId: spec.kitchenId },
    });
    if (existing) return ok({ threadId: existing.id, created: false });

    const thread = await db.chatThread.create({
      data: {
        code: makeCode('CH'),
        kind: 'request',
        requestId: request.id,
        customerKey: request.customerKey,
        kitchenId: spec.kitchenId,
        openedBy: viewer.side,
        subject: `${request.code} · ${request.title}`,
      },
    });
    return ok({ threadId: thread.id, created: true });
  }

  // support
  if (viewer.side === 'admin') return fail(ERR.FORBIDDEN);

  const existing = await db.chatThread.findFirst({
    where: { kind: 'support', customerKey: viewer.customerKey, status: 'open' },
  });
  if (existing) return ok({ threadId: existing.id, created: false });

  const thread = await db.chatThread.create({
    data: {
      code: makeCode('CH'),
      kind: 'support',
      customerKey: viewer.customerKey,
      // A cook asking support a question is asking as themselves, not as
      // their kitchen — so no kitchenId, or every operator reply would look
      // like it was addressed to the shop.
      kitchenId: null,
      openedBy: viewer.side,
      subject: spec.subject?.slice(0, 120) || 'Support',
    },
  });
  return ok({ threadId: thread.id, created: true });
}

/* ------------------------------------------------------------------ *
 * sending
 * ------------------------------------------------------------------ */

export type SentMessage = {
  id: string;
  threadId: string;
  senderType: string;
  senderRef: string | null;
  senderName: string;
  body: string;
  attachments: unknown[];
  systemKind: string | null;
  clientId: string;
  sentAt: Date;
  hidden: boolean;
};

/**
 * Post one message.
 *
 * `clientId` is generated on the device before the message leaves it, which
 * is what makes an offline outbox safe to replay: the second delivery loses
 * on the unique index and returns the first message rather than posting a
 * duplicate. The caller cannot tell the difference, and should not.
 */
export async function sendMessage(
  viewer: Viewer,
  args: {
    threadId: string;
    body: string;
    clientId: string;
    attachments?: unknown[];
  },
): Promise<Result<{ message: SentMessage; duplicate: boolean }>> {
  const body = String(args.body ?? '').trim();
  const attachments = args.attachments ?? [];

  if (!body && attachments.length === 0) return fail(ERR.NAME_REQUIRED);
  if (body.length > MAX_BODY) return fail(ERR.BAD_AMOUNT);
  if (!args.clientId) return fail(ERR.BAD_AMOUNT);

  const thread = await threadFor(viewer, args.threadId);
  if (!thread) return fail(ERR.FORBIDDEN);
  if (thread.status === 'closed') return fail(ERR.REQUEST_CLOSED);

  // The replay case, before we try to write.
  const seen = await db.chatMessage.findUnique({ where: { clientId: args.clientId } });
  if (seen) return ok({ message: shapeMessage(seen), duplicate: true });

  const senderRef =
    viewer.side === 'customer'
      ? viewer.customerKey
      : viewer.side === 'cook'
        ? viewer.kitchenId
        : viewer.email;

  /* Both sides' counters move in the same transaction as the insert. A
     message that exists with nobody notified is worse than no message. */
  const created = await db.$transaction(async (tx) => {
    const message = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderType: viewer.side,
        senderRef,
        senderName: viewer.name,
        body,
        attachments: toJson(attachments),
        clientId: args.clientId,
        // Your own message is read by you the instant you send it.
        ...(viewer.side === 'customer' ? { readByCustomerAt: new Date() } : {}),
        ...(viewer.side === 'cook' ? { readByCookAt: new Date() } : {}),
        ...(viewer.side === 'admin' ? { readByAdminAt: new Date() } : {}),
      },
    });

    await tx.chatThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: message.sentAt,
        lastMessageBody: (body || '📎 attachment').slice(0, 140),
        lastMessageFrom: viewer.side,
        unreadCustomer: viewer.side === 'customer' ? undefined : { increment: 1 },
        unreadCook:
          viewer.side === 'cook' || !thread.kitchenId ? undefined : { increment: 1 },
        unreadAdmin: viewer.side === 'admin' ? undefined : { increment: 1 },
      },
    });

    return message;
  });

  return ok({ message: shapeMessage(created), duplicate: false });
}

/** A message nobody typed — an order moved, a price was agreed. */
export async function postSystemMessage(
  threadId: string,
  systemKind: string,
  body: string,
): Promise<SentMessage | null> {
  const clientId = `sys:${threadId}:${systemKind}:${Date.now()}`;
  try {
    const message = await db.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          threadId,
          senderType: 'system',
          senderRef: null,
          senderName: '',
          body,
          systemKind,
          clientId,
        },
      });
      await tx.chatThread.update({
        where: { id: threadId },
        data: { lastMessageAt: created.sentAt, lastMessageBody: body.slice(0, 140), lastMessageFrom: 'system' },
      });
      return created;
    });
    return shapeMessage(message);
  } catch {
    // A system note failing must never take down whatever triggered it.
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * reading
 * ------------------------------------------------------------------ */

/** Mark everything in a thread read for this side, and zero their counter. */
export async function markRead(
  viewer: Viewer,
  threadId: string,
): Promise<Result<{ threadId: string }>> {
  const thread = await threadFor(viewer, threadId);
  if (!thread) return fail(ERR.FORBIDDEN);

  const stamp = readField(viewer.side);
  const counter = unreadField(viewer.side);

  await db.$transaction([
    db.chatMessage.updateMany({
      where: { threadId, [stamp]: null },
      data: { [stamp]: new Date() },
    }),
    db.chatThread.update({ where: { id: threadId }, data: { [counter]: 0 } }),
  ]);

  return ok({ threadId });
}

/* ------------------------------------------------------------------ *
 * moderation
 * ------------------------------------------------------------------ */

/** Hide a message from both sides. The row stays; only operators see it. */
export async function hideMessage(
  messageId: string,
  by: string,
  note: string,
): Promise<Result<{ threadId: string }>> {
  const message = await db.chatMessage.findUnique({ where: { id: messageId } });
  if (!message) return fail(ERR.NO_ORDER);

  await db.chatMessage.update({
    where: { id: messageId },
    data: { hidden: true, hiddenBy: by, hiddenAt: new Date(), hiddenNote: note },
  });
  return ok({ threadId: message.threadId });
}

export async function setThreadStatus(
  threadId: string,
  status: 'open' | 'closed',
  by: string,
): Promise<Result<{ threadId: string }>> {
  await db.chatThread.update({
    where: { id: threadId },
    data: {
      status,
      closedAt: status === 'closed' ? new Date() : null,
      closedBy: status === 'closed' ? by : null,
    },
  });
  return ok({ threadId });
}
