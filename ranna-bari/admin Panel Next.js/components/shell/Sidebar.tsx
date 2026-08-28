'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

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
      { href: '/meals', label: 'Meals', cap: 'order.read' },
      { href: '/stores', label: 'Stores & products', cap: 'order.read' },
    ],
  },
  {
    group: 'Demand',
    items: [
      { href: '/orders', label: 'Orders', cap: 'order.read' },
      { href: '/chat', label: 'Live chat', cap: 'order.read', badge: 'chat' },
      { href: '/requests', label: 'Requests & offers', cap: 'request.read' },
      { href: '/reviews', label: 'Reviews', cap: 'kitchen.read' },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/ledger', label: 'Ledger & escrow', cap: 'ledger.read', badge: 'escrow' },
      { href: '/payouts', label: 'Payouts', cap: 'ledger.read' },
      { href: '/topups', label: 'Top-up reconciliation', cap: 'ledger.read' },
      { href: '/disputes', label: 'Disputes', cap: 'order.read', badge: 'disputes' },
    ],
  },
  {
    group: 'Platform',
    items: [
      { href: '/settings', label: 'Configuration', cap: 'config.read' },
      { href: '/notifications', label: 'Notifications', cap: 'order.read' },
      { href: '/admins', label: 'Admin users', cap: 'kitchen.read' },
      { href: '/audit', label: 'Audit log', cap: 'order.read' },
    ],
  },
];

export function Sidebar({
  role,
  counts,
}: {
  role: string;
  counts: { kyc: number; disputes: number; escrow: number; chat: number };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed top-3 left-3 z-50 rounded-[10px] border border-line bg-raised px-2.5 py-1.5 text-[13px] shadow-sm lg:hidden"
        aria-label="Toggle navigation"
      >
        ☰
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col border-r border-line bg-raised transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-[57px] shrink-0 items-center gap-2 border-b border-line px-4">
          <span
            className="grid h-7 w-7 place-items-center rounded-[9px] bg-primary text-[13px] font-bold text-on-primary"
            aria-hidden
          >
            রা
          </span>
          <div className="min-w-0">
            <div className="font-display text-[14px] leading-none font-bold">RannaBari</div>
            <div className="text-[10.5px] text-ink3">Admin</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
          {NAV.map((section) => {
            const items = section.items.filter((item) => can(role, item.cap));
            if (!items.length) return null;
            return (
              <div key={section.group}>
                <div className="label px-2 pb-1.5">{section.group}</div>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active =
                      item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                    const count = item.badge ? counts[item.badge] : 0;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5 text-[13px] transition-colors ${
                            active
                              ? 'bg-primary-50 font-semibold text-primary'
                              : 'text-ink2 hover:bg-sunken hover:text-ink'
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          {count > 0 ? (
                            <span
                              className="tnum shrink-0 rounded-full bg-saffron-100 px-1.5 py-px text-[10.5px] font-bold text-saffron"
                              title="Needs attention"
                            >
                              {count}
                            </span>
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
