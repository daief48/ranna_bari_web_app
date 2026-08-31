import Link from 'next/link';

import { get } from '@/lib/backend';
import { currentUser } from '@/lib/auth';
import { can, LEDGER_KINDS, ACCOUNTS, type FoldedAccount } from '@/lib/domain';
import { taka, timeAgo, fmtDateTime } from '@/lib/format';
import { paging, pageCount } from '@/lib/queries';
import {
  Badge,
  Card,
  Grid,
  GapNote,
  Money,
  PageHeader,
  Stat,
  Table,
  EmptyRow,
} from '@/components/ui';
import { RowLink } from '@/components/ui/row-link';
import { FilterSelect, Pager, ActionButton } from '@/components/ui/client';
import { BackendDown, down } from '@/components/backend-down';
import { sweepEscrow } from '@/actions/money';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Ledger & escrow · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type Folded = Record<FoldedAccount, number>;

type LedgerView = {
  entries: {
    id: string;
    kind: string;
    from: string;
    to: string;
    amount: number;
    note: string;
    orderId: string | null;
    at: string;
  }[];
  total: number;
  balances: Folded;
  books: {
    balances: Folded;
    totals: Record<string, number>;
    expected: Folded;
    drift: Folded;
  };
};

type AgedView = {
  orders: {
    id: string;
    code: string;
    cookName: string;
    customerName: string;
    deliveredAt: string | null;
    amount: number;
    /** Folded by the backend off `deliveredAt`, so the board and the sweep agree. */
    days: number;
  }[];
  count: number;
  total: number;
  windowDays: number;
};

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

  const query = new URLSearchParams({ skip: String(skip), take: String(take) });
  if (params.kind) query.set('kind', params.kind);
  if (params.account) query.set('account', params.account);

  const [data, aged] = await Promise.all([
    get<LedgerView>(`/ledger?${query}`).catch(down),
    get<AgedView>('/escrow/aged?take=50').catch(down),
  ]);

  if (!data || !aged) {
    return (
      <BackendDown
        title="Ledger & escrow"
        subtitle="Append-only. A correction is a new entry in the opposite direction."
      />
    );
  }

  const bal = data.balances;
  const books = data.books;
  const entries = data.entries;
  const entryCount = data.total;

  /* A roll-up of the drift the backend already folded, not a second fold of
     the entries — the panel never derives a balance of its own. */
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
          tone={aged.total > 0 ? 'warn' : 'neutral'}
          sub={`${taka(aged.total)} past ${aged.windowDays} days`}
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
            set to <strong>{aged.windowDays} days</strong> after
            delivery; changing it is on the{' '}
            <Link href="/settings" className="font-semibold text-primary hover:underline">
              configuration page
            </Link>
            .
          </GapNote>

          <Card
            /* `count` and not the length of the list: the table shows the oldest
               fifty, but the sweep below releases every aged order, and a
               confirmation that undercounts what a button moves is a lie. */
            title={`${aged.count} orders past the release window`}
            subtitle={`${taka(aged.total)} stuck in escrow`}
            pad={false}
            actions={
              canMove ? (
                <ActionButton
                  action={sweepEscrow}
                  variant="primary"
                  confirm={`Release every order past ${aged.windowDays} days? That is ${taka(aged.total)} across ${aged.count} orders, and it cannot be undone.`}
                >
                  Release all
                </ActionButton>
              ) : null
            }
          >
            <Table head={['Order', 'Kitchen', 'Customer', 'Delivered', 'Age', 'Amount', '']}>
              {aged.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      href={`/orders/${order.id}`}
                      className="tnum font-semibold hover:text-primary"
                    >
                      {order.code}
                    </Link>
                  </td>
                  {/* The order carries the kitchen's name on itself; the backend
                      does not join the kitchen row to hand back a second copy. */}
                  <td className="max-w-[150px] truncate text-ink2">{order.cookName}</td>
                  <td className="max-w-[130px] truncate text-ink2">{order.customerName}</td>
                  <td className="whitespace-nowrap text-ink2">{timeAgo(order.deliveredAt)}</td>
                  <td>
                    <Badge tone={order.days > 7 ? 'bad' : 'warn'}>{order.days} days</Badge>
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
              ))}
              {aged.orders.length === 0 ? (
                <EmptyRow span={7}>
                  Nothing has been held past {aged.windowDays} days.
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
              <RowLink key={entry.id} href={`/ledger/${entry.id}`}>
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
                  {/* The row's real link: the whole row is clickable as a
                      convenience, but that is a mouse affordance only. */}
                  <Link
                    href={`/ledger/${entry.id}`}
                    className="ml-1.5 text-[11px] text-ink3 hover:text-primary"
                  >
                    open
                  </Link>
                </td>
                <td className="text-ink2">{entry.from}</td>
                <td className="text-ink2">{entry.to}</td>
                <td>
                  <Money amount={entry.amount} />
                </td>
                {/* `/ledger` returns the entry's `orderId` but not the order's
                    code, and the panel's own database holds unrelated ids — a
                    local lookup would print a code belonging to some other
                    order, which on a money screen is worse than a blank. */}
                <td className="tnum text-ink2">—</td>
                <td className="max-w-[260px] truncate text-ink2">{entry.note}</td>
                <td className="whitespace-nowrap text-ink2" title={fmtDateTime(entry.at)}>
                  {timeAgo(entry.at)}
                </td>
              </RowLink>
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
