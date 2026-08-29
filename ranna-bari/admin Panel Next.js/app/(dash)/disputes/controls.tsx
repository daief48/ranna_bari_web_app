'use client';

import { useState } from 'react';

import { addDisputeNote, resolveDispute } from '@/actions/orders';
import { ActionButton } from '@/components/ui/client';
import { taka } from '@/lib/format';

type Resolution = 'refund' | 'release' | 'split' | 'no-action';

/**
 * Settle one case.
 *
 * The split slider is the point of this component: the two halves are shown
 * live as the operator drags it, because "৳600 back to the customer, ৳900 to
 * the cook" is a decision somebody has to be able to see before they make it.
 * The server re-checks that the halves add to exactly what is held.
 */
export function DisputeControls({
  disputeId,
  code,
  amount,
  payment,
  canResolve,
  canNote,
}: {
  disputeId: string;
  code: string;
  amount: number;
  payment: string;
  canResolve: boolean;
  canNote: boolean;
}) {
  /* A finding rather than a verdict: the same note is saved on its own and
     attached to whichever resolution is chosen, so it must not pre-announce
     one of the four. */
  const [note, setNote] = useState(
    'Called both sides. The cook says four boxes went out; the handover photo shows two. The customer is out the two that never arrived.',
  );
  const [resolution, setResolution] = useState<Resolution>('refund');
  /* The midpoint is where the slider starts, not a recommendation — the two
     figures under it are what the operator actually settles on. */
  const [refund, setRefund] = useState(Math.round(amount / 2));

  const held = payment === 'held';
  const input =
    'w-full rounded-[10px] border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-ink3 focus:border-primary-200';

  const OPTIONS: { key: Resolution; label: string; help: string; enabled: boolean }[] = [
    {
      key: 'refund',
      label: 'Refund the customer',
      help: `All ${taka(amount)} goes back.`,
      enabled: held,
    },
    {
      key: 'release',
      label: 'Release to the cook',
      help: 'The kitchen did its part.',
      enabled: held,
    },
    {
      key: 'split',
      label: 'Split it',
      help: 'Both sides carry some of it.',
      enabled: held,
    },
    {
      key: 'no-action',
      label: 'No money moves',
      help: 'Close it on the record alone.',
      enabled: true,
    },
  ];

  return (
    <div>
      <div className="label mb-1.5">Add a note</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="What you found, or how you are settling it."
        className={`${input} mb-2 resize-y`}
      />

      {canNote ? (
        <ActionButton
          action={() => addDisputeNote(disputeId, note)}
          variant="ghost"
          disabled={!note.trim()}
        >
          Save note
        </ActionButton>
      ) : null}

      {!canResolve ? (
        <p className="mt-3 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink3">
          Resolving a dispute moves money, so it needs the finance role. Sign in as
          finance@rannabari.app or admin@rannabari.app.
        </p>
      ) : (
        <div className="mt-4 border-t border-line pt-3">
          <div className="label mb-2">Resolve</div>

          {!held ? (
            <p className="mb-2 rounded-[10px] border border-line bg-sunken px-2.5 py-2 text-[11.5px] text-ink2">
              Nothing is held against this order any more, so only a no-money close is
              available.
            </p>
          ) : null}

          <div className="mb-3 space-y-1.5">
            {OPTIONS.map((option) => (
              <label
                key={option.key}
                className={`flex cursor-pointer items-start gap-2 rounded-[10px] border px-2.5 py-1.5 ${
                  resolution === option.key
                    ? 'border-primary-200 bg-primary-50'
                    : 'border-line bg-raised'
                } ${option.enabled ? '' : 'cursor-not-allowed opacity-45'}`}
              >
                <input
                  type="radio"
                  name={`res-${disputeId}`}
                  checked={resolution === option.key}
                  disabled={!option.enabled}
                  onChange={() => setResolution(option.key)}
                  className="mt-1 accent-[var(--primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold">{option.label}</span>
                  <span className="block text-[11px] text-ink3">{option.help}</span>
                </span>
              </label>
            ))}
          </div>

          {resolution === 'split' ? (
            <div className="mb-3 rounded-[10px] border border-line bg-sunken p-2.5">
              <input
                type="range"
                min={0}
                max={amount}
                step={10}
                value={refund}
                onChange={(e) => setRefund(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
                aria-label="Amount refunded to the customer"
              />
              <div className="mt-1.5 flex justify-between text-[12px]">
                <span className="text-primary">
                  Customer <strong className="tnum">{taka(refund)}</strong>
                </span>
                <span className="text-sage">
                  Cook side <strong className="tnum">{taka(amount - refund)}</strong>
                </span>
              </div>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink3">
                The cook&rsquo;s side still has commission taken off it before it
                reaches them.
              </p>
            </div>
          ) : null}

          <ActionButton
            action={() => resolveDispute(disputeId, resolution, refund, note)}
            variant="primary"
            disabled={!note.trim()}
            confirm={`Resolve ${code} as "${resolution}"? Any money this moves cannot be undone — only corrected with a new entry.`}
          >
            Resolve case
          </ActionButton>
        </div>
      )}
    </div>
  );
}
