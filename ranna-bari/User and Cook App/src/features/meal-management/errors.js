import { useCallback } from 'react';

import { useAlert } from '../../components/Alert';
import { errorText } from '../../lib/errors';
import { useLang } from '../../i18n/LanguageContext';

/**
 * Meal management — refusals, in words.
 *
 * The module's backend refuses with its own `mm-` prefixed codes, which the
 * app's shared `errorText` has never heard of and would answer with "Something
 * went wrong". That is exactly the wrong thing to say about a closed month or
 * a target that has not been set, so this maps the module's codes itself and
 * hands everything else — network failures, expired sessions — back to the
 * shared table, which is still the authority on those.
 *
 * Kept here rather than added to `src/lib/errors.js` so the feature owns its
 * whole vocabulary and the shared file stays the app's.
 */
export function mealErrorText(out, t, n) {
  const code = out?.error;

  switch (code) {
    case 'mm-month-closed':
      return t('That month is closed, so its meals and costs cannot change.');
    case 'mm-month-already-closed':
      return t('That month is already closed.');
    case 'mm-month-empty':
      return t('There are no meals in that month to close yet.');
    case 'mm-target-missing':
      return t('Set a target meal rate before building a plan.');
    case 'mm-plan-missing':
      return t('There is no plan for that month yet.');
    case 'mm-plan-item-missing':
      return t('That meal is no longer in your plan.');
    case 'mm-recipe-missing':
      return t('That dish is no longer available.');
    case 'mm-expense-missing':
      return t('That expense has already been removed.');
    case 'mm-no-dishes':
      return t('No dishes are left to plan with — check what you have chosen to avoid.');
    case 'mm-date-invalid':
      return t('That date is not valid.');
    case 'mm-amount-invalid':
      return t('That amount is not valid.');
    case 'mm-mess-missing':
    case 'mm-not-a-member':
      return t('That mess could not be found.');
    case 'mm-unauthenticated':
      return t('Sign in to use meal management.');
    case 'mm-request-invalid':
      return t('Something in that was not filled in correctly.');
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
