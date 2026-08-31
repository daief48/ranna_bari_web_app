'use client';

/**
 * The four seeded operators, as buttons rather than a printed list.
 *
 * The demo's whole point is that authorisation is real, which you can only
 * see by signing in twice as two different roles. Making that a click instead
 * of a retype is the difference between people trying it and people reading
 * about it.
 *
 * It writes into the form's own inputs by id rather than lifting the fields
 * into React state, because the form is a server component posting to a
 * server action — making it controlled would mean turning the whole thing
 * into a client component to save two `document.getElementById` calls.
 */

export type Operator = {
  email: string;
  role: string;
  sees: string;
  /** Which of the status colours this role reads as. */
  tone: 'primary' | 'sage' | 'saffron' | 'ink3';
};

const DOT: Record<Operator['tone'], string> = {
  primary: 'bg-primary',
  sage: 'bg-sage',
  saffron: 'bg-saffron',
  ink3: 'bg-ink3',
};

export function OperatorPicker({
  operators,
  domain,
  password,
}: {
  operators: Operator[];
  domain: string;
  password: string;
}) {
  const pick = (op: Operator) => {
    const email = document.getElementById('email') as HTMLInputElement | null;
    const pass = document.getElementById('password') as HTMLInputElement | null;
    if (!email || !pass) return;

    email.value = op.email + domain;
    pass.value = password;

    /* Native value writes do not notify React, and an autofilled field that
       still looks empty to the browser will not offer to save the password. */
    email.dispatchEvent(new Event('input', { bubbles: true }));
    pass.dispatchEvent(new Event('input', { bubbles: true }));
    email.focus({ preventScroll: true });
  };

  return (
    <ul className="mt-3 grid gap-1">
      {operators.map((op) => (
        <li key={op.email}>
          <button
            type="button"
            onClick={() => pick(op)}
            className="group flex w-full items-baseline gap-2.5 rounded-[9px] px-2 py-1.5 text-left transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] focus-visible:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)]"
          >
            <span
              aria-hidden
              className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${DOT[op.tone]}`}
            />
            <span className="w-[56px] shrink-0 text-[12px] font-semibold text-ink">
              {op.email}
            </span>
            {/* Sized so the longest of the four — `ops@` — still sits on one
                line, rather than truncated to fit: what a role can see is the
                whole point of the list, so it does not get an ellipsis. */}
            <span className="min-w-0 flex-1 text-[11px] leading-snug text-ink3">
              <span className="text-ink2">{op.role}</span> — {op.sees}
            </span>
            <span
              aria-hidden
              className="shrink-0 text-[10px] font-semibold tracking-[0.06em] text-ink3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              USE
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
