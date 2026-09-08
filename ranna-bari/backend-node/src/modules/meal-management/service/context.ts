import { can, permissionsFor, type Action } from '../access.js';
import { monthOfDay, wallClock } from '../calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import {
  MmAudit,
  MmMealType,
  MmMember,
  MmMess,
  MmNotification,
  MmSession,
  type Role,
} from '../models.js';

/**
 * The plumbing every operation in the module starts from.
 *
 * Three questions have to be answered before any handler does anything —
 * which mess, is the caller in it, and may they do this — and they have to be
 * answered the same way every time. §4.17's data-isolation requirement is not
 * a feature somebody implements; it is the property that every query in the
 * module is scoped by a `messId` this file proved the caller belongs to.
 *
 * So the service modules never take a `messId` from a request body and go
 * looking. They take a `MessContext`, which can only be produced here, and
 * which carries the caller's own member row with it.
 */

export type Caller = { customerKey: string; name?: string | null };

export type MessContext = {
  messId: string;
  messName: string;
  /** The caller's member row id — what every record points at. */
  memberId: string;
  memberName: string;
  role: Role;
  settings: MessSettings;
  /** Cached for the request: cutoffs are needed by almost every meal path. */
  mealTypes: MealTypeRow[];
  caller: Caller;
};

export type MessSettings = {
  monthStartDay: number;
  allowedMealValues: number[];
  maxGuestPerMeal: number;
  rounding: string;
  roundingDigits: number;
  allExpensesInMealRate: boolean;
  requireBazarApproval: boolean;
  requireExpenseApproval: boolean;
  requireDepositApproval: boolean;
  requireJoinApproval: boolean;
  coAdminCanEditOthersMeal: boolean;
  membersSeeFullReports: boolean;
  defaultCutoffMinutes: number;
  carryForwardBalances: boolean;
  currency: string;
  timezone: string;
};

export type MealTypeRow = {
  key: string;
  label: string;
  order: number;
  defaultValue: number;
  cutoff: string;
  cutoffDayOffset: number;
  countsInRate: boolean;
  active: boolean;
};

const id = (value: unknown): string => String(value ?? '');

/* ------------------------------------------------------------------ *
 * resolving a caller into a mess
 * ------------------------------------------------------------------ */

/**
 * Every mess the caller is a live member of.
 *
 * §4.1 does not cap a person at one mess and the data model does not either —
 * somebody can keep a flat's books and their parents' at once. The app picks
 * one and sends its id; this is the list it picks from.
 */
export async function messesFor(caller: Caller) {
  const memberships = await MmMember.find({
    customerKey: caller.customerKey,
    status: { $in: ['active', 'pending'] },
  })
    .sort({ createdAt: 1 })
    .lean();

  if (!memberships.length) return [];

  const messes = await MmMess.find({
    _id: { $in: memberships.map((m) => m.messId) },
    archived: false,
  }).lean();

  const byId = new Map(messes.map((m) => [id(m._id), m]));

  return memberships
    .filter((m) => byId.has(m.messId))
    .map((m) => {
      const mess = byId.get(m.messId)!;
      return {
        messId: m.messId,
        name: mess.name,
        area: mess.area,
        code: mess.code,
        role: m.role,
        status: m.status,
        memberId: id(m._id),
      };
    });
}

/**
 * Turn a caller and a mess id into a context, or refuse.
 *
 * When no mess is named the caller's first live membership is used, so the app
 * can open the feature without knowing anything yet. That convenience is the
 * *only* place a mess is chosen for somebody — everywhere else the id is
 * explicit and checked here.
 */
export async function contextFor(
  caller: Caller,
  messId?: string | null,
): Promise<MmResult<MessContext>> {
  const query: Record<string, unknown> = {
    customerKey: caller.customerKey,
    status: { $in: ['active', 'pending', 'inactive'] },
  };
  if (messId) query.messId = messId;

  const member = await MmMember.findOne(query).sort({ createdAt: 1 }).lean();
  if (!member) return mmFail(messId ? MM_ERR.NOT_MEMBER : MM_ERR.NO_MESS);
  if (member.status !== 'active') return mmFail(MM_ERR.MEMBER_INACTIVE);

  const mess = await MmMess.findById(member.messId).lean();
  if (!mess || mess.archived) return mmFail(MM_ERR.NO_MESS);

  const mealTypes = await MmMealType.find({ messId: member.messId, active: true })
    .sort({ order: 1 })
    .lean();

  return mmOk({
    messId: member.messId,
    messName: mess.name,
    memberId: id(member._id),
    memberName: member.name,
    role: member.role as Role,
    settings: mess.settings as unknown as MessSettings,
    mealTypes: mealTypes as unknown as MealTypeRow[],
    caller,
  });
}

