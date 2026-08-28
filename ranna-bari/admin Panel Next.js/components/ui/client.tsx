'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from 'react';

import { BTN } from './index';

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
    <input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-[180px] rounded-[10px] border border-line bg-raised px-3 py-1.5 text-[13px] outline-none placeholder:text-ink3 focus:border-primary-200 sm:w-64"
    />
  );
}

export function FilterSelect({
  name,
  options,
  allLabel = 'All',
}: {
  name: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const { set, params } = useSetParam();
  const value = params.get(name) ?? '';

  return (
    <select
      value={value}
      onChange={(e) => set({ [name]: e.target.value || null })}
      className="rounded-[10px] border border-line bg-raised px-2.5 py-1.5 text-[13px] outline-none focus:border-primary-200"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Pager({ page, pages, total }: { page: number; pages: number; total: number }) {
  const { set } = useSetParam();
  if (pages <= 1) {
    return (
      <div className="px-4 py-3 text-[12px] text-ink3">
        {total.toLocaleString('en-US')} {total === 1 ? 'row' : 'rows'}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
      <span className="text-[12px] text-ink3">
        Page {page} of {pages} · {total.toLocaleString('en-US')} rows
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className={BTN.ghost}
          disabled={page <= 1}
          onClick={() => set({ page: String(page - 1) })}
        >
          Previous
        </button>
        <button
          type="button"
          className={BTN.ghost}
          disabled={page >= pages}
          onClick={() => set({ page: String(page + 1) })}
        >
          Next
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
        <span className={`text-ink3 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
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

  const run = () => {
    if (confirm && !window.confirm(confirm)) return;
    setNote(null);
    start(async () => {
      try {
        const out = await action();
        if (out?.message) setNote({ ok: out.ok, message: out.message });
      } catch (error) {
        setNote({
          ok: false,
          message: error instanceof Error ? error.message : 'That did not work.',
        });
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        title={title}
        className={BTN[variant]}
      >
        {pending ? '…' : children}
      </button>
      {note ? (
        <span className={`text-[11px] ${note.ok ? 'text-sage' : 'text-primary'}`}>
          {note.message}
        </span>
      ) : null}
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
  const [pending] = useTransition();
  return (
    <button type="submit" disabled={disabled || pending} className={BTN[variant]}>
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
      className="tnum font-semibold text-ink hover:text-primary"
      title="Copy"
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
      {done ? 'copied' : value}
    </button>
  );
}
