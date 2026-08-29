import type { FilterQuery } from 'mongoose';

import { ChatMessage, ChatThread, Order, Request } from '../models/index.js';
import { tx, isDuplicateKey } from '../config/db.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { makeCode } from '../lib/format.js';

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
 * That is deliberate: it makes authorisation a **query predicate** rather
 * than a check somebody can forget to write. `threadsFor()` cannot return a
 * thread you are not on, so nothing downstream has to remember not to leak
 * one — the same trick `requestLogic.js` uses to keep one cook out of
 * another's offer.
 *
 * Messages are append-only in the sense that matters: no edit, no delete. A
 * chat that can be rewritten afterwards is not evidence, and these threads
 * are what a dispute gets settled on. A moderator can hide one; the row stays.
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
export function visibleTo(viewer: Viewer): FilterQuery<Record<string, unknown>> {
  switch (viewer.side) {
    case 'customer':
      return { customerKey: viewer.customerKey };
    case 'cook':
      /* A cook sees threads their kitchen is on. The second clause is for the
         support thread a cook opened about themselves, where they are the
         customer side and no kitchen is attached. */
      return {
        $or: [
          { kitchenId: viewer.kitchenId },
          { kind: 'support', customerKey: viewer.customerKey, kitchenId: null },
        ],
      };
    case 'admin':
      return {};
  }
}

const unreadField = (side: Viewer['side']) =>
  side === 'customer' ? 'unreadCustomer' : side === 'cook' ? 'unreadCook' : 'unreadAdmin';

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
  return ChatThread.find({
    ...visibleTo(viewer),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.kind ? { kind: opts.kind } : {}),
  })
    .sort({ lastMessageAt: -1 })
    .limit(opts.take ?? 50)
    .lean();
}

/** One thread, or null — never somebody else's, whatever id was asked for. */
export async function threadFor(viewer: Viewer, threadId: string) {
  try {
    return await ChatThread.findOne({ _id: threadId, ...visibleTo(viewer) }).lean();
  } catch {
    // A malformed ObjectId is a miss, not a crash.
    return null;
  }
}

export async function messagesFor(
  viewer: Viewer,
  threadId: string,
  opts: { before?: Date; take?: number } = {},
): Promise<Result<{ messages: unknown[] }>> {
  const thread = await threadFor(viewer, threadId);
  if (!thread) return fail(ERR.FORBIDDEN);

  const rows = await ChatMessage.find({
    threadId,
    ...(opts.before ? { sentAt: { $lt: opts.before } } : {}),
    /* A hidden message is gone for the two sides but still visible to an
       operator — hiding is moderation, not deletion, and the desk that hid it
       has to be able to see what it hid. */
    ...(viewer.side === 'admin' ? {} : { hidden: false }),
  })
    .sort({ sentAt: -1 })
    .limit(opts.take ?? 50)
    .lean();

  return ok({ messages: rows.reverse().map(shapeMessage) });
}

type MessageRow = {
  _id: unknown;
  threadId: string;
  senderType: string;
  senderRef?: string | null;
  senderName: string;
  body: string;
  attachments?: unknown;
  systemKind?: string | null;
  clientId: string;
  sentAt: Date;
  hidden: boolean;
};

export const shapeMessage = (row: MessageRow) => ({
  id: String(row._id),
  threadId: row.threadId,
  senderType: row.senderType,
  senderRef: row.senderRef ?? null,
  senderName: row.senderName,
  body: row.hidden ? '' : row.body,
  attachments: row.hidden ? [] : (row.attachments ?? []),
  systemKind: row.systemKind ?? null,
  clientId: row.clientId,
  sentAt: row.sentAt,
  hidden: row.hidden,
});

/**
 * One thread, from one side's point of view.
 *
 * The unread count is flattened to *this viewer's* number rather than sending
 * all three. A customer has no business knowing how far behind the support
 * desk is, and a client that has to work out which of three counters is
 * theirs will eventually pick the wrong one.
 */
export function shapeThread(thread: Record<string, any>, side: Viewer['side']) {
  return {
    id: String(thread._id),
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
    createdAt: thread.createdAt,
    // Only the desk needs to know which two parties these are.
    ...(side === 'admin'
      ? { customerKey: thread.customerKey, kitchenId: thread.kitchenId }
      : {}),
  };
}

