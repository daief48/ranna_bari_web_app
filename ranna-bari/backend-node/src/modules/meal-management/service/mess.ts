import { isDay } from '../calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import {
  MmInvite,
  MmJoinRequest,
  MmMealType,
  MmMember,
  MmMess,
  type Role,
} from '../models.js';
import { makeCode, normaliseCode, seedMess } from '../seed.js';

import {
  audit,
  contextFor,
  deny,
  idOf,
  membersOf,
  messesFor,
  notifyEveryone,
  notifyMembers,
  refreshMealTypes,
  type Caller,
  type MessContext,
} from './context.js';

/**
 * Mess and membership. §4.1.
 *
 * This module is the foundation the specification says it is: every meal,
 * expense, payment and report belongs to a mess, and a person's relationship
 * to that mess — their role, their status, whether they even have an account —
 * is decided here and consulted everywhere else.
 *
 * The rule that shapes most of this file is §4.1's last-but-two line: *member
 * removal must not delete historical meal or financial records*. So nothing
 * here deletes a member. Leaving sets a status and a date; the row, and every
 * figure that points at it, stays exactly where it was.
 */

/* ------------------------------------------------------------------ *
 * creating and joining
 * ------------------------------------------------------------------ */

/** A join code that is not already taken. Six characters, ~900M combinations. */
async function freeCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeCode(6);
    if (!(await MmMess.exists({ code }))) return code;
  }
  /* Vanishingly unlikely; a longer code is still a valid code. */
  return makeCode(9);
}

export async function createMess(
  caller: Caller,
  input: { name: string; area?: string; currency?: string },
): Promise<MmResult<{ messId: string; code: string }>> {
  const code = await freeCode();

  const mess = await MmMess.create({
    name: input.name.trim(),
    area: input.area?.trim() ?? '',
    ownerKey: caller.customerKey,
    code,
    settings: input.currency ? { currency: input.currency } : {},
  });

  const messId = idOf(mess._id);

  /* The creator is the admin, and is a member like everybody else — the mess
     has no separate notion of an owner-who-is-not-in-it. */
  const member = await MmMember.create({
    messId,
    customerKey: caller.customerKey,
    name: caller.name || 'Me',
    role: 'admin',
    status: 'active',
    history: [{ status: 'active', at: new Date(), by: caller.customerKey, note: 'created the mess' }],
  });

  await seedMess(messId);

  await MmInvite.create({ messId, code, createdBy: caller.customerKey });

  void audit(
    {
      messId,
      memberId: idOf(member._id),
      memberName: member.name,
      caller,
    } as MessContext,
    'mess.create',
    { entity: 'mess', entityId: messId, summary: `Created the mess "${mess.name}"` },
  );

  return mmOk({ messId, code });
}

/**
 * Join with a code. §4.1.
 *
 * The mess's own `code` and any live `mm_invites` code both work, so a mess
 * can hand out a permanent code and a disposable link at the same time and
 * the joiner cannot tell the difference.
 *
 * Whether this lands as a membership or a request is the mess's
 * `requireJoinApproval` setting, which is §4.1's "optional approval workflow"
 * — the joiner does not choose.
 */
