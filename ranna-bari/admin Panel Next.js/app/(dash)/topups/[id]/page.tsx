import Link from 'next/link';
import { notFound } from 'next/navigation';
import { get } from '@/lib/backend';

import { taka, fmtDateTime, timeAgo } from '@/lib/format';
import {
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

type Row = {
  id: string;
  customerKey: string;
  amount: number;
  method: string;
  reconciled: string;
  pspRef: string | null;
  pspAmount: number | null;
  note?: string;
  ledgerEntryId?: string | null;
  at: string | Date;
};

/**
 * The credit, from whichever store holds it.
 *
 * The board is served by `GET /topups`, so its ids are the backend's. Reading
 * only the panel's own mirror here meant every row on that board opened a
 * 404 — the id was real, just not in the database being asked.
 */
async function loadTopUp(id: string) {
  const remote = await get<{
    topup: Row;
    others: Row[];
    wallet: { amount: number; count: number };
    entry: { id: string; kind: string; amount: number; at: string } | null;
  }>(`/topups/${id}`).catch(() => null);

  if (remote) {
    return {
      topup: remote.topup,
      others: remote.others,
      wallet: { _sum: { amount: remote.wallet.amount }, _count: remote.wallet.count },
      entry: remote.entry ?? null,
    };
  }

  /* No fallback to the panel's own database. When the backend cannot answer,
     the honest result is nothing found — a stale mirror rendered as if it were
     live is the failure that hides itself. */
  return null;
}

export default async function TopUpDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('ledger.read');
  const { id } = await params;

  const data = await loadTopUp(id);
  if (!data) notFound();

  /* The ledger row this credited now comes from the endpoint, which joins it
     from the same database that wrote it. A missing entry is still shown as
     missing rather than guessed at. */
  const { topup, others, wallet, entry } = data;

  /* What the PSP says minus what we credited. Non-zero is the whole reason
     this screen exists. */
  const drift = topup.pspAmount == null ? null : topup.pspAmount - topup.amount;

  return (
    <>
      <PageHeader
        title={taka(topup.amount)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>Top-up by {topup.customerKey}</span>
            <span className="text-ink3">·</span>
            <StatusBadge status={topup.reconciled} />
            <span className="text-ink3">·</span>
            <span>{fmtDateTime(topup.at)}</span>
          </span>
        }
        actions={<LinkButton href="/topups">← All top-ups</LinkButton>}
      />

      <Grid cols={3}>
        <Stat label="Credited to wallet" value={taka(topup.amount)} />
        <Stat
          label="PSP says"
          value={topup.pspAmount == null ? '—' : taka(topup.pspAmount)}
          tone={drift == null ? 'neutral' : drift === 0 ? 'good' : 'bad'}
          sub={
            drift == null
              ? 'No provider record matched'
              : drift === 0
                ? 'Matches to the taka'
                : `${drift > 0 ? 'Provider is higher' : 'Provider is lower'} by ${taka(Math.abs(drift))}`
          }
        />
        <Stat
          label="This customer, all time"
          value={taka(wallet._sum.amount ?? 0)}
          sub={`${wallet._count} top-up${wallet._count === 1 ? '' : 's'}`}
        />
      </Grid>

      <Grid cols={2}>
        <Card className="mt-3" title="The top-up">
          <Field label="Amount">
            <Money amount={topup.amount} />
          </Field>
          <Field label="Method">{topup.method}</Field>
          <Field label="Reconciled">
            <StatusBadge status={topup.reconciled} />
          </Field>
          <Field label="Customer">{topup.customerKey}</Field>
          <Field label="When">{fmtDateTime(topup.at)}</Field>
          <Field label="Top-up id">
            <code className="text-[11.5px] text-ink2">{topup.id}</code>
          </Field>
        </Card>

        <Card className="mt-3" title="What the provider says">
          <Field label="PSP reference">
            {topup.pspRef ? (
              <code className="text-[11.5px]">{topup.pspRef}</code>
            ) : (
              <span className="text-ink3">None — nothing to match against</span>
            )}
          </Field>
          <Field label="PSP amount">
            {topup.pspAmount == null ? (
              <span className="text-ink3">—</span>
            ) : (
              <Money amount={topup.pspAmount} />
            )}
          </Field>
          <Field label="Difference">
            {drift == null ? (
              <span className="text-ink3">—</span>
            ) : drift === 0 ? (
              <span className="text-sage">None</span>
            ) : (
              <span className="text-primary">
                {drift > 0 ? '+' : '−'}
                {taka(Math.abs(drift))}
              </span>
            )}
          </Field>
          <Field label="Ledger entry">
            {entry ? (
              <Link href={`/ledger/${entry.id}`} className="hover:text-primary">
                {entry.kind} · {taka(entry.amount)}
              </Link>
            ) : (
              <span className="text-ink3">Not written to the ledger</span>
            )}
          </Field>
          {topup.note ? <Field label="Note">{topup.note}</Field> : null}
        </Card>
      </Grid>

      {others.length > 0 ? (
        <Card className="mt-3" title={`Earlier top-ups by ${topup.customerKey}`}>
          <ul className="divide-y divide-line2">
            {others.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <Link
                  href={`/topups/${row.id}`}
                  className="text-[13px] hover:text-primary"
                >
                  {fmtDateTime(row.at)}
                </Link>
                <span className="flex items-center gap-2.5">
                  <span className="text-[12px] text-ink3">{row.method}</span>
                  <StatusBadge status={row.reconciled} />
                  <span className="tnum text-[13px] text-ink">{taka(row.amount)}</span>
                  <span className="w-[70px] text-right text-[12px] text-ink3">
                    {timeAgo(row.at)}
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
