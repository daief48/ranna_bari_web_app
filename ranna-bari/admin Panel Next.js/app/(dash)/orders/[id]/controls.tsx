'use client';

import { useState } from 'react';

import { forceAdvance, forceCancel, openDispute } from '@/actions/orders';
import { forceRelease, forceRefund } from '@/actions/money';
import { ActionButton } from '@/components/ui/client';
import { taka } from '@/lib/format';

/**
 * Everything an operator can do to one order.
 *
 * Grouped by who is allowed: moving an order along is operations, moving its
 * money is finance, and opening a case is support. Each group renders only if
 * the signed-in role holds the capability — and each action re-checks on the
 * server, because a hidden button is a courtesy rather than a control.
 */
export function OrderControls({
  orderId,
  code,
  kind,
  status,
  payment,
  amount,
  nextStep,
  hasDispute,
  canWrite,
  canMoney,
  canDispute,
}: {
  orderId: string;
  code: string;
  kind: string;
  status: string;
  payment: string;
  amount: number;
  nextStep: string | null;
  hasDispute: boolean;
  canWrite: boolean;
  canMoney: boolean;
  canDispute: boolean;
}) {
  const [cancelReason, setCancelReason] = useState(
    'Cook unreachable for 20 minutes after confirming.',
  );
  /* Short on purpose — this one shares its row with the amount box. */
  const [refundReason, setRefundReason] = useState('Delivered cold, 50 minutes late.');
  /* The whole held amount, and never anything else. A partial figure typed by
     nobody is a decision the operator did not make, and the ledger has no
     undo — only a second entry pointing the other way. */
  const [refundAmount, setRefundAmount] = useState(String(amount));
  const [disputeReason, setDisputeReason] = useState(
    'Customer says two of the four boxes were missing at handover; the cook says all four went out.',
  );

  const input =
    'w-full rounded-[10px] border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-ink3 focus:border-primary-200';

  const settled = ['completed', 'cancelled', 'rejected'].includes(status);
  const held = payment === 'held';

  /**
   * Why the money buttons are off, in the operator's terms.
   *
   * "Nothing is held against this order" is true of four quite different
   * situations and an operator staring at a dead Release button cannot tell
   * which one they are in. Cash on delivery is the one that confuses: there
   * is no escrow to release *by design* — the customer pays the rider at the
   * door and the cook already has the money — so the button is not broken and
   * never will be enabled on this order.
   */
  const moneyNote = held
    ? status === 'completed'
      ? 'The customer has confirmed the food arrived. Nothing else moves this money — releasing it is your call, and it splits between the cook and the platform. Both post to the ledger; neither can be edited afterwards.'
      : 'Releasing splits the held amount between the cook and the platform. Both post to the ledger; neither can be edited afterwards.'
    : kind === 'cod'
      ? 'Cash on delivery: the customer pays the rider at the door, so the platform never holds this money and there is nothing to release. The cook was paid in cash.'
      : payment === 'released'
        ? 'Already released to the cook. The ledger is append-only, so this cannot be undone — only corrected with an entry in the opposite direction.'
        : payment === 'refunded'
          ? 'Already refunded to the customer. Nothing is left in escrow.'
          : 'Nothing is held against this order.';

  /** The same sentence, short enough for a tooltip on the dead button. */
  const whyOff = held
    ? undefined
    : kind === 'cod'
      ? 'Cash on delivery — the platform never held this money'
      : payment === 'released'
        ? 'Already released'
        : payment === 'refunded'
          ? 'Already refunded'
          : 'Nothing is held against this order';

  if (!canWrite && !canMoney && !canDispute) {
    return (
      <p className="text-[13px] text-ink3">
        Your role can read this order but not change it.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {canWrite ? (
        <div>
          <div className="label mb-1.5">Move it along</div>
          <p className="mb-2 text-[11.5px] leading-relaxed text-ink3">
            Forces the next step on the cook&rsquo;s behalf. The stamp records that it
            was you, not them.
          </p>
          <ActionButton
            action={() => forceAdvance(orderId)}
            variant="ghost"
            disabled={!nextStep}
            title={nextStep ? undefined : 'There is no next step from here'}
          >
            {nextStep ? `Advance to ${nextStep.replace(/_/g, ' ')}` : 'Nothing to advance'}
          </ActionButton>

          <div className="mt-3 border-t border-line pt-3">
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Cancellation reason"
              className={`${input} mb-2`}
            />
            <ActionButton
              action={() => forceCancel(orderId, cancelReason)}
              variant="danger"
              disabled={settled || !cancelReason.trim()}
              confirm={
                held
                  ? `Cancel ${code} and refund ${taka(amount)} to the customer?`
                  : `Cancel ${code}?`
              }
            >
              Cancel {held ? '& refund' : 'order'}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {canMoney ? (
        <div>
          <div className="label mb-1.5">Move the money</div>
          <p className="mb-2 text-[11.5px] leading-relaxed text-ink3">{moneyNote}</p>

          <ActionButton
            action={() => forceRelease(orderId, 'Released by an operator')}
            variant="good"
            disabled={!held}
            title={whyOff}
            confirm={`Release ${taka(amount)} on ${code}? This cannot be undone — only corrected with a new entry.`}
          >
            {payment === 'released' ? 'Already released' : 'Release to cook'}
          </ActionButton>

          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
              <input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Refund reason"
                className={input}
                disabled={!held}
              />
              <input
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                inputMode="numeric"
                className={`${input} tnum w-24`}
                disabled={!held}
              />
            </div>
            <ActionButton
              action={() => forceRefund(orderId, Number(refundAmount), refundReason)}
              variant="danger"
              disabled={!held || !refundReason.trim()}
              title={whyOff}
              confirm={`Refund ${taka(Number(refundAmount) || 0)} to the customer?`}
            >
              {payment === 'refunded' ? 'Already refunded' : 'Refund'}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {/* Money is finance's job, so this column is simply absent for
          operations and support — and an absent column explains nothing. An
          operator looking for the Release button on an order that is plainly
          holding money should be told it exists and who has it, rather than
          be left to conclude the panel is broken. */}
      {!canMoney && held ? (
        <div>
          <div className="label mb-1.5">Move the money</div>
          <p className="text-[11.5px] leading-relaxed text-ink3">
            {taka(amount)} is held against this order and your role cannot release
            it. Releasing and refunding belong to <strong>finance</strong> — sign in
            as a finance or super-admin operator to do it here.
          </p>
        </div>
      ) : null}

      {canDispute ? (
        <div>
          <div className="label mb-1.5">Open a case</div>
          <p className="mb-2 text-[11.5px] leading-relaxed text-ink3">
            Once the food is out for delivery the app refuses to cancel and calls it a
            dispute. This is where those go.
          </p>
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            rows={3}
            placeholder="What went wrong?"
            className={`${input} mb-2 resize-y`}
            disabled={hasDispute}
          />
          <ActionButton
            action={() => openDispute(orderId, disputeReason)}
            variant="ghost"
            disabled={hasDispute || !disputeReason.trim()}
            title={hasDispute ? 'This order already has a case' : undefined}
          >
            {hasDispute ? 'Case already open' : 'Open dispute'}
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}
