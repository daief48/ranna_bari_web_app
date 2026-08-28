import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { can, LEDGER_KINDS, ACCOUNTS } from '@/lib/domain';
import { balances, reconcile } from '@/lib/logic/ledger';
import { getSettings } from '@/lib/settings';
import { taka, timeAgo, daysSince, fmtDateTime } from '@/lib/format';
import { paging, pageCount } from '@/lib/queries';
import {
  Badge,
  Card,
  Grid,
  GapNote,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  EmptyRow,
} from '@/components/ui';
import { FilterSelect, Pager, ActionButton } from '@/components/ui/client';
import { sweepEscrow } from '@/actions/money';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Ledger & escrow · RannaBari Admin' };
export const dynamic = 'force-dynamic';

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('ledger.read');
  const params = await searchParams;
  const view = params.view ?? 'entries';
  const { page, skip, take } = paging(params);
  const user = await currentUser();
  const canMove = can(user?.role ?? '', 'payout.write');

  const [bal, books, settings] = await Promise.all([balances(), reconcile(), getSettings()]);
  const cutoff = new Date(Date.now() - settings.escrowAutoReleaseDays * 86_400_000);

  const where: Prisma.LedgerEntryWhereInput = {};
  if (params.kind) where.kind = params.kind;
  if (params.account) {
    where.OR = [{ from: params.account }, { to: params.account }];
  }

  const [entries, entryCount, agedOrders, agedTotal] = await Promise.all([
    db.ledgerEntry.findMany({
      where,
      skip,
      take,
      orderBy: { at: 'desc' },
      include: { order: { select: { code: true, title: true } } },
    }),
    db.ledgerEntry.count({ where }),
    db.order.findMany({
      where: { payment: 'held', status: 'delivered', deliveredAt: { lt: cutoff } },
      orderBy: { deliveredAt: 'asc' },
      take: 50,
      include: { kitchen: { select: { name: true } } },
    }),
    db.order.aggregate({
      where: { payment: 'held', status: 'delivered', deliveredAt: { lt: cutoff } },
      _sum: { amount: true },
    }),
  ]);

  const driftTotal = Object.values(books.drift).reduce((s, v) => s + Math.abs(v), 0);

  return (
    <>
      <PageHeader
        title="Ledger & escrow"
        subtitle="Append-only. A correction is a new entry in the opposite direction."
        actions={
          <div className="flex gap-2">
            <Tab href="/ledger" active={view === 'entries'}>
              Entries
            </Tab>
            <Tab href="/ledger?view=aged" active={view === 'aged'}>
              Ageing escrow
            </Tab>
            <Tab href="/ledger?view=reconcile" active={view === 'reconcile'}>
              Reconciliation
            </Tab>
          </div>
        }
      />

      <Grid cols={4}>
        <Stat label="Customer wallets" value={taka(bal.customer)} sub="Topped up, unspent" />
        <Stat
          label="Held in escrow"
          value={taka(bal.held)}
          tone={(agedTotal._sum.amount ?? 0) > 0 ? 'warn' : 'neutral'}
          sub={`${taka(agedTotal._sum.amount ?? 0)} past ${settings.escrowAutoReleaseDays} days`}
        />
        <Stat label="Owed to cooks" value={taka(bal.cook)} sub="Released, not paid out" href="/payouts" />
        <Stat label="Platform earned" value={taka(bal.platform)} tone="good" sub="Commission taken" />
      </Grid>

      {view === 'aged' ? (
        <>
          <GapNote>
            <strong>Why this screen exists.</strong> Money is released only when the
            customer confirms the food arrived. When they never do, it sits in escrow
            forever — the customer has paid, the cook has cooked, and neither has what
            they are owed. The app nudges once a day and then waits. Auto-release is
            set to <strong>{settings.escrowAutoReleaseDays} days</strong> after
            delivery; changing it is on the{' '}
            <Link href="/settings" className="font-semibold text-primary hover:underline">
              configuration page
            </Link>
            .
          </GapNote>

          <Card
            title={`${agedOrders.length} orders past the release window`}
            subtitle={`${taka(agedTotal._sum.amount ?? 0)} stuck in escrow`}
            pad={false}
            actions={
              canMove ? (
                <ActionButton
                  action={sweepEscrow}
                  variant="primary"
                  confirm={`Release every order past ${settings.escrowAutoReleaseDays} days? That is ${taka(agedTotal._sum.amount ?? 0)} across ${agedOrders.length} orders, and it cannot be undone.`}
                >
                  Release all
                </ActionButton>
              ) : null
            }
          >
            <Table head={['Order', 'Kitchen', 'Customer', 'Delivered', 'Age', 'Amount', '']}>
              {agedOrders.map((order) => {
                const age = daysSince(order.deliveredAt);
                return (
                  <tr key={order.id}>
                    <td>
                      <Link
                        href={`/orders/${order.id}`}
                        className="tnum font-semibold hover:text-primary"
                      >
                        {order.code}
                      </Link>
                    </td>
                    <td className="max-w-[150px] truncate text-ink2">{order.kitchen.name}</td>
                    <td className="max-w-[130px] truncate text-ink2">{order.customerName}</td>
                    <td className="whitespace-nowrap text-ink2">{timeAgo(order.deliveredAt)}</td>
                    <td>
                      <Badge tone={age > 7 ? 'bad' : 'warn'}>{age} days</Badge>
                    </td>
                    <td>
                      <Money amount={order.amount} />
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/orders/${order.id}`}
                        className="text-[12px] font-semibold text-primary hover:underline"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {agedOrders.length === 0 ? (
                <EmptyRow span={7}>
                  Nothing has been held past {settings.escrowAutoReleaseDays} days.
                </EmptyRow>
              ) : null}
            </Table>
          </Card>
        </>
      ) : null}

      {view === 'reconcile' ? (
        <Card
          title="Reconciliation"
          subtitle="Each account, folded from its entries, against what those entries imply"
          className="mt-3"
        >
          <div
            className={`mb-4 rounded-[10px] border px-3.5 py-2.5 text-[13px] ${
              driftTotal === 0
                ? 'border-sage-100 bg-sage-50 text-sage'
                : 'border-primary-100 bg-primary-50 text-primary'
            }`}
          >
            {driftTotal === 0 ? (
              <>
                <strong>Balanced.</strong> Every account folds to exactly what its
                entries imply. Balances are derived on read, never stored, so this is
                the books checking themselves rather than two numbers agreeing.
              </>
            ) : (
              <>
                <strong>Drift of {taka(driftTotal)}.</strong> An entry has been posted
                with an account this fold does not understand. Nothing here is safe to
                trust until it is explained.
              </>
            )}
          </div>

          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Folded balance</th>
                  <th>Implied by entries</th>
                  <th>Drift</th>
                </tr>
              </thead>
              <tbody>
                {ACCOUNTS.map((account) => {
                  const drift = books.drift[account];
                  return (
                    <tr key={account}>
                      <td className="font-medium capitalize">{account}</td>
                      <td>
                        <Money amount={books.balances[account]} />
                      </td>
                      <td>
                        <Money amount={books.expected[account]} />
                      </td>
                      <td>
                        {drift === 0 ? (
                          <Badge tone="good">clean</Badge>
                        ) : (
                          <Badge tone="bad">{taka(drift)}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5">
            <div className="label mb-2">Totals by kind</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(books.totals).map(([kind, value]) => (
                <div key={kind} className="rounded-[10px] border border-line bg-sunken px-3 py-2">
                  <div className="label">{kind}</div>
                  <div className="tnum mt-0.5 text-[14px] font-semibold">{taka(value)}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-[11.5px] leading-relaxed text-ink3">
            Customers hold what they topped up, less what is held against orders, plus
            refunds. Escrow holds what went in less everything that has come out.
            Cooks are owed what was released, less what has been paid out. The
            platform holds exactly the commission it has taken.
          </p>
        </Card>
      ) : null}

      {view === 'entries' ? (
        <Card
          className="mt-3"
          pad={false}
          title="Entries"
          subtitle="Newest first. Nothing here can be edited or deleted."
          actions={
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                name="kind"
                allLabel="All kinds"
                options={LEDGER_KINDS.map((k) => ({ value: k, label: k }))}
              />
              <FilterSelect
                name="account"
                allLabel="All accounts"
                options={[...ACCOUNTS, 'external'].map((a) => ({ value: a, label: a }))}
              />
            </div>
          }
        >
          <Table head={['Kind', 'From', 'To', 'Amount', 'Order', 'Note', 'When']}>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <Badge
                    tone={
                      entry.kind === 'refund' || entry.kind === 'payout'
                        ? 'bad'
                        : entry.kind === 'release' || entry.kind === 'topup'
                          ? 'good'
                          : entry.kind === 'commission'
                            ? 'info'
                            : 'warn'
                    }
                  >
                    {entry.kind}
                  </Badge>
                </td>
                <td className="text-ink2">{entry.from}</td>
                <td className="text-ink2">{entry.to}</td>
                <td>
                  <Money amount={entry.amount} />
                </td>
                <td className="tnum text-ink2">{entry.order?.code ?? '—'}</td>
                <td className="max-w-[260px] truncate text-ink2">{entry.note}</td>
                <td className="whitespace-nowrap text-ink2" title={fmtDateTime(entry.at)}>
                  {timeAgo(entry.at)}
                </td>
              </tr>
            ))}
            {entries.length === 0 ? <EmptyRow span={7}>No entries match that.</EmptyRow> : null}
          </Table>

          <Pager page={page} pages={pageCount(entryCount)} total={entryCount} />
        </Card>
      ) : null}
    </>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
        active
          ? 'border-primary-100 bg-primary-50 text-primary'
          : 'border-line bg-raised text-ink2 hover:bg-sunken'
      }`}
    >
      {children}
    </Link>
  );
}
