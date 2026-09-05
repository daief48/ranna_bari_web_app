'use client';

/**
 * The panel's dialogs and its confirmations, in one place.
 *
 * Two things used to do this job and neither was ours. Destructive actions
 * asked with `window.confirm` — an operating-system box in Arial that cannot
 * be styled, cannot say which of the three buttons on a row it belongs to,
 * and blocks the whole tab while it waits. And the result came back as a chip
 * under the button, which was well-placed but easy to miss on a long table
 * where the button that produced it has already scrolled away.
 *
 * SweetAlert2 does both, and every colour below is a panel variable rather
 * than a literal, so the dialog follows `[data-theme='dark']` for free —
 * nothing here needs to know which theme is on.
 */
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

/** Shared shape: our fonts, our radii, our surfaces. */
const base = {
  background: 'var(--raised)',
  color: 'var(--ink)',
  customClass: {
    popup: 'rb-swal',
    title: 'rb-swal-title',
    htmlContainer: 'rb-swal-body',
    confirmButton: 'rb-swal-confirm',
    cancelButton: 'rb-swal-cancel',
    actions: 'rb-swal-actions',
  },
  buttonsStyling: false,
} as const;

/**
 * Ask before doing something that cannot be taken back.
 *
 * Resolves true only on an explicit confirm — dismissing by backdrop, Escape
 * or Cancel all mean no, because on a money action "they clicked away" is not
 * consent.
 */
export async function confirmAction({
  title = 'Are you sure?',
  text,
  confirm = 'Yes, do it',
  danger = true,
}: {
  title?: string;
  text?: string;
  confirm?: string;
  danger?: boolean;
}): Promise<boolean> {
  const out = await Swal.fire({
    ...base,
    icon: danger ? 'warning' : 'question',
    iconColor: danger ? 'var(--primary)' : 'var(--saffron)',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirm,
    cancelButtonText: 'Never mind',
    reverseButtons: true,
    /* Cancel is what a stray Return should hit on a destructive question. */
    focusCancel: danger,
  });

  return out.isConfirmed === true;
}

/**
 * Say what happened, without taking the screen.
 *
 * A toast rather than a modal: the answer to "did that work" is worth reading
 * and never worth a click to dismiss, and an operator working down a payout
 * queue would otherwise close one box per row.
 */
export function toastResult(ok: boolean, message: string) {
  if (!message) return;

  Swal.fire({
    ...base,
    toast: true,
    position: 'top-end',
    icon: ok ? 'success' : 'error',
    iconColor: ok ? 'var(--sage)' : 'var(--primary)',
    title: message,
    showConfirmButton: false,
    /* Long enough to read a sentence; a failure earns more of it, because it
       is the one an operator has to act on. */
    timer: ok ? 3200 : 5200,
    timerProgressBar: true,
    customClass: { ...base.customClass, popup: 'rb-swal rb-swal-toast' },
    didOpen: (el) => {
      el.addEventListener('mouseenter', Swal.stopTimer);
      el.addEventListener('mouseleave', Swal.resumeTimer);
    },
  });
}
