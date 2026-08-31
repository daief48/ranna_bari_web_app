import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { Badge, Card, Field, Grid, LinkButton, PageHeader } from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/** Where a target of this type is read in the panel, if anywhere. */
const TARGET_HREF: Record<string, (id: string) => string> = {
  order: (id) => `/orders/${id}`,
  kitchen: (id) => `/kitchens/${id}`,
  request: (id) => `/requests/${id}`,
  meal: (id) => `/meals/${id}`,
  store: (id) => `/stores/${id}`,
  review: (id) => `/reviews/${id}`,
  dispute: (id) => `/disputes/${id}`,
  topup: (id) => `/topups/${id}`,
  payout: (id) => `/payouts/${id}`,
  payoutRun: (id) => `/payouts/${id}`,
  admin: (id) => `/admins/${id}`,
  adminUser: (id) => `/admins/${id}`,
  ledger: (id) => `/ledger/${id}`,
};

function parse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const show = (value: unknown) =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

export default async function AuditDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('order.read');
  const { id } = await params;

  const row = await db.auditLog.findUnique({
    where: { id },
    include: { actor: { select: { id: true, name: true, email: true, role: true } } },
  });
  if (!row) notFound();

  const before = parse(row.before);
  const after = parse(row.after);

  /* The union of both sides, so a key that only exists on one still gets a
     line. A field that was added and one that was cleared are both changes,
     and showing only the intersection hides exactly those two cases. */
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  const changed = keys.filter((k) => show(before?.[k]) !== show(after?.[k]));

  /* What else this operator did around the same time, and what else was done
     to this target. Either is usually the reason someone opened this row. */
  const [nearby, sameTarget] = await Promise.all([
    db.auditLog.findMany({
      where: { actorEmail: row.actorEmail, id: { not: row.id } },
      orderBy: { at: 'desc' },
      take: 8,
    }),
    db.auditLog.findMany({
      where: { targetType: row.targetType, targetId: row.targetId, id: { not: row.id } },
      orderBy: { at: 'desc' },
      take: 8,
    }),
  ]);

  const targetHref = TARGET_HREF[row.targetType]?.(row.targetId);

  return (
    <>
      <PageHeader
        title={row.action}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{row.actorEmail}</span>
            <span className="text-ink3">·</span>
            <Badge tone="neutral">{row.actorRole}</Badge>
            <span className="text-ink3">·</span>
            <span>{fmtDateTime(row.at)}</span>
          </span>
        }
        actions={<LinkButton href="/audit">← Audit log</LinkButton>}
      />

      {row.summary ? (
        <Card className="mt-3">
          <p className="text-[13.5px] leading-relaxed text-ink">{row.summary}</p>
        </Card>
      ) : null}

      <Grid cols={2}>
        <Card className="mt-3" title="Who">
          <Field label="Operator">
            {row.actor ? (
              <Link href={`/admins/${row.actor.id}`} className="hover:text-primary">
                {row.actor.name}
              </Link>
            ) : (
              row.actorEmail
            )}
          </Field>
          <Field label="Email">{row.actorEmail}</Field>
          <Field label="Role at the time">
            <Badge tone="neutral">{row.actorRole}</Badge>
          </Field>
          <Field label="From address">
            {row.ip ? <code className="text-[11.5px]">{row.ip}</code> : <span className="text-ink3">Not recorded</span>}
          </Field>
          <Field label="When">{fmtDateTime(row.at)}</Field>
        </Card>

        <Card className="mt-3" title="What">
          <Field label="Action">
            <code className="text-[12px]">{row.action}</code>
          </Field>
          <Field label="Target type">{row.targetType}</Field>
          <Field label="Target">
            {targetHref ? (
              <Link href={targetHref} className="hover:text-primary">
                <code className="text-[11.5px]">{row.targetId}</code>
              </Link>
            ) : (
              <code className="text-[11.5px] text-ink2">{row.targetId}</code>
            )}
          </Field>
          <Field label="Entry id">
            <code className="text-[11.5px] text-ink2">{row.id}</code>
          </Field>
        </Card>
      </Grid>

      {/* ---------------------------------------------------------- *
       * the diff
       * ---------------------------------------------------------- */}
      <Card
        className="mt-3"
        title="What changed"
        subtitle={
          before || after
            ? `${changed.length} field${changed.length === 1 ? '' : 's'} differ`
            : undefined
        }
      >
        {!before && !after ? (
          <p className="text-[13px] text-ink3">
            No snapshot was recorded for this action. Reads and actions with nothing to
            revert do not carry one.
          </p>
        ) : keys.length === 0 ? (
          <p className="text-[13px] text-ink3">The snapshot is empty on both sides.</p>
        ) : (
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '26%' }}>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const b = show(before?.[key]);
                  const a = show(after?.[key]);
                  const differs = b !== a;
                  return (
                    <tr key={key} className={differs ? undefined : 'opacity-55'}>
                      <td className="font-semibold">{key}</td>
                      <td className={differs ? 'text-primary' : 'text-ink2'}>
                        <span className="break-all">{b}</span>
                      </td>
                      <td className={differs ? 'text-sage' : 'text-ink2'}>
                        <span className="break-all">{a}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Grid cols={2}>
        {sameTarget.length > 0 ? (
          <Card className="mt-3" title="Else done to this target">
            <ul className="divide-y divide-line2">
              {sameTarget.map((other) => (
                <li key={other.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/audit/${other.id}`} className="min-w-0 truncate text-[13px] hover:text-primary">
                    {other.action}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2.5 text-[12px] text-ink3">
                    <span>{other.actorEmail}</span>
                    <span className="w-[70px] text-right">{timeAgo(other.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {nearby.length > 0 ? (
          <Card className="mt-3" title={`Else by ${row.actorEmail}`}>
            <ul className="divide-y divide-line2">
              {nearby.map((other) => (
                <li key={other.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/audit/${other.id}`} className="min-w-0 truncate text-[13px] hover:text-primary">
                    {other.action}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2.5 text-[12px] text-ink3">
                    <span className="max-w-[110px] truncate">{other.targetType}</span>
                    <span className="w-[70px] text-right">{timeAgo(other.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </Grid>
    </>
  );
}
