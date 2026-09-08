import { Types } from 'mongoose';

import { publish } from '../../../realtime/hub.js';

import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import { MmMember, MmMessage } from '../models.js';

import { allowed, audit, idOf, type MessContext } from './context.js';

/**
 * The mess's own room. Everyone in one mess, one conversation.
 *
 * There are no direct messages here, and that is a decision rather than an
 * omission. A mess is four to ten people who already share a single set of
 * books, and the conversation the books depend on — who is shopping tomorrow,
 * why gas is up, whether we are settling on Friday — is exactly the
 * conversation that must not happen in private pairs. Splitting it would give
 * a mess the one thing the whole feature exists to remove: a decision nobody
 * else can see.
 *
 * Two ties to the rest of the backend, and this file owns the second one. The
 * module borrows `identify()` for who the caller is, and here it borrows the
 * realtime hub to push a message to the people already holding a socket. It
 * publishes with `admins: false`, which is load-bearing: `publish` copies
 * every platform operator in by default, and a mess's private conversation
 * reaching marketplace support would be a leak, not a feature.
 */

/** How many messages one page carries. */
const PAGE = 40;

/** What a record reference may point at. */
const ABOUT_KINDS = new Set(['bazar', 'expense', 'deposit', 'month', 'meal']);

type AboutRef = { kind: string; id: string; label: string };

/** Narrow whatever arrived into a reference, or nothing. */
function cleanAbout(input: unknown): AboutRef | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const kind = String(raw.kind ?? '');
  if (!ABOUT_KINDS.has(kind)) return null;
  const id = String(raw.id ?? '').slice(0, 64);
  if (!id) return null;
  return { kind, id, label: String(raw.label ?? '').slice(0, 120) };
}

const view = (row: Record<string, unknown>, meId: string) => ({
  id: idOf(row._id),
  memberId: row.memberId,
  senderName: row.senderName,
  kind: row.kind,
  /* A hidden message keeps its place in the conversation but not its words —
     a reply above it would otherwise answer nothing. */
  body: row.hidden ? '' : row.body,
  hidden: !!row.hidden,
  replyToId: row.replyToId || null,
  replyToName: row.replyToName || null,
  replyToBody: row.replyToBody || null,
  about: row.about ?? null,
  at: row.at,
  mine: row.memberId === meId,
});

/* ------------------------------------------------------------------ *
 * reading
 * ------------------------------------------------------------------ */

/**
 * A page of the room, oldest-last.
 *
 * Paged backwards from newest because that is where a reader starts, then
 * reversed so the caller can append rather than prepend.
 *
 * The cursor is the oldest message's **id**, not its timestamp. That is not a
 * style choice: `at` defaults to `Date.now()`, so a burst — two people
 * answering at once, or one person's retry — lands several messages on the
 * same millisecond, and `{ at: { $lt: oldest } }` then skips every one of its
 * own ties and returns nothing. An ObjectId carries a counter as well as a
 * clock, so it orders insertions strictly even inside a millisecond.
 *
 * `at` is still what the room *displays*; it is simply not what it counts on.
 */
export async function listMessages(
  ctx: MessContext,
  input: { before?: string; limit?: number } = {},
): Promise<MmResult<Record<string, unknown>>> {
  const limit = Math.min(PAGE, Math.max(1, input.limit ?? PAGE));

  const query: Record<string, unknown> = { messId: ctx.messId };
  if (input.before && /^[a-f0-9]{24}$/i.test(input.before)) {
    query._id = { $lt: new Types.ObjectId(input.before) };
  }

  /* One extra row, purely to answer "is there more" without a second count. */
  const rows = await MmMessage.find(query).sort({ _id: -1 }).limit(limit + 1).lean();

  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();

  const me = await MmMember.findById(ctx.memberId).select({ chatReadAt: 1 }).lean();

  return mmOk({
    messages: page.map((row) => view(row as never, ctx.memberId)),
    hasMore,
    /* The cursor for the next page back — an id, matching what `before` takes. */
    oldest: page[0] ? idOf(page[0]._id) : null,
    readAt: me?.chatReadAt ?? null,
    canModerate: allowed(ctx, 'manage_notices'),
  });
}

/**
 * How many messages have arrived since this member last looked.
 *
 * Own messages are excluded — a room that badges you for your own sending is
 * a room whose badge nobody trusts.
 */
export async function unreadMessages(ctx: MessContext): Promise<number> {
  const me = await MmMember.findById(ctx.memberId).select({ chatReadAt: 1 }).lean();

  return MmMessage.countDocuments({
    messId: ctx.messId,
    memberId: { $ne: ctx.memberId },
    hidden: false,
    ...(me?.chatReadAt ? { at: { $gt: me.chatReadAt } } : {}),
  });
}

