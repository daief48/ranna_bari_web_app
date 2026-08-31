'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode, MouseEvent } from 'react';

/**
 * A table row you can click anywhere on.
 *
 * ## Why this is an enhancement and not the affordance
 *
 * The obvious implementation — `tabIndex={0} role="link"` on the `<tr>` — is
 * worse than it looks. It invents a tab stop per row, so a table of fifty
 * becomes fifty stops before the pager; it lies to a screen reader, which
 * announces a link with the row's entire text as its name; and it still does
 * not give you middle-click, "open in new tab", or a status-bar URL preview,
 * because none of those come from a click handler.
 *
 * So every row that uses this keeps a real `<Link>` in its identifying cell.
 * That link is the accessible, keyboard, right-clickable route to the record.
 * What this adds is the *mouse* convenience of not having to hit it — which
 * is all anyone means by "make the row clickable".
 *
 * ## What it must not swallow
 *
 * Several boards put controls in the last column: Moderate, Reconcile,
 * Actions. A click on one of those is not a click on the row, and neither is
 * a click that ends a text selection — dragging across a cell to copy an id
 * and landing on a different page is maddening. Both are checked before
 * navigating.
 */
export function RowLink({
  href,
  children,
  title,
  className = '',
}: {
  href: string;
  children: ReactNode;
  title?: string;
  /** Merged, not replaced — a board that dims its own rows keeps doing so. */
  className?: string;
}) {
  const router = useRouter();

  const onClick = (event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement;

    /* A control in the row owns its own click. `summary` is in this list
       because the audit board expands its before/after snapshot inline, and a
       disclosure that navigates away instead of opening is not a disclosure. */
    if (
      target.closest(
        'a,button,input,select,textarea,label,summary,[role="button"],[data-no-row-link]',
      )
    ) {
      return;
    }

    // Finishing a drag-select is not a navigation.
    if (window.getSelection()?.toString()) return;

    // Modified clicks mean "somewhere else", which router.push cannot do.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      window.open(href, '_blank', 'noopener');
      return;
    }

    router.push(href);
  };

  return (
    <tr
      onClick={onClick}
      title={title}
      className={`cursor-pointer transition-colors hover:bg-sunken ${className}`}
    >
      {children}
    </tr>
  );
}
