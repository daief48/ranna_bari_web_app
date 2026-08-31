import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { get } from '@/lib/backend';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { can, flowFor, nextStatus, type OrderKind } from '@/lib/domain';
import { splitCommission } from '@/lib/logic/ledger';
import { taka, fmtDateTime, timeAgo, daysSince } from '@/lib/format';
import { parseJson, type Address, type OrderLine, type StatusStamp } from '@/lib/mappers';
import {
  Badge,
  Card,
  Field,
  Grid,
  LinkButton,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  EmptyRow,
} from '@/components/ui';
import { OrderControls } from './controls';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/** Exactly what the render below reads, named once so both loads must match. */
type OrderView = Prisma.OrderGetPayload<{
  include: {
    kitchen: { select: { id: true; name: true; area: true } };
    dispute: true;
    ledger: true;
    meal: { select: { id: true; title: true; serveDate: true; slot: true } };
    store: { select: { id: true; name: true } };
  };
}>;

/**
 * The order, from whichever store holds it.
 *
 * `GET /orders/:id` has existed for a while and this page never used it, so
 * every row on the orders board — which *is* served by the backend, and
 * therefore carries the backend's ids — opened a 404. The endpoint returns the
 * kitchen, the dispute and the ledger entries alongside the order, which is
 * everything here except the meal and store rows.
 */
