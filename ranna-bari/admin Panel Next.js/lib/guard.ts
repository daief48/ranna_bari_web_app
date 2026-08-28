import 'server-only';

import { redirect } from 'next/navigation';

import { currentUser, type Session } from './auth';
import { can } from './domain';

/**
 * Refuse to render a page the signed-in role has no business seeing.
 *
 * The sidebar already hides these links, and every server action re-checks
 * before it writes — but neither of those stops a support agent from typing
 * `/payouts` into the address bar and reading what every cook is owed.
 * Hiding a link is not access control; this is.
 *
 * Redirects rather than throwing: a 403 page an operator cannot act on is
 * just a dead end, and the dashboard is always something they can see.
 */
export async function requirePage(capability: string): Promise<Session> {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!can(user.role, capability)) {
    redirect(`/?denied=${encodeURIComponent(capability)}`);
  }
  return user;
}
