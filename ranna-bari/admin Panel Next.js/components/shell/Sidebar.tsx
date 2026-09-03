'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { can } from '@/lib/domain';

/**
 * The navigation, grouped the way the work is grouped.
 *
 * Each item names the capability it needs, and an operator who does not hold
 * it never sees the link. That is a courtesy, not the control — every action
 * behind these pages checks again on the server.
 */
export const NAV: {
  group: string;
  items: { href: string; label: string; cap: string; badge?: 'kyc' | 'disputes' | 'escrow' | 'chat' }[];
}[] = [
  {
    group: 'Overview',
    items: [{ href: '/', label: 'Dashboard', cap: 'order.read' }],
  },
  {
    group: 'Supply',
    items: [
      { href: '/kitchens', label: 'Kitchens & cooks', cap: 'kitchen.read' },
      { href: '/kyc', label: 'KYC queue', cap: 'kitchen.read', badge: 'kyc' },
      { href: '/menu', label: 'Menus & dishes', cap: 'kitchen.read' },
      { href: '/specialties', label: 'Specialties', cap: 'config.read' },
      { href: '/meals', label: 'Meals', cap: 'order.read' },
      { href: '/stores', label: 'Stores & products', cap: 'order.read' },
      { href: '/coverage', label: 'Coverage map', cap: 'kitchen.read' },
      { href: '/preorders', label: 'Pre-orders', cap: 'order.read' },
    ],
  },
  {
    group: 'Demand',
    items: [
      { href: '/orders', label: 'Orders', cap: 'order.read' },
      { href: '/carts', label: 'Abandoned baskets', cap: 'order.read' },
      { href: '/customers', label: 'Customers', cap: 'order.read' },
      { href: '/chat', label: 'Live chat', cap: 'order.read', badge: 'chat' },
      { href: '/requests', label: 'Requests & offers', cap: 'request.read' },
      { href: '/reviews', label: 'Reviews', cap: 'kitchen.read' },
      { href: '/search-terms', label: 'What people looked for', cap: 'kitchen.read' },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/ledger', label: 'Ledger & escrow', cap: 'ledger.read', badge: 'escrow' },
      { href: '/payouts', label: 'Payouts', cap: 'ledger.read' },
      { href: '/topups', label: 'Top-up reconciliation', cap: 'ledger.read' },
      { href: '/refunds', label: 'Refunds', cap: 'ledger.read' },
      { href: '/disputes', label: 'Disputes', cap: 'order.read', badge: 'disputes' },
      { href: '/promotions', label: 'Promotions', cap: 'config.read' },
    ],
  },
  {
    group: 'Platform',
    items: [
      { href: '/settings', label: 'Configuration', cap: 'config.read' },
      { href: '/icons', label: 'Emoji & icons', cap: 'config.read' },
      { href: '/notifications', label: 'Notifications', cap: 'order.read' },
      { href: '/admins', label: 'Admin users', cap: 'kitchen.read' },
      { href: '/audit', label: 'Audit log', cap: 'order.read' },
    ],
  },
];

/**
 * Glyphs, keyed by route rather than carried on the NAV item.
 *
 * NAV's shape is read by the authorisation filter and by the top bar, so the
 * drawing stays out of it. Keying on `href` also means a route with no glyph
 * degrades to a dot instead of throwing.
 */
