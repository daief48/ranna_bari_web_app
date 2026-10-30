'use client';

import { useState } from 'react';

import {
  approveTopUpRequest,
  rejectTopUpRequest,
  saveTopUpConfig,
} from '@/actions/money';
import { ActionButton } from '@/components/ui/client';
import { taka } from '@/lib/format';

const input =
  'rounded-[8px] border border-line bg-canvas px-2 py-1 text-[12px] outline-none placeholder:text-ink3 focus:border-primary-200';

/**
 * Approve or decline one customer's top-up request.
 *
 * Approving credits the wallet, so the confirm names the three things an
 * operator must have checked against the provider's statement: the amount, the
 * transaction id and the sender. The ledger entry is idempotent on the
 * request, so a second click credits nothing more.
 */
export function TopUpRequestActions({
  id,
  amount,
  method,
  txnId,
  sender,
}: {
  id: string;
  amount: number;
  method: string;
  txnId: string;
  sender: string;
}) {
  const [note, setNote] = useState('');

  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton
        action={() => approveTopUpRequest(id)}
        variant="good"
        confirm={`Add ${taka(amount)} to this customer's wallet? Check ${method} shows ${txnId} for ${taka(amount)} from ${sender}.`}
      >
        Approve
      </ActionButton>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason to decline"
        aria-label={`Reason for declining ${txnId}`}
        className={`${input} w-40`}
      />
      <ActionButton
        action={() => rejectTopUpRequest(id, note)}
        variant="quiet"
        disabled={!note.trim()}
        confirm={`Decline this request? The customer is told: "${note.trim()}"`}
      >
        Decline
      </ActionButton>
    </div>
  );
}

/**
 * The numbers customers are told to pay.
 *
 * Blank means "not offered": with both blank the app shows that top-up is not
 * set up, and nothing in the app or the code supplies a number of its own.
 */
export function TopUpConfigForm({
  bkash,
  nagad,
  note,
}: {
  bkash: string;
  nagad: string;
  note: string;
}) {
  const [b, setB] = useState(bkash);
  const [g, setG] = useState(nagad);
  const [n, setN] = useState(note);

  return (
    <div className="flex flex-wrap items-end gap-3 p-4">
      <label className="flex flex-col gap-1 text-[11.5px] text-ink3">
        bKash number
        <input value={b} onChange={(e) => setB(e.target.value)} placeholder="01XXXXXXXXX" className={`${input} tnum w-36`} />
      </label>
      <label className="flex flex-col gap-1 text-[11.5px] text-ink3">
        Nagad number
        <input value={g} onChange={(e) => setG(e.target.value)} placeholder="01XXXXXXXXX" className={`${input} tnum w-36`} />
      </label>
      <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[11.5px] text-ink3">
        Note shown to customers
        <input value={n} onChange={(e) => setN(e.target.value)} placeholder="Use Send Money, not Payment" className={input} />
      </label>
      <ActionButton action={() => saveTopUpConfig(b, g, n)} variant="ghost">
        Save
      </ActionButton>
    </div>
  );
}