async function loadOrder(id: string): Promise<OrderView | null> {
  const remote = await get<{
    order: Record<string, unknown> & { id: string };
    kitchen: { id: string; name: string; area: string } | null;
    dispute: unknown;
    entries: unknown[];
  }>(`/orders/${id}`).catch(() => null);

  if (remote) {
    return {
      ...(remote.order as unknown as OrderView),
      id: remote.order.id,
      kitchen: remote.kitchen,
      dispute: remote.dispute,
      ledger: remote.entries,
      /* The endpoint does not join these two. Null renders as "not from a
         meal / not a shop order", which is also what a genuinely absent one
         looks like — and inventing a row to fill the slot would be worse. */
      meal: null,
      store: null,
    } as unknown as OrderView;
  }

  return db.order.findUnique({
    where: { id },
    include: {
      kitchen: { select: { id: true, name: true, area: true } },
      dispute: true,
      ledger: { orderBy: { at: 'asc' } },
      meal: { select: { id: true, title: true, serveDate: true, slot: true } },
      store: { select: { id: true, name: true } },
    },
  });
}

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('order.read');
  const { id } = await params;
  const user = await currentUser();

  const order = await loadOrder(id);
  if (!order) notFound();

  const history = parseJson<StatusStamp[]>(order.history, []);
  const lines = parseJson<OrderLine[]>(order.lines, []);
  const address = parseJson<Address>(order.address, null);

  const flow = flowFor(order.kind as OrderKind, order.handover, { preorder: order.preorder });
  const reachedIndex = flow.findIndex((s) => s.key === order.status);
  const stampFor = (key: string) => history.find((h) => h.status === key);

  /* What the split would be if this were released right now. Shown before the
     button rather than after, so an operator releasing money knows exactly
     what each side gets. */
  const projected = order.payment === 'held' ? await splitCommission(order.amount, order.kind) : null;

  const canWrite = can(user?.role ?? '', 'order.write');
  const canMoney = can(user?.role ?? '', 'payout.write');
  const canDispute = can(user?.role ?? '', 'dispute.open');
  const held = order.payment === 'held';
  const aging = held && order.deliveredAt ? daysSince(order.deliveredAt) : 0;

  return (
    <>
      <PageHeader
        title={order.code}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={order.kind === 'cod' ? 'neutral' : 'info'}>{order.kind}</Badge>
            <span>{order.title}</span>
            <span className="text-ink3">·</span>
            <span>placed {fmtDateTime(order.createdAt)}</span>
          </span>
        }
        actions={<LinkButton href="/orders">← All orders</LinkButton>}
      />

      {order.dispute ? (
        <div className="mb-5 rounded-[10px] border border-primary-100 bg-primary-50 px-3.5 py-2.5 text-[13px]">
          <strong className="text-primary">Dispute {order.dispute.code}</strong>{' '}
          <span className="text-ink2">— {order.dispute.reason}</span>{' '}
          <Link href="/disputes" className="font-semibold text-primary hover:underline">
            Open the case →
          </Link>
        </div>
      ) : null}

      {held && aging >= 3 ? (
        <div className="mb-5 rounded-[10px] border border-saffron-100 bg-saffron-50 px-3.5 py-2.5 text-[13px] text-ink2">
          <strong className="text-saffron">Held for {aging} days.</strong> The customer
          has paid and the cook has cooked, and neither has what they are owed. In the
          app nothing resolves this — only the customer can, by confirming receipt.
        </div>
      ) : null}

      <Grid cols={4}>
        <Stat label="Order total" value={taka(order.amount)} />
        <Stat
          label="Payment"
          value={order.payment === 'cod' ? 'Cash' : order.payment}
          tone={held ? 'warn' : order.payment === 'released' ? 'good' : 'neutral'}
          sub={held ? `held ${aging > 0 ? `${aging} days` : 'since delivery'}` : undefined}
        />
        <Stat
          label={order.payment === 'released' ? 'Cook received' : 'Cook would receive'}
          value={taka(order.cookAmount ?? projected?.cook ?? 0)}
          tone="good"
          sub={order.kind === 'cod' ? 'Paid in cash to the rider' : undefined}
        />
        <Stat
          label={order.payment === 'released' ? 'Commission taken' : 'Commission would be'}
          value={taka(order.platformAmount ?? projected?.platform ?? 0)}
          sub={
            projected
              ? `${Math.round(projected.rate * 100)}% on ${order.kind}`
              : undefined
          }
        />
      </Grid>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="Timeline" subtitle="Every stamp, and who made it" className="lg:col-span-1">
          <ol className="space-y-0">
            {flow.map((step, i) => {
              const stamp = stampFor(step.key);
              const reached = reachedIndex >= 0 ? i <= reachedIndex : !!stamp;
              return (
                <li key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2 ${
                        reached ? 'border-sage bg-sage' : 'border-line bg-raised'
                      }`}
                      aria-hidden
                    />
                    {i < flow.length - 1 ? (
                      <span
                        className={`w-0.5 flex-1 ${reached ? 'bg-sage-100' : 'bg-line2'}`}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 pb-4">
                    <div
                      className={`text-[13px] font-medium ${reached ? 'text-ink' : 'text-ink3'}`}
                    >
                      {step.label}
                    </div>
                    {stamp ? (
                      <div className="text-[11.5px] text-ink3">
                        {fmtDateTime(stamp.at)}
                        {stamp.by ? (
                          <>
                            {' · '}
                            <span className="text-primary" title="Forced by an operator">
                              {stamp.by}
                            </span>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          {['cancelled', 'rejected'].includes(order.status) ? (
            <div className="mt-1 rounded-[10px] border border-primary-100 bg-primary-50 px-3 py-2 text-[12.5px] text-primary">
              {order.status === 'cancelled' ? 'Cancelled' : 'Rejected'}
              {order.cancelReason || order.rejectReason
                ? ` — ${order.cancelReason ?? order.rejectReason}`
                : ''}
            </div>
          ) : null}

          {order.kind !== 'cod' && order.status === 'delivered' ? (
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink3">
              <strong>Delivered is not completed.</strong> Money moves on the customer
              confirming receipt, not on the courier. That gap is the whole design.
            </p>
          ) : null}
        </Card>

        <Card title="Customer" className="lg:col-span-1">
          <Field label="Name">{order.customerName}</Field>
          <Field label="Phone">
            <span className="tnum">{order.phone || '—'}</span>
          </Field>
          <Field label="Key">
            <span className="tnum text-[11.5px]">{order.customerKey}</span>
          </Field>
          {address ? (
            <>
              <Field label="Address">
                <span className="block">{address.label}</span>
                <span className="block text-ink2">{address.line}</span>
                <span className="block text-ink2">{address.area}</span>
              </Field>
              {address.instructions ? (
                <Field label="Instructions">
                  <span className="text-ink2">{address.instructions}</span>
                </Field>
              ) : null}
            </>
          ) : null}
          <Field label="Handover">{order.handover}</Field>
          {order.serveDate ? (
            <Field label="Serving">
              <span className="tnum">{order.serveDate}</span> · {order.slot}
            </Field>
          ) : null}
        </Card>

        <Card title="Kitchen" className="lg:col-span-1">
          <Field label="Kitchen">
            <Link href={`/kitchens/${order.kitchen.id}`} className="hover:text-primary">
              {order.kitchen.name}
            </Link>
          </Field>
          <Field label="Area">{order.kitchen.area}</Field>
          {order.meal ? (
            <Field label="From meal">
              {order.meal.title} · {order.meal.serveDate} {order.meal.slot}
            </Field>
          ) : null}
          {order.store ? <Field label="From shop">{order.store.name}</Field> : null}
          {order.requestId ? (
            <Field label="From request">
              <Link href={`/requests/${order.requestId}`} className="hover:text-primary">
                view the negotiation →
              </Link>
            </Field>
          ) : null}
          <Field label="Subtotal">
            <Money amount={order.subtotal || order.price} />
          </Field>
          {order.deliveryFee > 0 ? (
            <Field label="Delivery">
              <Money amount={order.deliveryFee} />
            </Field>
          ) : null}
          {order.platformFee > 0 ? (
            <Field label="Platform fee">
              <Money amount={order.platformFee} />
            </Field>
          ) : null}
          <Field label="Total">
            <Money amount={order.amount} bold />
          </Field>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Line items" pad={false}>
          <Table head={['Item', 'Qty', 'Price', 'Line']}>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="max-w-[260px] truncate font-medium">
                  {line.name}
                  {line.option ? <span className="ml-1 text-ink3">({line.option})</span> : null}
                </td>
                <td className="tnum">{line.qty}</td>
                <td>
                  <Money amount={line.price} />
                </td>
                <td>
                  <Money amount={line.lineTotal ?? line.price * line.qty} />
                </td>
              </tr>
            ))}
            {lines.length === 0 ? (
              <EmptyRow span={4}>
                A single-item order — {order.title} at {taka(order.price)}.
              </EmptyRow>
            ) : null}
          </Table>
        </Card>

        <Card
          title="Ledger entries"
          subtitle="Every movement attached to this order"
          pad={false}
        >
          <Table head={['Kind', 'From', 'To', 'Amount', 'When']}>
            {order.ledger.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <Badge
                    tone={
                      entry.kind === 'refund'
                        ? 'bad'
                        : entry.kind === 'release'
                          ? 'good'
                          : entry.kind === 'commission'
                            ? 'info'
                            : 'warn'
                    }
                  >
                    {entry.kind}
                  </Badge>
                </td>
                <td className="text-ink2">{entry.from}</td>
                <td className="text-ink2">{entry.to}</td>
                <td>
                  <Money amount={entry.amount} />
                </td>
                <td className="whitespace-nowrap text-ink2">{timeAgo(entry.at)}</td>
              </tr>
            ))}
            {order.ledger.length === 0 ? (
              <EmptyRow span={5}>
                {order.kind === 'cod'
                  ? 'Cash on delivery never touches the ledger — the rider takes the money.'
                  : 'No entries yet.'}
              </EmptyRow>
            ) : null}
          </Table>
        </Card>
      </div>

      <Card title="Operator actions" className="mt-3">
        <OrderControls
          orderId={order.id}
          code={order.code}
          status={order.status}
          payment={order.payment}
          amount={order.amount}
          nextStep={nextStatus(order)}
          hasDispute={!!order.dispute}
          canWrite={canWrite}
          canMoney={canMoney}
          canDispute={canDispute}
        />
      </Card>
    </>
  );
}
