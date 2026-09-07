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
 */

export const MM_ERR = {
  /** The caller is not signed in. */
  UNAUTHENTICATED: 'mm-unauthenticated',
  /** No mess, or not this caller's. */
  NO_MESS: 'mm-mess-missing',
  /** The caller is not a member of the mess they named. */
  NOT_MEMBER: 'mm-not-a-member',
  /** A day, month, or range that is not one. */
  BAD_DATE: 'mm-date-invalid',
  /** An amount that is not a positive whole number of taka. */
  BAD_AMOUNT: 'mm-amount-invalid',
  /** A field the request needed and did not carry. */
  BAD_REQUEST: 'mm-request-invalid',
  /** The month is closed; its figures are frozen. */
  MONTH_CLOSED: 'mm-month-closed',
  /** Closing a month that is already closed. */
  ALREADY_CLOSED: 'mm-month-already-closed',
  /** Closing a month with nothing in it. */
  NOTHING_TO_CLOSE: 'mm-month-empty',
  /** No plan for that month yet. */
  NO_PLAN: 'mm-plan-missing',
  /** A target meal rate is needed before a plan can be built. */
  NO_TARGET: 'mm-target-missing',
  /** The planner had no dish it was allowed to use. */
  NO_CANDIDATES: 'mm-no-dishes',
  /** A recipe or food key that is not in the catalogue. */
  NO_RECIPE: 'mm-recipe-missing',
  /** An expense row that is not there. */
  NO_EXPENSE: 'mm-expense-missing',
  /** A plan item index that is not in the plan. */
  NO_ITEM: 'mm-plan-item-missing',
} as const;

/**
 * What each refusal means, in a sentence a person could read.
 *
 * The app translates from the English, as it does everywhere else, so these
 * double as the Bangla lookup keys.
 */
const MM_ERR_TEXT: Record<string, string> = {
  [MM_ERR.UNAUTHENTICATED]: 'Sign in to use meal management.',
  [MM_ERR.NO_MESS]: 'That mess could not be found.',
  [MM_ERR.NOT_MEMBER]: 'You are not a member of that mess.',
  [MM_ERR.BAD_DATE]: 'That date is not valid.',
  [MM_ERR.BAD_AMOUNT]: 'That amount is not valid.',
  [MM_ERR.BAD_REQUEST]: 'Something in that request was missing.',
  [MM_ERR.MONTH_CLOSED]: 'That month is closed, so its figures cannot change.',
  [MM_ERR.ALREADY_CLOSED]: 'That month is already closed.',
  [MM_ERR.NOTHING_TO_CLOSE]: 'There are no meals in that month to close.',
  [MM_ERR.NO_PLAN]: 'There is no meal plan for that month yet.',
  [MM_ERR.NO_TARGET]: 'Set a target meal rate first.',
  [MM_ERR.NO_CANDIDATES]: 'No dishes are available to plan with — check what you have chosen to avoid.',
  [MM_ERR.NO_RECIPE]: 'That dish could not be found.',
  [MM_ERR.NO_EXPENSE]: 'That expense could not be found.',
  [MM_ERR.NO_ITEM]: 'That meal is not in the plan.',
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
