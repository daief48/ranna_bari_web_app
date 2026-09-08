import { useCallback } from 'react';

import { useAlert } from '../../components/Alert';
import { errorText } from '../../lib/errors';
import { useLang } from '../../i18n/LanguageContext';

/**
 * Meal management — refusals, in words.
 *
 * The module's backend refuses with its own `mm-` prefixed codes, which the
 * app's shared `errorText` has never heard of and would answer with "Something
 * went wrong". That is exactly the wrong thing to say about a passed cutoff or
 * a closed month, so this maps the module's codes itself and hands everything
 * else — network failures, expired sessions — back to the shared table, which
 * is still the authority on those.
 *
 * Kept here rather than added to `src/lib/errors.js` so the feature owns its
 * whole vocabulary and the shared file stays the app's.
 */
export function mealErrorText(out, t, n) {
  const code = out?.error;
  const detail = out?.detail ?? {};

  switch (code) {
    /* ---- identity and membership ---- */
    case 'mm-unauthenticated':
      return t('Sign in to use meal management.');
    case 'mm-mess-missing':
      return t('You are not in a mess yet.');
    case 'mm-not-a-member':
      return t('You are not a member of that mess.');
    case 'mm-member-inactive':
      return t('Your membership of this mess is not active.');
    case 'mm-member-missing':
      return t('That member could not be found.');
    case 'mm-not-allowed':
      return t('You do not have permission to do that.');
    case 'mm-already-a-member':
      return t('You are already in this mess.');
    case 'mm-invite-invalid':
      return t('That join code is not valid any more.');
    case 'mm-request-already-decided':
      return t('That request has already been decided.');
    case 'mm-request-missing':
      return t('That join request could not be found.');
    case 'mm-last-admin':
      return t('A mess needs an admin — make somebody else admin first.');
    case 'mm-transfer-invalid':
      return t('Ownership can only pass to another active member.');
    case 'mm-member-is-a-ghost':
      return t('That member has no app account.');

    /* ---- shapes ---- */
    case 'mm-date-invalid':
      return t('That date is not valid.');
    case 'mm-amount-invalid':
      return detail.max
        ? t('That is more than the {n} allowed.', { n: n(detail.max) })
        : t('That amount is not valid.');
    case 'mm-request-invalid':
      return t('Something in that was not filled in correctly.');
    case 'mm-meal-value-invalid':
      return t('This mess does not allow that meal value.');
    case 'mm-meal-type-missing':
      return t('That meal is not set up in this mess.');
    case 'mm-category-missing':
      return t('That expense category could not be found.');
    case 'mm-allocation-invalid':
      /* The two numbers are the whole point of the message: somebody is
         staring at a split that looks right to them. */
      return detail.given !== undefined
        ? t('The shares add up to ৳{given}, not ৳{amount}.', {
            given: n(detail.given),
            amount: n(detail.amount),
          })
        : t('The shares do not add up to the amount.');
    case 'mm-attachment-invalid':
      return t('That receipt could not be attached — try a smaller photo.');

    /* ---- meals ---- */
    case 'mm-past-cutoff':
      return t('The cutoff for that meal has passed — send a correction request instead.');
    case 'mm-meal-locked':
      return t('That meal is locked — send a correction request instead.');
    case 'mm-correction-missing':
      return t('That correction request could not be found.');
    case 'mm-correction-already-decided':
      return t('That correction has already been decided.');
    case 'mm-correction-already-pending':
      return t('A correction for that day is already waiting.');
    case 'mm-leave-missing':
      return t('That leave could not be found.');

    /* ---- bazar, expenses, deposits ---- */
    case 'mm-bazar-missing':
      return t('That bazar entry could not be found.');
    case 'mm-expense-missing':
      return t('That expense could not be found.');
    case 'mm-deposit-missing':
      return t('That deposit could not be found.');
    case 'mm-duty-missing':
      return t('That bazar duty could not be found.');
    case 'mm-status-invalid':
      return t('That cannot be done at this stage.');
    case 'mm-already-approved':
      return t('That has been approved already, so it cannot be edited.');
    case 'mm-bazar-empty':
      return t('Add at least one item before submitting a bazar.');

    /* ---- the month ---- */
    case 'mm-month-closed':
      return t('That month is settled, so its figures cannot change.');
    case 'mm-month-already-closed':
      return t('That month is already settled.');
    case 'mm-month-empty':
      return t('There is nothing recorded in that month to settle.');
    case 'mm-approvals-pending':
      return t('Some records are still waiting for approval.');
    case 'mm-session-missing':
      return t('That month has not been opened yet.');
    case 'mm-month-not-closed':
      return t('That month is not settled yet.');

    /* ---- board, menu, cook ---- */
    case 'mm-notice-missing':
      return t('That notice could not be found.');
    case 'mm-poll-missing':
      return t('That poll could not be found.');
    case 'mm-poll-closed':
      return t('That poll is not open for voting.');
    case 'mm-already-voted':
      return t('You have already voted in this poll.');
    case 'mm-poll-option-invalid':
      return t('That option is not on this poll.');
    case 'mm-menu-missing':
      return t('That menu could not be found.');
    case 'mm-cook-missing':
      return t('That cook could not be found.');

    /* ---- assistant ---- */
    case 'mm-assistant-unclear':
      return t('I could not turn that into an action — try naming the meal and the day.');
    case 'mm-assistant-not-allowed':
      return t('You do not have permission for that action.');

    default:
      /* Not one of ours — the shared table knows about network, session and
         the rest of the app's vocabulary. */
      return errorText(code, t, n, out ?? {});
  }
}

/**
 * `useAction`, with this module's error vocabulary.
 *
 * Same contract as the app's shared hook — run a write, surface a refusal,
 * optionally toast on success, always return the verdict — so screens read the
 * same as the rest of the app.
 */
export function useMealAction() {
  const alert = useAlert();
  const { t, n } = useLang();

  return useCallback(
    async (write, successMessage) => {
      const out = await write();

      if (out && out.ok === false) {
        alert.error(mealErrorText(out, t, n));
        return out;
      }

      if (successMessage) alert.success(successMessage);
      return out;
    },
    [alert, t, n],
  );
}

/**
 * The codes a screen should treat as "you cannot be here", not "that failed".
 *
 * A refusal in this set means the caller has no business on the screen at all
 * — they left the mess, or it was archived under them — so the screens send
 * them back to the hub rather than showing a toast over a page of nothing.
 */
export const isScopeError = (code) =>
  code === 'mm-mess-missing' || code === 'mm-not-a-member' || code === 'mm-member-inactive';
