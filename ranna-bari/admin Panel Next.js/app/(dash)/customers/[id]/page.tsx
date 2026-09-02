import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { fmtDateTime, timeAgo } from '@/lib/format';
import {
  Avatar,
  Badge,
  Card,
  EmptyRow,
  Field,
  Grid,
  Money,
  MoneyStat,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
} from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

type Address = {
  id: string;
  label: string;
  area: string;
  detail: string;
  instructions?: string;
  lat: number | null;
  lng: number | null;
  selected?: boolean;
};

type Detail = {
  account: {
    id: string;
    customerKey: string;
    name: string;
    phone: string;
    email: string;
    avatar: string;
    role: string;
    area: string;
    addressDetail: string;
    addressLabel: string;
    lat: number | null;
    lng: number | null;
    addresses: Address[];
    createdAt: string | null;
  };
  wallet: number;
  lifetime: number;
  orders: Array<{
    id: string;
    code: string;
    kind: string;
    title: string;
    cookName: string;
    status: string;
    payment?: string;
    amount: number;
    createdAt: string;
  }>;
  ledger: Array<{
    id: string;
    kind: string;
    from: string;
    to: string;
    amount: number;
    note?: string;
    createdAt: string;
  }>;
  requests: Array<{ id: string; code: string; title: string; status: string; createdAt: string }>;
  reviews: Array<{ id: string; rating: number; body?: string; createdAt: string }>;
  threads: Array<{ id: string; side?: string; kitchenName?: string; updatedAt: string }>;
};

/**
 * One customer, with everything a support conversation needs in one place.
 *
 * The order this is laid out in is the order the questions get asked: who is
 * this, where were they sending it, what did they order, and where did the
 * money go. The ledger is last because it is the answer to "I was charged
 * twice" — the question that used to mean reading the whole ledger by hand.
 */
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage('order.read');
  const { id } = await params;

  let data: Detail;
  try {
    data = await get<Detail>(`/accounts/${id}`);
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return <BackendDown title="Customer" subtitle="Reading this account from the backend" />;
    }
    if (error instanceof BackendError && error.status === 404) notFound();
    throw error;
  }

  const { account, wallet, lifetime, orders, ledger, requests, reviews, threads } = data;

  const held = ledger
    .filter((e) => e.kind === 'hold' && e.from === 'customer')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <>
      <PageHeader
        title={account.name || account.phone}
        subtitle={account.name ? account.phone : 'No name on the account'}
      />

      <Grid cols={4}>
        <Stat label="Orders" value={orders.length.toLocaleString('en-US')} />
        <MoneyStat label="Spent with us" amount={lifetime} />
        <MoneyStat label="Wallet balance" amount={wallet} />
        <MoneyStat label="Held against orders" amount={held} tone={held ? 'warn' : 'neutral'} />
      </Grid>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="flex flex-col gap-4">
          <Card title="Orders" subtitle="Every system, newest first" pad={false}>
            <Table head={['Code', 'What', 'Kitchen', 'Status', 'Amount', 'When']}>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/orders/${order.id}`} className="tnum hover:text-primary">
                      {order.code}
                    </Link>
                  </td>
                  <td className="max-w-[220px] truncate">{order.title}</td>
                  <td className="text-ink2">{order.cookName}</td>
                  <td><StatusBadge status={order.status} /></td>
                  <td className="tnum"><Money amount={order.amount} /></td>
                  <td className="text-ink3">{timeAgo(order.createdAt)}</td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <EmptyRow span={6}>This account has never ordered.</EmptyRow>
              ) : null}
            </Table>
          </Card>

          <Card
            title="Every taka"
            subtitle="Top-ups, holds, releases and refunds against this account"
            pad={false}
          >
            <Table head={['Kind', 'From', 'To', 'Amount', 'Note', 'When']}>
              {ledger.map((entry) => (
                <tr key={entry.id}>
                  <td><StatusBadge status={entry.kind} /></td>
                  <td className="text-ink2">{entry.from}</td>
                  <td className="text-ink2">{entry.to}</td>
                  <td className="tnum"><Money amount={entry.amount} /></td>
                  <td className="max-w-[200px] truncate text-ink3">{entry.note ?? '—'}</td>
                  <td className="text-ink3">{timeAgo(entry.createdAt)}</td>
                </tr>
              ))}
              {ledger.length === 0 ? (
                <EmptyRow span={6}>No money has moved on this account.</EmptyRow>
              ) : null}
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="The account">
            <div className="mb-3 flex items-center gap-3">
              <Avatar src={account.avatar} name={account.name || account.phone} />
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {account.name || <span className="text-ink3">No name given</span>}
                </div>
                <div className="tnum truncate text-[12px] text-ink3">{account.phone}</div>
              </div>
            </div>
            <Field label="Email">{account.email || '—'}</Field>
            <Field label="Role">
              {account.role === 'cook' ? <Badge tone="info">Cook</Badge> : 'Customer'}
            </Field>
            <Field label="Area">{account.area || '—'}</Field>
            <Field label="Joined">
              {account.createdAt ? fmtDateTime(account.createdAt) : '—'}
            </Field>
          </Card>

          <Card
            title="Where it goes"
            subtitle={`${account.addresses.length} saved`}
          >
            {account.addresses.length === 0 ? (
              <p className="text-[13px] text-ink3">
                No address on file — nothing can be delivered to this account yet.
              </p>
            ) : (
              account.addresses.map((address) => (
                <div key={address.id} className="border-b border-line2 py-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{address.label}</span>
                    {address.selected ? <Badge tone="good">Delivering here</Badge> : null}
                  </div>
                  <div className="text-[12.5px] text-ink2">
                    {[address.detail, address.area].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {address.lat != null && address.lng != null ? (
                    <div className="tnum text-[11px] text-ink3">
                      {address.lat.toFixed(5)}, {address.lng.toFixed(5)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-warn">No pin — distance cannot be measured</div>
                  )}
                </div>
              ))
            )}
          </Card>

          <Card title="Asked for" subtitle="Custom food requests">
            {requests.length === 0 ? (
              <p className="text-[13px] text-ink3">Never posted a request.</p>
            ) : (
              requests.map((request) => (
                <Field key={request.id} label={request.title}>
                  <Link href={`/requests/${request.id}`} className="hover:text-primary">
                    <StatusBadge status={request.status} />
                  </Link>
                </Field>
              ))
            )}
          </Card>

          <Card title="Wrote" subtitle="Reviews left for kitchens">
            {reviews.length === 0 ? (
              <p className="text-[13px] text-ink3">No reviews written.</p>
            ) : (
              reviews.map((review) => (
                <Field key={review.id} label={`${review.rating}★`}>
                  <span className="text-ink2">{review.body?.slice(0, 60) || '—'}</span>
                </Field>
              ))
            )}
          </Card>

          <Card title="Conversations" subtitle="Support and cook threads">
            {threads.length === 0 ? (
              <p className="text-[13px] text-ink3">Has never messaged anybody.</p>
            ) : (
              threads.map((thread) => (
                <Field key={thread.id} label={thread.kitchenName || 'Support desk'}>
                  <span className="text-ink3">{timeAgo(thread.updatedAt)}</span>
                </Field>
              ))
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