export async function joinByCode(
  caller: Caller,
  rawCode: string,
): Promise<MmResult<{ status: 'joined' | 'requested'; messId: string }>> {
  const code = normaliseCode(rawCode);
  if (!code) return mmFail(MM_ERR.BAD_INVITE);

  const mess = await MmMess.findOne({ code, archived: false }).lean();
  let invite: { _id: unknown; messId: string; maxUses: number; uses: number } | null = null;
  let messId = mess ? idOf(mess._id) : '';

  if (!mess) {
    const row = await MmInvite.findOne({ code, active: true }).lean();
    if (!row) return mmFail(MM_ERR.BAD_INVITE);
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return mmFail(MM_ERR.BAD_INVITE);
    if (row.maxUses > 0 && row.uses >= row.maxUses) return mmFail(MM_ERR.BAD_INVITE);

    const target = await MmMess.findById(row.messId).lean();
    if (!target || target.archived) return mmFail(MM_ERR.BAD_INVITE);

    invite = row as { _id: unknown; messId: string; maxUses: number; uses: number };
    messId = row.messId;
  }

  const existing = await MmMember.findOne({ messId, customerKey: caller.customerKey }).lean();
  if (existing && ['active', 'pending'].includes(existing.status)) {
    return mmFail(MM_ERR.ALREADY_MEMBER);
  }

  const settings = (mess ?? (await MmMess.findById(messId).lean()))?.settings;
  const needsApproval = settings?.requireJoinApproval !== false;

  if (needsApproval) {
    await MmJoinRequest.findOneAndUpdate(
      { messId, customerKey: caller.customerKey, status: 'pending' },
      {
        $setOnInsert: {
          messId,
          customerKey: caller.customerKey,
          name: caller.name ?? '',
          status: 'pending',
        },
      },
      { upsert: true },
    );

    const admins = await MmMember.find({
      messId,
      status: 'active',
      role: { $in: ['admin', 'coadmin'] },
    })
      .select({ _id: 1 })
      .lean();

    await notifyMembers(
      { messId, memberId: '', memberName: '', caller } as MessContext,
      admins.map((a) => idOf(a._id)),
      {
        kind: 'join-request',
        title: 'Someone wants to join',
        body: `${caller.name || 'A member'} has asked to join the mess.`,
        link: '/meal-management/members',
      },
    );

    return mmOk({ status: 'requested', messId });
  }

  /* A member who left and comes back reuses their row, so their history comes
     back with them — §9's returning-member case. */
  if (existing) {
    await MmMember.updateOne(
      { _id: existing._id },
      {
        $set: { status: 'active', leftAt: null, name: caller.name || existing.name },
        $push: { history: { status: 'active', at: new Date(), by: caller.customerKey, note: 'rejoined' } },
      },
    );
  } else {
    await MmMember.create({
      messId,
      customerKey: caller.customerKey,
      name: caller.name || 'Member',
      role: 'member',
      status: 'active',
      history: [{ status: 'active', at: new Date(), by: caller.customerKey, note: 'joined by code' }],
    });
  }

  if (invite) {
    await MmInvite.updateOne({ _id: invite._id }, { $inc: { uses: 1 } });
  }

  return mmOk({ status: 'joined', messId });
}

/** Which messes the caller can open, for the switcher. */
export async function myMesses(caller: Caller) {
  return mmOk({ messes: await messesFor(caller) });
}

/* ------------------------------------------------------------------ *
 * members
 * ------------------------------------------------------------------ */

export async function listMembers(ctx: MessContext) {
  const members = await membersOf(ctx.messId);
  const pending = await MmJoinRequest.countDocuments({ messId: ctx.messId, status: 'pending' });
  return mmOk({ members, pendingRequests: pending });
}

/** Everyone who has ever been in the mess, including those who left. §4.1. */
export async function memberHistory(ctx: MessContext) {
  const rows = await MmMember.find({ messId: ctx.messId }).sort({ createdAt: 1 }).lean();

  return mmOk({
    members: rows.map((row) => ({
      memberId: idOf(row._id),
      name: row.name,
      role: row.role,
      status: row.status,
      ghost: row.ghost,
      joinedAt: row.joinedAt,
      leftAt: row.leftAt,
      history: row.history ?? [],
    })),
  });
}

/**
 * Add somebody who does not have the app. §4.1's ghost member.
 *
 * The row is a full accounting identity with no `customerKey`, so meals and
 * money attach to it exactly as they would to anybody else. That is the whole
 * design: a ghost is not a special kind of record, it is an ordinary member
 * that nobody can sign in as.
 */
export async function addGhostMember(
  ctx: MessContext,
  input: { name: string; phone?: string },
): Promise<MmResult<{ memberId: string }>> {
  const refused = deny(ctx, 'manage_members');
  if (refused) return refused;

  const member = await MmMember.create({
    messId: ctx.messId,
    customerKey: null,
    name: input.name.trim(),
    phone: input.phone?.trim() ?? '',
    role: 'member',
    status: 'active',
    ghost: true,
    history: [{ status: 'active', at: new Date(), by: ctx.caller.customerKey, note: 'added as a ghost member' }],
  });

  audit(ctx, 'member.add-ghost', {
    entity: 'member',
    entityId: idOf(member._id),
    summary: `Added ${member.name} as an offline member`,
  });

  return mmOk({ memberId: idOf(member._id) });
}

