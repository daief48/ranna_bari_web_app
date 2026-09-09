import 'server-only';

import { BackendError } from '@/lib/backend';
import { PageHeader } from '@/components/ui';

/**
 * What a screen looks like when the service behind it is not answering.
 *
 * The panel keeps no database of its own, so an unreachable service is not a
 * degraded page — it is an empty one, and it says so rather than showing
 * zeroes an operator might act on.
 *
 * It names no file, command or process. An operator at a desk cannot run a
 * terminal command and should not be shown one; what they can do is wait,
 * reload, or tell whoever keeps the service running. The details that used to
 * be printed here belong in the log, where the person who can act on them
 * looks.
 */
export function BackendDown({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="rounded-[10px] border border-primary-100 bg-primary-50 px-3.5 py-3 text-[13px] leading-relaxed text-primary">
        <strong>This screen cannot be loaded right now.</strong> The service that
        holds these records is not responding, and nothing here will be guessed at
        — an approximate figure on a money screen is worse than none. Try again in
        a moment, and let your technical team know if it continues.
      </div>
    </>
  );
}

/**
 * Swallow *only* the backend being down.
 *
 * Used as `get(...).catch(down)`, so a page renders the banner above instead of
 * throwing. A 4xx or a 5xx is a real bug and is re-thrown — a money screen that
 * quietly renders nothing on a broken query is worse than one that crashes.
 */
export function down(error: unknown): null {
  if (error instanceof BackendError && error.status === 0) return null;
  throw error;
}
