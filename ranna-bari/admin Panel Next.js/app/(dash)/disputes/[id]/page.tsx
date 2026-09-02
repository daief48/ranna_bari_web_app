import Link from 'next/link';
import { notFound } from 'next/navigation';

import { get } from '@/lib/backend';
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

type Note = { at?: string; by?: string; text?: string };

function parseNotes(raw: string | null | undefined): Note[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as Note[]) : [];
  } catch {
    return [];
  }
}

export default async function DisputeDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('order.read');
  const { id } = await params;

  /* Backend, because the board that links here is the backend's. The order
     and the postings against it come back with the dispute — reading one
     without the others is how people conclude the numbers do not add up. */
  const loaded = await get<{
    dispute: Record<string, unknown>;
    order: {
      id: string;
      code: string;
      title: string;
      status: string;
      payment: string;
      amount: number;
      cookName: string;
      customerName: string;
      kitchenId: string;
    } | null;
    entries: {
      id: string;
      kind: string;
      amount: number;
      at: string;
      note: string;
      from: string;
      to: string;
    }[];
  }>(`/disputes/${id}`).catch(() => null);

  /* A dispute whose order has gone is a broken record, not a page: every panel
     on this screen is about that order, so there is nothing honest to render. */
  if (!loaded || !loaded.order) notFound();

  const dispute = { ...loaded.dispute, order: loaded.order } as typeof loaded.dispute & {
    id: string;
    code: string;
    status: string;
    reason: string;
    openedBy: string;
    orderId: string;
    notes: string;
    resolution: string | null;
    resolutionNote: string | null;
    resolvedBy: string | null;
    resolvedAt: string | null;
    refundAmount: number | null;
    releaseAmount: number | null;
    createdAt: string;
    updatedAt: string;
    order: NonNullable<typeof loaded.order>;
  };

  const notes = parseNotes(dispute.notes);

  /* Every taka that has moved on the disputed order. A dispute is an argument
     about money, so the ledger is the evidence. */
  const entries = loaded.entries;

  const open = dispute.status !== 'resolved';
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(dispute.createdAt).getTime()) / 86_400_000),
  );

  return (
    <>
      <PageHeader
        title={dispute.code}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={dispute.status} />
            <span className="text-ink3">·</span>
            <span>opened by {dispute.openedBy}</span>
            <span className="text-ink3">·</span>
            <span>{fmtDateTime(dispute.createdAt)}</span>
          </span>
        }
        actions={
          <>
            <LinkButton href={`/orders/${dispute.orderId}`}>The order →</LinkButton>
            <LinkButton href="/disputes">← All disputes</LinkButton>
          </>
        }
      />

      <Grid cols={3}>
        <Stat
          label="Order value"
          value={taka(dispute.order.amount)}
          sub={dispute.order.code}
        />
        <Stat
          label="Money state"
          value={dispute.order.payment}
          tone={dispute.order.payment === 'held' ? 'warn' : 'neutral'}
          sub={
            dispute.order.payment === 'held'
              ? 'Still in escrow, so both outcomes are open'
              : 'Already settled'
          }
        />
        <Stat
          label={open ? 'Open for' : 'Resolved'}
          value={open ? `${ageDays}d` : (dispute.resolution ?? '—')}
          tone={open ? (ageDays > 3 ? 'bad' : 'warn') : 'good'}
          sub={
            open
              ? ageDays > 3
                ? 'Past the three-day mark'
                : 'Within the usual window'
              : dispute.resolvedAt
                ? fmtDateTime(dispute.resolvedAt)
                : undefined
          }
        />
      </Grid>

      <Card className="mt-3" title="Why it was raised">
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink">
          {dispute.reason || <span className="text-ink3">No reason was recorded.</span>}
        </p>
      </Card>

      <Grid cols={2}>
        <Card className="mt-3" title="The dispute">
          <Field label="Code">
            <span className="tnum">{dispute.code}</span>
          </Field>
          <Field label="Status">
            <StatusBadge status={dispute.status} />
          </Field>
          <Field label="Opened by">
            <Badge tone="neutral">{dispute.openedBy}</Badge>
          </Field>
          <Field label="Raised">{fmtDateTime(dispute.createdAt)}</Field>
          <Field label="Last touched">{fmtDateTime(dispute.updatedAt)}</Field>
        </Card>

        <Card className="mt-3" title="Resolution">
          <Field label="Outcome">
            {dispute.resolution ? (
              <Badge tone={dispute.resolution === 'refund' ? 'bad' : 'good'}>
                {dispute.resolution}
              </Badge>
            ) : (
              <span className="text-ink3">Not decided</span>
            )}
          </Field>
          <Field label="Refunded">
            {dispute.refundAmount == null ? (
              <span className="text-ink3">—</span>
            ) : (
              <Money amount={dispute.refundAmount} />
            )}
          </Field>
          <Field label="Released">
            {dispute.releaseAmount == null ? (
              <span className="text-ink3">—</span>
            ) : (
              <Money amount={dispute.releaseAmount} />
            )}
          </Field>
          <Field label="Resolved by">
            {dispute.resolvedBy ?? <span className="text-ink3">—</span>}
          </Field>
          <Field label="Resolved at">
            {dispute.resolvedAt ? fmtDateTime(dispute.resolvedAt) : <span className="text-ink3">—</span>}
          </Field>
          {dispute.resolutionNote ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink2">
              {dispute.resolutionNote}
            </p>
          ) : null}
        </Card>
      </Grid>

      <Grid cols={2}>
        <Card className="mt-3" title="The order it is about">
          <Field label="Code">
            <Link href={`/orders/${dispute.order.id}`} className="tnum hover:text-primary">
              {dispute.order.code}
            </Link>
          </Field>
          <Field label="Item">{dispute.order.title}</Field>
          <Field label="Kitchen">
            <Link href={`/kitchens/${dispute.order.kitchenId}`} className="hover:text-primary">
              {dispute.order.cookName}
            </Link>
          </Field>
          <Field label="Customer">{dispute.order.customerName}</Field>
          <Field label="Order status">
            <StatusBadge status={dispute.order.status} />
          </Field>
          <Field label="Amount">
            <Money amount={dispute.order.amount} />
          </Field>
        </Card>

        <Card className="mt-3" title="Case notes">
          {notes.length === 0 ? (
            <p className="text-[13px] text-ink3">Nothing has been added to the case yet.</p>
          ) : (
            <ol className="space-y-3">
              {notes.map((note, i) => (
                <li key={i} className="border-l-2 border-line pl-3">
                  <div className="flex flex-wrap items-baseline gap-2 text-[11.5px] text-ink3">
                    <span className="font-semibold text-ink2">{note.by ?? 'unknown'}</span>
                    {note.at ? <span>{fmtDateTime(note.at)}</span> : null}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
                    {note.text}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </Grid>

      <Card className="mt-3" title="Every taka on this order" pad={false}>
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
              {entries.map((entry) => (
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
                  <td className="text-ink2">{entry.to}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Money amount={entry.amount} />
                  </td>
                  <td className="max-w-[240px] truncate text-ink2">{entry.note}</td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[13px] text-ink3">
                    No money has moved on this order yet.
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