/**
 * Change a member's role or status. §4.1.
 *
 * Two things this refuses, both of which would leave the mess unusable: the
 * last admin cannot be demoted, and a ghost cannot be given a role that
 * implies signing in. §4.1's admin-transfer step is the supported way to hand
 * over, and it is a separate call because it is a different intent.
 */
export async function updateMember(
  ctx: MessContext,
  memberId: string,
  patch: { name?: string; phone?: string; role?: Role; status?: string; note?: string },
): Promise<MmResult<{ memberId: string }>> {
  const refused = deny(ctx, 'manage_members');
  if (refused) return refused;

  const member = await MmMember.findOne({ _id: memberId, messId: ctx.messId }).lean();
  if (!member) return mmFail(MM_ERR.NO_MEMBER);

  if (patch.role && patch.role !== 'member' && member.ghost) {
    return mmFail(MM_ERR.GHOST_MEMBER);
  }

  /* A mess without an admin cannot close a month or change a setting ever
     again, so the second-to-last check in this module is also the strictest. */
  const losingAdmin =
    member.role === 'admin' &&
    ((patch.role && patch.role !== 'admin') || (patch.status && patch.status !== 'active'));

  if (losingAdmin) {
    const admins = await MmMember.countDocuments({
      messId: ctx.messId,
      role: 'admin',
      status: 'active',
      _id: { $ne: memberId },
    });
    if (admins === 0) return mmFail(MM_ERR.LAST_ADMIN);
  }

  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.phone !== undefined) set.phone = patch.phone.trim();
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.leftAt = patch.status === 'left' ? new Date() : null;
  }

  const push = patch.status
    ? {
        history: {
          status: patch.status,
          at: new Date(),
          by: ctx.caller.customerKey,
          note: patch.note ?? '',
        },
      }
    : undefined;

  await MmMember.updateOne({ _id: memberId }, push ? { $set: set, $push: push } : { $set: set });

  audit(ctx, 'member.update', {
    entity: 'member',
    entityId: memberId,
    summary: `Updated ${member.name}`,
    before: { role: member.role, status: member.status },
    after: { role: patch.role ?? member.role, status: patch.status ?? member.status },
  });

  if (patch.role && patch.role !== member.role) {
    await notifyMembers(ctx, [memberId], {
      kind: 'role-changed',
      title: 'Your role changed',
      body: `You are now ${patch.role === 'coadmin' ? 'a co-admin' : patch.role} of ${ctx.messName}.`,
      link: '/meal-management',
    });
  }

  return mmOk({ memberId });
}

/**
 * Hand the mess over. §4.1's admin transfer.
 *
 * Both rows move in the same call — the new owner becomes admin and the old
 * one becomes a co-admin rather than nothing, because a mess whose founder
 * loses all access the moment they hand over is a mess nobody hands over.
 */
export async function transferOwnership(
  ctx: MessContext,
  memberId: string,
): Promise<MmResult<{ memberId: string }>> {
  const refused = deny(ctx, 'mess_settings');
  if (refused) return refused;

  const target = await MmMember.findOne({ _id: memberId, messId: ctx.messId }).lean();
  if (!target) return mmFail(MM_ERR.NO_MEMBER);
  if (target.ghost || target.status !== 'active' || !target.customerKey) {
    return mmFail(MM_ERR.BAD_TRANSFER);
  }
  if (idOf(target._id) === ctx.memberId) return mmFail(MM_ERR.BAD_TRANSFER);

  await Promise.all([
    MmMember.updateOne({ _id: memberId }, { $set: { role: 'admin' } }),
    MmMember.updateOne({ _id: ctx.memberId }, { $set: { role: 'coadmin' } }),
    MmMess.updateOne({ _id: ctx.messId }, { $set: { ownerKey: target.customerKey } }),
  ]);

  audit(ctx, 'mess.transfer', {
    entity: 'mess',
    entityId: ctx.messId,
    summary: `Handed the mess over to ${target.name}`,
  });

  await notifyEveryone(ctx, {
    kind: 'owner-changed',
    title: 'The mess has a new admin',
    body: `${target.name} is now the admin of ${ctx.messName}.`,
    link: '/meal-management/members',
  });

  return mmOk({ memberId });
}

