import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { taka, fmtDateTime, timeAgo } from '@/lib/format';
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

export default async function PayoutRunDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('ledger.read');
  const { id } = await params;

  const run = await db.payoutRun.findUnique({
    where: { id },
    include: {
      items: { orderBy: { amount: 'desc' } },
      ledger: { orderBy: { at: 'asc' } },
    },
  });
  if (!run) notFound();

  /* The declared total against what the ledger actually moved. These agree on
     a healthy run, and the moment they do not is the moment somebody needs to
     know — a run that says it paid more than the ledger recorded is either a
     failed write or a payment nobody can account for. */
  const posted = run.ledger.reduce((sum, entry) => sum + entry.amount, 0);
  const itemsTotal = run.items.reduce((sum, item) => sum + item.amount, 0);
  const drift = posted - run.total;

  return (
    <>
      <PageHeader
        title={run.code}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={run.status} />
            <span className="text-ink3">·</span>
            <span>{run.method}</span>
            <span className="text-ink3">·</span>
            <span>raised {fmtDateTime(run.createdAt)}</span>
          </span>
        }
        actions={<LinkButton href="/payouts">← Payouts</LinkButton>}
      />

      <Grid cols={4}>
        <Stat label="Run total" value={taka(run.total)} sub={`${run.cookCount} cook${run.cookCount === 1 ? '' : 's'}`} />
        <Stat
          label="Lines add up to"
          value={taka(itemsTotal)}
          tone={itemsTotal === run.total ? 'good' : 'bad'}
          sub={
            itemsTotal === run.total
              ? 'Matches the run total'
              : `Off by ${taka(Math.abs(itemsTotal - run.total))}`
          }
        />
        <Stat
          label="Posted to the ledger"
          value={taka(posted)}
          tone={run.status === 'paid' ? (drift === 0 ? 'good' : 'bad') : 'neutral'}
          sub={
            run.status !== 'paid'
              ? 'Nothing moves until the run is paid'
              : drift === 0
                ? 'Matches to the taka'
                : `Off by ${taka(Math.abs(drift))}`
          }
        />
        <Stat
          label="State"
          value={run.status}
          tone={run.status === 'paid' ? 'good' : run.status === 'cancelled' ? 'bad' : 'warn'}
          sub={run.paidAt ? `Paid ${timeAgo(run.paidAt)}` : 'Not paid yet'}
        />
      </Grid>

      <Grid cols={2}>
        <Card className="mt-3" title="The run">
          <Field label="Code">
            <span className="tnum">{run.code}</span>
          </Field>
          <Field label="Status">
            <StatusBadge status={run.status} />
          </Field>
          <Field label="Method">
            <Badge tone="neutral">{run.method}</Badge>
          </Field>
          <Field label="Total">
            <Money amount={run.total} />
          </Field>
          <Field label="Cooks">{run.cookCount}</Field>
          {run.note ? <Field label="Note">{run.note}</Field> : null}
        </Card>

        <Card className="mt-3" title="Who and when">
          <Field label="Raised by">{run.createdBy}</Field>
          <Field label="Raised at">{fmtDateTime(run.createdAt)}</Field>
          <Field label="Paid by">{run.paidBy ?? <span className="text-ink3">—</span>}</Field>
          <Field label="Paid at">
            {run.paidAt ? fmtDateTime(run.paidAt) : <span className="text-ink3">—</span>}
          </Field>
          <Field label="Run id">
            <code className="text-[11.5px] text-ink2">{run.id}</code>
          </Field>
        </Card>
      </Grid>

      <Card
        className="mt-3"
        title="What each cook is owed"
        subtitle={`${run.items.length} line${run.items.length === 1 ? '' : 's'}`}
        pad={false}
      >
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Kitchen</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right', width: '18%' }}>Share of run</th>
              </tr>
            </thead>
            <tbody>
              {run.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/kitchens/${item.kitchenId}`} className="hover:text-primary">
                      {item.kitchenName}
                    </Link>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Money amount={item.amount} />
                  </td>
                  <td className="tnum text-ink2" style={{ textAlign: 'right' }}>
                    {run.total > 0 ? `${Math.round((item.amount / run.total) * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
              {run.items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-[13px] text-ink3">
                    This run has no lines.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        className="mt-3"
        title="Ledger entries this run wrote"
        subtitle={
          run.ledger.length === 0
            ? 'None yet — a draft run has not moved money'
            : `${run.ledger.length} entries, ${taka(posted)} in total`
        }
        pad={false}
      >
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>From</th>
                <th>To</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {run.ledger.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap text-ink2">
                    <Link href={`/ledger/${entry.id}`} className="hover:text-primary">
                      {timeAgo(entry.at)}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={entry.kind} />
                  </td>
                  <td className="text-ink2">{entry.from}</td>
                  <td className="text-ink2">
                    {entry.to}
                    {entry.toRef ? (
                      <span className="ml-1.5 text-[11.5px] text-ink3">({entry.toRef})</span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Money amount={entry.amount} />
                  </td>
                  <td className="max-w-[220px] truncate text-ink2">{entry.note}</td>
                </tr>
              ))}
              {run.ledger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[13px] text-ink3">
                    Nothing posted. Money moves when the run is marked paid.
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
