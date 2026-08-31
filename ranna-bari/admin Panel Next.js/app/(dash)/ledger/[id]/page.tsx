import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { taka, fmtDateTime, timeAgo } from '@/lib/format';
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
} from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/** What each bucket means, in the one sentence an operator needs. */
const BUCKET: Record<string, string> = {
  customer: 'a customer wallet',
  held: 'escrow — money the platform is holding',
  cook: 'a cook balance',
  platform: 'platform revenue',
};

export default async function LedgerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('ledger.read');
  const { id } = await params;

  const entry = await db.ledgerEntry.findUnique({
    where: { id },
    include: {
      order: { select: { id: true, code: true, title: true, status: true, amount: true, kitchenId: true, cookName: true, customerName: true } },
      payoutRun: { select: { id: true, code: true, status: true, total: true } },
    },
  });
  if (!entry) notFound();

  /* The rest of the movement this entry belongs to. A release and its
     commission are two rows written together, and reading one without the
     other is how people conclude the numbers do not add up. */
  const siblings = entry.orderId
    ? await db.ledgerEntry.findMany({
        where: { orderId: entry.orderId },
        orderBy: { at: 'asc' },
      })
    : [];

  const meal = entry.mealId
    ? await db.meal.findUnique({
        where: { id: entry.mealId },
        select: { id: true, title: true, code: true, kitchenId: true, cookName: true },
      })
    : null;

  return (
    <>
      <PageHeader
        title={taka(entry.amount)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={entry.kind} />
            <span className="text-ink3">·</span>
            <span>
              {entry.from} → {entry.to}
            </span>
            <span className="text-ink3">·</span>
            <span>{fmtDateTime(entry.at)}</span>
          </span>
        }
        actions={<LinkButton href="/ledger">← The ledger</LinkButton>}
      />

      <Grid cols={3}>
        <Stat label="Amount" value={taka(entry.amount)} sub={entry.kind} />
        <Stat
          label="Out of"
          value={entry.from}
          sub={BUCKET[entry.from] ?? 'an account'}
        />
        <Stat label="Into" value={entry.to} sub={BUCKET[entry.to] ?? 'an account'} />
      </Grid>

      <Grid cols={2}>
        <Card className="mt-3" title="The entry">
          <Field label="Kind">
            <StatusBadge status={entry.kind} />
          </Field>
          <Field label="Amount">
            <Money amount={entry.amount} />
          </Field>
          <Field label="From">
            {entry.from}
            {entry.fromRef ? (
              <span className="ml-1.5 text-[11.5px] text-ink3">({entry.fromRef})</span>
            ) : null}
          </Field>
          <Field label="To">
            {entry.to}
            {entry.toRef ? (
              <span className="ml-1.5 text-[11.5px] text-ink3">({entry.toRef})</span>
            ) : null}
          </Field>
          <Field label="Posted">{fmtDateTime(entry.at)}</Field>
          <Field label="Entry id">
            <code className="text-[11.5px] text-ink2">{entry.id}</code>
          </Field>
        </Card>

        <Card className="mt-3" title="What it refers to">
          <Field label="Order">
            {entry.order ? (
              <Link href={`/orders/${entry.order.id}`} className="tnum hover:text-primary">
                {entry.order.code}
              </Link>
            ) : (
              <span className="text-ink3">Not tied to an order</span>
            )}
          </Field>
          <Field label="Meal">
            {meal ? (
              <Link href={`/meals/${meal.id}`} className="hover:text-primary">
                {meal.title}
              </Link>
            ) : (
              <span className="text-ink3">—</span>
            )}
          </Field>
          <Field label="Payout run">
            {entry.payoutRun ? (
              <Link href={`/payouts/${entry.payoutRun.id}`} className="tnum hover:text-primary">
                {entry.payoutRun.code}
              </Link>
            ) : (
              <span className="text-ink3">—</span>
            )}
          </Field>
          <Field label="Idempotency key">
            {entry.idemKey ? (
              <code className="text-[11.5px] text-ink2">{entry.idemKey}</code>
            ) : (
              <span className="text-ink3">None</span>
            )}
          </Field>
          {entry.note ? <Field label="Note">{entry.note}</Field> : null}
          <p className="mt-2 text-[12px] leading-relaxed text-ink3">
            The ledger is append-only. A correction is a new entry in the opposite
            direction, never an edit to this one.
          </p>
        </Card>
      </Grid>

      {entry.order ? (
        <Card
          className="mt-3"
          title="Everything posted against this order"
          subtitle={`${entry.order.code} · ${entry.order.title}`}
          pad={false}
        >
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Kind</th>
                  <th>From</th>
                  <th>To</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {siblings.map((row) => {
                  const isThis = row.id === entry.id;
                  return (
                    <tr key={row.id} className={isThis ? 'bg-primary-50' : undefined}>
                      <td className="whitespace-nowrap text-ink2">
                        {isThis ? (
                          <span className="font-semibold text-primary">this entry</span>
                        ) : (
                          <Link href={`/ledger/${row.id}`} className="hover:text-primary">
                            {timeAgo(row.at)}
                          </Link>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={row.kind} />
                      </td>
                      <td className="text-ink2">{row.from}</td>
                      <td className="text-ink2">{row.to}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Money amount={row.amount} />
                      </td>
                      <td className="max-w-[240px] truncate text-ink2">{row.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {entry.order ? (
        <Card className="mt-3" title="The order">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            <span>
              <span className="label mr-1.5">Item</span>
              {entry.order.title}
            </span>
            <span>
              <span className="label mr-1.5">Kitchen</span>
              <Link href={`/kitchens/${entry.order.kitchenId}`} className="hover:text-primary">
                {entry.order.cookName}
              </Link>
            </span>
            <span>
              <span className="label mr-1.5">Customer</span>
              {entry.order.customerName}
            </span>
            <span>
              <span className="label mr-1.5">Status</span>
              <StatusBadge status={entry.order.status} />
            </span>
            <span>
              <span className="label mr-1.5">Value</span>
              <Money amount={entry.order.amount} />
            </span>
            <Badge tone="neutral">
              <Link href={`/orders/${entry.order.id}`}>Open the order →</Link>
            </Badge>
          </div>
        </Card>
      ) : null}
    </>
  );
}