const ICON: Record<string, string> = {
  '/': 'M4 4h6v6H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 14h6v6H4z',
  '/kitchens':
    'M4 10h16M6 10v5a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-5M9.5 7c0-1.6 1-1.6 1-3M14 7c0-1.6 1-1.6 1-3',
  '/kyc':
    'M3 6h18v12H3zM10.4 11a1.9 1.9 0 1 1-3.8 0 1.9 1.9 0 0 1 3.8 0M5.6 16c.5-1.4 1.6-2.1 2.9-2.1s2.4.7 2.9 2.1M14 10h4M14 13.5h3',
  /* Fork and knife — the same glyph the cook's app puts on its Menu tab, so
     the two screens read as the same thing seen from two sides. */
  '/menu': 'M7 3v5.5a2 2 0 0 0 4 0V3M9 10.5V21M16.5 3c-1.3 1.3-1.3 6.2 0 7.5V21',
  '/meals': 'M3 14h18M4 14a8 8 0 0 1 16 0M2.5 17.5h19M12 6V4.5',
  '/stores': 'M4.5 10h15v9h-15zM3 10l1.6-5h14.8L21 10M10 19v-5h4v5',
  '/orders': 'M6.5 3h11v18l-2.75-1.8L12 21l-2.75-1.8L6.5 21zM10 8.5h4.5M10 12.5h4.5',
  '/chat': 'M20 14.5a2 2 0 0 1-2 2H9l-4 3.5V6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2z',
  '/requests': 'M4 10v4h3l6 4V6l-6 4zM17.5 9.2a4 4 0 0 1 0 5.6',
  '/reviews': 'M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.9l5.4-.8z',
  '/search-terms': 'M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13M15.2 15.2 20 20',
  '/ledger': 'M5.5 4h13v16H7.5a2 2 0 0 1-2-2zM5.5 17.5h13M9.5 8h5M9.5 11.5h3.5',
  '/payouts': 'M12 4v11M8 11.5l4 4 4-4M4.5 19.5h15',
  '/topups': 'M12 20V9M8 12.5l4-4 4 4M4.5 4.5h15',
  '/disputes': 'M6 21V4M6 4h11l-2.6 4 2.6 4H6',
  '/settings':
    'M4 7h3M11 7h9M4 12h7M15 12h5M4 17h3M11 17h9M11 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0M15 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0M11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  '/notifications': 'M17.8 16H6.2l1.3-2.2V10a4.5 4.5 0 0 1 9 0v3.8zM10 19a2 2 0 0 0 4 0',
  '/admins':
    'M12.2 8.4a3.1 3.1 0 1 1-6.2 0 3.1 3.1 0 0 1 6.2 0M3.2 19c.6-3 2.9-4.7 5.9-4.7s5.3 1.7 5.9 4.7M16 5.6a2.9 2.9 0 0 1 0 5.6M17.4 14.6c1.9.7 3.1 2.2 3.4 4.4',
  '/audit': 'M4 12a8 8 0 1 0 2.4-5.7M4 4.5v4h4M12 8v4.6l3.2 1.9',

  /* A rosette. This is the one list on the platform that is a claim about
     craft rather than an inventory of anything, and nothing else here is
     round-with-ribbons. */
  /* A smiling face. Every other glyph here is an object or a document; this
     one is about the little pictures themselves, so it is the only place a
     face belongs. */
  '/icons':
    'M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6M8.6 14.4a4.2 4.2 0 0 0 6.8 0M9.2 9.6h.01M14.8 9.6h.01',

  /* A price tag with its punched hole — the one shape on this rail that
     means a price rather than a thing. Deliberately not a percentage sign:
     half the codes here take a flat number of taka off instead. */
  '/promotions':
    'M12.6 3.5H20a.5.5 0 0 1 .5.5v7.4a1.5 1.5 0 0 1-.44 1.06l-7.5 7.5a1.5 1.5 0 0 1-2.12 0l-6.4-6.4a1.5 1.5 0 0 1 0-2.12l7.5-7.5A1.5 1.5 0 0 1 12.6 3.5M16.8 7.2h.01',

  '/specialties':
    'M12 3.2a5 5 0 1 0 0 10 5 5 0 0 0 0-10M8.6 12.4 7 20.8l5-2.4 5 2.4-1.6-8.4',

  /* A folded paper map. Nothing else in this list is rectangular-and-creased,
     so it is findable at a glance even at the rail's 16px. */
  '/coverage': 'M9 4.8 3.5 7v12.2L9 17l6 2.2 5.5-2.2V4.6L15 6.8zM9 4.8V17M15 6.8v12.4',

  /* An hourglass: this queue is money sitting still while somebody waits. A
     clock would have read as the audit log's, which rewinds. */
  '/preorders':
    'M7.5 3.5h9M7.5 20.5h9M9 3.5v3c0 2 3 3.5 3 5.5s-3 3.5-3 5.5v3M15 3.5v3c0 2-3 3.5-3 5.5s3 3.5 3 5.5v3',

  /* A basket, not a trolley — the app calls it a basket, and Stores already
     owns the shopfront silhouette. */
  '/carts':
    'M3.5 8.5h17l-1.7 9.2a2 2 0 0 1-2 1.6H7.2a2 2 0 0 1-2-1.6zM8.8 8.5 11.2 3.8M15.2 8.5 12.8 3.8M9.8 12.2v3.6M14.2 12.2v3.6',

  /* One person. Admin users is two, and the difference between an operator and
     a customer is exactly the distinction this sidebar has to make. */
  '/customers': 'M12 12.4a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4M4.9 20a7.1 7.1 0 0 1 14.2 0',

  /* A note with the arrow pointing back into it. Payouts and Top-ups are bare
     arrows out and in; a refund is money returning to where it came from, so
     it keeps the note and turns the arrow around. */
  '/refunds': 'M3 6.5h18v11H3zM13.8 12H7.2M9.9 9.3 7.2 12l2.7 2.7M17 9.8v4.4',
};