/** Total unread across every thread this viewer can see — the badge. */
export async function unreadTotal(viewer: Viewer): Promise<number> {
  const field = unreadField(viewer.side);
  const rows = await ChatThread.aggregate<{ total: number }>([
    { $match: visibleTo(viewer) },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return rows[0]?.total ?? 0;
}

/* ------------------------------------------------------------------ *
 * opening a thread
 * ------------------------------------------------------------------ */

/**
 * Find or create the thread for a subject.
 *
 * One thread per order, per request-and-kitchen pair, and one open support
 * thread per person — not one per message. A customer who taps "message the
 * cook" twice should land back in the same conversation, and a support desk
 * should not be answering four threads from one confused person.
 */
export async function openThread(
  viewer: Viewer,
  spec:
    | { kind: 'order'; orderId: string }
    | { kind: 'request'; requestId: string; kitchenId: string }
    | { kind: 'support'; subject?: string },
): Promise<Result<{ threadId: string; created: boolean }>> {
  if (viewer.side === 'admin' && spec.kind !== 'support') {
    // An operator joins existing threads; they do not start a conversation
    // between two other people.
    return fail(ERR.FORBIDDEN);
  }

  if (spec.kind === 'order') {
    const order = await Order.findById(spec.orderId).catch(() => null);
    if (!order) return fail(ERR.NO_ORDER);

    const allowed =
      (viewer.side === 'customer' && order.customerKey === viewer.customerKey) ||
      (viewer.side === 'cook' && order.kitchenId === viewer.kitchenId);
    if (!allowed) return fail(ERR.FORBIDDEN);

    const existing = await ChatThread.findOne({ kind: 'order', orderId: String(order._id) });
    if (existing) return ok({ threadId: String(existing._id), created: false });

    const thread = await ChatThread.create({
      code: makeCode('CH'),
      kind: 'order',
      orderId: String(order._id),
      customerKey: order.customerKey,
      kitchenId: order.kitchenId,
      openedBy: viewer.side,
      subject: `${order.code} · ${order.title}`,
    });
    return ok({ threadId: String(thread._id), created: true });
  }

  if (spec.kind === 'request') {
    const request = await Request.findById(spec.requestId).catch(() => null);
    if (!request) return fail(ERR.NO_REQUEST);

    const allowed =
      (viewer.side === 'customer' && request.customerKey === viewer.customerKey) ||
      (viewer.side === 'cook' && spec.kitchenId === viewer.kitchenId);
    if (!allowed) return fail(ERR.FORBIDDEN);

    /* Keyed on request *and* kitchen: a broadcast goes to several cooks, and
       a customer haggling with three of them needs three conversations, not
       one with everybody in it. */
    const existing = await ChatThread.findOne({
      kind: 'request',
      requestId: String(request._id),
      kitchenId: spec.kitchenId,
    });
    if (existing) return ok({ threadId: String(existing._id), created: false });

    const thread = await ChatThread.create({
      code: makeCode('CH'),
      kind: 'request',
      requestId: String(request._id),
      customerKey: request.customerKey,
      kitchenId: spec.kitchenId,
      openedBy: viewer.side,
      subject: `${request.code} · ${request.title}`,
    });
    return ok({ threadId: String(thread._id), created: true });
  }

  // support
  if (viewer.side === 'admin') return fail(ERR.FORBIDDEN);

  const existing = await ChatThread.findOne({
    kind: 'support',
    customerKey: viewer.customerKey,
    status: 'open',
  });
  if (existing) return ok({ threadId: String(existing._id), created: false });

  const thread = await ChatThread.create({
    code: makeCode('CH'),
    kind: 'support',
    customerKey: viewer.customerKey,
    /* A cook asking support a question is asking as themselves, not as their
       kitchen — so no kitchenId, or every reply would look like it was
       addressed to the shop. */
    kitchenId: null,
    openedBy: viewer.side,
    subject: spec.subject?.slice(0, 120) || 'Support',
  });
  return ok({ threadId: String(thread._id), created: true });
}

/* ------------------------------------------------------------------ *
 * sending
 * ------------------------------------------------------------------ */

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
  args: { threadId: string; body: string; clientId: string; attachments?: unknown[] },
): Promise<Result<{ message: ReturnType<typeof shapeMessage>; duplicate: boolean }>> {
  const body = String(args.body ?? '').trim();
  const attachments = args.attachments ?? [];

  if (!body && attachments.length === 0) return fail(ERR.NAME_REQUIRED);
  if (body.length > MAX_BODY) return fail(ERR.BAD_AMOUNT);
  if (!args.clientId) return fail(ERR.BAD_AMOUNT);

  const thread = await threadFor(viewer, args.threadId);
  if (!thread) return fail(ERR.FORBIDDEN);
  if (thread.status === 'closed') return fail(ERR.REQUEST_CLOSED);

  const seen = await ChatMessage.findOne({ clientId: args.clientId }).lean();
  if (seen) return ok({ message: shapeMessage(seen as MessageRow), duplicate: true });

  const senderRef =
    viewer.side === 'customer'
      ? viewer.customerKey
      : viewer.side === 'cook'
        ? viewer.kitchenId
        : viewer.email;

  try {
    /* The insert and both counters move together. A message that exists with
       nobody notified is worse than no message. */
    const created = await tx(async (session) => {
      const [message] = await ChatMessage.create(
        [
          {
            threadId: args.threadId,
            senderType: viewer.side,
            senderRef,
            senderName: viewer.name,
            body,
            attachments,
            clientId: args.clientId,
            // Your own message is read by you the instant you send it.
            ...(viewer.side === 'customer' ? { readByCustomerAt: new Date() } : {}),
            ...(viewer.side === 'cook' ? { readByCookAt: new Date() } : {}),
            ...(viewer.side === 'admin' ? { readByAdminAt: new Date() } : {}),
          },
        ],
        { session },
      );

      const inc: Record<string, number> = {};
      if (viewer.side !== 'customer') inc.unreadCustomer = 1;
      if (viewer.side !== 'cook' && thread.kitchenId) inc.unreadCook = 1;
      if (viewer.side !== 'admin') inc.unreadAdmin = 1;

      await ChatThread.updateOne(
        { _id: args.threadId },
        {
          $set: {
            lastMessageAt: message.sentAt,
            lastMessageBody: (body || '📎 attachment').slice(0, 140),
            lastMessageFrom: viewer.side,
          },
          ...(Object.keys(inc).length ? { $inc: inc } : {}),
        },
        { session },
      );

      return message;
    });

    return ok({ message: shapeMessage(created as unknown as MessageRow), duplicate: false });
  } catch (error) {
    /* Two devices replaying the same outbox at once. The other one won; hand
       back what it wrote rather than reporting a failure for a message that
       is safely stored. */
    if (isDuplicateKey(error)) {
      const stored = await ChatMessage.findOne({ clientId: args.clientId }).lean();
      if (stored) return ok({ message: shapeMessage(stored as MessageRow), duplicate: true });
    }
    throw error;
  }
}

/** A message nobody typed — an order moved, a price was agreed. */
export async function postSystemMessage(
  threadId: string,
  systemKind: string,
  body: string,
) {
  try {
    return await tx(async (session) => {
      const [message] = await ChatMessage.create(
        [
          {
            threadId,
            senderType: 'system',
            senderRef: null,
            senderName: '',
            body,
            systemKind,
            clientId: `sys:${threadId}:${systemKind}:${Date.now()}`,
          },
        ],
        { session },
      );
      await ChatThread.updateOne(
        { _id: threadId },
        {
          lastMessageAt: message.sentAt,
          lastMessageBody: body.slice(0, 140),
          lastMessageFrom: 'system',
        },
        { session },
      );
      return shapeMessage(message as unknown as MessageRow);
    });
  } catch {
    // A system note failing must never take down whatever triggered it.
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * reading and moderation
 * ------------------------------------------------------------------ */

export async function markRead(
  viewer: Viewer,
  threadId: string,
): Promise<Result<{ threadId: string }>> {
  const thread = await threadFor(viewer, threadId);
  if (!thread) return fail(ERR.FORBIDDEN);

  const stamp = readField(viewer.side);
  const counter = unreadField(viewer.side);

  await tx(async (session) => {
    await ChatMessage.updateMany(
      { threadId, [stamp]: null },
      { [stamp]: new Date() },
      { session },
    );
    await ChatThread.updateOne({ _id: threadId }, { [counter]: 0 }, { session });
  });

  return ok({ threadId });
}

/** Hide a message from both sides. The row stays; only operators see it. */
export async function hideMessage(
  messageId: string,
  by: string,
  note: string,
): Promise<Result<{ threadId: string }>> {
  const message = await ChatMessage.findById(messageId).catch(() => null);
  if (!message) return fail(ERR.NO_ORDER);

  await ChatMessage.updateOne(
    { _id: messageId },
    { hidden: true, hiddenBy: by, hiddenAt: new Date(), hiddenNote: note },
  );
  return ok({ threadId: message.threadId });
}

export async function setThreadStatus(
  threadId: string,
  status: 'open' | 'closed',
  by: string,
): Promise<Result<{ threadId: string }>> {
  await ChatThread.updateOne(
    { _id: threadId },
    {
      status,
      closedAt: status === 'closed' ? new Date() : null,
      closedBy: status === 'closed' ? by : null,
    },
  );
  return ok({ threadId });
}
