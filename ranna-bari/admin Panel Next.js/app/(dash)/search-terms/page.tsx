import { get } from '@/lib/backend';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { paging, pageCount } from '@/lib/queries';
import {
  Card,
  Grid,
  GapNote,
  PageHeader,
  Stat,
  Table,
  EmptyRow,
} from '@/components/ui';
import { FilterSelect, Pager } from '@/components/ui/client';
import { BackendDown, down } from '@/components/backend-down';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'What people looked for · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/** The endpoint parses these against an enum; anything else is dropped here. */
const VIEWS = ['misses', 'all'] as const;
const WINDOWS = ['7', '30', '90'] as const;

type TermsView = {
  terms: {
    term: string;
    searches: number;
    misses: number;
    people: number;
    spellings: string[];
    areas: string[];
    lastAt: string;
  }[];
  total: number;
  days: number;
};

export default async function SearchTermsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('kitchen.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);

  const view = (VIEWS as readonly string[]).includes(params.only ?? '')
    ? params.only!
    : 'misses';
  const days = (WINDOWS as readonly string[]).includes(params.days ?? '')
    ? params.days!
    : '30';

  const query = new URLSearchParams({
    skip: String(skip),
    take: String(take),
    only: view,
    days,
  });
  if (params.area) query.set('area', params.area);

  const data = await get<TermsView>(`/search-terms?${query}`).catch(down);

  if (!data) {
    return (
      <BackendDown
        title="What people looked for"
        subtitle="Searches that found nothing — the demand the catalogue is missing"
      />
    );
  }

  const rows = data.terms;
  const searches = rows.reduce((sum, row) => sum + row.searches, 0);
  const misses = rows.reduce((sum, row) => sum + row.misses, 0);
  const people = rows.reduce((sum, row) => sum + row.people, 0);

  return (
    <>
      <PageHeader
        title="What people looked for"
        subtitle="Searches that found nothing — the demand the catalogue is missing"
      />

      <GapNote>
        <strong>Why this screen exists.</strong> A customer who searches for
        something the platform does not have places no order, so no other
        collection on the platform ever hears they were here — they simply do not
        appear in the numbers. This is the one place that records them. A term
        with a high <em>miss</em> count and several distinct people behind it is
        not a bug report; it is a list of which cook to recruit, and where.
      </GapNote>

      <Grid cols={4}>
        <Stat label="Terms on this page" value={String(rows.length)} sub={`${data.total} in window`} />
        <Stat label="Searches" value={String(searches)} sub={`last ${data.days} days`} />
        <Stat
          label="Found nothing"
          value={String(misses)}
          tone={misses > 0 ? 'warn' : 'good'}
          sub={searches ? `${Math.round((misses / searches) * 100)}% of searches` : 'none'}
        />
        <Stat
          label="People behind them"
          value={String(people)}
          sub="distinct customers"
        />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title="Terms"
        actions={
          <div className="flex gap-2">
            <FilterSelect
              name="only"
              allLabel="Misses only"
              options={[
                { value: 'misses', label: 'Misses only' },
                { value: 'all', label: 'Every search' },
              ]}
            />
            <FilterSelect
              name="days"
              allLabel="Last 30 days"
              options={[
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: '90', label: 'Last 90 days' },
              ]}
            />
          </div>
        }
      >
        <Table head={['Term', 'Searches', 'Found nothing', 'People', 'Areas', 'Last searched']}>
          {rows.map((row) => (
            <tr key={row.term}>
              <td className="max-w-[240px]">
                <span className="font-semibold text-ink">{row.term}</span>
                {/* The spellings people actually reached for. Worth showing:
                    a term missed under one spelling and found under another
                    is a search problem, not a supply problem. */}
                {row.spellings.length > 1 ? (
                  <div className="mt-0.5 truncate text-xs text-ink3">
                    {row.spellings.slice(0, 4).join(' · ')}
                  </div>
                ) : null}
              </td>
              <td className="tnum font-semibold">{row.searches}</td>
              <td className="tnum">
                {row.misses > 0 ? (
                  <span className="font-semibold text-primary">{row.misses}</span>
                ) : (
                  <span className="text-ink3">0</span>
                )}
              </td>
              <td className="tnum text-ink2">{row.people || <span className="text-ink3">—</span>}</td>
              <td className="max-w-[200px] truncate text-ink2">
                {row.areas.length ? row.areas.join(', ') : <span className="text-ink3">unknown</span>}
              </td>
              <td className="text-ink2" title={fmtDateTime(row.lastAt)}>
                {timeAgo(row.lastAt)}
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <EmptyRow span={6}>
              {view === 'misses'
                ? 'Nothing was searched for and missed in this window.'
                : 'No searches recorded in this window.'}
            </EmptyRow>
          ) : null}
        </Table>
      </Card>

      <Pager page={page} pages={pageCount(data.total)} total={data.total} />
    </>
  );
}
