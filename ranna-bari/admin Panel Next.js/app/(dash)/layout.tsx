import { redirect } from 'next/navigation';

import { currentUser, clearSessionCookie } from '@/lib/auth';
import { get } from '@/lib/backend';
import { ROLE_LABEL } from '@/lib/domain';
import { Sidebar, PageContext } from '@/components/shell/Sidebar';
import CommandPalette from '@/components/shell/CommandPalette';
import { ThemeToggle } from '@/components/ui/client';
import { Avatar, BTN } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * The shell.
 *
 * It used to re-apply the append-only triggers on every render, because
 * `prisma db push` rebuilt the panel's own schema and dropped them with it.
 * The ledger is not here any more — it is in Mongo, behind the backend, where
 * the guard is Mongoose middleware plus an Atlas role that refuses the write.
 * There is nothing left for this file to protect.
 */
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  /*
   * The four counts the sidebar badges, from the backend.
   *
   * All work that is waiting on a person: an unreviewed cook, an unresolved
   * dispute, money that has sat in escrow past the release window, and
   * somebody mid-sentence. Three of them come folded out of `/overview`,
   * which is already computing them for the dashboard — counting them twice
   * against two different clocks is how a badge and the page it opens end up
   * disagreeing.
   *
   * `.catch` rather than a guard: the shell has to render even when the
   * backend is down, or an operator gets a stack trace instead of the page
   * that would have told them it is down.
   */
  const [board, chatStats] = await Promise.all([
    get<{ attention: { kyc: number; disputes: number; escrowAged: number } }>(
      '/overview',
    ).catch(() => null),
    get<{ waiting: number }>('/chat/stats').catch(() => null),
  ]);

  const kyc = board?.attention.kyc ?? 0;
  const disputes = board?.attention.disputes ?? 0;
  const escrow = board?.attention.escrowAged ?? 0;
  const chat = chatStats?.waiting ?? 0;

  async function signOut() {
    'use server';
    await clearSessionCookie();
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar role={user.role} counts={{ kyc, disputes, escrow, chat }} />
      <CommandPalette role={user.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[57px] shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur lg:px-6">
          {/* Left of the hamburger below lg, or the bar would sit under it. */}
          <div className="min-w-0 flex-1 pl-10 lg:pl-0">
            <PageContext />
          </div>

          {/* The rail shortcut is worth advertising: this is a desk tool and
              nobody discovers a bare-key binding by accident. */}
          <div className="hidden items-center gap-3 text-[11.5px] text-ink3 xl:flex">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-[5px] border border-line bg-sunken px-1.5 py-px font-sans text-[10.5px] font-semibold text-ink2">
                ⌘K
              </kbd>
              <span>go to</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-[5px] border border-line bg-sunken px-1.5 py-px font-sans text-[10.5px] font-semibold text-ink2">
                [
              </kbd>
              <span>sidebar</span>
            </span>
          </div>

          <span className="hidden h-6 w-px shrink-0 bg-line sm:block" aria-hidden />

          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={user.name} size={26} />
            <span className="hidden truncate text-[13px] leading-tight font-semibold text-ink sm:block">
              {user.name}
            </span>
            {/* The role is what the whole panel narrows to, so it is a chip and
                not a caption. Neutral on purpose: the colour legend is about
                work waiting, and a role is not a status. */}
            <span
              className="hidden shrink-0 items-center rounded-full border border-line bg-sunken px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.07em] whitespace-nowrap text-ink2 uppercase md:inline-flex"
              title="What this session is allowed to touch"
            >
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
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
