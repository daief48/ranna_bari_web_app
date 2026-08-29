'use client';

import { useState } from 'react';

import { reconcileTopUp } from '@/actions/money';
import { ActionButton } from '@/components/ui/client';

/**
 * Attach a payment reference to one wallet credit.
 *
 * The amount defaults to what the wallet was credited, so the common case is
 * one paste and one click. Typing a different figure is what flags the row as
 * a disagreement rather than a match.
 */
export function ReconcileRow({ id, amount }: { id: string; amount: number }) {
  /* Blank on purpose, alone among the fields on this desk. The reference is
     copied off the provider's statement and is the entire attestation that the
     money arrived; a default one would let a credit be stamped `matched`
     against a payment nobody went and looked for. The placeholder carries the
     shape, which is the most this screen honestly knows. */
  const [ref, setRef] = useState('');
  /* The credited amount, so the common case is one paste and one click.
     Anything else typed here is the operator saying the two disagree. */
  const [value, setValue] = useState(String(amount));

  const input =
    'rounded-[8px] border border-line bg-canvas px-2 py-1 text-[12px] outline-none placeholder:text-ink3 focus:border-primary-200';

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="BKS482170"
        className={`${input} tnum w-24`}
        aria-label="Payment reference"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="numeric"
        className={`${input} tnum w-16`}
        aria-label="Amount the provider says"
      />
      <ActionButton
        action={() => reconcileTopUp(id, ref, Number(value))}
        variant="ghost"
        disabled={!ref.trim()}
      >
        Match
      </ActionButton>
    </div>
  );
}
