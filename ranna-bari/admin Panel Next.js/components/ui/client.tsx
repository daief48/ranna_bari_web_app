'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';

import { BTN } from './index';
import { confirmAction, toastResult } from '../../lib/sweet';

/*
 * The control classes — `.field`, `.select`, `.chip` — live in globals.css and
 * are written outside any @layer, so they outrank every Tailwind utility here
 * no matter the specificity. The utilities alongside them are therefore not a
 * duplicate: they are the fallback that renders the control correctly for the
 * properties the class does not claim. Anything that must win over the class
 * regardless is set from the style attribute.
 */

const FIELD = 'rounded-[10px] border border-line bg-raised px-3 py-1.5 text-[13px] outline-none placeholder:text-ink3';

/* ------------------------------------------------------------------ *
 * motion
 * ------------------------------------------------------------------ */

/**
 * The pending mark on an action.
 *
 * `motion-reduce:animate-none` rather than leaning on the blanket rule in
 * globals.css: that rule collapses the duration to 0.01ms, which stops an
 * infinite rotation from *reading* as motion but does not stop it running.
 * The button stays disabled and `aria-busy`, so the state is still carried
 * when the ring is standing still.
 */
function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      focusable="false"
      className={`shrink-0 animate-spin motion-reduce:animate-none ${className}`}
    >
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="2" opacity="0.28" />
      <path
        d="M8 1.6A6.4 6.4 0 0 1 14.4 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * theme
 * ------------------------------------------------------------------ */

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem('rb-admin-theme');
      } catch {
        // A locked-down browser throws on storage access. The panel still
        // works; it just opens in whatever the system prefers.
        return null;
      }
    })();
    const preferred =
      stored === 'dark' || stored === 'light'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    setTheme(preferred);
    document.documentElement.dataset.theme = preferred;
  }, []);

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('rb-admin-theme', next);
    } catch {
      /* nothing to do — the choice just will not survive a reload */
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      className={BTN.quiet}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * URL-driven filters
 *
 * Filter state lives in the query string rather than in React state, so a
 * filtered view is a link an operator can send to a colleague, and the back
 * button does what it should.
 * ------------------------------------------------------------------ */

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    // Any filter change resets paging — page 4 of a different filter is a
    // blank screen, which reads as a bug.
    if (!('page' in patch)) next.delete('page');
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return { set, pending, params };
}