/** Re-read the mess's meal types, after they have been edited. */
export async function refreshMealTypes(ctx: MessContext): Promise<void> {
  const rows = await MmMealType.find({ messId: ctx.messId, active: true }).sort({ order: 1 }).lean();
  ctx.mealTypes = rows as unknown as MealTypeRow[];
}

/* ------------------------------------------------------------------ *
 * permission
 * ------------------------------------------------------------------ */

/** The matrix question, with the mess's configurable cells filled in. */
export const allowed = (ctx: MessContext, action: Action): boolean =>
  can(ctx.role, action, {
    coAdminCanEditOthersMeal: ctx.settings?.coAdminCanEditOthersMeal,
    membersSeeFullReports: ctx.settings?.membersSeeFullReports,
  });

/** `null` when allowed, a refusal when not — so a guard is one line at a call site. */
export const deny = (ctx: MessContext, action: Action) =>
  allowed(ctx, action) ? null : mmFail(MM_ERR.FORBIDDEN, { action });

/** The whole set, for the app to draw disabled buttons with. */
export const permissions = (ctx: MessContext) =>
  permissionsFor(ctx.role, {
    coAdminCanEditOthersMeal: ctx.settings?.coAdminCanEditOthersMeal,
    membersSeeFullReports: ctx.settings?.membersSeeFullReports,
  });

/* ------------------------------------------------------------------ *
 * the month a day belongs to, and whether it is still open
 * ------------------------------------------------------------------ */

/** The accounting month of a day, under this mess's month-start rule. */
export const monthFor = (ctx: MessContext, date: string): string =>
  monthOfDay(date, ctx.settings?.monthStartDay ?? 1);

/** Today, on the mess's own wall clock rather than the server's. */
export const todayIn = (ctx: MessContext): string =>
  wallClock(ctx.settings?.timezone ?? 'Asia/Dhaka').day;

/**
 * Refuse anything that would change a closed month.
 *
 * §4.8 makes a closed month a protected snapshot and §12 requires that it stay
 * readable afterwards, so every write path calls this and no read path does.
 * A month with no session row has never been closed and is therefore open —
 * sessions are created lazily, and demanding one before the first meal could
 * be recorded would be ceremony with no purpose.
 */
export async function requireOpenMonth(ctx: MessContext, month: string): Promise<MmResult<true>> {
  const session = await MmSession.findOne({ messId: ctx.messId, month }).lean();
  if (session && (session.status === 'closed' || session.status === 'archived')) {
    return mmFail(MM_ERR.MONTH_CLOSED, { month });
  }
  return mmOk(true);
}

/** Whether a month is frozen, for a read that wants to say so. */
export async function monthIsClosed(ctx: MessContext, month: string): Promise<boolean> {
  const session = await MmSession.findOne({ messId: ctx.messId, month })
    .select({ status: 1 })
    .lean();
  return session?.status === 'closed' || session?.status === 'archived';
}

/* ------------------------------------------------------------------ *
 * the audit trail
 * ------------------------------------------------------------------ */

/**
 * Record that something happened. §4.17, §12.
 *
 * Deliberately fire-and-forget: an audit write that fails should not fail the
 * operation it was describing, because the alternative is a mess that cannot
 * record a meal because a log collection is unhappy. The trail is for
 * explaining money after the fact, and a gap in it is a smaller problem than
 * a member who cannot turn dinner off.
 */
