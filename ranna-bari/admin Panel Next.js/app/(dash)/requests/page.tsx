import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { REQUEST_STATUS } from '@/lib/domain';
import { timeAgo } from '@/lib/format';
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

/**
 * One row of `GET /requests`.
 *
 * The dead view and the ordinary list are the same route and not the same
 * shape: the dead pipeline projects `eligible` and `reached`, the ordinary one
 * folds an offer count in. Everything that only one of them returns is
 * optional here rather than assumed.
 */
type RequestRow = {
  id: string;
  code: string;
  title: string;
  area: string | null;
  budget: number | null;
  target: string;
  status: string;
  createdAt: string;
  eligible?: string[];
  offers?: number;
  priced?: number;
  /* Not returned today, and the reason the "First reply" column is blank. The
     route already groups offers by request for the counts, so a
     `$min: '$createdAt'` in that same `$group` would fill it in — there is no
     way to compute it here without one round trip per row. */
  firstOfferAt?: string;
};

type RequestList = { requests: RequestRow[]; total: number };

/** The route's own ceiling on `take`. */
const WINDOW = 100;

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('request.read');
  const params = await searchParams;
  const dead = params.view === 'dead';
  const { page, skip, take } = paging(params);

  /* A backend that never answered is a banner. Anything else it said is a real
     bug and stays loud. */
  const board = await load(params, dead, skip, take).catch((error: unknown) => {
    if (error instanceof BackendError && error.status === 0) return null;
    throw error;
  });
  if (!board) return <BackendDown />;

  const { rows, total, totalRequests, openCount, orderedCount, deadCount } = board;
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
            const eligible = request.eligible ?? [];
            const offers = request.offers ?? 0;
            const priced = request.priced ?? 0;

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
                  {offers === 0 ? (
                    <span className="text-primary">0</span>
                  ) : (
                    <>
                      {offers}
                      {priced !== offers ? (
                        <span className="ml-1 text-[11px] text-ink3">
                          ({priced} priced)
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap text-ink2">
                  {request.firstOfferAt ? (
                    timeAgo(request.firstOfferAt)
                  ) : (
                    <span className="text-ink3">—</span>
                  )}
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

/**
 * The board, and the four numbers above it.
 *
 * The counts are the same route asked for one row each: `total` is a
 * `countDocuments` the route already runs, so a count costs a query rather
 * than a page of documents. The dead count is the dead view's own total, and
 * when that view is on screen it is the very same promise — the dead pipeline
 * is a `$lookup` across every offer and running it twice to render one page
 * would be paying for the same answer.
 */
async function load(
  params: Record<string, string | undefined>,
  dead: boolean,
  skip: number,
  take: number,
) {
  const count = (query: string) => get<RequestList>(`/requests?${query ? `${query}&` : ''}take=1`);

  /* `/requests` has no title filter. Rather than search a database the rows no
     longer come from, the newest window the route will hand over is narrowed
     here and paged on the matches — so the pager promises what is actually on
     screen. It stops at that window; a `q` parameter on the route replaces
     this entirely. */
  const searching = !dead && Boolean(params.q);
  const status = dead ? '' : (params.status ?? '');

  const listed = dead
    ? get<RequestList>(`/requests?view=dead&take=${WINDOW}`)
    : get<RequestList>(
        `/requests?${status ? `status=${encodeURIComponent(status)}&` : ''}skip=${
          searching ? 0 : skip
        }&take=${searching ? WINDOW : take}`,
      );

  const [list, all, open, ordered, deadList] = await Promise.all([
    listed,
    count(''),
    count('status=open'),
    count('status=ordered'),
    dead ? listed : count('view=dead'),
  ]);

  const needle = String(params.q ?? '').toLowerCase();
  const matched = searching
    ? list.requests.filter((request) => request.title.toLowerCase().includes(needle))
    : list.requests;

  return {
    rows: searching ? matched.slice(skip, skip + take) : matched,
    total: searching ? matched.length : list.total,
    totalRequests: all.total,
    openCount: open.total,
    orderedCount: ordered.total,
    deadCount: deadList.total,
  };
}

function BackendDown() {
  return (
    <>
      <PageHeader
        title="Requests & offers"
        subtitle="Customers asking for what nobody listed, and the cooks bidding for it"
      />
      <div className="rounded-[10px] border border-primary-100 bg-primary-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink2">
        <strong className="text-primary">The backend is not answering.</strong> This
        board is served by <code>backend-node</code>, which is not running or not
        reachable. Start it with <code>cd backend-node &amp;&amp; npm run dev</code>,
        then reload.
      </div>
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
