import 'server-only';

import { BackendError } from '@/lib/backend';
import { PageHeader } from '@/components/ui';

/**
 * What a migrated screen looks like when `backend-node` is not answering.
 *
 * The panel no longer opens a database of its own, so a dead backend is not a
 * degraded page — it is an empty one. An operator staring at a blank screen
 * with a redacted server-error digest has no way to know that the fix is one
 * command in another terminal, so the screen says so.
 */
export function BackendDown({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="rounded-[10px] border border-primary-100 bg-primary-50 px-3.5 py-3 text-[13px] leading-relaxed text-primary">
        <strong>The backend is not reachable.</strong> Every figure on this screen is
        folded by <code>backend-node</code>, and the panel will not guess at money it
        cannot read. Start it with <code>cd backend-node &amp;&amp; npm run dev</code>,
        then reload.
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