/**
 * Leave the mess yourself.
 *
 * Same refusal as demotion: the last admin has to hand over first. The row
 * survives, so the month they are leaving still bills them for what they ate.
 */
export async function leaveMess(ctx: MessContext): Promise<MmResult<{ left: true }>> {
  if (ctx.role === 'admin') {
    const admins = await MmMember.countDocuments({
      messId: ctx.messId,
      role: 'admin',
      status: 'active',
      _id: { $ne: ctx.memberId },
    });
    if (admins === 0) return mmFail(MM_ERR.LAST_ADMIN);
  }

  await MmMember.updateOne(
    { _id: ctx.memberId },
    {
      $set: { status: 'left', leftAt: new Date() },
      $push: { history: { status: 'left', at: new Date(), by: ctx.caller.customerKey, note: 'left the mess' } },
    },
  );

  audit(ctx, 'member.leave', {
    entity: 'member',
    entityId: ctx.memberId,
    summary: `${ctx.memberName} left the mess`,
  });

  return mmOk({ left: true });
}

/* ------------------------------------------------------------------ *
 * invitations and join requests
 * ------------------------------------------------------------------ */

export async function listInvites(ctx: MessContext) {
  const refused = deny(ctx, 'manage_members');
  if (refused) return refused;

  const invites = await MmInvite.find({ messId: ctx.messId, active: true })
    .sort({ createdAt: -1 })
    .lean();

  return mmOk({
    code: (await MmMess.findById(ctx.messId).select({ code: 1 }).lean())?.code ?? '',
    invites: invites.map((row) => ({
      id: idOf(row._id),
      code: row.code,
      expiresAt: row.expiresAt,
      maxUses: row.maxUses,
      uses: row.uses,
    })),
  });
}

export async function createInvite(
  ctx: MessContext,
  input: { expiresInDays?: number; maxUses?: number },
): Promise<MmResult<{ code: string }>> {
  const refused = deny(ctx, 'manage_members');
  if (refused) return refused;

  const code = await (async () => {
    for (let i = 0; i < 8; i += 1) {
      const candidate = makeCode(6);
      const taken =
        (await MmInvite.exists({ code: candidate })) || (await MmMess.exists({ code: candidate }));
      if (!taken) return candidate;
    }
    return makeCode(9);
  })();

  await MmInvite.create({
    messId: ctx.messId,
    code,
    createdBy: ctx.caller.customerKey,
    maxUses: Math.max(0, input.maxUses ?? 0),
    expiresAt: input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86_400_000)
      : null,
  });

  audit(ctx, 'invite.create', { entity: 'invite', summary: 'Created an invitation code' });

  return mmOk({ code });
}

export async function revokeInvite(ctx: MessContext, inviteId: string) {
  const refused = deny(ctx, 'manage_members');
  if (refused) return refused;

  const out = await MmInvite.updateOne(
    { _id: inviteId, messId: ctx.messId },
    { $set: { active: false } },
  );
  if (!out.matchedCount) return mmFail(MM_ERR.BAD_INVITE);

  audit(ctx, 'invite.revoke', { entity: 'invite', entityId: inviteId, summary: 'Revoked an invitation' });
  return mmOk({ revoked: true });
}

export async function listJoinRequests(ctx: MessContext) {
  const refused = deny(ctx, 'manage_members');
  if (refused) return refused;

  const rows = await MmJoinRequest.find({ messId: ctx.messId, status: 'pending' })
    .sort({ createdAt: 1 })
    .lean();

  return mmOk({
    requests: rows.map((row) => ({
      id: idOf(row._id),
      name: row.name,
      phone: row.phone,
      note: row.note,
      at: row.createdAt,
    })),
  });
}

