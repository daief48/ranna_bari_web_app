import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { get } from '@/lib/backend';

import { db } from '@/lib/db';
import { taka, fmtDateTime, timeAgo } from '@/lib/format';
import { parseJson, type PriceStamp } from '@/lib/mappers';
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

type RequestView = Prisma.RequestGetPayload<{
  include: {
    offers: {
      include: { kitchen: { select: { id: true; name: true; area: true; isVerified: true } } };
    };
  };
}>;

async function loadRequest(id: string): Promise<RequestView | null> {
  const remote = await get<{
    request: Record<string, unknown> & { id: string };
    offers: (Record<string, unknown> & { id: string; kitchenId: string; kitchenName: string })[];
  }>(`/requests/${id}`).catch(() => null);

  if (remote) {
    return {
      ...(remote.request as unknown as RequestView),
      id: remote.request.id,
      /* The endpoint flattens the kitchen to a name, which is what the offer
         list actually shows; the id comes off the offer itself so the link
         still resolves. */
      offers: remote.offers.map((offer) => ({
        ...offer,
        kitchen: {
          id: offer.kitchenId,
          name: offer.kitchenName,
          area: '',
          isVerified: false,
        },
      })),
    } as unknown as RequestView;
  }

  return db.request.findUnique({
    where: { id },
    include: {
      offers: {
        orderBy: { createdAt: 'asc' },
        include: { kitchen: { select: { id: true, name: true, area: true, isVerified: true } } },
      },
    },
  });
}

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('request.read');
  const { id } = await params;

  /* Backend first: `/requests` serves the board, so its ids are the
     backend's, and reading only the panel's mirror here answered every row on
     that board with a 404. `GET /requests/:id` has existed all along. */
  const request = await loadRequest(id);
  if (!request) notFound();

  const eligible = parseJson<string[]>(request.eligible, []);
  const priced = request.offers.filter((o) => o.price != null);
  const best = priced.length ? Math.min(...priced.map((o) => o.price!)) : null;
  const order = request.orderId
    ? await db.order.findUnique({ where: { id: request.orderId }, select: { id: true, code: true, status: true } })
    : null;

  return (
    <>
      <PageHeader
        title={request.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tnum">{request.code}</span>
            <span className="text-ink3">·</span>
            <StatusBadge status={request.status} />
            <span className="text-ink3">·</span>
            <span>posted {fmtDateTime(request.createdAt)}</span>
          </span>
        }
        actions={<LinkButton href="/requests">← All requests</LinkButton>}
      />

      {eligible.length === 0 ? (
        <div className="mb-5 rounded-[10px] border border-primary-100 bg-primary-50 px-3.5 py-2.5 text-[13px] text-ink2">
          <strong className="text-primary">This broadcast reached nobody.</strong> Every
          kitchen was either shut or out of range when it went out, so{' '}
          <code>eligible</code> came back empty and no cook was ever told. The customer
          is waiting on a message that was never sent.
        </div>
      ) : null}

      <Grid cols={4}>
        <Stat
          label="Budget"
          value={request.budget ? taka(request.budget) : 'Open'}
          sub={`quantity ${request.quantity}`}
        />
        <Stat
          label="Reached"
          value={eligible.length}
          tone={eligible.length === 0 ? 'bad' : 'neutral'}
          sub={request.target === 'all' ? 'broadcast' : 'one kitchen'}
        />
        <Stat
          label="Offers"
          value={request.offers.length}
          tone={request.offers.length === 0 ? 'warn' : 'good'}
          sub={`${priced.length} named a price`}
        />
        <Stat
          label="Best price"
          value={best != null ? taka(best) : '—'}
          sub={best != null && request.budget ? (best <= request.budget ? 'within budget' : 'over budget') : undefined}
          tone={best != null && request.budget && best > request.budget ? 'warn' : 'neutral'}
        />
      </Grid>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="What they asked for">
          <p className="mb-3 text-[13px] leading-relaxed text-ink2">{request.description}</p>
          <Field label="Customer">
            <span className="tnum text-[12px]">{request.customerKey}</span>
          </Field>
          <Field label="Wanted for">
            <span className="tnum">{request.wantedFor ?? '—'}</span>
          </Field>
          <Field label="Category">{request.category ?? '—'}</Field>
          <Field label="Area">{request.area ?? '—'}</Field>
          {order ? (
            <Field label="Became order">
              <Link href={`/orders/${order.id}`} className="tnum hover:text-primary">
                {order.code}
              </Link>{' '}
              <StatusBadge status={order.status} />
            </Field>
          ) : null}
        </Card>

        <Card
          title="Offers"
          subtitle="Every cook who answered, and what they asked for"
          className="lg:col-span-2"
          pad={false}
        >
          <div className="divide-y divide-line2">
            {request.offers.map((offer) => {
              const history = parseJson<PriceStamp[]>(offer.history, []);
              const standing = history.length ? history[history.length - 1] : null;
              const selected = request.selectedOfferId === offer.id;

              return (
                <div
                  key={offer.id}
                  className={`p-4 ${selected ? 'bg-sage-50' : ''}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/kitchens/${offer.kitchen.id}`}
                        className="truncate font-medium hover:text-primary"
                      >
                        {offer.kitchen.name}
                      </Link>
                      {offer.kitchen.isVerified ? <Badge tone="good">verified</Badge> : null}
                      {selected ? <Badge tone="good">chosen</Badge> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={offer.status} />
                      <span className="tnum font-display text-[16px] font-bold">
                        {offer.agreedPrice != null
                          ? taka(offer.agreedPrice)
                          : standing
                            ? taka(standing.amount)
                            : offer.price != null
                              ? taka(offer.price)
                              : '—'}
                      </span>
                    </div>
                  </div>

                  {offer.note ? (
                    <p className="mb-2 text-[12.5px] text-ink2">&ldquo;{offer.note}&rdquo;</p>
                  ) : null}

                  <div className="mb-2 flex flex-wrap gap-3 text-[11.5px] text-ink3">
                    <span>{offer.kitchen.area}</span>
                    {offer.prepTime ? <span>ready {offer.prepTime}</span> : null}
                    <span>answered {timeAgo(offer.createdAt)}</span>
                  </div>

                  {history.length > 1 ? (
                    <div className="rounded-[10px] border border-line bg-sunken p-2.5">
                      <div className="label mb-1.5">Negotiation</div>
                      <ol className="space-y-1">
                        {history.map((stamp, i) => (
                          <li
                            key={i}
                            className="flex items-baseline justify-between gap-3 text-[12px]"
                          >
                            <span className={stamp.by === 'cook' ? 'text-ink' : 'text-primary'}>
                              {stamp.by === 'cook' ? offer.kitchen.name : 'Customer'}
                            </span>
                            <span className="tnum font-semibold">{taka(stamp.amount)}</span>
                            <span className="text-ink3">{timeAgo(stamp.at)}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="mt-2 text-[11px] leading-relaxed text-ink3">
                        Nothing here is overwritten. The standing price is the last
                        entry, and whose turn it is falls out of the history rather
                        than being tracked separately — so it cannot disagree with it.
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {request.offers.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-ink3">
                {eligible.length === 0
                  ? 'No cook was ever told about this request.'
                  : `${eligible.length} kitchens were told. None answered.`}
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink3">
        On the app side a cook can only ever see their own offer — there is no function
        that returns a competitor&rsquo;s price to a cook. On a device that is a UI
        guarantee; on a server it has to be an authorisation one, and the endpoints
        under <code>/api/app/v1</code> enforce it that way.
      </p>
    </>
  );
}
