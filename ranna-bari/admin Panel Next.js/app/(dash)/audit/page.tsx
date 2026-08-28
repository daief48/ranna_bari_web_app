import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
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

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('order.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);

  const where: Prisma.AuditLogWhereInput = {};
  if (params.q) {
    where.OR = [
      { summary: { contains: params.q } },
      { targetId: { contains: params.q } },
      { actorEmail: { contains: params.q } },
    ];
  }
  if (params.actor) where.actorEmail = params.actor;
  if (params.type) where.targetType = params.type;
  if (params.view === 'money') where.action = { in: MONEY_ACTIONS };

  const [rows, total, actors, types, moneyCount, todayCount] = await Promise.all([
    db.auditLog.findMany({ where, skip, take, orderBy: { at: 'desc' } }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      distinct: ['actorEmail'],
      select: { actorEmail: true },
      orderBy: { actorEmail: 'asc' },
    }),
    db.auditLog.findMany({
      distinct: ['targetType'],
      select: { targetType: true },
      orderBy: { targetType: 'asc' },
    }),
    db.auditLog.count({ where: { action: { in: MONEY_ACTIONS } } }),
    db.auditLog.count({ where: { at: { gte: new Date(Date.now() - 86_400_000) } } }),
  ]);

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
              options={actors.map((a) => ({ value: a.actorEmail, label: a.actorEmail }))}
            />
            <FilterSelect
              name="type"
              allLabel="Any target"
              options={types.map((t) => ({ value: t.targetType, label: t.targetType }))}
            />
          </div>
        }
      >
        <Table head={['When', 'Operator', 'Action', 'Target', 'Summary', 'Diff']}>
          {rows.map((row) => {
            const before = parseJson<Record<string, unknown> | null>(row.before, null);
            const after = parseJson<Record<string, unknown> | null>(row.after, null);
            const isMoney = MONEY_ACTIONS.includes(row.action);

            return (
              <tr key={row.id}>
                <td className="whitespace-nowrap text-ink2" title={fmtDateTime(row.at)}>
                  {timeAgo(row.at)}
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
              </tr>
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