export function SearchBox({ placeholder = 'Search…' }: { placeholder?: string }) {
  const { set, params } = useSetParam();
  const [value, setValue] = useState(params.get('q') ?? '');

  // Debounced, so a five-letter name is one query rather than five.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (value === current) return;
    const timer = setTimeout(() => set({ q: value || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full min-w-[180px] sm:w-64">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        // The clear button sits inside the field, so its room has to be
        // reserved against whatever padding `.field` sets.
        style={{ paddingRight: 26 }}
        className={`field w-full focus:border-primary-200 [&::-webkit-search-cancel-button]:appearance-none ${FIELD}`}
      />
      {value ? (
        <button
          type="button"
          // Cleared on the spot rather than through the 300ms debounce: an ×
          // that takes a third of a second reads as a dead button.
          onClick={() => {
            setValue('');
            set({ q: null });
          }}
          title="Clear"
          aria-label="Clear search"
          className="absolute top-1/2 right-1 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[14px] leading-none text-ink3 transition-colors hover:bg-sunken hover:text-ink"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function FilterSelect({
  name,
  options,
  allLabel = 'All',
  label,
}: {
  name: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  /** Renders the field name beside the control, and names it for a reader. */
  label?: string;
}) {
  const { set, params } = useSetParam();
  const value = params.get(name) ?? '';

  const select = (
    <select
      value={value}
      onChange={(e) => set({ [name]: e.target.value || null })}
      aria-label={label ?? name}
      // Which filters are on has to be legible without reading them, and the
      // legend does not have a spare hue for "active" — so it is weight.
      className={`select rounded-[10px] border border-line bg-raised px-2.5 py-1.5 text-[13px] outline-none focus:border-primary-200 ${
        value ? 'font-semibold text-ink' : 'text-ink2'
      }`}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  if (!label) return select;

  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="label">{label}</span>
      {select}
    </label>
  );
}

export function Pager({ page, pages, total }: { page: number; pages: number; total: number }) {
  const { set } = useSetParam();
  const count = total.toLocaleString('en-US');

  if (pages <= 1) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2.5 text-[12px] text-ink3">
        <span className="chip tnum rounded-full bg-sunken px-2 py-0.5 font-semibold text-ink2">
          {count}
        </span>
        <span>{total === 1 ? 'row' : 'rows'}</span>
      </div>
    );
  }

  // The page size is not passed in, but it is implied: only the last page is
  // ever short. Saying which rows these are beats saying which page they are on.
  const per = Math.ceil(total / pages);
  const first = (page - 1) * per + 1;
  const last = Math.min(page * per, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
      <span className="text-[12px] text-ink3">
        <span className="tnum font-semibold text-ink2">
          {first.toLocaleString('en-US')}–{last.toLocaleString('en-US')}
        </span>{' '}
        of <span className="tnum">{count}</span> · page <span className="tnum">{page}</span> of{' '}
        <span className="tnum">{pages}</span>
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className={BTN.ghost}
          disabled={page <= 1}
          aria-label="Previous page"
          onClick={() => set({ page: String(page - 1) })}
        >
          <span aria-hidden>‹</span> Previous
        </button>
        <button
          type="button"
          className={BTN.ghost}
          disabled={page >= pages}
          aria-label="Next page"
          onClick={() => set({ page: String(page + 1) })}
        >
          Next <span aria-hidden>›</span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * disclosure
 * ------------------------------------------------------------------ */

export function Expandable({
  summary,
  children,
  open: initial = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <span
          aria-hidden
          className={`text-ink3 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ›
        </span>
        {summary}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * actions
 * ------------------------------------------------------------------ */

/**
 * A button that runs a server action and shows what came back.
 *
 * Every money action in this panel is irreversible in the sense that matters
 * — the correcting entry is a new row, not an undo — so anything destructive
 * asks first, and the answer is shown rather than swallowed.
 *
 * Both halves are SweetAlert now. The question used to be `window.confirm`,
 * an OS box in a font this panel does not own, which blocks the tab and says
 * nothing about which of a row's three buttons is asking. The answer used to
 * be a chip under the button — well attributed, but easy to miss on a long
 * table, and gone the moment the row scrolled.
 *
 * The chip stays as well, quietly. A toast is read once and floats away; the
 * chip is still there when an operator looks back down at the row to check
 * what they just did, and it is the half that says *which button*.
 */
export function ActionButton({
  action,
  children,
  variant = 'ghost',
  confirm,
  disabled,
  title,
}: {
  action: () => Promise<{ ok: boolean; message?: string }>;
  children: ReactNode;
  variant?: keyof typeof BTN;
  confirm?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  const run = async () => {
    /* Asked before the transition starts, so the button does not sit spinning
       behind a dialog the operator has not answered yet. */
    if (confirm && !(await confirmAction({ text: confirm, confirm: 'Yes, do it' }))) return;

    setNote(null);
    start(async () => {
      const said = (ok: boolean, message: string) => {
        setNote({ ok, message });
        toastResult(ok, message);
      };

      try {
        const out = await action();
        if (out?.message) said(out.ok, out.message);
      } catch (error) {
        said(false, error instanceof Error ? error.message : 'That did not work.');
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        aria-busy={pending}
        title={title}
        className={BTN[variant]}
      >
        {/* The label stays put while it runs — swapping it for an ellipsis
            resized the button and shuffled every control beside it. */}
        {pending ? <Spinner className="-ml-0.5" /> : null}
        {children}
      </button>

      {/* The region exists before the message does, or a screen reader has
          nothing to announce into. */}
      <span role="status" aria-live="polite">
        {note ? (
          <span
            className={`mt-1 inline-flex max-w-[30ch] items-start gap-1 rounded-[8px] px-1.5 py-1 text-[11px] leading-snug font-medium ring-1 ring-inset ${
              note.ok
                ? 'bg-sage-50 text-sage ring-sage-100'
                : 'bg-primary-50 text-primary ring-primary-100'
            }`}
          >
            <span aria-hidden className="font-bold">
              {note.ok ? '✓' : '!'}
            </span>
            {note.message}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** A submit button that reports the form's own pending state. */
export function SubmitButton({
  children,
  variant = 'primary',
  disabled,
}: {
  children: ReactNode;
  variant?: keyof typeof BTN;
  disabled?: boolean;
}) {
  // `useFormStatus` reads the parent <form>. `useTransition` cannot: nothing
  // here starts the transition, so its flag was false for the whole submit.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={BTN[variant]}
    >
      {pending ? <Spinner className="-ml-0.5" /> : null}
      {children}
    </button>
  );
}

/** Copy a code to the clipboard — order codes get read out over the phone. */
export function CopyCode({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      // The code stays on screen through the confirmation. Replacing it with
      // the word "copied" resized a column that is read down.
      className={`tnum inline-flex items-center gap-1 font-semibold transition-colors ${
        done ? 'text-sage' : 'text-ink hover:text-primary'
      }`}
      title={done ? 'Copied' : 'Copy'}
      aria-label={done ? `${value} — copied` : `Copy ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked — the code is on screen either way */
        }
      }}
    >
      {value}
      {/* The tick's room is held whether or not it is there, so the column
          does not breathe every time somebody copies a code. */}
      <span className="w-2 text-[11px] leading-none" aria-hidden>
        {done ? '✓' : ''}
      </span>
    </button>
  );
}