export async function decideJoinRequest(
  ctx: MessContext,
  requestId: string,
  approve: boolean,
): Promise<MmResult<{ decided: 'approved' | 'rejected' }>> {
  const refused = deny(ctx, 'manage_members');
  if (refused) return refused;

  const request = await MmJoinRequest.findOne({ _id: requestId, messId: ctx.messId }).lean();
  if (!request) return mmFail(MM_ERR.NO_REQUEST);
  if (request.status !== 'pending') return mmFail(MM_ERR.REQUEST_DECIDED);

  await MmJoinRequest.updateOne(
    { _id: requestId },
    {
      $set: {
        status: approve ? 'approved' : 'rejected',
        decidedBy: ctx.caller.customerKey,
        decidedAt: new Date(),
      },
    },
  );

  if (approve) {
    const existing = await MmMember.findOne({
      messId: ctx.messId,
      customerKey: request.customerKey,
    }).lean();

    if (existing) {
      await MmMember.updateOne(
        { _id: existing._id },
        {
          $set: { status: 'active', leftAt: null },
          $push: { history: { status: 'active', at: new Date(), by: ctx.caller.customerKey, note: 'request approved' } },
        },
      );
    } else {
      await MmMember.create({
        messId: ctx.messId,
        customerKey: request.customerKey,
        name: request.name || 'Member',
        phone: request.phone ?? '',
        role: 'member',
        status: 'active',
        history: [
          { status: 'active', at: new Date(), by: ctx.caller.customerKey, note: 'join request approved' },
        ],
      });
    }
  }

  audit(ctx, approve ? 'member.approve-join' : 'member.reject-join', {
    entity: 'join-request',
    entityId: requestId,
    summary: `${approve ? 'Approved' : 'Rejected'} ${request.name || 'a'} join request`,
  });

  return mmOk({ decided: approve ? 'approved' : 'rejected' });
}

/** Withdraw your own pending request. §8's "Cancelled". */
export async function cancelJoinRequest(caller: Caller, messId: string) {
  const out = await MmJoinRequest.updateOne(
    { messId, customerKey: caller.customerKey, status: 'pending' },
    { $set: { status: 'cancelled', decidedAt: new Date() } },
  );
  if (!out.matchedCount) return mmFail(MM_ERR.NO_REQUEST);
  return mmOk({ cancelled: true });
}

/* ------------------------------------------------------------------ *
 * settings
 * ------------------------------------------------------------------ */

export async function getSettings(ctx: MessContext) {
  const mess = await MmMess.findById(ctx.messId).lean();
  if (!mess) return mmFail(MM_ERR.NO_MESS);

  const mealTypes = await MmMealType.find({ messId: ctx.messId }).sort({ order: 1 }).lean();

  return mmOk({
    mess: {
      messId: ctx.messId,
      name: mess.name,
      area: mess.area,
      code: mess.code,
      archived: mess.archived,
    },
    settings: mess.settings,
    mealTypes: mealTypes.map((row) => ({
      id: idOf(row._id),
      key: row.key,
      label: row.label,
      order: row.order,
      defaultValue: row.defaultValue,
      cutoff: row.cutoff,
      cutoffDayOffset: row.cutoffDayOffset,
      countsInRate: row.countsInRate,
      active: row.active,
    })),
  });
}

export async function saveSettings(
  ctx: MessContext,
  patch: { name?: string; area?: string; settings?: Record<string, unknown> },
) {
  const refused = deny(ctx, 'mess_settings');
  if (refused) return refused;

  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.area !== undefined) set.area = patch.area.trim();

  for (const [key, value] of Object.entries(patch.settings ?? {})) {
    set[`settings.${key}`] = value;
  }

  await MmMess.updateOne({ _id: ctx.messId }, { $set: set });

  audit(ctx, 'mess.settings', {
    entity: 'mess',
    entityId: ctx.messId,
    summary: 'Changed mess settings',
    after: patch.settings ?? {},
  });

  return getSettings(ctx);
}

/* ------------------------------------------------------------------ *
 * meal types
 * ------------------------------------------------------------------ */

