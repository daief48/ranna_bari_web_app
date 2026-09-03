'use client';

import { useState } from 'react';

import { decideKyc } from '@/actions/kitchens';
import { ActionButton } from '@/components/ui/client';

/**
 * Approve or reject one cook.
 *
 * A rejection requires a note because the cook is sent it verbatim — a
 * rejection that arrives as silence is indistinguishable from the queue being
 * slow, and the cook has no way to fix whatever was wrong.
 */
export function KycDecision({
  kitchenId,
  name,
  status = 'pending',
}: {
  kitchenId: string;
  name: string;
  /**
   * What the kitchen is now.
   *
   * The queue only ever shows this component undecided, so it defaulted to
   * offering both buttons. On a kitchen page it can be opened on a cook who
   * was approved months ago, and "Approve" sitting under a green Approved
   * badge is a button whose meaning nobody can guess.
   */
  status?: string;
}) {
  const approved = status === 'approved';
  /* Written as a rejection, because that is the only path this field is
     required on and the only one where the text reaches the cook verbatim. An
     approval-shaped default would sit one mis-click away from telling a
     rejected cook their papers were fine. */
  const [note, setNote] = useState(
    'The back of the NID is too blurred to read the number. Re-upload it in daylight and we will look again the same day.',
  );

  return (
    <div>
      <div className="label mb-1.5">Decision</div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Note — optional to approve, required to reject. The cook is sent this."
        className="mb-2 w-full resize-y rounded-[10px] border border-line bg-canvas px-2.5 py-2 text-[12.5px] outline-none placeholder:text-ink3 focus:border-primary-200"
      />

      <div className="flex flex-wrap gap-2">
        {/* Not offered on a kitchen that is already approved — there is
            nothing for it to change, and it would read as an action. */}
        {approved ? null : (
          <ActionButton
            action={() => decideKyc(kitchenId, 'approved', note)}
            variant="good"
            confirm={`Approve ${name}? They can open their kitchen and start taking orders immediately.`}
          >
            Approve kitchen
          </ActionButton>
        )}

        <ActionButton
          action={() => decideKyc(kitchenId, 'rejected', note)}
          variant="danger"
          disabled={!note.trim()}
          title={note.trim() ? undefined : 'A rejection needs a reason'}
        >
          {approved ? 'Revoke approval' : 'Reject'}
        </ActionButton>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-ink3">
        {approved ? (
          <>
            This kitchen is approved and trading. Revoking stops it taking new
            orders — the cook is sent the note above.
          </>
        ) : (
          <>
            Approving writes <code>isVerified: true</code> and stamps who decided it.
            It is also the only thing that lets this cook open their kitchen, add
            dishes or take orders. Both outcomes notify the cook and land in the
            audit log.
          </>
        )}
      </p>
    </div>
  );
}
