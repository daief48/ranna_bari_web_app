import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { BackendError, get } from '@/lib/backend';
import { taka, timeAgo } from '@/lib/format';
import { ORDER_KINDS } from '@/lib/domain';
import { paging, pageCount } from '@/lib/queries';
import {
  Badge,
  Card,
  GapNote,
  Grid,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  EmptyRow,
} from '@/components/ui';
import { RowLink } from '@/components/ui/row-link';
import { SearchBox, FilterSelect, Pager } from '@/components/ui/client';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Orders · RannaBari Admin' };
export const dynamic = 'force-dynamic';

const STATUSES = [
  'pending', 'placed', 'confirmed', 'accepted', 'preparing', 'cooking',
  'ready', 'delivering', 'on_the_way', 'delivered', 'completed',
  'cancelled', 'rejected',
];

/**
 * One row of the board.
 *
 * `createdAt` is a Date from Prisma and an ISO string from the backend;
 * `timeAgo` takes either, which is why the union never has to be narrowed.
 */
type Row = {
  id: string;
  code: string;
  kind: string;
  title: string;
  cookName: string;
  customerName: string;
  kitchenId: string;
  status: string;
  payment: string;
  amount: number;
  createdAt: string | Date;
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('order.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);

  const where: Prisma.OrderWhereInput = {};
  if (params.q) {
    where.OR = [
      { code: { contains: params.q.toUpperCase() } },
      { customerName: { contains: params.q } },
      { title: { contains: params.q } },
      { cookName: { contains: params.q } },
    ];
  }
  if (params.kind) where.kind = params.kind;
  if (params.status) where.status = params.status;
  if (params.payment) where.payment = params.payment;
  if (params.kitchen) where.kitchenId = params.kitchen;

  let rows: Row[] = [];
  let total = 0;

  if (params.q) {
    /* `GET /orders` filters on kind, status, payment and kitchenId and takes
       no free-text term, so a search is still answered from Prisma. */
    [rows, total] = await Promise.all([
      db.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      db.order.count({ where }),
    ]);
  } else {
    const query = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (params.kind) query.set('kind', params.kind);
    if (params.status) query.set('status', params.status);
    if (params.payment) query.set('payment', params.payment);
    if (params.kitchen) query.set('kitchenId', params.kitchen);

    try {
      const list = await get<{ orders: Row[]; total: number }>(`/orders?${query}`);
      rows = list.orders;
      total = list.total;
    } catch (error) {
      /* Only an unreachable backend degrades into a banner. A refusal the
         backend actually sent is a real bug and stays loud. */
      if (error instanceof BackendError && error.status === 0) {
        return (
          <>
            <PageHeader
              title="Orders"
              subtitle="Every order across all four systems, on one rail"
            />
            <GapNote>
              <strong>The backend is not answering.</strong> Orders are served by{' '}
              <code>backend-node</code>, and nothing on this board can be read without
              it. Start it with <code>cd backend-node &amp;&amp; npm run dev</code>, then
              reload.
            </GapNote>
          </>
        );
      }
      throw error;
    }
  }

  /* Two more answers `GET /orders` cannot give: an aggregate over the whole
     filtered set, and whether each order carries a dispute. Both stay on
     Prisma until the endpoint returns them. */
  const [held, disputed] = await Promise.all([
    db.order.aggregate({ where: { ...where, payment: 'held' }, _sum: { amount: true }, _count: true }),
    db.dispute.findMany({ where: { order: where }, select: { orderId: true } }),
  ]);
  const disputedIds = new Set(disputed.map((row) => row.orderId));

  /* An order carries its kitchen's name as `cookName`, which is the same
     string the kitchen lookup used to supply — and the backend has no read of
     one kitchen by id. */
  const kitchenName = params.kitchen ? rows[0]?.cookName : null;

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={
          kitchenName
            ? `Filtered to ${kitchenName}`
            : 'Every order across all four systems, on one rail'
        }
      />

      <Grid cols={3}>
        <Stat label="Matching orders" value={total.toLocaleString('en-US')} />
        <Stat
          label="Money held against them"
          value={taka(held._sum.amount ?? 0)}
          tone={(held._sum.amount ?? 0) > 0 ? 'warn' : 'neutral'}
          sub={`${held._count} orders in escrow`}
        />
        <Stat
          label="With a dispute"
          value={disputedIds.size}
          tone={disputedIds.size > 0 ? 'bad' : 'neutral'}
          href="/disputes"
        />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title="Orders"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox placeholder="Code, customer, dish…" />
            <FilterSelect
              name="kind"
              allLabel="All systems"
              options={ORDER_KINDS.map((k) => ({ value: k.key, label: k.label }))}
            />
            <FilterSelect
              name="status"
              allLabel="Any status"
              options={STATUSES.map((s) => ({
                value: s,
                label: s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '),
              }))}
            />
            <FilterSelect
              name="payment"
              allLabel="Any payment"
              options={[
                { value: 'held', label: 'Held in escrow' },
                { value: 'released', label: 'Released' },
                { value: 'refunded', label: 'Refunded' },
                { value: 'cod', label: 'Cash on delivery' },
              ]}
            />
          </div>
        }
      >
        <Table
          head={['Code', 'System', 'Item', 'Kitchen', 'Customer', 'Status', 'Money', 'Amount', 'When']}
        >
          {rows.map((order) => (
            <RowLink key={order.id} href={`/orders/${order.id}`}>
              <td>
                <Link
                  href={`/orders/${order.id}`}
                  className="tnum font-semibold hover:text-primary"
                >
                  {order.code}
                </Link>
                {disputedIds.has(order.id) ? (
                  <span className="ml-1.5">
                    <Badge tone="bad" title="Has an open dispute">
                      !
                    </Badge>
                  </span>
                ) : null}
              </td>
              <td>
                <Badge tone={order.kind === 'cod' ? 'neutral' : 'info'}>{order.kind}</Badge>
              </td>
              <td className="max-w-[200px] truncate">{order.title}</td>
              <td className="max-w-[140px] truncate text-ink2">
                <Link href={`/kitchens/${order.kitchenId}`} className="hover:text-primary">
                  {order.cookName}
                </Link>
              </td>
              <td className="max-w-[130px] truncate text-ink2">{order.customerName}</td>
              <td>
                <StatusBadge status={order.status} />
              </td>
              <td>
                <StatusBadge status={order.payment} />
              </td>
              <td>
                <Money amount={order.amount} />
              </td>
              <td className="whitespace-nowrap text-ink2">{timeAgo(order.createdAt)}</td>
            </RowLink>
          ))}
          {rows.length === 0 ? <EmptyRow span={9}>No order matches that.</EmptyRow> : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>
    </>
  );
}
