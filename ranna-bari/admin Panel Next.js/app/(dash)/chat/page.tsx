import { get } from '@/lib/backend';
import { requirePage } from '@/lib/guard';
import { Card, Grid, GapNote, PageHeader, Stat } from '@/components/ui';
import { ChatDesk, type Message, type Thread } from './desk';

export const metadata = { title: 'Live chat · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/**
 * The support desk.
 *
 * Server-rendered once with the inbox and whichever thread is open, then
 * handed to a client component that keeps it live. The first paint is real
 * data rather than a spinner, and everything after it arrives without asking.
 *
 * On the backend now, through `/api/admin/v1/chat/*`. That surface was the
 * open question this file used to describe: chat is served to the phone under
 * `/api/app/v1/chat/*` and told apart by credential, while `lib/backend.ts`
 * only ever reaches `/api/admin/v1` — because a panel that can call the app's
 * routes is a panel that can present itself as a customer. Rather than widen
 * the client, the backend grew an admin-prefixed desk: the same
 * `logic/chat.ts` underneath, the same `visibleTo()` authorisation, and no
 * path through it that can construct a customer viewer.
 *
 * "Live" is a poll, not a socket, and that is a hosting fact rather than a
 * preference: the panel runs on serverless functions, which cannot hold a
 * connection open. The desk therefore needs same-origin routes to poll —
 * `app/api/admin/v1/chat/*` — because the service token `lib/backend.ts`
 * signs with is a secret and cannot be handed to a browser.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; kind?: string }>;
}) {
  const user = await requirePage('order.read');
  const params = await searchParams;

  const query = new URLSearchParams({ take: '80' });
  if (params.kind) query.set('kind', params.kind);

  const [inbox, stats] = await Promise.all([
    get<{ threads: Thread[] }>(`/chat/threads?${query}`),
    get<{ waiting: number; openSupport: number; today: number }>('/chat/stats'),
  ]);

  const threads = inbox.threads;

  // Default to whatever is most recent, so the desk opens on work rather
  // than on an empty pane.
  const activeId = params.thread ?? threads[0]?.id ?? null;
  const active = activeId ? (threads.find((t) => t.id === activeId) ?? null) : null;

  /* A thread id from the query string may be one this operator cannot read,
     or one that has since been deleted — the surface answers 404 either way,
     and an unreadable thread is an empty pane rather than a crash. */
  const transcript = activeId
    ? await get<{ messages: Message[] }>(
        `/chat/messages?threadId=${encodeURIComponent(activeId)}&take=80`,
      )
        .then((out) => out.messages)
        .catch(() => null)
    : null;


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
          value={stats.waiting}
          tone={stats.waiting > 0 ? 'warn' : 'good'}
        />
        <Stat label="Open support threads" value={stats.openSupport} />
        <Stat label="Messages in 24 hours" value={stats.today} />
      </Grid>

      <Card className="mt-3" pad={false}>
        <ChatDesk
          me={{ email: user.email, name: user.name }}
          /* Passed through rather than remapped: shapeThread() on the backend
             already answers in the shape this component renders, and a second
             mapping here is a second place for the two to drift. */
          threads={threads}
          activeId={activeId}
          activeSubject={active?.subject ?? ''}
          activeStatus={active?.status ?? 'open'}
          initialMessages={transcript ?? []}
        />
      </Card>
    </>
  );
}