export function audit(
  ctx: MessContext,
  action: string,
  detail: {
    entity?: string;
    entityId?: string;
    summary?: string;
    before?: unknown;
    after?: unknown;
  } = {},
): void {
  void MmAudit.create({
    messId: ctx.messId,
    actorKey: ctx.caller.customerKey,
    actorName: ctx.memberName,
    action,
    entity: detail.entity ?? action.split('.')[0],
    entityId: detail.entityId ?? '',
    summary: detail.summary ?? '',
    before: detail.before ?? null,
    after: detail.after ?? null,
  }).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * notifications
 * ------------------------------------------------------------------ */

export type NoticeSpec = {
  kind: string;
  title: string;
  body?: string;
  link?: string;
};

/**
 * Tell specific members something. §4.10.
 *
 * Takes member ids and resolves them to accounts here, because a ghost member
 * has no account and every caller would otherwise have to remember that.
 * Fire-and-forget for the same reason `audit` is.
 */
export async function notifyMembers(
  ctx: MessContext,
  memberIds: string[],
  spec: NoticeSpec,
): Promise<void> {
  if (!memberIds.length) return;

  const rows = await MmMember.find({
    _id: { $in: memberIds },
    messId: ctx.messId,
    customerKey: { $type: 'string' },
  })
    .select({ customerKey: 1 })
    .lean();

  if (!rows.length) return;

  void MmNotification.insertMany(
    rows.map((row) => ({
      messId: ctx.messId,
      customerKey: row.customerKey,
      kind: spec.kind,
      title: spec.title,
      body: spec.body ?? '',
      link: spec.link ?? '',
    })),
  ).catch(() => {});
}

/**
 * Tell whoever can approve this kind of thing.
 *
 * §4.10 lists "bazar added", "deposit added" and friends as notifications, and
 * the person who needs them is whoever the matrix says can act on them. Asking
 * the matrix rather than hardcoding "admins" means a mess that has given its
 * co-admins approval rights gets its co-admins notified.
 */
export async function notifyApprovers(
  ctx: MessContext,
  action: Action,
  spec: NoticeSpec,
): Promise<void> {
  const roles = (['admin', 'coadmin', 'member'] as Role[]).filter((role) =>
    can(role, action, {
      coAdminCanEditOthersMeal: ctx.settings?.coAdminCanEditOthersMeal,
      membersSeeFullReports: ctx.settings?.membersSeeFullReports,
    }),
  );

  const rows = await MmMember.find({
    messId: ctx.messId,
    status: 'active',
    role: { $in: roles },
    customerKey: { $type: 'string' },
  })
    .select({ _id: 1 })
    .lean();

  /* Not the person who just did the thing — being told about your own
     submission is noise, and it is the one notification nobody needs. */
  const targets = rows.map((r) => id(r._id)).filter((memberId) => memberId !== ctx.memberId);

  await notifyMembers(ctx, targets, spec);
}

/** Everybody active in the mess — a notice, a poll, a closed month. */
export async function notifyEveryone(ctx: MessContext, spec: NoticeSpec): Promise<void> {
  const rows = await MmMember.find({
    messId: ctx.messId,
    status: 'active',
    customerKey: { $type: 'string' },
  })
    .select({ _id: 1 })
    .lean();

  await notifyMembers(ctx, rows.map((r) => id(r._id)), spec);
}

/* ------------------------------------------------------------------ *
 * small shared shapes
 * ------------------------------------------------------------------ */

/** Meal-type keys that count toward the rate, as the set `calc` wants. */
export const rateTypesOf = (ctx: MessContext): Set<string> =>
  new Set(ctx.mealTypes.filter((t) => t.countsInRate).map((t) => t.key));

/** Every active member of the mess, in the shape the statement builder takes. */
export async function membersOf(messId: string) {
  const rows = await MmMember.find({
    messId,
    status: { $in: ['active', 'inactive'] },
  })
    .sort({ createdAt: 1 })
    .lean();

  return rows.map((row) => ({
    memberId: id(row._id),
    name: row.name,
    role: row.role,
    status: row.status,
    ghost: row.ghost,
    customerKey: row.customerKey,
    avatar: row.avatar,
    phone: row.phone,
  }));
}

/**
 * Everyone who should be billed for a month.
 *
 * A member who left mid-month still ate for part of it, so §9's "member leaves
 * mid-month" case is handled by including anyone who has a record in the
 * month rather than only those active today. The caller passes the ids that
 * appeared in the month's own rows.
 */
export async function membersForMonth(messId: string, extraIds: string[] = []) {
  const active = await membersOf(messId);
  const known = new Set(active.map((m) => m.memberId));
  const missing = extraIds.filter((memberId) => memberId && !known.has(memberId));

  if (!missing.length) return active;

  const gone = await MmMember.find({ _id: { $in: missing }, messId }).lean();

  return [
    ...active,
    ...gone.map((row) => ({
      memberId: id(row._id),
      name: row.name,
      role: row.role,
      status: row.status,
      ghost: row.ghost,
      customerKey: row.customerKey,
      avatar: row.avatar,
      phone: row.phone,
    })),
  ];
}

export { id as idOf };
