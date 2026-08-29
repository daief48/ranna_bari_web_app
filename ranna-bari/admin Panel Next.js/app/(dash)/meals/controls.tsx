'use client';

import { useState } from 'react';

import { closeMeal, cancelMeal } from '@/actions/orders';
import { ActionButton } from '@/components/ui/client';

/**
 * Close or cancel one meal.
 *
 * Two different things: closing stops new orders and leaves the placed ones
 * alone, cancelling refunds everybody. The cancel path asks for a reason
 * because every customer on the meal is sent it.
 */
export function MealControls({
  mealId,
  title,
  status,
  soldCount,
}: {
  mealId: string;
  title: string;
  status: string;
  soldCount: number;
}) {
  const [asking, setAsking] = useState(false);
  /* Every customer on the meal is sent this, so it is written to be read by
     one — the reason a cook actually pulls a serve date. */
  const [reason, setReason] = useState('Cook is ill — nothing is cooking today.');

  if (status === 'cancelled') {
    return <span className="text-[11.5px] text-ink3">cancelled</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex gap-1.5">
        {status === 'published' ? (
          <ActionButton action={() => closeMeal(mealId)} variant="ghost">
            Close
          </ActionButton>
        ) : null}

        <button
          type="button"
          onClick={() => setAsking((a) => !a)}
          className="rounded-[10px] border border-primary-100 bg-primary-50 px-3 py-1.5 text-[13px] font-semibold text-primary hover:bg-primary-100"
        >
          Cancel
        </button>
      </div>

      {asking ? (
        <div className="w-[220px] rounded-[10px] border border-line bg-sunken p-2">
          <p className="mb-1.5 text-[11px] leading-relaxed text-ink2">
            {soldCount > 0
              ? `${soldCount} ${soldCount === 1 ? 'order' : 'orders'} will be refunded and told why.`
              : 'Nothing is held against this meal.'}
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            className="mb-1.5 w-full rounded-[8px] border border-line bg-canvas px-2 py-1 text-[12px] outline-none focus:border-primary-200"
          />
          <ActionButton
            action={() => cancelMeal(mealId, reason)}
            variant="danger"
            disabled={!reason.trim()}
            confirm={`Cancel "${title}" and refund ${soldCount} ${soldCount === 1 ? 'order' : 'orders'}?`}
          >
            Confirm cancel
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}