export async function saveMealType(
  ctx: MessContext,
  input: {
    key: string;
    label?: string;
    order?: number;
    defaultValue?: number;
    cutoff?: string;
    cutoffDayOffset?: number;
    countsInRate?: boolean;
    active?: boolean;
  },
) {
  const refused = deny(ctx, 'mess_settings');
  if (refused) return refused;

  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!key) return mmFail(MM_ERR.BAD_REQUEST, { field: 'key' });

  const set: Record<string, unknown> = {};
  for (const field of [
    'label',
    'order',
    'defaultValue',
    'cutoff',
    'cutoffDayOffset',
    'countsInRate',
    'active',
  ] as const) {
    if (input[field] !== undefined) set[field] = input[field];
  }

  await MmMealType.updateOne(
    { messId: ctx.messId, key },
    { $set: set, $setOnInsert: { messId: ctx.messId, key, label: input.label ?? key } },
    { upsert: true },
  );

  await refreshMealTypes(ctx);

  audit(ctx, 'meal-type.save', { entity: 'meal-type', entityId: key, summary: `Updated the ${key} sitting` });

  return getSettings(ctx);
}

/**
 * Retire a sitting rather than delete it.
 *
 * Past entries are keyed by the type, so deleting the row would leave a
 * month's meals pointing at a sitting with no name. Deactivating keeps the
 * history readable and takes it off tomorrow's form, which is what anybody
 * asking to delete it actually wants.
 */
export async function removeMealType(ctx: MessContext, key: string) {
  const refused = deny(ctx, 'mess_settings');
  if (refused) return refused;

  const out = await MmMealType.updateOne(
    { messId: ctx.messId, key },
    { $set: { active: false } },
  );
  if (!out.matchedCount) return mmFail(MM_ERR.NO_MEAL_TYPE);

  await refreshMealTypes(ctx);
  audit(ctx, 'meal-type.retire', { entity: 'meal-type', entityId: key, summary: `Turned off the ${key} sitting` });

  return getSettings(ctx);
}

/* ------------------------------------------------------------------ *
 * archive
 * ------------------------------------------------------------------ */

/** §5's mess archive: readable, frozen, and never deleted. */
export async function archiveMess(ctx: MessContext) {
  const refused = deny(ctx, 'mess_settings');
  if (refused) return refused;

  await MmMess.updateOne(
    { _id: ctx.messId },
    { $set: { archived: true, archivedAt: new Date(), active: false } },
  );

  audit(ctx, 'mess.archive', { entity: 'mess', entityId: ctx.messId, summary: 'Archived the mess' });
  return mmOk({ archived: true });
}

/** A member's own profile inside this mess — name, phone, food preferences. */
export async function saveMyProfile(
  ctx: MessContext,
  patch: {
    name?: string;
    phone?: string;
    mealDefaults?: Record<string, number>;
    preferences?: { likes?: string[]; avoid?: string[]; note?: string };
  },
) {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.phone !== undefined) set.phone = patch.phone.trim();
  if (patch.mealDefaults !== undefined) set.mealDefaults = patch.mealDefaults;
  if (patch.preferences !== undefined) {
    if (patch.preferences.likes !== undefined) set['preferences.likes'] = patch.preferences.likes;
    if (patch.preferences.avoid !== undefined) set['preferences.avoid'] = patch.preferences.avoid;
    if (patch.preferences.note !== undefined) set['preferences.note'] = patch.preferences.note;
  }

  await MmMember.updateOne({ _id: ctx.memberId }, { $set: set });

  const member = await MmMember.findById(ctx.memberId).lean();

  return mmOk({
    memberId: ctx.memberId,
    name: member?.name ?? '',
    phone: member?.phone ?? '',
    role: member?.role ?? 'member',
    mealDefaults: member?.mealDefaults ?? {},
    preferences: member?.preferences ?? { likes: [], avoid: [], note: '' },
  });
}

/** Re-resolve the caller into a context after they created or joined a mess. */
export const refreshContext = (caller: Caller, messId: string) => contextFor(caller, messId);

/** Guard used by the routes when a body carries a date it will store. */
export const validDay = (date: string): boolean => isDay(date);
