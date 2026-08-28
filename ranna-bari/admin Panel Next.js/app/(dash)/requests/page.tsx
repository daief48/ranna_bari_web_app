import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { REQUEST_STATUS } from '@/lib/domain';
import { taka, timeAgo } from '@/lib/format';
import { parseJson } from '@/lib/mappers';
import { paging, pageCount } from '@/lib/queries';
import {
  Badge,
  Card,
  Grid,
  GapNote,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  EmptyRow,
} from '@/components/ui';
import { SearchBox, FilterSelect, Pager } from '@/components/ui/client';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Requests & offers · RannaBari Admin' };
export const dynamic = 'force-dynamic';

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('request.read');
  const params = await searchParams;
  const dead = params.view === 'dead';
  const { page, skip, take } = paging(params);

  const where: Prisma.RequestWhereInput = {};
  if (params.q) where.title = { contains: params.q };
  if (params.status) where.status = params.status;
  if (dead) where.status = 'open';

  const [all, total, openCount, orderedCount] = await Promise.all([
    db.request.findMany({
      where,
      skip: dead ? 0 : skip,
      take: dead ? 200 : take,
      orderBy: { createdAt: 'desc' },
      include: {
        offers: { select: { id: true, status: true, price: true, createdAt: true } },
      },
    }),
    db.request.count({ where }),
    db.request.count({ where: { status: 'open' } }),
    db.request.count({ where: { status: 'ordered' } }),
  ]);

  /* A broadcast that reached nobody, or reached kitchens and got no answer.
     Both are supply problems and both are invisible in the app. */
  const rows = dead ? all.filter((r) => r.offers.length === 0) : all;

  const deadCount = (
    await db.request.findMany({
      where: { status: 'open' },
      include: { _count: { select: { offers: true } } },
    })
  ).filter((r) => r._count.offers === 0).length;

  const totalRequests = await db.request.count();
  const fillRate = totalRequests ? Math.round((orderedCount / totalRequests) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Requests & offers"
        subtitle="Customers asking for what nobody listed, and the cooks bidding for it"
        actions={
          <div className="flex gap-2">
            <Tab href="/requests" active={!dead}>
              All requests
            </Tab>
            <Tab href="/requests?view=dead" active={dead}>
              No offers ({deadCount})
            </Tab>
          </div>
        }
      />

      {dead ? (
        <GapNote>
          <strong>Why this list exists.</strong> Each of these is a customer who
          described what they wanted and heard nothing back. Either the broadcast
          reached no eligible kitchen at all — every cook within range was shut, so{' '}
          <code>eligible</code> came back empty — or it reached kitchens and none of
          them answered. The first is a coverage bug and the fix is widening a
          radius; the second is a supply problem. Nothing in the app surfaces either.
        </GapNote>
      ) : null}

      <Grid cols={4}>
        <Stat label="Requests" value={totalRequests} />
        <Stat label="Still open" value={openCount} tone="info" />
        <Stat
          label="Reached nobody"
          value={deadCount}
          tone={deadCount > 0 ? 'warn' : 'good'}
          href="/requests?view=dead"
        />
        <Stat label="Fill rate" value={`${fillRate}%`} sub={`${orderedCount} turned into orders`} />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title={dead ? 'Requests with no offer on them' : 'All requests'}
        actions={
          dead ? null : (
            <div className="flex flex-wrap gap-2">
              <SearchBox placeholder="What they asked for…" />
              <FilterSelect
                name="status"
                allLabel="Any status"
                options={Object.values(REQUEST_STATUS).map((s) => ({ value: s, label: s }))}
              />
            </div>
          )
        }
      >
        <Table
          head={['Request', 'Area', 'Budget', 'Reach', 'Offers', 'First reply', 'Status', 'Posted']}
        >
          {rows.map((request) => {
            const eligible = parseJson<string[]>(request.eligible, []);
            const first = request.offers
              .map((o) => new Date(o.createdAt).getTime())
              .sort((a, b) => a - b)[0];
            const priced = request.offers.filter((o) => o.price != null);

            return (
              <tr key={request.id}>
                <td className="max-w-[260px]">
                  <Link
                    href={`/requests/${request.id}`}
                    className="block truncate font-medium hover:text-primary"
                  >
                    {request.title}
                  </Link>
                  <span className="tnum block text-[11px] text-ink3">{request.code}</span>
                </td>
                <td className="text-ink2">{request.area ?? '—'}</td>
                <td>
                  {request.budget ? (
                    <Money amount={request.budget} />
                  ) : (
                    <span className="text-ink3">open</span>
                  )}
                </td>
                <td>
                  {eligible.length === 0 ? (
                    <Badge tone="bad" title="The broadcast matched no kitchen at all">
                      nobody
                    </Badge>
                  ) : (
                    <span className="tnum text-ink2">
                      {eligible.length} {request.target === 'all' ? 'kitchens' : 'kitchen'}
                    </span>
                  )}
                </td>
                <td className="tnum">
                  {request.offers.length === 0 ? (
                    <span className="text-primary">0</span>
                  ) : (
                    <>
                      {request.offers.length}
                      {priced.length !== request.offers.length ? (
                        <span className="ml-1 text-[11px] text-ink3">
                          ({priced.length} priced)
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap text-ink2">
                  {first ? timeAgo(new Date(first)) : <span className="text-ink3">—</span>}
                </td>
                <td>
                  <StatusBadge status={request.status} />
                </td>
                <td className="whitespace-nowrap text-ink2">{timeAgo(request.createdAt)}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <EmptyRow span={8}>
              {dead ? 'Every open request has at least one offer on it.' : 'Nothing matches that.'}
            </EmptyRow>
          ) : null}
        </Table>

        {!dead ? <Pager page={page} pages={pageCount(total)} total={total} /> : null}
      </Card>
    </>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
        active
          ? 'border-primary-100 bg-primary-50 text-primary'
          : 'border-line bg-raised text-ink2 hover:bg-sunken'
      }`}
    >
      {children}
    </Link>
  );
}
