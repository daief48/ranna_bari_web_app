'use client';

import { forceRelease } from '@/actions/money';
import { ActionButton } from '@/components/ui/client';
import { taka } from '@/lib/format';

/**
 * Release one meal's money, from the row that meal is on.
 *
 * Deliberately the same server action the orders board uses rather than a
 * meal-shaped copy of it: a meal *is* an order here, and two paths that both
 * move escrow are two places for the ledger rules to drift apart.
 *
 * The button is only offered on a meal the customer has confirmed. An operator
 * can still force a release from the order's own page — that is what it is
 * for — but this screen is the routine one, and the routine case is "the
 * customer said it arrived, pay the cook."
 */
export function MealRelease({
  orderId,
  code,
  amount,
  payment,
  confirmed,
  canMoney,
}: {
  orderId: string;
  code: string;
  amount: number;
  payment: string | null;
  confirmed: boolean;
  canMoney: boolean;
}) {
  if (payment === 'released') {
    return <span className="text-[11.5px] whitespace-nowrap text-ink3">paid</span>;
  }
  if (payment === 'refunded') {
    return <span className="text-[11.5px] whitespace-nowrap text-ink3">refunded</span>;
  }
  if (!canMoney) return null;

  if (payment !== 'held') {
    return (
      <span
        className="text-[11.5px] whitespace-nowrap text-ink3"
        title="Nothing is in escrow against this meal yet."
      >
        —
      </span>
    );
  }

  if (!confirmed) {
    return (
      <span
        className="text-[11.5px] whitespace-nowrap text-ink3"
        title="The customer has not confirmed this meal arrived. Release it from the order page if you have another reason to."
      >
        waiting
      </span>
    );
  }

  return (
    <ActionButton
      action={() => forceRelease(orderId, 'Meal confirmed by the customer')}
      variant="ghost"
      confirm={`Release ${taka(amount)} on ${code} to the cook? The ledger is append-only, so this can only be corrected with a new entry.`}
    >
      Release
    </ActionButton>
  );
}
