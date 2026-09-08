/**
 * The module's own refusal vocabulary.
 *
 * Deliberately not the host's `ERR` map. Those codes are shared between the
 * backend, the Expo client and the admin panel, and every one of them is
 * something all three agree about — adding this feature's private failures to
 * that list would make three codebases share a vocabulary only one of them
 * uses. Every code here is prefixed `mm-`, so a refusal from this module can
 * never be confused with, or collide with, one from the rest of the app.
 *
 * The app maps these in the module's own error table, nowhere else.
 *
 * The specification is emphatic that permission and validation live on the
 * server (§4.17), so a large share of these codes are refusals a well-behaved
 * client would never provoke. They exist anyway: the client's job is to keep
 * people out of dead ends, and this file's job is to be right when it doesn't.
 */

export const MM_ERR = {
  /* ---- identity and membership ---- */
  /** The caller is not signed in. */
  UNAUTHENTICATED: 'mm-unauthenticated',
  /** The caller belongs to no mess yet. */
  NO_MESS: 'mm-mess-missing',
  /** The mess named exists, but the caller is not in it. */
  NOT_MEMBER: 'mm-not-a-member',
  /** The caller's membership is not active — pending, suspended or left. */
  MEMBER_INACTIVE: 'mm-member-inactive',
  /** A member id that is not in this mess. */
  NO_MEMBER: 'mm-member-missing',
  /** The action needs a role the caller does not hold. */
  FORBIDDEN: 'mm-not-allowed',
  /** An account already in the mess, joining again. */
  ALREADY_MEMBER: 'mm-already-a-member',
  /** A join code or invite link that matches nothing live. */
  BAD_INVITE: 'mm-invite-invalid',
  /** A join request that has already been decided. */
  REQUEST_DECIDED: 'mm-request-already-decided',
  /** A join request that is not there. */
  NO_REQUEST: 'mm-request-missing',
  /** The last admin cannot step down or leave. */
  LAST_ADMIN: 'mm-last-admin',
  /** Ownership can only pass to an active member who is not the owner. */
  BAD_TRANSFER: 'mm-transfer-invalid',
  /** A ghost member has no account, so it cannot be given a role or a login. */
  GHOST_MEMBER: 'mm-member-is-a-ghost',

  /* ---- shapes ---- */
  /** A day, month, or range that is not one. */
  BAD_DATE: 'mm-date-invalid',
  /** An amount that is not a usable sum of money. */
  BAD_AMOUNT: 'mm-amount-invalid',
  /** A field the request needed and did not carry. */
  BAD_REQUEST: 'mm-request-invalid',
  /** A meal value the mess does not permit. */
  BAD_MEAL_VALUE: 'mm-meal-value-invalid',
  /** A meal type key the mess does not have. */
  NO_MEAL_TYPE: 'mm-meal-type-missing',
  /** An expense category key the mess does not have. */
  NO_CATEGORY: 'mm-category-missing',
  /** An allocation that does not add up to the expense it splits. */
  BAD_ALLOCATION: 'mm-allocation-invalid',
  /** An upload larger than the module accepts, or of a type it does not. */
  BAD_ATTACHMENT: 'mm-attachment-invalid',

  /* ---- meals ---- */
  /** The cutoff for that sitting has passed; the entry is locked. */
  PAST_CUTOFF: 'mm-past-cutoff',
  /** The entry is locked and can only move through a correction request. */
  MEAL_LOCKED: 'mm-meal-locked',
  /** A correction request that is not there. */
  NO_CORRECTION: 'mm-correction-missing',
  /** A correction that has already been approved or rejected. */
  CORRECTION_DECIDED: 'mm-correction-already-decided',
  /** A second pending correction for the same day and member. */
  CORRECTION_PENDING: 'mm-correction-already-pending',
  /** A leave range that is not there. */
  NO_LEAVE: 'mm-leave-missing',

  /* ---- bazar, expenses, deposits ---- */
  /** A bazar entry that is not there. */
  NO_BAZAR: 'mm-bazar-missing',
  /** An expense row that is not there. */
  NO_EXPENSE: 'mm-expense-missing',
  /** A deposit row that is not there. */
  NO_DEPOSIT: 'mm-deposit-missing',
  /** A duty assignment that is not there. */
  NO_DUTY: 'mm-duty-missing',
  /** Submitting, approving or editing something already past that point. */
  BAD_STATUS: 'mm-status-invalid',
  /** Editing a record that has been approved; it must be reopened first. */
  ALREADY_APPROVED: 'mm-already-approved',
  /** A bazar with no items has no total to approve. */
  BAZAR_EMPTY: 'mm-bazar-empty',

  /* ---- the month ---- */
  /** The month is closed; its figures are frozen. */
  MONTH_CLOSED: 'mm-month-closed',
  /** Closing a month that is already closed. */
  ALREADY_CLOSED: 'mm-month-already-closed',
  /** Closing a month with nothing in it. */
  NOTHING_TO_CLOSE: 'mm-month-empty',
  /** Closing a month that still has approvals waiting on somebody. */
  APPROVALS_PENDING: 'mm-approvals-pending',
  /** A monthly session that has not been opened. */
  NO_SESSION: 'mm-session-missing',
  /** An adjustment against a month that is not closed. */
  NOT_CLOSED: 'mm-month-not-closed',

  /* ---- board, menu, cook ---- */
  /** A notice that is not there. */
  NO_NOTICE: 'mm-notice-missing',
  /** A poll that is not there. */
  NO_POLL: 'mm-poll-missing',
  /** A poll that has not started, or has finished. */
  POLL_CLOSED: 'mm-poll-closed',
  /** A second vote where the poll allows one. */
  ALREADY_VOTED: 'mm-already-voted',
  /** An option that is not on the poll. */
  BAD_OPTION: 'mm-poll-option-invalid',
  /** A menu entry that is not there. */
  NO_MENU: 'mm-menu-missing',
  /** A cook that is not there. */
  NO_COOK: 'mm-cook-missing',

  /* ---- assistant ---- */
  /** The assistant could not turn the sentence into an action. */
  AI_UNCLEAR: 'mm-assistant-unclear',
  /** The assistant understood, but the caller may not do it. */
  AI_FORBIDDEN: 'mm-assistant-not-allowed',
} as const;

