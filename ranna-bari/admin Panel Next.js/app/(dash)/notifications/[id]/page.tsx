import Link from 'next/link';
import { notFound } from 'next/navigation';

import { get } from '@/lib/backend';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { Badge, Card, Field, Grid, LinkButton, PageHeader, Stat } from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

type Note = {
  id: string;
  key: string;
  audience: string;
  kind: string;
  title: string;
  body: string;
  customerKey: string | null;
  kitchenId: string | null;
  zone: string | null;
  orderId: string | null;
  mealId: string | null;
  requestId: string | null;
  offerId: string | null;
  /** Set when an operator sent it by hand rather than the system raising it. */
  broadcastBy: string | null;
  read: boolean;
  at: string;
};

export default async function NotificationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage('order.read');
  const { id } = await params;

  /* Everything that went out under the same dedupe key is counted with it:
     `key` is unique only while unread, so a repeat is a real second send
     rather than a duplicate row, and how many landed against how many were
     opened is the only honest measure of whether the message worked. All of
     it, and the three things it might point at, come back in one read. */
  const loaded = await get<{
    note: Note;
    counts: { sent: number; opened: number };
    kitchen: { id: string; name: string } | null;
    order: { id: string; code: string } | null;
    meal: { id: string; title: string } | null;
    siblings: Note[];
  }>(`/notifications/${id}`).catch(() => null);
  if (!loaded) notFound();

  const note = loaded.note;
  const batch = loaded.counts.sent;
  const opened = loaded.counts.opened;
  const { kitchen, order, meal } = loaded;

  const targeted = note.customerKey || note.kitchenId || note.zone;

  return (
    <>
      <PageHeader
        title={note.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={note.audience === 'cook' ? 'info' : 'neutral'}>{note.audience}</Badge>
            <span className="text-ink3">·</span>
            <code className="text-[12px]">{note.kind}</code>
            <span className="text-ink3">·</span>
            <span>{fmtDateTime(note.at)}</span>
          </span>
        }
        actions={<LinkButton href="/notifications">← All notifications</LinkButton>}
      />

      <Grid cols={3}>
        <Stat
          label="Sent under this key"
          value={batch.toLocaleString('en-US')}
          sub={batch === 1 ? 'This recipient only' : 'Across all recipients'}
        />
        <Stat
          label="Opened"
          value={opened.toLocaleString('en-US')}
          tone={batch > 0 && opened / batch >= 0.5 ? 'good' : 'neutral'}
          sub={batch > 0 ? `${Math.round((opened / batch) * 100)}% of the batch` : undefined}
        />
        <Stat
          label="This one"
          value={note.read ? 'Read' : 'Unread'}
          tone={note.read ? 'good' : 'warn'}
          sub={note.broadcastBy ? `Sent by ${note.broadcastBy}` : 'Raised by the app'}
        />
      </Grid>

      <Card className="mt-3" title="The message">
        <p className="font-display text-[16px] font-bold text-ink">{note.title}</p>
        <p className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink2">
          {note.body || <span className="text-ink3">No body.</span>}
        </p>
      </Card>

      <Grid cols={2}>
        <Card className="mt-3" title="Delivery">
          <Field label="Audience">
            <Badge tone={note.audience === 'cook' ? 'info' : 'neutral'}>{note.audience}</Badge>
          </Field>
          <Field label="Kind">
            <code className="text-[12px]">{note.kind}</code>
          </Field>
          <Field label="Dedupe key">
            <code className="text-[11.5px] text-ink2">{note.key}</code>
          </Field>
          <Field label="State">
            {note.read ? <Badge tone="good">Read</Badge> : <Badge tone="warn">Unread</Badge>}
          </Field>
          <Field label="Sent">{fmtDateTime(note.at)}</Field>
          <Field label="Sent by">
            {note.broadcastBy ? (
              note.broadcastBy
            ) : (
              <span className="text-ink3">The app, automatically</span>
            )}
          </Field>
        </Card>

        <Card className="mt-3" title="Who it went to">
          {!targeted ? (
            <p className="text-[13px] text-ink2">
              Everyone in the <strong>{note.audience}</strong> audience — no narrowing was
              applied.
            </p>
          ) : null}
          <Field label="Customer">
            {note.customerKey ? (
              <code className="text-[11.5px] text-ink2">{note.customerKey}</code>
            ) : (
              <span className="text-ink3">—</span>
            )}
          </Field>
          <Field label="Kitchen">
            {kitchen ? (
              <Link href={`/kitchens/${kitchen.id}`} className="hover:text-primary">
                {kitchen.name}
              </Link>
            ) : (
              <span className="text-ink3">—</span>
            )}
          </Field>
          <Field label="Zone">{note.zone || <span className="text-ink3">—</span>}</Field>
        </Card>
      </Grid>

      <Card className="mt-3" title="What it points at">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          {order ? (
            <Link href={`/orders/${order.id}`} className="hover:text-primary">
              <span className="label mr-1.5">Order</span>
              <span className="tnum">{order.code}</span>
            </Link>
          ) : null}
          {meal ? (
            <Link href={`/meals/${meal.id}`} className="hover:text-primary">
              <span className="label mr-1.5">Meal</span>
              {meal.title}
            </Link>
          ) : null}
          {note.requestId ? (
            <Link href={`/requests/${note.requestId}`} className="hover:text-primary">
              <span className="label mr-1.5">Request</span>
              <code className="text-[11.5px]">{note.requestId}</code>
            </Link>
          ) : null}
          {note.offerId ? (
            <span>
              <span className="label mr-1.5">Offer</span>
              <code className="text-[11.5px] text-ink2">{note.offerId}</code>
            </span>
          ) : null}
          {!order && !meal && !note.requestId && !note.offerId ? (
            <span className="text-[13px] text-ink3">
              Nothing — this notification does not deep-link anywhere.
            </span>
          ) : null}
        </div>
      </Card>

      <Card className="mt-3" title="Recent notifications">
        <RecentList rows={loaded.siblings} />
      </Card>
    </>
  );
}

/* Handed the rows rather than fetching them: the endpoint already returned
   everything else that went to this audience, and a second read would be a
   second round trip for a list that is on screen beside its source. */
function RecentList({ rows }: { rows: Note[] }) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-ink3">Nothing else has gone to this audience.</p>;
  }

  return (
    <ul className="divide-y divide-line2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 py-2">
          <Link
            href={`/notifications/${row.id}`}
            className="min-w-0 truncate text-[13px] hover:text-primary"
          >
            {row.title}
          </Link>
          <span className="flex shrink-0 items-center gap-2.5 text-[12px] text-ink3">
            <code className="text-[11.5px]">{row.kind}</code>
            {row.read ? null : <Badge tone="warn">Unread</Badge>}
            <span className="w-[70px] text-right">{timeAgo(row.at)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
