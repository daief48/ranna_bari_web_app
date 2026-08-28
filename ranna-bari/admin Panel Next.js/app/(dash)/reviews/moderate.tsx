'use client';

import { useState } from 'react';

import { moderateReview } from '@/actions/platform';
import { ActionButton } from '@/components/ui/client';

/**
 * Hide or restore one review.
 *
 * Hiding needs a note because the kitchen's score moves with it — an operator
 * six months from now looking at why a rating jumped deserves an answer.
 */
export function ModerateReview({
  reviewId,
  hidden,
  kitchenName,
}: {
  reviewId: string;
  hidden: boolean;
  kitchenName: string;
}) {
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);

  if (hidden) {
    return (
      <ActionButton action={() => moderateReview(reviewId, false, '')} variant="quiet">
        Restore
      </ActionButton>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => setAsking((a) => !a)}
        className="rounded-[10px] border border-line bg-raised px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-sunken"
      >
        Hide
      </button>

      {asking ? (
        <div className="w-[210px] rounded-[10px] border border-line bg-sunken p-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why?"
            className="mb-1.5 w-full rounded-[8px] border border-line bg-canvas px-2 py-1 text-[12px] outline-none focus:border-primary-200"
          />
          <ActionButton
            action={() => moderateReview(reviewId, true, note)}
            variant="danger"
            disabled={!note.trim()}
            confirm={`Hide this review? ${kitchenName}'s rating is recomputed without it.`}
          >
            Hide it
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}
