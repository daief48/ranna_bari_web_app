import { db } from '@/lib/db';
import { requirePage } from '@/lib/guard';
import { threadsFor, messagesFor, type Viewer } from '@/lib/logic/chat';
import { Card, Grid, GapNote, PageHeader, Stat } from '@/components/ui';
import { ChatDesk } from './desk';

export const metadata = { title: 'Live chat · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/**
 * The support desk.
 *
 * Server-rendered once with the inbox and whichever thread is open, then
 * handed to a client component that keeps it live over the socket. The first
 * paint is real data rather than a spinner, and everything after it arrives
 * without asking.
 *
 * Still on Prisma, and deliberately so. `backend-node` serves chat under
 * `/api/app/v1/chat/*` — one set of endpoints for the phone and the desk, told
 * apart by which credential the caller presents — while `lib/backend.ts` only
 * ever reaches `/api/admin/v1`, because a panel that could call the app's
 * routes is a panel that can present itself as a customer. Widening the client
 * to close that gap is a decision about the trust boundary, not a migration
 * step, so the desk waits for either an admin-prefixed chat surface or an
 * explicit exception. The three counters below have no admin route at all.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; kind?: string }>;
}) {
  const user = await requirePage('order.read');
  const params = await searchParams;

  const viewer: Viewer = { side: 'admin', email: user.email, name: user.name };

  const threads = await threadsFor(viewer, { kind: params.kind, take: 80 });

  // Default to whatever is most recent, so the desk opens on work rather
  // than on an empty pane.
  const activeId = params.thread ?? threads[0]?.id ?? null;
  const active = activeId ? threads.find((t) => t.id === activeId) ?? null : null;

  const transcript = activeId ? await messagesFor(viewer, activeId, { take: 80 }) : null;

  const [waiting, openSupport, todayCount] = await Promise.all([
    db.chatThread.aggregate({ _sum: { unreadAdmin: true } }),
    db.chatThread.count({ where: { kind: 'support', status: 'open' } }),
    db.chatMessage.count({
      where: { sentAt: { gte: new Date(Date.now() - 86_400_000) } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Live chat"
        subtitle="Support, and every conversation between a customer and a cook"
      />

      <GapNote>
        <strong>Why this screen exists.</strong> Until now the only way anybody
        could reach anybody was a <code>tel:</code> link on the cook&rsquo;s order
        screen — one direction, cook to customer, and nothing at all the other way
        or to the platform. A customer whose food never arrived had no one to tell.
        Every thread here is also the evidence a dispute gets settled on, which is
        why a message can be hidden but never edited or deleted.
      </GapNote>

      <Grid cols={3}>
        <Stat
          label="Waiting on the desk"
          value={waiting._sum.unreadAdmin ?? 0}
          tone={(waiting._sum.unreadAdmin ?? 0) > 0 ? 'warn' : 'good'}
        />
        <Stat label="Open support threads" value={openSupport} />
        <Stat label="Messages in 24 hours" value={todayCount} />
      </Grid>

      <Card className="mt-3" pad={false}>
        <ChatDesk
          me={{ email: user.email, name: user.name }}
          threads={threads.map((thread) => ({
            id: thread.id,
            code: thread.code,
            kind: thread.kind,
            subject: thread.subject,
            status: thread.status,
            customerKey: thread.customerKey,
            kitchenId: thread.kitchenId,
            unread: thread.unreadAdmin,
            lastMessageAt: thread.lastMessageAt.toISOString(),
            lastMessageBody: thread.lastMessageBody,
            lastMessageFrom: thread.lastMessageFrom,
            orderCode: thread.order?.code ?? null,
            orderId: thread.order?.id ?? null,
          }))}
          activeId={activeId}
          activeSubject={active?.subject ?? ''}
          activeStatus={active?.status ?? 'open'}
          initialMessages={
            transcript?.ok
              ? (transcript.result.messages as {
                  id: string;
                  senderType: string;
                  senderName: string;
                  body: string;
                  sentAt: string;
                  hidden: boolean;
                  systemKind: string | null;
                }[])
              : []
          }
        />
      </Card>
    </>
  );
}
