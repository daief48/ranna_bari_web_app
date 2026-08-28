'use client';

import { payPayoutRun, cancelPayoutRun } from '@/actions/money';
import { ActionButton } from '@/components/ui/client';
import { taka } from '@/lib/format';

/**
 * Pay or discard one draft run.
 *
 * A thin client wrapper: the payouts page is a server component, and a server
 * component cannot hand an inline closure to a client one.
 */
export function RunActions({
  runId,
  code,
  total,
}: {
  runId: string;
  code: string;
  total: number;
}) {
  return (
    <div className="flex gap-2">
      <ActionButton
        action={() => payPayoutRun(runId)}
        variant="good"
        confirm={`Mark ${code} paid? ${taka(total)} is recorded as leaving the platform, and the entries cannot be undone.`}
      >
        Mark paid
      </ActionButton>

      <ActionButton
        action={() => cancelPayoutRun(runId)}
        variant="quiet"
        confirm="Discard this draft? No money has moved."
      >
        Discard
      </ActionButton>
    </div>
  );
}
