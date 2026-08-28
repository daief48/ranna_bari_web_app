import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { taka, timeAgo } from '@/lib/format';
import { ORDER_KINDS } from '@/lib/domain';
import { paging, pageCount } from '@/lib/queries';
import {
  Badge,
  Card,
  Grid,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  EmptyRow,
} from '@/components/ui';
import { SearchBox, FilterSelect, Pager } from '@/components/ui/client';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Orders · RannaBari Admin' };
export const dynamic = 'force-dynamic';

const STATUSES = [
  'pending', 'placed', 'confirmed', 'accepted', 'preparing', 'cooking',
  'ready', 'delivering', 'on_the_way', 'delivered', 'completed',
  'cancelled', 'rejected',
];

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

  const [rows, total, held, disputed] = await Promise.all([
    db.order.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { dispute: { select: { id: true, status: true } } },
    }),
    db.order.count({ where }),
    db.order.aggregate({ where: { ...where, payment: 'held' }, _sum: { amount: true }, _count: true }),
    db.order.count({ where: { ...where, dispute: { isNot: null } } }),
  ]);

  const kitchen = params.kitchen
    ? await db.kitchen.findUnique({ where: { id: params.kitchen }, select: { name: true } })
    : null;

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={
          kitchen
            ? `Filtered to ${kitchen.name}`
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
          value={disputed}
          tone={disputed > 0 ? 'bad' : 'neutral'}
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
            <tr key={order.id}>
              <td>
                <Link
                  href={`/orders/${order.id}`}
                  className="tnum font-semibold hover:text-primary"
                >
                  {order.code}
                </Link>
                {order.dispute ? (
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
            </tr>
          ))}
          {rows.length === 0 ? <EmptyRow span={9}>No order matches that.</EmptyRow> : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>
    </>
  );
}
