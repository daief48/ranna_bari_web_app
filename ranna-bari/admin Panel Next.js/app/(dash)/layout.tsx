import { redirect } from 'next/navigation';

import { currentUser, clearSessionCookie } from '@/lib/auth';
import { db, ensureAppendOnly } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { ROLE_LABEL } from '@/lib/domain';
import { Sidebar } from '@/components/shell/Sidebar';
import { ThemeToggle } from '@/components/ui/client';
import { BTN } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * The shell.
 *
 * Also where the append-only triggers get re-applied — `prisma db push`
 * rebuilds the schema and drops them with it, so leaving that to a migration
 * means the ledger silently loses its guard the first time the schema moves.
 */
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  await ensureAppendOnly();

  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.escrowAutoReleaseDays * 86_400_000);

  /* The three counts the sidebar badges. All work that is waiting on a
     person: an unreviewed cook, an unresolved dispute, and money that has sat
     in escrow past the release window. */
  const [kyc, disputes, escrow] = await Promise.all([
    db.kitchen.count({ where: { kycStatus: 'pending' } }),
    db.dispute.count({ where: { status: { in: ['open', 'investigating'] } } }),
    db.order.count({
      where: { payment: 'held', status: 'delivered', deliveredAt: { lt: cutoff } },
    }),
  ]);

  async function signOut() {
    'use server';
    await clearSessionCookie();
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar role={user.role} counts={{ kyc, disputes, escrow }} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[57px] shrink-0 items-center justify-end gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur lg:px-6">
          <div className="mr-auto pl-10 lg:pl-0" />

          <div className="hidden text-right sm:block">
            <div className="text-[13px] leading-tight font-semibold">{user.name}</div>
            <div className="text-[11px] text-ink3">{ROLE_LABEL[user.role] ?? user.role}</div>
          </div>

          <ThemeToggle />

          <form action={signOut}>
            <button type="submit" className={BTN.quiet}>
              Sign out
            </button>
          </form>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
