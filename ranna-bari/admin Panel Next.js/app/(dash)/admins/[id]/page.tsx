import Link from 'next/link';
import { notFound } from 'next/navigation';

import { get } from '@/lib/backend';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { Badge, Card, Field, Grid, LinkButton, PageHeader, Stat } from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

type Admin = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TrailRow = {
  id: string;
  at: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
};

const ROLE_NOTE: Record<string, string> = {
  superadmin: 'Everything, including other operators and platform settings.',
  ops: 'Kitchens, KYC, orders and meals. No money screens.',
  finance: 'Ledger, payouts, top-ups and disputes. No operations screens.',
  support: 'Orders and cases, read-mostly.',
};

export default async function AdminDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('kitchen.read');
  const { id } = await params;

  /* The operator, and what they have actually done. The endpoint drops
     `passwordHash` and `totpSecret` at the query rather than trusting a caller
     to remember not to render them — the same reasoning the explicit select
     here used, moved to where the row is read.

     The trail is matched on the recorded email rather than an id, because the
     trail is the record: renaming an operator afterwards must not change what
     it says happened. */
  const loaded = await get<{
    admin: Admin;
    recent: TrailRow[];
    byAction: { action: string; count: number }[];
    total: number;
  }>(`/admins/${id}`).catch(() => null);
  if (!loaded) notFound();

  const admin = loaded.admin;
  const recent = loaded.recent;
  const total = loaded.total;
  /* Kept in the grouped shape the list below reads. */
  const actionCounts = loaded.byAction.map((row) => ({
    action: row.action,
    _count: { action: row.count },
  }));

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
