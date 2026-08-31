import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { fmtDate, timeAgo } from '@/lib/format';
import { paging, pageCount } from '@/lib/queries';
import {
  Avatar,
  Badge,
  Card,
  Grid,
  GapNote,
  PageHeader,
  Stat,
  Table,
  EmptyRow,
} from '@/components/ui';
import { RowLink } from '@/components/ui/row-link';
import { FilterSelect, Pager } from '@/components/ui/client';
import { ModerateReview } from './moderate';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Reviews · RannaBari Admin' };
export const dynamic = 'force-dynamic';

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('kitchen.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);
  const user = await currentUser();
  const canModerate = can(user?.role ?? '', 'review.moderate');

  const where: Prisma.ReviewWhereInput = {};
  if (params.state === 'hidden') where.hidden = true;
  if (params.state === 'visible') where.hidden = false;
  if (params.rating) where.rating = Number(params.rating);

  const [rows, total, hiddenCount, lowCount, avg] = await Promise.all([
    db.review.findMany({
      where,
      skip,
      take,
      orderBy: [{ hidden: 'asc' }, { createdAt: 'desc' }],
      include: { kitchen: { select: { id: true, name: true, rating: true, reviewCount: true } } },
    }),
    db.review.count({ where }),
    db.review.count({ where: { hidden: true } }),
    db.review.count({ where: { hidden: false, rating: { lte: 2 } } }),
    db.review.aggregate({ where: { hidden: false }, _avg: { rating: true } }),
  ]);

  return (
    <>
      <PageHeader title="Reviews" subtitle="Moderation, and the ratings that follow from it" />

      <GapNote>
        <strong>Why this screen exists.</strong> Reviews ship as a static JSON file in
        the app bundle. Nothing moderates them, and nothing can — a review that names a
        competitor&rsquo;s phone number or was left on the wrong kitchen stays on that
        kitchen&rsquo;s page forever. Hiding one here also recomputes the
        kitchen&rsquo;s score, because a hidden review that still counts toward the
        rating achieves nothing except removing the evidence.
      </GapNote>

      <Grid cols={4}>
        <Stat label="Reviews" value={total} />
        <Stat
          label="One and two stars"
          value={lowCount}
          tone={lowCount > 0 ? 'warn' : 'good'}
          sub="visible, worth a look"
          href="/reviews?rating=1"
        />
        <Stat label="Hidden" value={hiddenCount} sub="excluded from every rating" />
        <Stat
          label="Average, visible only"
          value={(avg._avg.rating ?? 0).toFixed(2)}
          tone="good"
        />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title="All reviews"
        actions={
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              name="rating"
              allLabel="Any rating"
              options={[5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: `${r} star` }))}
            />
            <FilterSelect
              name="state"
              allLabel="Any state"
              options={[
                { value: 'visible', label: 'Visible' },
                { value: 'hidden', label: 'Hidden' },
              ]}
            />
          </div>
        }
      >
        <Table head={['Reviewer', 'Kitchen', 'Rating', 'Review', 'Date', 'State', 'Moderate']}>
          {rows.map((review) => (
            <RowLink
              key={review.id}
              href={`/reviews/${review.id}`}
              className={review.hidden ? 'opacity-55' : ''}
            >
              <td>
                <div className="flex items-center gap-2">
                  <Avatar src={review.avatar} name={review.name} size={24} />
                  <Link href={`/reviews/${review.id}`} className="truncate hover:text-primary">
                    {review.name}
                  </Link>
                </div>
              </td>
              <td className="max-w-[150px] truncate text-ink2">
                <Link href={`/kitchens/${review.kitchen.id}`} className="hover:text-primary">
                  {review.kitchen.name}
                </Link>
                <span className="tnum ml-1 text-[11px] text-ink3">
                  ({review.kitchen.rating.toFixed(1)})
                </span>
              </td>
              <td>
                <Badge tone={review.rating >= 4 ? 'good' : review.rating >= 3 ? 'warn' : 'bad'}>
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(5 - review.rating)}
                </Badge>
              </td>
              <td className="max-w-[320px]">
                <span className="block truncate" title={review.text}>
                  {review.text}
                </span>
                {review.hiddenNote ? (
                  <span className="block truncate text-[11px] text-primary">
                    hidden: {review.hiddenNote}
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap text-ink2">{fmtDate(review.createdAt)}</td>
              <td>
                {review.hidden ? <Badge tone="bad">hidden</Badge> : <Badge tone="good">live</Badge>}
              </td>
              <td>
                {canModerate ? (
                  <ModerateReview
                    reviewId={review.id}
                    hidden={review.hidden}
                    kitchenName={review.kitchen.name}
                  />
                ) : (
                  <span className="text-[11.5px] text-ink3">—</span>
                )}
              </td>
            </RowLink>
          ))}
          {rows.length === 0 ? <EmptyRow span={7}>No review matches that.</EmptyRow> : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>
    </>
  );
}
