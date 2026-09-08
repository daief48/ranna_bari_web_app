import type { Role } from './models.js';

/**
 * Who may do what. §4.17, as code.
 *
 * The specification opens that section with the sentence this file exists to
 * honour: *all permissions must be enforced on the backend; frontend-only
 * restrictions are not sufficient*. So the matrix lives here, every service
 * function consults it, and the app gets a copy only so it can grey out
 * buttons — never so it can decide anything.
 *
 * The matrix is deliberately a plain data table rather than a scattering of
 * `if (role === 'admin')`. A permission question that is answered in fourteen
 * places is a permission question that is answered differently in one of
 * them, and the table is small enough to read against the specification's own
 * grid in one sitting.
 */

/** Everything the module gates. One entry per row of the specification's table. */
export const ACTIONS = [
  'manage_members',
  'add_meal',
  'edit_own_meal',
  'edit_others_meal',
  'approve_meal_correction',
  'add_bazar',
  'approve_bazar',
  'add_expense',
  'approve_expense',
  'add_deposit',
  'approve_deposit',
  'view_reports',
  'view_all_reports',
  'close_month',
  'mess_settings',
  /* Rows the grid does not list but the modules need; each is placed at the
     level the neighbouring rows imply. */
  'manage_notices',
  'manage_polls',
  'manage_menu',
  'manage_cook',
  'manage_duty',
  'manage_categories',
  'post_adjustment',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * `true` — always allowed for the role.
 * `false` — never.
 * `'setting'` — the mess decides; §4.17 writes "Configurable" in these cells.
 */
type Verdict = boolean | 'setting';

const MATRIX: Record<Action, Record<Role, Verdict>> = {
  /* ---- §4.17, row for row ---- */
  manage_members: { admin: true, coadmin: true, member: false },
  add_meal: { admin: true, coadmin: true, member: true },
  edit_own_meal: { admin: true, coadmin: true, member: true },
  edit_others_meal: { admin: true, coadmin: 'setting', member: false },
  approve_meal_correction: { admin: true, coadmin: true, member: false },
  add_bazar: { admin: true, coadmin: true, member: true },
  approve_bazar: { admin: true, coadmin: true, member: false },
  add_expense: { admin: true, coadmin: true, member: true },
  approve_expense: { admin: true, coadmin: true, member: false },
  add_deposit: { admin: true, coadmin: true, member: true },
  approve_deposit: { admin: true, coadmin: true, member: false },
  /** Everybody can see reports; what they contain is the next row's question. */
  view_reports: { admin: true, coadmin: true, member: true },
  /** The whole mess's figures rather than only the caller's own. */
  view_all_reports: { admin: true, coadmin: true, member: 'setting' },
  close_month: { admin: true, coadmin: false, member: false },
  mess_settings: { admin: true, coadmin: false, member: false },

  /* ---- the rest, placed by analogy ---- */
  manage_notices: { admin: true, coadmin: true, member: false },
  manage_polls: { admin: true, coadmin: true, member: false },
  manage_menu: { admin: true, coadmin: true, member: false },
  manage_cook: { admin: true, coadmin: true, member: false },
  manage_duty: { admin: true, coadmin: true, member: false },
  /** Categories change what counts toward the rate, so they sit with settings. */
  manage_categories: { admin: true, coadmin: false, member: false },
  /** A post-close adjustment rewrites settled money. Admin only, like closing. */
  post_adjustment: { admin: true, coadmin: false, member: false },
};

/** The two mess settings that resolve a 'setting' cell. */
export type AccessSettings = {
  coAdminCanEditOthersMeal?: boolean;
  membersSeeFullReports?: boolean;
};

/**
 * Which setting decides which configurable cell.
 *
 * Kept as a lookup rather than branching inside `can`, so adding a
 * configurable permission is a line in this map and a line in the matrix
 * instead of another arm of a conditional.
 */
const SETTING_FOR: Partial<Record<Action, keyof AccessSettings>> = {
  edit_others_meal: 'coAdminCanEditOthersMeal',
  view_all_reports: 'membersSeeFullReports',
};

/**
 * May a role take this action in this mess?
 *
 * Membership and mess-scoping are *not* asked here — by the time this is
 * called the caller has already been proved to be an active member of the
 * mess in question. This answers the narrower question the matrix answers.
 */
export function can(role: Role | string, action: Action, settings: AccessSettings = {}): boolean {
  const row = MATRIX[action];
  if (!row) return false;

  const verdict = row[role as Role];
  if (verdict === undefined) return false;
  if (verdict !== 'setting') return verdict;

  const key = SETTING_FOR[action];
  if (!key) return false;

  /* A configurable cell defaults to the permissive reading, which is what the
     mess settings themselves default to. */
  return settings[key] !== false;
}

/**
 * The caller's whole permission set, for the app to draw with.
 *
 * Sent on the dashboard so a member never sees an Approve button that would
 * refuse them. This is a *rendering hint*: every one of these is re-checked
 * server-side on the action itself, and the app being wrong about one is a
 * cosmetic bug rather than a security one.
 */
export function permissionsFor(
  role: Role | string,
  settings: AccessSettings = {},
): Record<Action, boolean> {
  const out = {} as Record<Action, boolean>;
  for (const action of ACTIONS) out[action] = can(role, action, settings);
  return out;
}

/* ------------------------------------------------------------------ *
 * ownership
 * ------------------------------------------------------------------ */

/**
 * May the caller act on a record belonging to `ownerMemberId`?
 *
 * The pattern behind half the matrix: a member may do a thing to their own
 * row, and needs a stronger permission to do it to somebody else's. Written
 * once so "own" means the same thing for a meal, a deposit and a bazar.
 */
export function canTouch(
  role: Role | string,
  callerMemberId: string,
  ownerMemberId: string,
  otherAction: Action,
  settings: AccessSettings = {},
): boolean {
  if (callerMemberId === ownerMemberId) return true;
  return can(role, otherAction, settings);
}

/** Rank a role so "at least a co-admin" is one comparison. */
const RANK: Record<string, number> = { admin: 3, coadmin: 2, member: 1 };

export const atLeast = (role: Role | string, floor: Role): boolean =>
  (RANK[role] ?? 0) >= (RANK[floor] ?? 0);
