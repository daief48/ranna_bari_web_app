import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { parseJson } from '@/lib/mappers';
import { paging, pageCount } from '@/lib/queries';
import {
  Badge,
  Card,
  Grid,
  GapNote,
  PageHeader,
  Stat,
  Table,
  EmptyRow,
} from '@/components/ui';
import { SearchBox, FilterSelect, Pager } from '@/components/ui/client';
import { RowLink } from '@/components/ui/row-link';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Audit log · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/** Money actions are the ones worth finding fast. */
const MONEY_ACTIONS = [
  'escrow.release',
  'escrow.refund',
  'escrow.auto-release',
  'payout.paid',
  'ledger.adjustment',
  'dispute.refund',
  'dispute.release',
  'dispute.split',
];

/**
 * One trail row, from either store.
 *
 * `at` is a Date out of Prisma and an ISO string over HTTP; `fmtDateTime` and
 * `timeAgo` take both, so the table does not have to know which it got.
 */
type AuditRow = {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  before: unknown;
  after: unknown;
  at: string | Date;
};

/**
 * Mongo holds the snapshots as documents, so over HTTP they arrive already
 * parsed. SQLite holds them as JSON strings. Handing an object to `parseJson`
 * would stringify it into `JSON.parse`, fail, and quietly return the fallback
 * — every diff on the page collapsing to "—" with nothing to show for it.
 */
const diffOf = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string') return parseJson<Record<string, unknown> | null>(value, null);
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
};

/**
 * The page of rows, and how many there are.
 *
 * `GET /audit` filters on one exact action and one operator — which is the
 * default view and the operator dropdown, the two ways this page is actually
 * read. The free-text search, the target-type filter and the money view's
 * nine-action set are not expressible there, so those three searches still
 * run against the panel's own table.
 *
 * That fallback is on a clock. The backend writes the trail now, so the local
 * table only holds what this panel wrote before the migration and a `q`
 * search will keep finding less of the truth every week. What would close it:
 * `q`, `targetType` and a repeatable `action` on `/audit`.
 *
 * Null means the backend did not answer at all — a banner, not a throw.
 */
type Facets = {
  actors: string[];
  types: string[];
  moneyCount: number;
  todayCount: number;
};

async function readRows(
  params: Record<string, string | undefined>,
  skip: number,
  take: number,
): Promise<{ rows: AuditRow[]; total: number; facets: Facets } | null> {
  const query = new URLSearchParams({ skip: String(skip), take: String(take) });
  if (params.actor) query.set('actor', params.actor);
  if (params.type) query.set('targetType', params.type);
  if (params.q) query.set('q', params.q);
  /* The money view asks for its whole set in one filter — the endpoint takes a
     comma-separated list, and owns which actions count as money. */
  if (params.view === 'money') query.set('action', MONEY_ACTIONS.join(','));

  try {
    return await get<{ rows: AuditRow[]; total: number; facets: Facets }>(`/audit?${query}`);
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) return null;
    throw error;
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('order.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);

  /* One read. The search, the target-type filter and the money view are all
     expressible on the endpoint now, and the dropdowns and header counts ride
     back with the rows, so every figure on this screen comes from the store
     that holds the trail. */
  const list = await readRows(params, skip, take);

  if (!list) {
    return (
      <>
        <PageHeader
          title="Audit log"
          subtitle="Every state-changing action in this panel, with a before and an after"
        />
        <GapNote>
          <strong>The backend is not reachable.</strong> The trail is written and
          held by <code>backend-node</code>, so there is nothing to read until it
          answers. Start it with <code>cd backend-node &amp;&amp; npm run dev</code>.
        </GapNote>
      </>
    );
  }

  const { rows, total, facets } = list;
  const { actors, types, moneyCount, todayCount } = facets;

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every state-changing action in this panel, with a before and an after"
        actions={
          <FilterSelect
            name="view"
            allLabel="All actions"
            options={[{ value: 'money', label: 'Money only' }]}
          />
        }
      />

      <GapNote>
        <strong>Append-only, enforced by the database.</strong> A trigger refuses any
        UPDATE or DELETE on this table, the same as on the ledger. A money action
        without an attributable record is an unattributable movement, which is the same
        as having no control at all — so the record cannot be tidied away afterwards,
        including by whoever made it.
      </GapNote>

      <Grid cols={3}>
        <Stat label="Rows on file" value={total.toLocaleString('en-US')} />
        <Stat label="Money actions" value={moneyCount} tone={moneyCount > 0 ? 'warn' : 'neutral'} />
        <Stat label="In the last 24 hours" value={todayCount} />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title="Actions"
        actions={
          <div className="flex flex-wrap gap-2">
            <SearchBox placeholder="Summary, target or operator…" />
            <FilterSelect
              name="actor"
              allLabel="Any operator"
              options={actors.map((a) => ({ value: a, label: a }))}
            />
            <FilterSelect
              name="type"
              allLabel="Any target"
              options={types.map((t) => ({ value: t, label: t }))}
            />
          </div>
        }
      >
        <Table head={['When', 'Operator', 'Action', 'Target', 'Summary', 'Diff']}>
          {rows.map((row) => {
            const before = diffOf(row.before);
            const after = diffOf(row.after);
            const isMoney = MONEY_ACTIONS.includes(row.action);

            return (
              <RowLink key={row.id} href={`/audit/${row.id}`}>
                <td className="whitespace-nowrap" title={fmtDateTime(row.at)}>
                  <Link href={`/audit/${row.id}`} className="text-ink2 hover:text-primary">
                    {timeAgo(row.at)}
                  </Link>
                </td>
                <td className="max-w-[150px] truncate">
                  <span className="block truncate text-[12.5px]">{row.actorEmail}</span>
                  <span className="block text-[11px] text-ink3">{row.actorRole}</span>
                </td>
                <td>
                  <Badge tone={isMoney ? 'bad' : 'neutral'}>{row.action}</Badge>
                </td>
                <td className="text-[12px] text-ink2">
                  <span className="block">{row.targetType}</span>
                  <span className="tnum block truncate text-[10.5px] text-ink3">
                    {row.targetId.slice(0, 12)}
                  </span>
                </td>
                <td className="max-w-[300px]">
                  <span className="block truncate" title={row.summary}>
                    {row.summary}
                  </span>
                </td>
                <td>
                  {before || after ? (
                    <details>
                      <summary className="cursor-pointer text-[11.5px] text-ink3 hover:text-ink">
                        view
                      </summary>
                      <div className="mt-1.5 min-w-[220px] space-y-1.5">
                        {before ? (
                          <pre className="overflow-x-auto rounded-[8px] border border-line bg-sunken p-2 text-[10.5px] leading-relaxed text-ink2">
                            {JSON.stringify(before, null, 1)}
                          </pre>
                        ) : null}
                        {after ? (
                          <pre className="overflow-x-auto rounded-[8px] border border-sage-100 bg-sage-50 p-2 text-[10.5px] leading-relaxed text-ink2">
                            {JSON.stringify(after, null, 1)}
                          </pre>
                        ) : null}
                      </div>
                    </details>
                  ) : (
                    <span className="text-[11.5px] text-ink3">—</span>
                  )}
                </td>
              </RowLink>
            );
          })}
          {rows.length === 0 ? (
            <EmptyRow span={6}>
              Nothing yet. Every action taken in this panel lands here.
            </EmptyRow>
          ) : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>
    </>
  );
}
