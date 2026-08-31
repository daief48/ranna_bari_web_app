import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { Badge, Card, Field, Grid, LinkButton, PageHeader, Stat } from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

const ROLE_NOTE: Record<string, string> = {
  superadmin: 'Everything, including other operators and platform settings.',
  ops: 'Kitchens, KYC, orders and meals. No money screens.',
  finance: 'Ledger, payouts, top-ups and disputes. No operations screens.',
  support: 'Orders and cases, read-mostly.',
};

export default async function AdminDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('kitchen.read');
  const { id } = await params;

  /* An explicit select, not an include. `passwordHash` and `totpSecret` are
     columns on this model, and the cost of `findUnique` handing back the
     whole row is that a later edit here renders one of them onto a page.
     Naming the fields is what stops that from being one careless line away. */
  const admin = await db.adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      totpEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!admin) notFound();

  const [recent, actionCounts, total] = await Promise.all([
    db.auditLog.findMany({
      where: { actorEmail: admin.email },
      orderBy: { at: 'desc' },
      take: 20,
    }),
    db.auditLog.groupBy({
      by: ['action'],
      where: { actorEmail: admin.email },
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
      take: 6,
    }),
    db.auditLog.count({ where: { actorEmail: admin.email } }),
  ]);

  return (
    <>
      <PageHeader
        title={admin.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{admin.email}</span>
            <span className="text-ink3">·</span>
            <Badge tone={admin.role === 'superadmin' ? 'bad' : 'info'}>{admin.role}</Badge>
            <span className="text-ink3">·</span>
            {admin.active ? (
              <Badge tone="good">Active</Badge>
            ) : (
              <Badge tone="neutral">Suspended</Badge>
            )}
          </span>
        }
        actions={<LinkButton href="/admins">← All operators</LinkButton>}
      />

      <Grid cols={3}>
        <Stat
          label="Actions recorded"
          value={total.toLocaleString('en-US')}
          sub="Every state change this operator made"
        />
        <Stat
          label="Last signed in"
          value={admin.lastLoginAt ? timeAgo(admin.lastLoginAt) : 'Never'}
          tone={admin.lastLoginAt ? 'neutral' : 'warn'}
          sub={admin.lastLoginAt ? fmtDateTime(admin.lastLoginAt) : 'The account has not been used'}
        />
        <Stat
          label="Two-factor"
          value={admin.totpEnabled ? 'Enrolled' : 'Off'}
          tone={admin.totpEnabled ? 'good' : 'warn'}
          sub={
            admin.totpEnabled
              ? 'A code is required at sign-in'
              : 'Password alone opens this account'
          }
        />
      </Grid>

      <Grid cols={2}>
        <Card className="mt-3" title="The account">
          <Field label="Name">{admin.name}</Field>
          <Field label="Email">{admin.email}</Field>
          <Field label="Role">
            <Badge tone={admin.role === 'superadmin' ? 'bad' : 'info'}>{admin.role}</Badge>
          </Field>
          <Field label="State">
            {admin.active ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">Suspended</Badge>}
          </Field>
          <Field label="Created">{fmtDateTime(admin.createdAt)}</Field>
          <Field label="Last changed">{fmtDateTime(admin.updatedAt)}</Field>
          <p className="mt-2 text-[12px] leading-relaxed text-ink3">
            {ROLE_NOTE[admin.role] ?? 'Capabilities are decided by the role, on the server.'}
          </p>
        </Card>

        <Card className="mt-3" title="Most-used actions">
          {actionCounts.length === 0 ? (
            <p className="text-[13px] text-ink3">
              Nothing recorded. This operator has not changed anything yet.
            </p>
          ) : (
            <ul className="divide-y divide-line2">
              {actionCounts.map((row) => (
                <li key={row.action} className="flex items-center justify-between gap-3 py-2">
                  <code className="min-w-0 truncate text-[12.5px] text-ink2">{row.action}</code>
                  <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                    {row._count.action.toLocaleString('en-US')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Grid>

      <Card className="mt-3" title="Recent actions" pad={false}>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: '18%' }}>When</th>
                <th>Action</th>
                <th>Target</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap text-ink2">
                    <Link href={`/audit/${entry.id}`} className="hover:text-primary">
                      {timeAgo(entry.at)}
                    </Link>
                  </td>
                  <td>
                    <code className="text-[12px]">{entry.action}</code>
                  </td>
                  <td className="max-w-[160px] truncate text-ink2">{entry.targetType}</td>
                  <td className="max-w-[280px] truncate text-ink2">{entry.summary}</td>
                </tr>
              ))}
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[13px] text-ink3">
                    Nothing recorded for this operator.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