const FALLBACK_ICON = 'M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5';
const CHEVRON_LEFT = 'M14 7l-5 5 5 5';
const CHEVRON_RIGHT = 'M10 7l5 5-5 5';
const BURGER = 'M4 7h16M4 12h16M4 17h16';

function Icon({ d, className = '' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/*
 * An attention badge that is already lit when the screen arrives reads as
 * decoration; one that announces itself once, then sits still, reads as news.
 * It is keyed on the count, so a number that moves under a working operator
 * announces itself again — and it is off entirely for anyone who asked for
 * less motion.
 */
const ATTENTION_CSS = `
@keyframes rb-attn-pop {
  from { transform: scale(.55); opacity: 0 }
  60%  { transform: scale(1.14) }
  to   { transform: scale(1); opacity: 1 }
}
@keyframes rb-attn-ring {
  from { box-shadow: 0 0 0 0 color-mix(in oklab, var(--saffron) 45%, transparent) }
  to   { box-shadow: 0 0 0 9px color-mix(in oklab, var(--saffron) 0%, transparent) }
}
.rb-attn {
  animation: rb-attn-pop 360ms cubic-bezier(.2,.8,.3,1) both,
             rb-attn-ring 900ms 140ms ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  .rb-attn { animation: none }
}
`;

/** True when `pathname` is inside `href` — `/` only ever matches itself. */
function isUnder(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  role,
  counts,
}: {
  role: string;
  counts: { kyc: number; disputes: number; escrow: number; chat: number };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState(false);

  // Read after mount, never during render: the server has no localStorage and
  // a rail read at render time is a hydration mismatch.
  useEffect(() => {
    try {
      setRail(localStorage.getItem('rb-admin-rail') === '1');
    } catch {
      /* locked-down browser — the nav just opens wide every time */
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== '[' || event.metaKey || event.ctrlKey || event.altKey) return;

      // A bare-key shortcut must never eat a keystroke meant for a field.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }

      event.preventDefault();
      const next = !rail;
      setRail(next);
      try {
        localStorage.setItem('rb-admin-rail', next ? '1' : '0');
      } catch {
        /* the choice just will not survive a reload */
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rail]);

  const toggleRail = () => {
    const next = !rail;
    setRail(next);
    try {
      localStorage.setItem('rb-admin-rail', next ? '1' : '0');
    } catch {
      /* nothing to do */
    }
  };

  return (
    <>
      <style>{ATTENTION_CSS}</style>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed top-3 left-3 z-50 grid h-8 w-8 place-items-center rounded-[10px] border border-line bg-raised text-ink2 shadow-sm lg:hidden"
        aria-label="Toggle navigation"
        aria-expanded={open}
      >
        <Icon d={BURGER} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col border-r border-line bg-raised transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${rail ? 'lg:w-[64px]' : 'lg:w-[232px]'}`}
      >
        {/*
         * The header, and the collapse control.
         *
         * Aligned to the top bar's 57px so the two hairlines read as one.
         *
         * The control used to live in a footer strip at the very bottom —
         * the corner every browser fills with its own chrome, a download
         * bar, a status tooltip, Next's dev indicator — and it spent most of
         * its life underneath one of them. It belongs beside the thing it
         * collapses.
         *
         * Two shapes, because 64px of rail will not hold a 32px logo and a
         * button next to it. Wide: logo, wordmark, chevron on the right.
         * Railed: the logo *is* the button — one target, the branding stays,
         * and the hover state is what says it is pressable.
         */}
        <div
          className={`flex h-[57px] shrink-0 items-center gap-2.5 border-b border-line px-3.5 ${
            rail ? 'lg:justify-center lg:px-0' : ''
          }`}
        >
          <button
            type="button"
            onClick={toggleRail}
            aria-label="Expand navigation"
            title="Expand navigation  ["
            /* Only in the rail. Wide, the logo is not a control — there is a
               chevron for that, and a brand mark that silently does something
               is a trap. */
            className={`group relative hidden shrink-0 rounded-[8px] ${rail ? 'lg:block' : ''}`}
          >
            <img
              src="/logo.png"
              alt="RannaBari"
              className="h-8 w-8 object-contain rounded-[8px] border border-line bg-raised shadow-xs dark:hidden"
            />
            <img
              src="/logo-dark.png"
              alt="RannaBari"
              className="hidden h-8 w-8 object-contain rounded-[8px] border border-line bg-raised shadow-xs dark:block"
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-raised/90 text-ink2 opacity-0 transition-opacity group-hover:opacity-100">
              <Icon d={CHEVRON_RIGHT} />
            </span>
          </button>

          <img
            src="/logo.png"
            alt="RannaBari"
            className={`h-8 w-8 shrink-0 object-contain rounded-[8px] border border-line bg-raised shadow-xs dark:hidden ${
              rail ? 'lg:hidden' : ''
            }`}
          />
          <img
            src="/logo-dark.png"
            alt="RannaBari"
            className={`hidden h-8 w-8 shrink-0 object-contain rounded-[8px] border border-line bg-raised shadow-xs dark:block ${
              rail ? 'lg:dark:hidden' : ''
            }`}
          />

          <div className={`min-w-0 ${rail ? 'lg:hidden' : ''}`}>
            <div className="flex items-center">
              <span className="font-display text-[15px] leading-none font-bold tracking-[-0.02em] text-ink">
                Ranna
              </span>
              <span className="font-display text-[15px] leading-none font-bold tracking-[-0.02em] text-primary">
                Bari
              </span>
            </div>
            <div className="label mt-1 text-[10px] tracking-[0.03em] opacity-75">
              Operator console
            </div>
          </div>

          <button
            type="button"
            onClick={toggleRail}
            aria-label="Collapse navigation"
            title="Collapse navigation  ["
            className={`ml-auto hidden size-7 shrink-0 items-center justify-center rounded-[8px] text-ink3 transition-colors hover:bg-sunken hover:text-ink ${
              rail ? '' : 'lg:flex'
            }`}
          >
            <Icon d={CHEVRON_LEFT} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-2.5 py-4">
          {NAV.map((section) => {
            const items = section.items.filter((item) => can(role, item.cap));
            if (!items.length) return null;
            return (
              <div key={section.group}>
                {/* The group name is a wayfinding aid, not content: it recedes
                    below the links it heads, and vanishes in the rail. */}
                <div
                  className={`label px-2.5 pt-0.5 pb-1.5 opacity-70 select-none ${
                    rail ? 'lg:hidden' : ''
                  }`}
                >
                  {section.group}
                </div>
                <div
                  className={`mx-auto mb-2 hidden h-px w-5 bg-line ${rail ? 'lg:block' : ''}`}
                  aria-hidden
                />

                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = isUnder(pathname, item.href);
                    const count = item.badge ? counts[item.badge] : 0;
                    return (
                      <li key={item.href} className="relative">
                        {/* The accent sits on the panel's own edge rather than
                            the pill's, so the current page is findable from the
                            border of the screen and not just from the fill. */}
                        <span
                          className={`absolute top-1 bottom-1 -left-2.5 w-[3px] rounded-r-full transition-colors ${
                            active ? 'bg-primary' : 'bg-transparent'
                          }`}
                          aria-hidden
                        />
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          title={item.label}
                          className={`group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13px] transition-colors ${
                            rail ? 'lg:justify-center lg:px-0' : ''
                          } ${
                            active
                              ? 'bg-primary-50 font-semibold text-primary'
                              : 'font-medium text-ink2 hover:bg-sunken hover:text-ink'
                          }`}
                        >
                          <Icon
                            d={ICON[item.href] ?? FALLBACK_ICON}
                            className={
                              active ? 'text-primary' : 'text-ink3 group-hover:text-ink2'
                            }
                          />
                          <span className={`truncate ${rail ? 'lg:hidden' : ''}`}>
                            {item.label}
                          </span>

                          {count > 0 ? (
                            <>
                              <span
                                key={count}
                                className={`rb-attn tnum ml-auto shrink-0 rounded-full bg-saffron-100 px-1.5 py-px text-[10.5px] leading-[16px] font-bold text-saffron ${
                                  rail ? 'lg:hidden' : ''
                                }`}
                                title="Needs a human"
                              >
                                {count}
                              </span>
                              {/* The rail has no room for a number, but it must
                                  still say that something is waiting. */}
                              <span
                                key={`dot-${count}`}
                                className={`rb-attn absolute top-1.5 right-2 hidden h-1.5 w-1.5 rounded-full bg-saffron ${
                                  rail ? 'lg:block' : ''
                                }`}
                                aria-hidden
                              />
                            </>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

      </aside>
    </>
  );
}

/**
 * Where the operator is, for the top bar.
 *
 * The shell is a server component and cannot see the path, so the crumb reads
 * it here — from the same NAV the links come from, which means the bar can
 * never name a screen the navigation does not have.
 */
export function PageContext() {
  const pathname = usePathname();

  for (const section of NAV) {
    for (const item of section.items) {
      if (!isUnder(pathname, item.href)) continue;

      // Anything past the module's own route is a record — an order code, a
      // kitchen id — and worth showing, because that is what the operator is
      // actually looking at.
      const rest = pathname.slice(item.href === '/' ? 1 : item.href.length);
      const detail = rest.split('/').filter(Boolean)[0];

      return (
        <div className="flex min-w-0 items-center gap-2">
          <span className="label hidden opacity-70 sm:block">{section.group}</span>
          <span className="hidden text-ink3 sm:block" aria-hidden>
            /
          </span>
          <span className="truncate text-[13.5px] font-semibold text-ink">{item.label}</span>
          {detail ? (
            <>
              <span className="text-ink3" aria-hidden>
                /
              </span>
              <span className="tnum max-w-[180px] truncate text-[12.5px] text-ink3">
                {decodeURIComponent(detail)}
              </span>
            </>
          ) : null}
        </div>
      );
    }
  }

  return <span className="text-[13.5px] font-semibold text-ink3">Console</span>;
}
