import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { taka, pct } from '@/lib/format';
import { paging, pageCount } from '@/lib/queries';
import {
  Avatar,
  Badge,
  Card,
  Empty,
  PageHeader,
  Table,
  EmptyRow,
} from '@/components/ui';
import { SearchBox, FilterSelect, Pager } from '@/components/ui/client';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Kitchens · RannaBari Admin' };
export const dynamic = 'force-dynamic';

export default async function KitchensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('kitchen.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);

  const where: Prisma.KitchenWhereInput = {};
  if (params.q) {
    where.OR = [
      { name: { contains: params.q } },
      { ownerName: { contains: params.q } },
      { area: { contains: params.q } },
    ];
  }
  if (params.area) where.area = params.area;
  if (params.status === 'verified') where.isVerified = true;
  if (params.status === 'unverified') where.isVerified = false;
  if (params.status === 'suspended') where.suspended = true;
  if (params.status === 'open') where.isOpen = true;

  const [rows, total, areas] = await Promise.all([
    db.kitchen.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { dishes: true, orders: true, meals: true } } },
    }),
    db.kitchen.count({ where }),
    db.kitchen.findMany({ distinct: ['area'], select: { area: true }, orderBy: { area: 'asc' } }),
  ]);

  /* Lifetime GMV and cancellation rate per kitchen, in two grouped queries
     rather than one per row — a table of twenty-five kitchens should not be
     fifty round trips. */
  const ids = rows.map((r) => r.id);
  const [gmv, cancelled] = await Promise.all([
    db.order.groupBy({
      by: ['kitchenId'],
      where: { kitchenId: { in: ids }, status: { notIn: ['cancelled', 'rejected'] } },
      _sum: { amount: true },
      _count: true,
    }),
    db.order.groupBy({
      by: ['kitchenId'],
      where: { kitchenId: { in: ids }, status: { in: ['cancelled', 'rejected'] } },
      _count: true,
    }),
  ]);

  const gmvOf = new Map(gmv.map((g) => [g.kitchenId, { sum: g._sum.amount ?? 0, count: g._count }]));
  const cancelOf = new Map(cancelled.map((c) => [c.kitchenId, c._count]));

  return (
    <>
      <PageHeader
        title="Kitchens & cooks"
        subtitle={`${total.toLocaleString('en-US')} kitchens on the platform`}
      />

      <Card
        pad={false}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox placeholder="Name, owner or area…" />
            <FilterSelect
              name="area"
              allLabel="All areas"
              options={areas.map((a) => ({ value: a.area, label: a.area }))}
            />
            <FilterSelect
              name="status"
              allLabel="Any status"
              options={[
                { value: 'verified', label: 'Verified' },
                { value: 'unverified', label: 'Not verified' },
                { value: 'open', label: 'Open now' },
                { value: 'suspended', label: 'Suspended' },
              ]}
            />
          </div>
        }
        title="All kitchens"
      >
        <Table
          head={[
            'Kitchen',
            'Area',
            'Status',
            'Dishes',
            'Orders',
            'Lifetime GMV',
            'Cancelled',
            'Rating',
          ]}
        >
          {rows.map((kitchen) => {
            const money = gmvOf.get(kitchen.id) ?? { sum: 0, count: 0 };
            const cancels = cancelOf.get(kitchen.id) ?? 0;
            const totalOrders = money.count + cancels;

            return (
              <tr key={kitchen.id}>
                <td>
                  <Link
                    href={`/kitchens/${kitchen.id}`}
                    className="flex items-center gap-2.5 hover:text-primary"
                  >
                    <Avatar src={kitchen.avatar} name={kitchen.name} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{kitchen.name}</span>
                      <span className="block truncate text-[11.5px] text-ink3">
                        {kitchen.ownerName}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="text-ink2">{kitchen.area}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {kitchen.suspended ? (
                      <Badge tone="bad">Suspended</Badge>
                    ) : kitchen.isVerified ? (
                      <Badge tone="good">Verified</Badge>
                    ) : (
                      <Badge tone="warn">Unverified</Badge>
                    )}
                    {kitchen.isOpen && !kitchen.suspended ? (
                      <Badge tone="info">Open</Badge>
                    ) : null}
                  </div>
                </td>
                <td className="tnum">{kitchen._count.dishes}</td>
                <td className="tnum">{totalOrders}</td>
                <td className="tnum font-medium">{taka(money.sum)}</td>
                <td className="tnum">
                  {totalOrders === 0 ? (
                    <span className="text-ink3">—</span>
                  ) : (
                    <span className={cancels / totalOrders > 0.15 ? 'text-primary' : 'text-ink2'}>
                      {pct(cancels, totalOrders)}
                    </span>
                  )}
                </td>
                <td className="tnum">
                  {kitchen.reviewCount === 0 ? (
                    <span className="text-ink3">New</span>
                  ) : (
                    <>
                      {kitchen.rating.toFixed(1)}
                      <span className="ml-1 text-[11px] text-ink3">({kitchen.reviewCount})</span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <EmptyRow span={8}>No kitchen matches that.</EmptyRow>
          ) : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>
    </>
  );
}
