'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { notificationHref, notificationTargetLabel } from '@/lib/notification-link';
import { timeAgo } from '@/lib/format';

export type HeaderNote = {
  id: string;
  audience: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  at: string;
  orderId: string | null;
  mealId: string | null;
  requestId: string | null;
  kitchenId: string | null;
  customerKey: string | null;
};

/**
 * The bell.
 *
 * What the platform has just told people, one click from wherever the
 * operator is. The panel had a notifications *board* — a place you go to
 * audit sends — and nothing that surfaced a new one while you were working,
 * so an operator only learned about an event by opening a page that was
 * already about it.
 *
 * Every row goes to the thing the message is about, not to the message: an
 * order notification opens the order. `notificationHref` decides that in one
 * place so this and the board cannot disagree.
 *
 * The list is rendered by the server on each navigation rather than polled.
 * A desk tool navigates constantly, and a poll would be a request every few
 * seconds for a number that changes a few times an hour.
 */
export function HeaderNotifications({
  notes,
  unread,
}: {
  notes: HeaderNote[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  /* A popover that outlives a click elsewhere is a popover in the way. */
  useEffect(() => {
    if (!open) return undefined;

    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        title={unread ? `${unread} unread` : 'Notifications'}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-transparent text-ink2 transition-colors hover:bg-sunken hover:text-ink"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unread > 0 ? (
          <span
            className="absolute -top-0.5 -right-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9.5px] leading-[15px] font-bold text-on-primary tabular-nums"
            aria-hidden
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-[12px] border border-line bg-raised shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[12px] font-semibold text-ink">Notifications</span>
            <span className="text-[11px] text-ink3">
              {unread ? `${unread} unread` : 'all read'}
            </span>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {notes.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-ink3">
                Nothing has gone out yet.
              </p>
            ) : (
              notes.map((note) => (
                <Link
                  key={note.id}
                  href={notificationHref(note)}
                  onClick={() => setOpen(false)}
                  className="flex gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-sunken"
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      note.read ? 'bg-line' : 'bg-primary'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">
                      {note.title}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[11.5px] leading-snug text-ink2">
                      {note.body}
                    </span>
                    <span className="mt-1 block text-[10.5px] text-ink3">
                      {note.audience} · opens the {notificationTargetLabel(note)} ·{' '}
                      {timeAgo(note.at)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-3 py-2 text-center text-[12px] font-semibold text-primary hover:bg-sunken"
          >
            All notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
