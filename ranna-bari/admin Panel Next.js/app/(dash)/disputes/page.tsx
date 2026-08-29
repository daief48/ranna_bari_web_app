import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { taka, fmtDateTime, timeAgo } from '@/lib/format';
import type { DisputeNote } from '@/lib/mappers';
import {
  Badge,
  Card,
  Grid,
  GapNote,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Empty,
} from '@/components/ui';
import { DisputeControls } from './controls';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Disputes · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/**
 * What `/disputes` attaches to a case: a projection of the order, not the row.
 * `cookName` is the kitchen's name denormalised onto the order — the same
 * string the kitchen relation used to supply — and `customerKey` arrives where
 * `customerName` used to, because the projection does not select the name.
 */
type CaseOrder = {
  id: string;
  code: string;
  title: string;
  amount: number;
  payment: string;
  status: string;
  kitchenId: string;
  cookName: string;
  customerKey: string;
};

type Case = {
  id: string;
  code: string;
  status: string;
  openedBy: string;
  reason: string;
  resolution: string | null;
  resolutionNote: string | null;
  refundAmount: number | null;
  releaseAmount: number | null;
  notes: DisputeNote[];
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  order: CaseOrder | null;
};

type Board = {
  open: Case[];
  resolved: Case[];
  contested: number;
  counts: { open: number; resolved: number };
};

/**
 * The order behind a case that no longer has one.
 *
 * Under Prisma the relation was required and nothing on this page guarded it.
 * The backend answers `order: null` when the row has gone, and a case with no
 * order is still a case somebody has to close — so it keeps its card rather
 * than disappearing from the board.
 */
const LOST_ORDER: CaseOrder = {
  id: '',
  code: '—',
  title: '',
  amount: 0,
  payment: 'unknown',
  status: 'unknown',
  kitchenId: '',
  cookName: '—',
  customerKey: '—',
};

