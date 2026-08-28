'use client';

import { useState } from 'react';

import { setVerified, setSuspended, setCoverage } from '@/actions/kitchens';
import { ActionButton } from '@/components/ui/client';
import { BTN } from '@/components/ui';

/**
 * The three things an operator can change about a kitchen.
 *
 * Suspension and coverage both take free text, so they sit in local state
 * until the button is pressed. Every one of them is refused server-side if the
 * signed-in role does not hold `kitchen.write` — this component only decides
 * what is worth rendering.
 */
export function KitchenControls({
  kitchenId,
  isVerified,
  suspended,
  area,
  radiusKm,
}: {
  kitchenId: string;
  isVerified: boolean;
  suspended: boolean;
  area: string;
  radiusKm: number;
}) {
  const [reason, setReason] = useState('');
  const [nextArea, setNextArea] = useState(area);
  const [nextRadius, setNextRadius] = useState(String(radiusKm));

  const input =
    'w-full rounded-[10px] border border-line bg-canvas px-2.5 py-1.5 text-[13px] outline-none focus:border-primary-200';

  return (
    <div className="space-y-4">
      <div>
        <div className="label mb-1.5">Verification badge</div>
        <ActionButton
          action={() => setVerified(kitchenId, !isVerified)}
          variant={isVerified ? 'ghost' : 'good'}
          confirm={
            isVerified
              ? 'Remove the verified badge from this kitchen?'
              : undefined
          }
        >
          {isVerified ? 'Remove badge' : 'Grant badge'}
        </ActionButton>
      </div>

      <div className="border-t border-line pt-3">
        <div className="label mb-1.5">{suspended ? 'Lift suspension' : 'Suspend'}</div>
        {!suspended ? (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason — required"
            className={`${input} mb-2`}
          />
        ) : null}
        <ActionButton
          action={() => setSuspended(kitchenId, !suspended, reason)}
          variant={suspended ? 'good' : 'danger'}
          disabled={!suspended && !reason.trim()}
          confirm={
            suspended
              ? undefined
              : 'Suspend this kitchen? It disappears from browse immediately.'
          }
        >
          {suspended ? 'Lift suspension' : 'Suspend kitchen'}
        </ActionButton>
      </div>

      <div className="border-t border-line pt-3">
        <div className="label mb-1.5">Coverage</div>
        <p className="mb-2 text-[11.5px] leading-relaxed text-ink3">
          A kitchen is only shown to a customer inside this radius. Widening it is
          the fastest fix for a zone with no supply.
        </p>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input
            value={nextArea}
            onChange={(e) => setNextArea(e.target.value)}
            placeholder="Area"
            className={input}
          />
          <input
            value={nextRadius}
            onChange={(e) => setNextRadius(e.target.value)}
            inputMode="decimal"
            placeholder="km"
            className={`${input} tnum`}
          />
        </div>
        <ActionButton
          action={() => setCoverage(kitchenId, nextArea, Number(nextRadius))}
          variant="ghost"
          disabled={nextArea === area && Number(nextRadius) === radiusKm}
        >
          Save coverage
        </ActionButton>
      </div>

      <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-ink3">
        Every action here writes an audit row with a before and after. Nothing on
        this page deletes anything — a suspended kitchen keeps its menu, its
        orders and its history.
      </p>

      <noscript>
        <p className={`${BTN.ghost} !block !text-center`}>
          These controls need JavaScript.
        </p>
      </noscript>
    </div>
  );
}
