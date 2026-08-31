import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { getSettings } from '@/lib/settings';
import { taka, timeAgo, daysSince } from '@/lib/format';
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
import { RowLink } from '@/components/ui/row-link';
import { SearchBox, FilterSelect, Pager, ActionButton } from '@/components/ui/client';

import { StockCell, DelistButton, StoreToggle } from './stock';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Stores & products · RannaBari Admin' };
export const dynamic = 'force-dynamic';

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('order.read');
  const params = await searchParams;
  const view = params.view ?? 'stores';
  const { page, skip, take } = paging(params);
  const user = await currentUser();
  const canWrite = can(user?.role ?? '', 'store.write');
  const settings = await getSettings();
  const stockCutoff = new Date(Date.now() - settings.stockAlarmDays * 86_400_000);

  const [storeCount, openCount, productCount, alarmCount, preorderCount] = await Promise.all([
    db.store.count(),
    db.store.count({ where: { isOpen: true } }),
    db.product.count({ where: { active: true } }),
    db.product.count({ where: { active: true, stock: 0, outOfStockSince: { lt: stockCutoff } } }),
    db.order.count({ where: { status: 'pending', preorder: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Stores & products"
        subtitle="A shop per kitchen — jars, frozen things and sweets off the shelf"
        actions={
          <div className="flex flex-wrap gap-2">
            <Tab href="/stores" active={view === 'stores'}>
              Stores
            </Tab>
            <Tab href="/stores?view=stock" active={view === 'stock'}>
              Stock alarm ({alarmCount})
            </Tab>
            <Tab href="/stores?view=preorders" active={view === 'preorders'}>
              Pre-orders ({preorderCount})
            </Tab>
          </div>
        }
      />

      <Grid cols={4}>
        <Stat label="Shops" value={storeCount} sub={`${openCount} open now`} />
        <Stat label="Listed products" value={productCount} />
        <Stat
          label="Stuck at zero stock"
          value={alarmCount}
          tone={alarmCount > 0 ? 'warn' : 'good'}
          sub={`listed, unbuyable, for over ${settings.stockAlarmDays} days`}
          href="/stores?view=stock"
        />
        <Stat
          label="Pre-orders waiting"
          value={preorderCount}
          tone={preorderCount > 0 ? 'warn' : 'good'}
          sub="on a cook to accept or decline"
          href="/stores?view=preorders"
        />
      </Grid>

      {view === 'stores' ? <StoresTable page={page} skip={skip} take={take} params={params} canWrite={canWrite} /> : null}
      {view === 'stock' ? (
        <StockTable cutoff={stockCutoff} days={settings.stockAlarmDays} canWrite={canWrite} />
      ) : null}
      {view === 'preorders' ? <PreorderTable /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */

async function StoresTable({
  page,
  skip,
  take,
  params,
  canWrite,
}: {
  page: number;
  skip: number;
  take: number;
  params: Record<string, string | undefined>;
  canWrite: boolean;
}) {
  const where: Prisma.StoreWhereInput = {};
  if (params.q) where.name = { contains: params.q };
  if (params.open === 'yes') where.isOpen = true;
  if (params.open === 'no') where.isOpen = false;

  const [rows, total] = await Promise.all([
    db.store.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        kitchen: { select: { id: true, name: true, area: true } },
        _count: { select: { products: true, categories: true, orders: true } },
      },
    }),
    db.store.count({ where }),
  ]);

  return (
    <Card
      className="mt-3"
      pad={false}
      title="Shops"
      actions={
        <div className="flex flex-wrap gap-2">
          <SearchBox placeholder="Shop name…" />
          <FilterSelect
            name="open"
            allLabel="Any state"
            options={[
              { value: 'yes', label: 'Open' },
              { value: 'no', label: 'Closed' },
            ]}
          />
        </div>
      }
    >
      <Table
        head={['Shop', 'Kitchen', 'Area', 'Shelves', 'Products', 'Orders', 'Delivery', 'State', '']}
      >
        {rows.map((store) => (
          <RowLink key={store.id} href={`/stores/${store.id}`}>
            <td className="max-w-[190px] truncate font-medium">{store.name}</td>
            <td className="max-w-[150px] truncate text-ink2">
              <Link href={`/kitchens/${store.kitchen.id}`} className="hover:text-primary">
                {store.kitchen.name}
              </Link>
            </td>
            <td className="text-ink2">{store.kitchen.area}</td>
            <td className="tnum">{store._count.categories}</td>
            <td className="tnum">{store._count.products}</td>
            <td className="tnum">{store._count.orders}</td>
            <td>
              <Money amount={store.deliveryFee} />
              {store.freeDeliveryOver ? (
                <span className="ml-1 text-[11px] text-ink3">
                  free over {taka(store.freeDeliveryOver)}
                </span>
              ) : null}
            </td>
            <td>{store.isOpen ? <Badge tone="good">Open</Badge> : <Badge>Closed</Badge>}</td>
            <td>
              {canWrite ? (
                <StoreToggle storeId={store.id} isOpen={store.isOpen} />
              ) : null}
            </td>
          </RowLink>
        ))}
        {rows.length === 0 ? <EmptyRow span={9}>No shop matches that.</EmptyRow> : null}
      </Table>

      <Pager page={page} pages={pageCount(total)} total={total} />
    </Card>
  );
}

async function StockTable({
  cutoff,
  days,
  canWrite,
}: {
  cutoff: Date;
  days: number;
  canWrite: boolean;
}) {
  const rows = await db.product.findMany({
    where: { active: true, stock: 0 },
    orderBy: { outOfStockSince: 'asc' },
    take: 60,
    include: { store: { select: { name: true, isOpen: true, kitchenId: true } } },
  });

  return (
    <>
      <GapNote>
        <strong>Why this list exists.</strong> These products are still{' '}
        <code>active</code> — listed, visible, tappable — and hold zero stock, so every
        customer who opens one is told it is unavailable. Nothing in the app watches
        for this. A shelf that has been empty for a fortnight looks exactly like a
        shelf that sold out an hour ago.
      </GapNote>

      <Card
        title={`${rows.length} listed products with nothing on the shelf`}
        subtitle={`Flagged after ${days} days`}
        pad={false}
      >
        <Table head={['Product', 'Shop', 'Price', 'Empty since', 'Age', 'Set stock', 'Delist']}>
          {rows.map((product) => {
            const age = product.outOfStockSince ? daysSince(product.outOfStockSince) : 0;
            const overdue = product.outOfStockSince
              ? product.outOfStockSince < cutoff
              : false;
            return (
              <tr key={product.id}>
                <td className="max-w-[220px] truncate font-medium">{product.name}</td>
                <td className="max-w-[160px] truncate text-ink2">
                  {product.store.name}
                  {!product.store.isOpen ? (
                    <span className="ml-1.5">
                      <Badge>shop closed</Badge>
                    </span>
                  ) : null}
                </td>
                <td>
                  <Money amount={product.price} />
                </td>
                <td className="whitespace-nowrap text-ink2">
                  {product.outOfStockSince ? timeAgo(product.outOfStockSince) : '—'}
                </td>
                <td>
                  {overdue ? (
                    <Badge tone={age > 7 ? 'bad' : 'warn'}>{age} days</Badge>
                  ) : (
                    <Badge>{age} days</Badge>
                  )}
                </td>
                <td>{canWrite ? <StockCell productId={product.id} /> : null}</td>
                <td>{canWrite ? <DelistButton productId={product.id} /> : null}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <EmptyRow span={7}>Every listed product has stock behind it.</EmptyRow>
          ) : null}
        </Table>
      </Card>
    </>
  );
}

async function PreorderTable() {
  const rows = await db.order.findMany({
    where: { status: 'pending', preorder: true },
    orderBy: { createdAt: 'asc' },
    take: 60,
    include: { kitchen: { select: { id: true, name: true } } },
  });

  return (
    <>
      <GapNote>
        <strong>Why this list exists.</strong> A pre-order enters at{' '}
        <code>pending</code> and waits for the cook to accept or decline it. Nothing
        chases them. The customer&rsquo;s money is already held, so a cook who never
        opens the app leaves a customer paid-up and waiting indefinitely.
      </GapNote>

      <Card title={`${rows.length} pre-orders waiting on a cook`} pad={false}>
        <Table head={['Order', 'Item', 'Kitchen', 'Customer', 'Held', 'Waiting', '']}>
          {rows.map((order) => {
            const age = daysSince(order.createdAt);
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
                <td className="max-w-[200px] truncate">{order.title}</td>
                <td className="max-w-[150px] truncate text-ink2">
                  <Link href={`/kitchens/${order.kitchen.id}`} className="hover:text-primary">
                    {order.kitchen.name}
                  </Link>
                </td>
                <td className="max-w-[130px] truncate text-ink2">{order.customerName}</td>
                <td>
                  <Money amount={order.amount} tone="warn" />
                </td>
                <td>
                  <Badge tone={age > 3 ? 'bad' : age > 1 ? 'warn' : 'neutral'}>
                    {timeAgo(order.createdAt)}
                  </Badge>
                </td>
                <td className="text-right">
                  <Link
                    href={`/orders/${order.id}`}
                    className="text-[12px] font-semibold text-primary hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <EmptyRow span={7}>No pre-order is waiting on anybody.</EmptyRow>
          ) : null}
        </Table>
      </Card>
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
