'use server';

import { revalidatePath } from 'next/cache';

import { requireCapability } from '@/lib/auth';
import { BackendError, post } from '@/lib/backend';
import { ERR } from '@/lib/domain';
import { good, bad, guard, type ActionResult } from './shared';

/**
 * The meal system's operator half.
 *
 * The platform sets what a meal category is worth and what every cook's
 * calendar starts as; a cook overrides both from their own app. These are the
 * platform's side of that, and nothing here can reach a cook's own plan — a
 * cook's copy is a separate document by design, and an operator editing the
 * system month must not silently rewrite the menu somebody is cooking from
 * tomorrow.
 */

/**
 * Answer a backend refusal in the backend's own words.
 *
 * Same reasoning as `actions/platform.ts`: `guard()` reads a thrown message as
 * an error *code*, and a `BackendError` already carries a finished sentence
 * that would be flattened into "That did not work." by that lookup.
 */
async function attempt(body: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await body();
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    return bad(
      error.status === 0
        ? 'The backend is not answering. Start it with: cd backend-node && npm run dev'
        : error.message,
    );
  }
}

/* ------------------------------------------------------------------ *
 * categories and their rates
 * ------------------------------------------------------------------ */

/**
 * Add a category, or rename and re-price one.
 *
 * The rate set here is the *default*. A cook who has set their own keeps it —
 * the effective rate is the cook's if they named one, this otherwise — and
 * nothing already booked moves at all, because a booking snapshots the rate it
 * was made at. So this changes what new bookings cost on cooks who never
 * priced themselves, and nothing else.
 */
export async function saveMealCategory(
  id: string | null,
  label: string,
  rate: number,
): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('config.write');

      const clean = label.trim();
      if (!clean) return bad(ERR.NAME_REQUIRED);
      if (!Number.isFinite(rate) || rate <= 0) return bad(ERR.BAD_AMOUNT);

      if (id) await post(`/meal-categories/${id}`, { label: clean, rate });
      else await post('/meal-categories', { label: clean, rate });

      revalidatePath('/meal-categories');
      revalidatePath('/meal-plans');
      return good(id ? 'Saved.' : 'Added.');
    }),
  );
}

/**
 * Stop offering a category, or offer it again.
 *
 * Never a delete. Every service, calendar and past booking stores the category
 * *key* on its own row, so removing it would orphan all of them at once with
 * nothing to catch it. Retiring stops it being offered to a cook setting up
 * something new, and leaves everything already on it meaning what it said.
 */
export async function retireMealCategory(id: string, retired: boolean): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('config.write');

      await post(`/meal-categories/${id}/retire`, { retired });

      revalidatePath('/meal-categories');
      return good(retired ? 'No longer offered.' : 'Back in the list.');
    }),
  );
}

/* ------------------------------------------------------------------ *
 * the system calendar
 * ------------------------------------------------------------------ */

export type PlanDayInput = {
  date: string;
  breakfast?: string;
  lunch?: string;
  dinner?: string;
};

/**
 * Write one month of the platform's calendar for one category.
 *
 * Saving and publishing are one call with a flag rather than two states,
 * because the only difference that matters downstream is whether a cook may
 * book against it. An operator filling in thirty-one days over a lunch break
 * saves a draft; the month goes live when they say so.
 */
export async function saveMealPlan(
  categoryKey: string,
  month: string,
  days: PlanDayInput[],
  publish: boolean,
): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('meal.write');

      if (!categoryKey) return bad(ERR.NAME_REQUIRED);
      if (!/^\d{4}-\d{2}$/.test(month)) return bad('A month reads YYYY-MM.');

      /* Blank days are sent rather than filtered: clearing a dish is an edit,
         and dropping empty rows here would make it impossible to undo one. */
      await post('/meal-plans', { categoryKey, month, days, publish });

      revalidatePath('/meal-plans');
      return good(publish ? 'Published — cooks can book against it.' : 'Draft saved.');
    }),
  );
}