/** Move this member's watermark to now. */
export async function readMessages(ctx: MessContext) {
  await MmMember.updateOne({ _id: ctx.memberId }, { $set: { chatReadAt: new Date() } });
  return mmOk({ readAt: new Date() });
}

/* ------------------------------------------------------------------ *
 * writing
 * ------------------------------------------------------------------ */

/**
 * Say something to the mess.
 *
 * `clientId` makes the write idempotent: the app posts optimistically and a
 * flaky network will retry, and the unique index on (mess, clientId) turns
 * the second attempt into the same message rather than a duplicate. A replay
 * returns the row that already exists, so the caller cannot tell the
 * difference — which is the point.
 */
export async function sendMessage(
  ctx: MessContext,
  input: { body: string; clientId: string; replyToId?: string; about?: unknown },
): Promise<MmResult<Record<string, unknown>>> {
  const body = String(input.body ?? '').trim();
  if (!body) return mmFail(MM_ERR.MESSAGE_EMPTY);

  const existing = await MmMessage.findOne({ messId: ctx.messId, clientId: input.clientId }).lean();
  if (existing) return mmOk({ message: view(existing as never, ctx.memberId), replayed: true });

  /* The quoted line is copied rather than referenced, so a reply still reads
     after the message it answers is hidden. */
  let replyToName = '';
  let replyToBody = '';
  if (input.replyToId) {
    const parent = await MmMessage.findOne({ _id: input.replyToId, messId: ctx.messId }).lean();
    if (parent && !parent.hidden) {
      replyToName = parent.senderName ?? '';
      replyToBody = String(parent.body ?? '').slice(0, 160);
    }
  }

  let saved;
  try {
    saved = await MmMessage.create({
      messId: ctx.messId,
      memberId: ctx.memberId,
      senderName: ctx.memberName,
      kind: 'text',
      body: body.slice(0, 2000),
      replyToId: replyToName ? input.replyToId : '',
      replyToName,
      replyToBody,
      about: cleanAbout(input.about),
      clientId: input.clientId,
    });
  } catch (error) {
    /* Two devices replaying the same clientId at once: the index refused the
       second, so return the first rather than an error nobody caused. */
    const raced = await MmMessage.findOne({ messId: ctx.messId, clientId: input.clientId }).lean();
    if (raced) return mmOk({ message: view(raced as never, ctx.memberId), replayed: true });
    throw error;
  }

  const message = view(saved.toObject() as never, ctx.memberId);
  await broadcast(ctx, message);

  return mmOk({ message });
}

/**
 * Push a message to everybody in the mess who is holding a socket.
 *
 * Fire-and-forget, and per member rather than per mess: the hub indexes
 * sockets by `customerKey`, so there is no mess-shaped audience to publish to
 * — which also means a ghost member, having no account, is silently and
 * correctly skipped.
 *
 * The sender is left out because their own client already drew it.
 */
async function broadcast(ctx: MessContext, message: Record<string, unknown>): Promise<void> {
  const members = await MmMember.find({
    messId: ctx.messId,
    status: 'active',
    customerKey: { $type: 'string' },
    _id: { $ne: ctx.memberId },
  })
    .select({ customerKey: 1 })
    .lean()
    .catch(() => []);

  for (const member of members) {
    try {
      publish(
        { customerKey: member.customerKey, admins: false },
        /* `mine` is the sender's answer, not the receiver's. */
        { type: 'mm-message', messId: ctx.messId, message: { ...message, mine: false } },
      );
    } catch {
      /* A socket that has gone away must not fail the message that was
         already written. */
    }
  }
}

/**
 * Hide a message. §4.17's moderation, and the host chat's own rule.
 *
 * The row stays and keeps its place in the conversation — a room that can be
 * rewritten afterwards is not a record of what was said, and a reply whose
 * parent vanished answers nothing.
 */
export async function hideMessage(ctx: MessContext, messageId: string) {
  const row = await MmMessage.findOne({ _id: messageId, messId: ctx.messId }).lean();
  if (!row) return mmFail(MM_ERR.NO_MESSAGE);

  /* Your own words, or a moderator's. */
  const mine = row.memberId === ctx.memberId;
  if (!mine && !allowed(ctx, 'manage_notices')) {
    return mmFail(MM_ERR.FORBIDDEN, { action: 'manage_notices' });
  }

  await MmMessage.updateOne(
    { _id: messageId },
    { $set: { hidden: true, hiddenBy: ctx.caller.customerKey, hiddenAt: new Date() } },
  );

  audit(ctx, 'message.hide', {
    entity: 'message',
    entityId: messageId,
    summary: mine ? 'Removed their own message' : `Removed a message from ${row.senderName}`,
  });

  return mmOk({ hidden: true });
}
