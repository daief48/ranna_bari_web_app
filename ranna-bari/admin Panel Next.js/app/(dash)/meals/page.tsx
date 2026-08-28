import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { can, SLOTS } from '@/lib/domain';
import { taka, todayKey, fmtDateTime, timeAgo } from '@/lib/format';
import { parseJson } from '@/lib/mappers';
import { paging, pageCount } from '@/lib/queries';
import {
  Badge,
  Card,
  Grid,
  GapNote,
  Meter,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  EmptyRow,
} from '@/components/ui';
import { FilterSelect, Pager } from '@/components/ui/client';
import { MealControls } from './controls';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Meals · RannaBari Admin' };
export const dynamic = 'force-dynamic';

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('order.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);
  const user = await currentUser();
  const canWrite = can(user?.role ?? '', 'meal.write');
  const today = todayKey();

  const stale = params.view === 'stale';

  const where: Prisma.MealWhereInput = stale
    ? { status: 'published', serveDate: { lt: today } }
    : {};
  if (!stale) {
    if (params.status) where.status = params.status;
    if (params.slot) where.slot = params.slot;
    if (params.when === 'today') where.serveDate = today;
    if (params.when === 'upcoming') where.serveDate = { gt: today };
    if (params.when === 'past') where.serveDate = { lt: today };
  }

  const [rows, total, staleCount, published, todayCount] = await Promise.all([
    db.meal.findMany({
      where,
      skip,
      take,
      orderBy: [{ serveDate: 'desc' }, { slot: 'asc' }],
      include: {
        kitchen: { select: { id: true, name: true } },
        _count: { select: { orders: true } },
      },
    }),
    db.meal.count({ where }),
    db.meal.count({ where: { status: 'published', serveDate: { lt: today } } }),
    db.meal.count({ where: { status: 'published' } }),
    db.meal.count({ where: { serveDate: today } }),
  ]);

  /* Confirmed plates per meal, in one grouped query. `capacity - confirmed`
     is what "remaining" means to the app, and a capacity bar that lies is
     worse than no bar. */
  const confirmed = await db.order.groupBy({
    by: ['mealId'],
    where: {
      mealId: { in: rows.map((r) => r.id) },
      status: { notIn: ['cancelled', 'rejected'] },
    },
    _count: true,
  });
  const soldOf = new Map(confirmed.map((c) => [c.mealId, c._count]));

  return (
    <>
      <PageHeader
        title="Meals"
        subtitle="Pre-booked services, by serve date and slot"
        actions={
          <div className="flex gap-2">
            <Link
              href="/meals"
              className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold ${
                !stale ? 'border-primary-100 bg-primary-50 text-primary' : 'border-line bg-raised text-ink2'
              }`}
            >
              All meals
            </Link>
            <Link
              href="/meals?view=stale"
              className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold ${
                stale ? 'border-primary-100 bg-primary-50 text-primary' : 'border-line bg-raised text-ink2'
              }`}
            >
              Stale ({staleCount})
            </Link>
          </div>
        }
      />

      {stale ? (
        <GapNote>
          <strong>Why this list exists.</strong> These meals are still{' '}
          <code>published</code> — open for orders — but the day they were meant to be
          eaten has already passed. The app has no sweeper: a cook who forgets to close
          a service leaves it open forever, and a customer can still order dinner for
          last Tuesday. Closing them is a manual job, and this is where it happens.
        </GapNote>
      ) : null}

      <Grid cols={4}>
        <Stat label="Meals matching" value={total} />
        <Stat label="Open for orders" value={published} tone="info" />
        <Stat label="Serving today" value={todayCount} />
        <Stat
          label="Open past their date"
          value={staleCount}
          tone={staleCount > 0 ? 'warn' : 'good'}
          href="/meals?view=stale"
        />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title={stale ? 'Meals to close' : 'All meals'}
        actions={
          stale ? null : (
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                name="when"
                allLabel="Any date"
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'upcoming', label: 'Upcoming' },
                  { value: 'past', label: 'Past' },
                ]}
              />
              <FilterSelect
                name="slot"
                allLabel="Any slot"
                options={SLOTS.map((s) => ({ value: s.key, label: s.label }))}
              />
              <FilterSelect
                name="status"
                allLabel="Any status"
                options={[
                  { value: 'published', label: 'Published' },
                  { value: 'closed', label: 'Closed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            </div>
          )
        }
      >
        <Table
          head={['Meal', 'Kitchen', 'Serve', 'Slot', 'Price', 'Sold', 'Interest', 'Status', 'Actions']}
        >
          {rows.map((meal) => {
            const sold = soldOf.get(meal.id) ?? 0;
            const interest = parseJson<string[]>(meal.interested, []).length;
            const overdue = meal.status === 'published' && meal.serveDate < today;

            return (
              <tr key={meal.id}>
                <td className="max-w-[200px]">
                  <span className="block truncate font-medium">{meal.title}</span>
                  <span className="tnum block text-[11px] text-ink3">{meal.code}</span>
                </td>
                <td className="max-w-[140px] truncate text-ink2">
                  <Link href={`/kitchens/${meal.kitchen.id}`} className="hover:text-primary">
                    {meal.kitchen.name}
                  </Link>
                </td>
                <td className="tnum whitespace-nowrap">
                  {meal.serveDate}
                  {overdue ? (
                    <Badge tone="warn" title="Serve date has passed">
                      past
                    </Badge>
                  ) : null}
                </td>
                <td className="capitalize text-ink2">{meal.slot}</td>
                <td>
                  <Money amount={meal.price} />
                </td>
                <td className="min-w-[92px]">
                  <div className="tnum mb-1 text-[12px]">
                    {sold} / {meal.capacity}
                  </div>
                  <Meter
                    value={sold}
                    max={meal.capacity}
                    tone={sold >= meal.capacity ? 'good' : 'info'}
                  />
                </td>
                <td className="tnum text-ink2">{interest}</td>
                <td>
                  <StatusBadge status={meal.status} />
                </td>
                <td>
                  {canWrite ? (
                    <MealControls
                      mealId={meal.id}
                      title={meal.title}
                      status={meal.status}
                      soldCount={sold}
                    />
                  ) : (
                    <span className="text-[11.5px] text-ink3">ops only</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <EmptyRow span={9}>
              {stale ? 'Nothing is open past its serve date.' : 'No meal matches that.'}
            </EmptyRow>
          ) : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink3">
        Closing a meal stops new orders and leaves the ones already placed alone.
        Cancelling refunds every order held against it, one transaction each, and
        notifies each customer — forty people should not go unrefunded because the
        forty-first row is broken.
      </p>
    </>
  );
}