export default async function DisputesPage() {
  await requirePage('order.read');
  const user = await currentUser();
  const canResolve = can(user?.role ?? '', 'dispute.resolve');
  const canNote = can(user?.role ?? '', 'dispute.open');

  let board: Board;
  try {
    board = await get<Board>('/disputes?take=10');
  } catch (error) {
    /* Only an unreachable backend degrades into a banner. A refusal the
       backend actually sent is a real bug and stays loud. */
    if (error instanceof BackendError && error.status === 0) {
      return (
        <>
          <PageHeader
            title="Disputes"
            subtitle="Where the app stops and a person has to decide"
          />
          <GapNote>
            <strong>The backend is not answering.</strong> This board is served by{' '}
            <code>backend-node</code>, and nothing on it can be read without it. Start
            it with <code>cd backend-node &amp;&amp; npm run dev</code>, then reload.
          </GapNote>
        </>
      );
    }
    throw error;
  }

  const { open, resolved, contested } = board;

  return (
    <>
      <PageHeader
        title="Disputes"
        subtitle="Where the app stops and a person has to decide"
      />

      <GapNote>
        <strong>Why this screen exists.</strong> The app allows a cancellation right up
        until the food is on its way, and after that it refuses — its own comment says
        the situation is <em>&ldquo;a dispute rather than a cancellation, and this
        system does not pretend to settle those&rdquo;</em>. It was right not to: a
        device cannot look at photographs. This is the desk that can. Every resolution
        posts real ledger movements, and a split has to account for the whole held
        amount — a leftover taka would sit in escrow attached to a closed case.
      </GapNote>

      <Grid cols={3}>
        <Stat
          label="Open cases"
          value={open.length}
          tone={open.length > 0 ? 'bad' : 'good'}
        />
        <Stat
          label="Money contested"
          value={taka(contested)}
          tone={contested > 0 ? 'warn' : 'neutral'}
          sub="held against an unresolved case"
        />
        <Stat label="Resolved" value={resolved.length} tone="good" sub="most recent 10 shown" />
      </Grid>

      <div className="mt-3 space-y-3">
        {open.map((dispute) => {
          const order = dispute.order ?? LOST_ORDER;
          const notes = dispute.notes;
          return (
            <Card key={dispute.id} pad={false}>
              <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
                <div className="border-line p-4 lg:border-r">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="tnum font-display text-[15px] font-bold">
                        {dispute.code}
                      </span>
                      <StatusBadge status={dispute.status} />
                      <Badge>opened by {dispute.openedBy}</Badge>
                    </div>
                    <span className="text-[12px] text-ink3">{timeAgo(dispute.createdAt)}</span>
                  </div>

                  <p className="mb-3 text-[13px] leading-relaxed text-ink">{dispute.reason}</p>

                  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink2">
                    <span>
                      Order{' '}
                      <Link
                        href={`/orders/${order.id}`}
                        className="tnum font-semibold hover:text-primary"
                      >
                        {order.code}
                      </Link>
                    </span>
                    <span>
                      Kitchen{' '}
                      <Link
                        href={`/kitchens/${order.kitchenId}`}
                        className="hover:text-primary"
                      >
                        {order.cookName}
                      </Link>
                    </span>
                    <span>Customer {order.customerKey}</span>
                    <span>
                      Held <Money amount={order.amount} tone="warn" />
                    </span>
                    <span>
                      Payment <StatusBadge status={order.payment} />
                    </span>
                  </div>

                  <div className="rounded-[10px] border border-line bg-sunken p-3">
                    <div className="label mb-2">Case notes</div>
                    <ol className="space-y-2">
                      {notes.map((note, i) => (
                        <li key={i} className="text-[12.5px]">
                          <div className="text-ink">{note.text}</div>
                          <div className="text-[11px] text-ink3">
                            {note.by} · {fmtDateTime(note.at)}
                          </div>
                        </li>
                      ))}
                      {notes.length === 0 ? (
                        <li className="text-[12.5px] text-ink3">No notes yet.</li>
                      ) : null}
                    </ol>
                  </div>
                </div>

                <div className="p-4">
                  <DisputeControls
                    disputeId={dispute.id}
                    code={dispute.code}
                    amount={order.amount}
                    payment={order.payment}
                    canResolve={canResolve}
                    canNote={canNote}
                  />
                </div>
              </div>
            </Card>
          );
        })}

        {open.length === 0 ? (
          <Card>
            <Empty>No open disputes. Everything that was contested is settled.</Empty>
          </Card>
        ) : null}
      </div>

      <Card title="Resolved" className="mt-5" pad={false}>
        <ul className="divide-y divide-line2">
          {resolved.map((dispute) => {
            const order = dispute.order ?? LOST_ORDER;
            return (
              <li key={dispute.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="tnum shrink-0 font-semibold">{dispute.code}</span>
                <Link
                  href={`/orders/${order.id}`}
                  className="tnum shrink-0 text-[12px] text-ink2 hover:text-primary"
                >
                  {order.code}
                </Link>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink2">
                  {dispute.resolutionNote}
                </span>
                <Badge
                  tone={
                    dispute.resolution === 'refund'
                      ? 'bad'
                      : dispute.resolution === 'release'
                        ? 'good'
                        : 'warn'
                  }
                >
                  {dispute.resolution}
                  {dispute.resolution === 'split' && dispute.refundAmount != null
                    ? ` ${taka(dispute.refundAmount)}/${taka(dispute.releaseAmount ?? 0)}`
                    : ''}
                </Badge>
                <span className="shrink-0 text-[11.5px] text-ink3">
                  {dispute.resolvedBy} · {timeAgo(dispute.resolvedAt)}
                </span>
              </li>
            );
          })}
          {resolved.length === 0 ? (
            <li className="px-4 py-8 text-center text-[13px] text-ink3">
              Nothing resolved yet.
            </li>
          ) : null}
        </ul>
      </Card>
    </>
  );
}
