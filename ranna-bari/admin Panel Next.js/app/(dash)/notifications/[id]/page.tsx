import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { Badge, Card, Field, Grid, LinkButton, PageHeader, Stat } from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

export default async function NotificationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage('order.read');
  const { id } = await params;

  const note = await db.notification.findUnique({ where: { id } });
  if (!note) notFound();

  /* Everything that went out under the same dedupe key. `key` is unique only
     while unread, so a repeat is a real second send, not a duplicate row —
     and how many landed against how many were opened is the only honest
     measure of whether the message worked. */
  const [batch, opened, kitchen, order, meal] = await Promise.all([
    db.notification.count({ where: { key: note.key } }),
    db.notification.count({ where: { key: note.key, read: true } }),
    note.kitchenId
      ? db.kitchen.findUnique({ where: { id: note.kitchenId }, select: { id: true, name: true } })
      : null,
    note.orderId
      ? db.order.findUnique({ where: { id: note.orderId }, select: { id: true, code: true } })
      : null,
    note.mealId
      ? db.meal.findUnique({ where: { id: note.mealId }, select: { id: true, title: true } })
      : null,
  ]);

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
        <RecentList currentId={note.id} audience={note.audience} />
      </Card>
    </>
  );
}

async function RecentList({ currentId, audience }: { currentId: string; audience: string }) {
  const rows = await db.notification.findMany({
    where: { audience, id: { not: currentId } },
    orderBy: { at: 'desc' },
    take: 10,
  });

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