/**
 * What each refusal means, in a sentence a person could read.
 *
 * The app translates from the English, as it does everywhere else, so these
 * double as the Bangla lookup keys.
 */
const MM_ERR_TEXT: Record<string, string> = {
  [MM_ERR.UNAUTHENTICATED]: 'Sign in to use meal management.',
  [MM_ERR.NO_MESS]: 'You are not in a mess yet.',
  [MM_ERR.NOT_MEMBER]: 'You are not a member of that mess.',
  [MM_ERR.MEMBER_INACTIVE]: 'Your membership of this mess is not active.',
  [MM_ERR.NO_MEMBER]: 'That member could not be found.',
  [MM_ERR.FORBIDDEN]: 'You do not have permission to do that.',
  [MM_ERR.ALREADY_MEMBER]: 'You are already in this mess.',
  [MM_ERR.BAD_INVITE]: 'That join code is not valid any more.',
  [MM_ERR.REQUEST_DECIDED]: 'That request has already been decided.',
  [MM_ERR.NO_REQUEST]: 'That join request could not be found.',
  [MM_ERR.LAST_ADMIN]: 'A mess needs an admin — make somebody else admin first.',
  [MM_ERR.BAD_TRANSFER]: 'Ownership can only pass to another active member.',
  [MM_ERR.GHOST_MEMBER]: 'That member has no app account.',

  [MM_ERR.BAD_DATE]: 'That date is not valid.',
  [MM_ERR.BAD_AMOUNT]: 'That amount is not valid.',
  [MM_ERR.BAD_REQUEST]: 'Something in that request was missing.',
  [MM_ERR.BAD_MEAL_VALUE]: 'This mess does not allow that meal value.',
  [MM_ERR.NO_MEAL_TYPE]: 'That meal type is not set up in this mess.',
  [MM_ERR.NO_CATEGORY]: 'That expense category could not be found.',
  [MM_ERR.BAD_ALLOCATION]: 'The shares do not add up to the expense amount.',
  [MM_ERR.BAD_ATTACHMENT]: 'That file could not be attached.',

  [MM_ERR.PAST_CUTOFF]: 'The cutoff for that meal has passed.',
  [MM_ERR.MEAL_LOCKED]: 'That meal is locked — send a correction request instead.',
  [MM_ERR.NO_CORRECTION]: 'That correction request could not be found.',
  [MM_ERR.CORRECTION_DECIDED]: 'That correction has already been decided.',
  [MM_ERR.CORRECTION_PENDING]: 'A correction for that day is already waiting.',
  [MM_ERR.NO_LEAVE]: 'That leave could not be found.',

  [MM_ERR.NO_BAZAR]: 'That bazar entry could not be found.',
  [MM_ERR.NO_EXPENSE]: 'That expense could not be found.',
  [MM_ERR.NO_DEPOSIT]: 'That deposit could not be found.',
  [MM_ERR.NO_DUTY]: 'That bazar duty could not be found.',
  [MM_ERR.BAD_STATUS]: 'That cannot be done at this stage.',
  [MM_ERR.ALREADY_APPROVED]: 'That has been approved already.',
  [MM_ERR.BAZAR_EMPTY]: 'Add at least one item before submitting a bazar.',

  [MM_ERR.MONTH_CLOSED]: 'That month is closed, so its figures cannot change.',
  [MM_ERR.ALREADY_CLOSED]: 'That month is already closed.',
  [MM_ERR.NOTHING_TO_CLOSE]: 'There is nothing recorded in that month to close.',
  [MM_ERR.APPROVALS_PENDING]: 'Some records are still waiting for approval.',
  [MM_ERR.NO_SESSION]: 'That month has not been opened yet.',
  [MM_ERR.NOT_CLOSED]: 'That month is not closed.',

  [MM_ERR.NO_NOTICE]: 'That notice could not be found.',
  [MM_ERR.NO_POLL]: 'That poll could not be found.',
  [MM_ERR.POLL_CLOSED]: 'That poll is not open for voting.',
  [MM_ERR.ALREADY_VOTED]: 'You have already voted in this poll.',
  [MM_ERR.BAD_OPTION]: 'That option is not on this poll.',
  [MM_ERR.NO_MENU]: 'That menu could not be found.',
  [MM_ERR.NO_COOK]: 'That cook could not be found.',

  [MM_ERR.AI_UNCLEAR]: 'I could not turn that into an action — try naming the meal and the day.',
  [MM_ERR.AI_FORBIDDEN]: 'You do not have permission for that action.',
};

export const mmErrText = (code: string): string =>
  MM_ERR_TEXT[code] ?? 'Something went wrong. Please try again.';

/* ------------------------------------------------------------------ *
 * results
 * ------------------------------------------------------------------ */

export type MmOk<T> = { ok: true; result: T };
export type MmFail = { ok: false; error: string; detail?: Record<string, unknown> };
export type MmResult<T> = MmOk<T> | MmFail;

export const mmOk = <T>(result: T): MmOk<T> => ({ ok: true, result });

export const mmFail = (error: string, detail?: Record<string, unknown>): MmFail => ({
  ok: false,
  error,
  ...(detail ? { detail } : {}),
});

/** Narrow a result without repeating the shape at every call site. */
export const isFail = <T>(out: MmResult<T>): out is MmFail => out.ok === false;
