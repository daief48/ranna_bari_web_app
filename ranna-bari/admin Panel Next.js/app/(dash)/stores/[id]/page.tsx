import Link from 'next/link';
import { notFound } from 'next/navigation';

import { get } from '@/lib/backend';
import { taka, fmtDate, fmtDateTime, timeAgo } from '@/lib/format';
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

type Shelf = { id: string; name: string; emoji: string | null; products: number };

type ProductRow = {
  id: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  preorder: boolean;
  outOfStockSince: string | null;
  categoryName: string | null;
};

type OrderRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  amount: number;
  customerName: string;
  createdAt: string;
};

export default async function StoreDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('order.read');
  const { id } = await params;

  /* The shops board serves this database's ids, so the shop is read from it
     too. Everything the page draws comes back in one call. */
  const loaded = await get<{
    store: Record<string, unknown>;
    kitchen: { id: string; name: string; area: string; isVerified: boolean } | null;
    categories: Shelf[];
    products: ProductRow[];
    counts: { products: number; empty: number; preorder: number; orders: number };
    orders: OrderRow[];
    revenue: number;
  }>(`/stores/${id}`).catch(() => null);

  /* A shop without its kitchen has no owner to name and no link to follow —
     the header alone is built from it. */
  if (!loaded || !loaded.kitchen) notFound();

  /* Reshaped into what the markup below already reads. */
  const store = {
    ...loaded.store,
    kitchen: loaded.kitchen,
    categories: loaded.categories.map((c) => ({ ...c, _count: { products: c.products } })),
    _count: { products: loaded.counts.products, orders: loaded.counts.orders },
  } as Record<string, never> & {
    id: string;
    name: string;
    tagline: string | null;
    description: string | null;
    phone: string | null;
    area: string | null;
    isOpen: boolean;
    deliveryFee: number;
    deliveryRadiusKm: number | null;
    freeDeliveryOver: number | null;
    kitchenId: string;
    createdAt: string;
    updatedAt: string;
    kitchen: NonNullable<typeof loaded.kitchen>;
    categories: (Shelf & { _count: { products: number } })[];
    _count: { products: number; orders: number };
  };

  const products = loaded.products.map((p) => ({
    ...p,
    /* The endpoint flattens the shelf to a name, which is all the row shows. */
    category: p.categoryName ? { name: p.categoryName } : null,
  }));
  const outOfStock = loaded.counts.empty;
  const preorders = loaded.counts.preorder;
  const recentOrders = loaded.orders;
  const revenue = { _sum: { amount: loaded.revenue } };

  return (
    <>
      <PageHeader
        title={store.name || store.kitchen.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/kitchens/${store.kitchen.id}`} className="hover:text-primary">
              {store.kitchen.name}
            </Link>
            <span className="text-ink3">·</span>
            <span>{store.area || store.kitchen.area}</span>
            <span className="text-ink3">·</span>
            {store.isOpen ? <Badge tone="good">Open</Badge> : <Badge tone="neutral">Closed</Badge>}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/orders?kitchen=${store.kitchenId}`}>Its orders →</LinkButton>
            <LinkButton href="/stores">← All shops</LinkButton>
          </>
        }
      />

      <Grid cols={4}>
        <Stat label="Products" value={store._count.products} sub={`${store.categories.length} shelves`} />
        <Stat
          label="Out of stock"
          value={outOfStock}
          tone={outOfStock > 0 ? 'warn' : 'good'}
          sub={outOfStock > 0 ? 'Listed but unbuyable' : 'Everything listed is buyable'}
        />
        <Stat label="Orders" value={store._count.orders} sub="All time" />
        <Stat label="Taken" value={taka(revenue._sum.amount ?? 0)} sub="Across every order" />
      </Grid>

      <Grid cols={2}>
        <Card className="mt-3" title="The shop">
          <Field label="Name">{store.name || <span className="text-ink3">Unnamed</span>}</Field>
          <Field label="Tagline">{store.tagline || <span className="text-ink3">—</span>}</Field>
          <Field label="Kitchen">
            <Link href={`/kitchens/${store.kitchen.id}`} className="hover:text-primary">
              {store.kitchen.name}
            </Link>
          </Field>
          <Field label="Area">{store.area || <span className="text-ink3">—</span>}</Field>
          <Field label="Phone">{store.phone || <span className="text-ink3">—</span>}</Field>
          <Field label="State">
            {store.isOpen ? <Badge tone="good">Open</Badge> : <Badge tone="neutral">Closed</Badge>}
          </Field>
          <Field label="Opened">{fmtDate(store.createdAt)}</Field>
        </Card>

        <Card className="mt-3" title="Delivery">
          <Field label="Delivery fee">
            <Money amount={store.deliveryFee} />
          </Field>
          <Field label="Free over">
            {store.freeDeliveryOver ? (
              taka(store.freeDeliveryOver)
            ) : (
              <span className="text-ink3">Never free</span>
            )}
          </Field>
          <Field label="Radius">
            {store.deliveryRadiusKm != null ? (
              `${store.deliveryRadiusKm} km`
            ) : (
              <span className="text-ink3">Not set</span>
            )}
          </Field>
          <Field label="Preorder items">{preorders}</Field>
          <Field label="Last changed">{fmtDateTime(store.updatedAt)}</Field>
        </Card>
      </Grid>

      {store.description ? (
        <Card className="mt-3" title="Description">
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink2">
            {store.description}
          </p>
        </Card>
      ) : null}

      {store.categories.length > 0 ? (
        <Card className="mt-3" title="Shelves">
          <div className="flex flex-wrap gap-2">
            {store.categories.map((cat) => (
              <span
                key={cat.id}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-line bg-sunken px-2.5 py-1 text-[12.5px]"
              >
                {cat.emoji ? <span aria-hidden>{cat.emoji}</span> : null}
                <span className="text-ink">{cat.name}</span>
                <span className="tnum text-ink3">{cat._count.products}</span>
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Card
        className="mt-3"
        title="Products"
        subtitle={
          store._count.products > products.length
            ? `First ${products.length} of ${store._count.products}, out of stock first`
            : undefined
        }
        pad={false}
      >
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Shelf</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th>State</th>
                <th>Out of stock since</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="max-w-[220px] truncate font-medium">{product.name}</td>
                  <td className="text-ink2">
                    {product.category?.name ?? <span className="text-ink3">—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Money amount={product.price} />
                  </td>
                  <td
                    className={`tnum ${product.stock === 0 ? 'text-primary' : 'text-ink'}`}
                    style={{ textAlign: 'right' }}
                  >
                    {product.stock}
                  </td>
                  <td>
                    {!product.active ? (
                      <Badge tone="neutral">Hidden</Badge>
                    ) : product.preorder ? (
                      <Badge tone="info">Preorder</Badge>
                    ) : product.stock === 0 ? (
                      <Badge tone="bad">Out</Badge>
                    ) : (
                      <Badge tone="good">Listed</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-ink2">
                    {product.outOfStockSince ? (
                      timeAgo(product.outOfStockSince)
                    ) : (
                      <span className="text-ink3">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[13px] text-ink3">
                    This shop has no products yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-3" title="Recent orders" pad={false}>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Item</th>
                <th>Customer</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
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
                  <td className="max-w-[140px] truncate text-ink2">{order.customerName}</td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Money amount={order.amount} />
                  </td>
                  <td className="whitespace-nowrap text-ink2">{timeAgo(order.createdAt)}</td>
                </tr>
              ))}
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[13px] text-ink3">
                    No orders through this shop yet.
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
