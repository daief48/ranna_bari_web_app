'use client';

import { BTN } from '@/components/ui';

/**
 * What a page throwing looks like.
 *
 * The panel had no boundary anywhere, so a single TypeError in a server
 * component reached the operator as Next's fallback — "A server error
 * occurred" and an eight-digit digest, on a page that gave no hint which of
 * the forty-odd routes had failed or why. The digest is a hash of the message
 * and the stack; it is not reversible, so that screen is genuinely all there
 * is. Every diagnosis had to start by asking someone to read a terminal.
 *
 * This boundary covers the pages inside `(dash)`, not the shell around them —
 * a boundary never catches its own layout, so `app/global-error.tsx` sits
 * above this one for that.
 *
 * In development it prints the message and the stack, because the person
 * looking at it is the person who can fix it. In production it prints the
 * digest and nothing else: an operations desk is not the place to leak a
 * stack trace, and the digest is what matches this render to the server log.
 */
export default function DashError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dev = process.env.NODE_ENV !== 'production';

  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="text-[19px] font-semibold text-ink">This page didn’t render.</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink2">
        The rest of the panel is fine — the sidebar is still live, and every other
        page is still reachable. Only this one threw.
      </p>

      {dev && error.message ? (
        <pre className="mt-4 overflow-x-auto rounded-[10px] border border-line bg-sunken px-3.5 py-3 text-[12px] leading-relaxed whitespace-pre-wrap text-ink">
          {error.message}
        </pre>
      ) : null}

      {dev && error.stack ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12.5px] font-medium text-ink2 hover:text-ink">
            Stack
          </summary>
          <pre className="mt-1.5 overflow-x-auto rounded-[10px] border border-line bg-sunken px-3.5 py-3 text-[11.5px] leading-relaxed text-ink3">
            {error.stack}
          </pre>
        </details>
      ) : null}

      {error.digest ? (
        <p className="mt-3 text-[11.5px] text-ink3">
          Digest <span className="tnum">{error.digest}</span> — the same string is on
          the line the server logged for this render.
        </p>
      ) : null}

      <button type="button" onClick={reset} className={`${BTN.quiet} mt-4`}>
        Try again
      </button>
    </div>
  );
}
