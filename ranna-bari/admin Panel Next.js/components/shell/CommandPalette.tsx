'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { can } from '@/lib/domain';
import { NAV } from './Sidebar';

/**
 * Go anywhere without reaching for the sidebar.
 *
 * Sixteen pages is past the point where a nav list is how you navigate — an
 * operator answering a support call knows the word "dispute" and should not
 * have to find which group it was filed under. ⌘K, three letters, enter.
 *
 * Two things it deliberately is not. It is not a search over the *data*: the
 * pages already have their own filters and a palette that mixed "the disputes
 * page" with "dispute #4194" would make both harder to hit. And it is not a
 * command runner — nothing here changes state, so there is no confirm step to
 * design and no way to release escrow by pressing enter on a typo.
 *
 * Capabilities are honoured, exactly as the sidebar honours them: a page an
 * operator cannot open is not offered. That is the same courtesy rather than
 * the control — every page checks again on the server.
 */

type Item = { href: string; label: string; group: string; hint: string };

/** Extra ways to say the same page. Nobody types "kyc queue". */
const ALIASES: Record<string, string> = {
  '/': 'home overview stats gmv',
  '/kitchens': 'cooks chefs',
  '/kyc': 'verify verification onboarding pending',
  '/meals': 'pre-booked services board',
  '/stores': 'shops products shelves stock inventory',
  '/orders': 'order rail escrow status',
  '/chat': 'messages support inbox threads',
  '/requests': 'offers bids broadcast',
  '/reviews': 'ratings moderation',
  '/search-terms': 'demand searches missing gaps recruit',
  '/ledger': 'money escrow entries balance books',
  '/payouts': 'pay cooks run bkash',
  '/topups': 'reconcile credits psp',
  '/disputes': 'cases refunds complaints',
  '/settings': 'configuration fees commission flags',
  '/notifications': 'broadcast push announce',
  '/admins': 'operators staff roles users permissions',
  '/audit': 'log history who did what trail',
};

export default function CommandPalette({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** Every page this operator may open, flattened out of the nav. */
  const items = useMemo<Item[]>(
    () =>
      NAV.flatMap((section) =>
        section.items
          .filter((item) => can(role, item.cap))
          .map((item) => ({
            href: item.href,
            label: item.label,
            group: section.group,
            hint: ALIASES[item.href] ?? '',
          })),
      ),
    [role],
  );

  const results = useMemo(() => {
    const typed = query.trim().toLowerCase();
    if (!typed) return items;

    /* Ranked, not filtered: a label that starts with what was typed has to
       beat one that merely contains it, or "or" opens "Reports" before
       "Orders". The alias pool sits below both — it is how somebody found
       the page, not what the page is called. */
    const scored = items
      .map((item) => {
        const label = item.label.toLowerCase();
        if (label.startsWith(typed)) return { item, score: 0 };
        if (label.includes(typed)) return { item, score: 1 };
        if (item.hint.includes(typed)) return { item, score: 2 };
        /* Initials, so "kc" reaches "Kitchens & cooks". */
        const initials = label
          .split(/[^a-z]+/)
          .filter(Boolean)
          .map((w) => w[0])
          .join('');
        if (initials.startsWith(typed)) return { item, score: 3 };
        return null;
      })
      .filter((row): row is { item: Item; score: number } => row !== null);

    return scored.sort((a, b) => a.score - b.score).map((row) => row.item);
  }, [items, query]);

  /* A new query is a new list, so the highlight goes back to the top rather
     than sitting on whatever index happened to survive. */
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

      // ⌘K and Ctrl+K work from anywhere, a field included — that is the
      // point of using a modifier.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
        return;
      }

      // `/` is the bare-key shortcut, so it has to stay out of fields.
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    // Focus after paint, or the field is not in the document yet.
    const handle = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(handle);
  }, [open]);

  /** Keep the highlighted row in view when arrowing past the fold. */
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onFieldKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = results[active];
      if (hit) go(hit.href);
    }
  };

  return (
    <div
      className="fixed inset-0 z-90 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Go to page"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
      />

      <div className="relative w-full max-w-[520px] overflow-hidden rounded-md border border-line bg-overlay shadow-lg">
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-ink3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          >
            <path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13M15.2 15.2 20 20" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFieldKey}
            placeholder="Go to…"
            aria-label="Go to page"
            className="cmd-input h-11 flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink3"
          />
          <kbd className="hidden shrink-0 rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] font-semibold text-ink3 sm:block">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink3">
              Nothing here matches “{query.trim()}”.
            </p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.href}
                type="button"
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.href)}
                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors ${
                  i === active ? 'bg-sunken' : ''
                }`}
              >
                <span className="truncate text-[13.5px] text-ink">{item.label}</span>
                <span className="label shrink-0">{item.group}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line bg-sunken px-3.5 py-2 text-[11px] text-ink3">
          <span>
            <kbd className="font-semibold">↑↓</kbd> move
          </span>
          <span>
            <kbd className="font-semibold">↵</kbd> open
          </span>
          <span className="ml-auto">
            <kbd className="font-semibold">⌘K</kbd> or <kbd className="font-semibold">/</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
