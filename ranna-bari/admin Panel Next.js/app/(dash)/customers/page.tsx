import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { paging, pageCount } from '@/lib/queries';
import {
  Avatar,
  Badge,
  Card,
  Grid,
  Money,
  MoneyStat,
  PageHeader,
  Stat,
  Table,
  EmptyRow,
} from '@/components/ui';
import { RowLink } from '@/components/ui/row-link';
import { SearchBox, FilterSelect, Pager } from '@/components/ui/client';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Customers · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/**
 * One row of `GET /accounts`.
 *
 * `orders`, `spent` and `held` are folded server-side across the whole
 * history — not counted from anything this page fetched — so the numbers mean
 * the same thing on page one and page nine.
 */
type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  area: string;
  role: string;
  orders: number;
  spent: number;
  lastOrderAt: string | null;
  wallet: number;
  held: number;
  addresses: number;
  state: 'active' | 'dormant' | 'new';
};

/** How long ago, in the words an operator would use out loud. */
function ago(iso: string | null) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

const STATE: Record<string, { tone: 'good' | 'warn' | 'neutral'; label: string }> = {
  active: { tone: 'good', label: 'Active' },
  dormant: { tone: 'warn', label: 'Dormant' },
  new: { tone: 'neutral', label: 'Never ordered' },
};

/**
 * The people who buy the food.
 *
 * Every other list in this panel is about supply — kitchens, menus, shelves,
 * payouts. This is the half that was missing: until it existed, an operator
 * taking a support call could not look the caller up by the number they were
 * calling from, and every conversation in `/chat` was with somebody the panel
 * could not describe.
 *
 * Sorted by most recent activity rather than by sign-up, because the question
 * a desk actually asks is "who is live right now".
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('order.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);

  const query = new URLSearchParams({ skip: String(skip), take: String(take) });
  if (params.q) query.set('q', params.q);
  if (params.area) query.set('area', params.area);
  if (params.state) query.set('state', params.state);

  let rows: CustomerRow[] = [];
  let total = 0;

  try {
    const data = await get<{ accounts: CustomerRow[]; total: number }>(`/accounts?${query}`);
    rows = data.accounts;
    total = data.total;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return <BackendDown title="Customers" subtitle="Everyone who has an account" />;
    }
    throw error;
  }

  /* Folded over the page rather than the whole table: these say "of the
     customers you are looking at", which is what a filtered view should. */
  const walletTotal = rows.reduce((sum, r) => sum + r.wallet, 0);
  const heldTotal = rows.reduce((sum, r) => sum + r.held, 0);
  const neverOrdered = rows.filter((r) => r.state === 'new').length;

  const areas = [...new Set(rows.map((r) => r.area).filter(Boolean))].sort();

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${total.toLocaleString('en-US')} accounts`}
      />

      <Grid cols={4}>
        <Stat label="On this page" value={rows.length.toLocaleString('en-US')} />
        <MoneyStat label="In their wallets" amount={walletTotal} />
        <MoneyStat label="Held against orders" amount={heldTotal} tone="warn" />
        <Stat
          label="Never ordered"
          value={neverOrdered.toLocaleString('en-US')}
          sub="signed up, never bought"
          tone={neverOrdered ? 'warn' : 'neutral'}
        />
      </Grid>

      <Card
        pad={false}
        title="All customers"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* A support call gives you a number or a name and nothing else. */}
            <SearchBox placeholder="Phone, name or email…" />
            <FilterSelect
              name="area"
              allLabel="All areas"
              options={areas.map((a) => ({ value: a, label: a }))}
            />
            <FilterSelect
              name="state"
              allLabel="Any state"
              options={[
                { value: 'active', label: 'Ordered in 30 days' },
                { value: 'dormant', label: 'Gone quiet' },
                { value: 'new', label: 'Never ordered' },
              ]}
            />
          </div>
        }
      >
        <Table
          head={[
            'Customer',
            'Area',
            'Orders',
            'Spent',
            'Wallet',
            'Held',
            'Last order',
            'State',
          ]}
        >
          {rows.map((customer) => (
            <RowLink key={customer.id} href={`/customers/${customer.id}`}>
              <td>
                <Link
                  href={`/customers/${customer.id}`}
                  className="flex items-center gap-2.5 hover:text-primary"
                >
                  <Avatar name={customer.name || customer.phone} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {customer.name || <span className="text-ink3">No name given</span>}
                    </span>
                    <span className="tnum block truncate text-[11.5px] text-ink3">
                      {customer.phone}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="text-ink2">{customer.area || <span className="text-ink3">—</span>}</td>
              <td className="tnum">{customer.orders || <span className="text-ink3">0</span>}</td>
              <td className="tnum font-medium">
                {customer.spent ? (
                  <Money amount={customer.spent} bold />
                ) : (
                  <span className="text-ink3">—</span>
                )}
              </td>
              <td className="tnum">
                {customer.wallet ? <Money amount={customer.wallet} /> : <span className="text-ink3">—</span>}
              </td>
              <td className="tnum">
                {customer.held ? (
                  <Money amount={customer.held} tone="warn" />
                ) : (
                  <span className="text-ink3">—</span>
                )}
              </td>
              <td className="text-ink2">{ago(customer.lastOrderAt)}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  <Badge tone={STATE[customer.state].tone}>{STATE[customer.state].label}</Badge>
                  {customer.role === 'cook' ? <Badge tone="info">Cook</Badge> : null}
                </div>
              </td>
            </RowLink>
          ))}
          {rows.length === 0 ? (
            <EmptyRow span={8}>No customer matches that.</EmptyRow>
          ) : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>
    </>
  );
}
