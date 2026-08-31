import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { fmtDateTime, timeAgo } from '@/lib/format';
import {
  Avatar,
  Badge,
  Card,
  Field,
  Grid,
  LinkButton,
  PageHeader,
  Stat,
} from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/** Five glyphs rather than a number: a rating is read, not calculated. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="tnum" title={`${rating} out of 5`}>
      <span className="text-saffron">{'★'.repeat(Math.max(0, Math.min(5, rating)))}</span>
      <span className="text-ink3">{'★'.repeat(Math.max(0, 5 - rating))}</span>
    </span>
  );
}

export default async function ReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('kitchen.read');
  const { id } = await params;

  const review = await db.review.findUnique({
    where: { id },
    include: { kitchen: { select: { id: true, name: true, area: true, isVerified: true } } },
  });
  if (!review) notFound();

  /* What this review does to the kitchen it is attached to, and what else
     the same person has said. Hidden reviews are out of the rating, so the
     two averages are both worth showing. */
  const [visible, all, bySameCustomer] = await Promise.all([
    db.review.aggregate({
      where: { kitchenId: review.kitchenId, hidden: false },
      _avg: { rating: true },
      _count: true,
    }),
    db.review.aggregate({
      where: { kitchenId: review.kitchenId },
      _avg: { rating: true },
      _count: true,
    }),
    review.customerKey
      ? db.review.findMany({
          where: { customerKey: review.customerKey, id: { not: review.id } },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: { kitchen: { select: { id: true, name: true } } },
        })
      : [],
  ]);

  const hiddenCount = all._count - visible._count;

  return (
    <>
      <PageHeader
        title={`${review.rating}★ from ${review.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/kitchens/${review.kitchen.id}`} className="hover:text-primary">
              {review.kitchen.name}
            </Link>
            <span className="text-ink3">·</span>
            <span>{fmtDateTime(review.createdAt)}</span>
            {review.hidden ? (
              <>
                <span className="text-ink3">·</span>
                <Badge tone="bad">Hidden</Badge>
              </>
            ) : null}
          </span>
        }
        actions={<LinkButton href="/reviews">← All reviews</LinkButton>}
      />

      <Grid cols={3}>
        <Stat label="This review" value={`${review.rating} / 5`} />
        <Stat
          label="Kitchen average, shown"
          value={(visible._avg.rating ?? 0).toFixed(2)}
          sub={`${visible._count} review${visible._count === 1 ? '' : 's'} counted`}
        />
        <Stat
          label="Hidden by moderation"
          value={hiddenCount}
          tone={hiddenCount > 0 ? 'warn' : 'neutral'}
          sub={
            hiddenCount > 0
              ? `Average with them: ${(all._avg.rating ?? 0).toFixed(2)}`
              : 'Nothing withheld'
          }
        />
      </Grid>

      <Card className="mt-3" title="What they wrote">
        <div className="flex items-start gap-3">
          <Avatar src={review.avatar} name={review.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-ink">{review.name}</span>
              <Stars rating={review.rating} />
              {review.area ? (
                <span className="text-[12px] text-ink3">{review.area}</span>
              ) : null}
            </div>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap">
              {review.text || <span className="text-ink3">No text — a rating only.</span>}
            </p>
          </div>
        </div>
      </Card>

      <Grid cols={2}>
        <Card className="mt-3" title="Record">
          <Field label="Rating">
            <Stars rating={review.rating} />
          </Field>
          <Field label="Kitchen">
            <Link href={`/kitchens/${review.kitchen.id}`} className="hover:text-primary">
              {review.kitchen.name}
            </Link>
          </Field>
          <Field label="Area">{review.area || <span className="text-ink3">—</span>}</Field>
          <Field label="Reviewer key">
            {review.customerKey ? (
              <code className="text-[11.5px] text-ink2">{review.customerKey}</code>
            ) : (
              <span className="text-ink3">Anonymous</span>
            )}
          </Field>
          <Field label="Displayed date">{review.date || fmtDateTime(review.createdAt)}</Field>
          <Field label="Written">{fmtDateTime(review.createdAt)}</Field>
        </Card>

        <Card className="mt-3" title="Moderation">
          <Field label="State">
            {review.hidden ? <Badge tone="bad">Hidden</Badge> : <Badge tone="good">Shown</Badge>}
          </Field>
          <Field label="Hidden by">
            {review.hiddenBy ?? <span className="text-ink3">—</span>}
          </Field>
          <Field label="Hidden at">
            {review.hiddenAt ? fmtDateTime(review.hiddenAt) : <span className="text-ink3">—</span>}
          </Field>
          <Field label="Reason">
            {review.hiddenNote || <span className="text-ink3">—</span>}
          </Field>
          <p className="mt-2 text-[12px] leading-relaxed text-ink3">
            Hiding a review takes it out of the kitchen&rsquo;s average. Moderate from the{' '}
            <Link href="/reviews" className="text-ink2 hover:text-primary">
              reviews board
            </Link>
            .
          </p>
        </Card>
      </Grid>

      {bySameCustomer.length > 0 ? (
        <Card className="mt-3" title={`Else from ${review.name}`}>
          <ul className="divide-y divide-line2">
            {bySameCustomer.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/reviews/${row.id}`} className="min-w-0 truncate text-[13px] hover:text-primary">
                  {row.text || <span className="text-ink3">(rating only)</span>}
                </Link>
                <span className="flex shrink-0 items-center gap-2.5">
                  <Stars rating={row.rating} />
                  <Link
                    href={`/kitchens/${row.kitchen.id}`}
                    className="text-[12px] text-ink3 hover:text-primary"
                  >
                    {row.kitchen.name}
                  </Link>
                  <span className="w-[70px] text-right text-[12px] text-ink3">
                    {timeAgo(row.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
