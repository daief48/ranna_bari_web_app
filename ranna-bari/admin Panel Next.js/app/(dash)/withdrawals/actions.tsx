'use client';

import { useState } from 'react';

import { payWithdrawal, rejectWithdrawal } from '@/actions/money';
import { ActionButton } from '@/components/ui/client';
import { taka } from '@/lib/format';

/**
 * Pay or decline one open withdrawal.
 *
 * "Mark paid" asks first and says what it does: the operator has already sent
 * the money by hand, and this records it as leaving the platform. The backend
 * posts one entry whatever happens here, so a double click is safe; the
 * confirm is for the human who is about to click on the wrong row.
 *
 * Declining needs a reason because the cook reads it, and the field is
 * deliberately blank: a default reason would be sent to a cook without anyone
 * having written it.
 */
export function WithdrawalActions({
  id,
  code,
  amount,
  account,
  method,
}: {
  id: string;
  code: string;
  amount: number;
  account: string;
  method: string;
}) {
  const [note, setNote] = useState('');

  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton
        action={() => payWithdrawal(id)}
        variant="good"
        confirm={`Mark ${code} paid? You should have already sent ${taka(amount)} to ${method} ${account}. The entry cannot be undone.`}
      >
        Mark paid
      </ActionButton>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason to decline"
        aria-label={`Reason for declining ${code}`}
        className="w-40 rounded-[8px] border border-line bg-canvas px-2 py-1 text-[12px] outline-none placeholder:text-ink3 focus:border-primary-200"
      />
      <ActionButton
        action={() => rejectWithdrawal(id, note)}
        variant="quiet"
        disabled={!note.trim()}
        confirm={`Decline ${code}? The cook is told: "${note.trim()}"`}
      >
        Decline
      </ActionButton>
    </div>
  );
}
