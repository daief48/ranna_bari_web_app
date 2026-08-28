import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { balanceFor } from '@/lib/logic/ledger';
import { taka, fmtDate, fmtDateTime, timeAgo } from '@/lib/format';
import { parseJson } from '@/lib/mappers';
import {
  Avatar,
  Badge,
  Card,
  Field,
  Grid,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  EmptyRow,
  LinkButton,
} from '@/components/ui';
import { KitchenControls } from './controls';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

export default async function KitchenDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('kitchen.read');
  const { id } = await params;
  const user = await currentUser();

  const kitchen = await db.kitchen.findUnique({
    where: { id },
    include: {
      account: true,
      store: { include: { _count: { select: { products: true } } } },
      dishes: { orderBy: { createdAt: 'asc' } },
      _count: { select: { meals: true, orders: true, reviews: true, offers: true } },
    },
  });
  if (!kitchen) notFound();

  const [orders, meals, gmv, cancelled, owed, released] = await Promise.all([
    db.order.findMany({
      where: { kitchenId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.meal.findMany({ where: { kitchenId: id }, orderBy: { serveDate: 'desc' }, take: 8 }),
    db.order.aggregate({
      where: { kitchenId: id, status: { notIn: ['cancelled', 'rejected'] } },
      _sum: { amount: true },
      _count: true,
    }),
    db.order.count({ where: { kitchenId: id, status: { in: ['cancelled', 'rejected'] } } }),
    balanceFor('cook', id),
    db.order.aggregate({
      where: { kitchenId: id, payment: 'released' },
      _sum: { cookAmount: true, platformAmount: true },
    }),
  ]);

  const tags = parseJson<string[]>(kitchen.tags, []);
  const canWrite = can(user?.role ?? '', 'kitchen.write');

  return (
    <>
      <PageHeader
        title={kitchen.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{kitchen.ownerName}</span>
            <span className="text-ink3">·</span>
            <span>{kitchen.area}</span>
            <span className="text-ink3">·</span>
            <span>{kitchen.deliveryRadiusKm} km radius</span>
            <span className="text-ink3">·</span>
            <span>joined {fmtDate(kitchen.createdAt)}</span>
          </span>
        }
        actions={
          <>
            <LinkButton href={`/orders?kitchen=${kitchen.id}`}>Orders</LinkButton>
            <LinkButton href="/kitchens">← All kitchens</LinkButton>
          </>
        }
      />

      {kitchen.suspended ? (
        <div className="mb-5 rounded-[10px] border border-primary-100 bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary">
          <strong>Suspended.</strong> {kitchen.suspendedReason} — this kitchen is hidden
          from browse regardless of whether the cook has it open.
        </div>
      ) : null}

      <Grid cols={4}>
        <Stat label="Lifetime GMV" value={taka(gmv._sum.amount ?? 0)} sub={`${gmv._count} orders`} />
        <Stat
          label="Owed to this cook"
          value={taka(owed)}
          tone={owed > 0 ? 'warn' : 'neutral'}
          sub="Released, not yet paid out"
          href="/payouts"
        />
        <Stat
          label="Paid to this cook"
          value={taka(released._sum.cookAmount ?? 0)}
          tone="good"
          sub={`${taka(released._sum.platformAmount ?? 0)} kept as commission`}
        />
        <Stat
          label="Cancellation rate"
          value={
            gmv._count + cancelled === 0
              ? '—'
              : `${Math.round((cancelled / (gmv._count + cancelled)) * 100)}%`
          }
          tone={cancelled / Math.max(1, gmv._count + cancelled) > 0.15 ? 'bad' : 'neutral'}
          sub={`${cancelled} cancelled or rejected`}
        />
      </Grid>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="Profile">
          <div className="mb-3 flex items-center gap-3">
            <Avatar src={kitchen.avatar} name={kitchen.name} size={44} />
            <div className="min-w-0">
              <div className="truncate font-display text-[15px] font-bold">{kitchen.name}</div>
              <div className="truncate text-[12px] text-ink2">{kitchen.specialty}</div>
            </div>
          </div>

          <p className="mb-3 text-[12.5px] leading-relaxed text-ink2">{kitchen.description}</p>

          <Field label="Verified">
            {kitchen.isVerified ? <Badge tone="good">Yes</Badge> : <Badge tone="warn">No</Badge>}
          </Field>
          <Field label="Open now">
            {kitchen.isOpen ? <Badge tone="info">Open</Badge> : <Badge>Closed</Badge>}
          </Field>
          <Field label="Coordinates">
            <span className="tnum text-[12px] text-ink2">
              {kitchen.lat.toFixed(4)}, {kitchen.lng.toFixed(4)}
            </span>
          </Field>
          <Field label="Eco badge">{kitchen.ecoBadge}</Field>
          <Field label="Tags">
            <span className="flex flex-wrap justify-end gap-1">
              {tags.length ? (
                tags.map((t) => <Badge key={t}>{t}</Badge>)
              ) : (
                <span className="text-ink3">none</span>
              )}
            </span>
          </Field>
        </Card>

        <Card title="Documents" subtitle="KYC — never shown to customers">
          {kitchen.account ? (
            <>
              <Field label="Owner">{kitchen.account.name}</Field>
              <Field label="Phone">{kitchen.account.phone ?? '—'}</Field>
              <Field label="Email">{kitchen.account.email ?? '—'}</Field>
              <Field label="National ID">
                {/* The one field an operator is here to look at. Shown in full
                    because a partial NID cannot be checked against anything. */}
                <span className="tnum">{kitchen.account.nid ?? '—'}</span>
              </Field>
              <Field label="KYC status">
                <StatusBadge status={kitchen.kycStatus} />
              </Field>
              {kitchen.kycDecidedAt ? (
                <Field label="Decided">
                  {fmtDate(kitchen.kycDecidedAt)} by {kitchen.kycDecidedBy}
                </Field>
              ) : null}
              {kitchen.kycNote ? <Field label="Note">{kitchen.kycNote}</Field> : null}
            </>
          ) : (
            <p className="text-[13px] text-ink3">
              No account is linked to this kitchen — it came from the seeded directory
              rather than from a signup.
            </p>
          )}
        </Card>

        <Card title="Operator controls" subtitle={canWrite ? undefined : 'Your role can only read'}>
          {canWrite ? (
            <KitchenControls
              kitchenId={kitchen.id}
              isVerified={kitchen.isVerified}
              suspended={kitchen.suspended}
              area={kitchen.area}
              radiusKm={kitchen.deliveryRadiusKm}
            />
          ) : (
            <p className="text-[13px] text-ink3">
              Verification, suspension and coverage are operations actions. Sign in as
              ops@ or admin@ to use them.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Menu" subtitle={`${kitchen.dishes.length} dishes`} pad={false}>
          <Table head={['Dish', 'Price', 'Listed']}>
            {kitchen.dishes.slice(0, 10).map((dish) => (
              <tr key={dish.id}>
                <td className="max-w-[240px] truncate font-medium">{dish.name}</td>
                <td>
                  <Money amount={dish.price} />
                </td>
                <td>
                  {dish.available ? <Badge tone="good">Available</Badge> : <Badge>Sold out</Badge>}
                </td>
              </tr>
            ))}
            {kitchen.dishes.length === 0 ? <EmptyRow span={3}>No dishes.</EmptyRow> : null}
          </Table>
        </Card>

        <Card
          title="Shop"
          subtitle={kitchen.store ? kitchen.store.name : 'This kitchen has not opened a shop'}
        >
          {kitchen.store ? (
            <>
              <Field label="Status">
                {kitchen.store.isOpen ? <Badge tone="good">Open</Badge> : <Badge>Closed</Badge>}
              </Field>
              <Field label="Products">{kitchen.store._count.products}</Field>
              <Field label="Delivery fee">
                <Money amount={kitchen.store.deliveryFee} />
              </Field>
              <Field label="Free delivery over">
                {kitchen.store.freeDeliveryOver ? (
                  <Money amount={kitchen.store.freeDeliveryOver} />
                ) : (
                  <span className="text-ink3">never</span>
                )}
              </Field>
              <div className="mt-3">
                <Link
                  href={`/stores?q=${encodeURIComponent(kitchen.store.name)}`}
                  className="text-[12.5px] font-semibold text-primary hover:underline"
                >
                  Open in stores →
                </Link>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-ink3">
              Nothing to show. A cook opens a shop from the cook panel in the app.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Recent orders" pad={false}>
          <Table head={['Code', 'Kind', 'Status', 'Amount', 'When']}>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link
                    href={`/orders/${order.id}`}
                    className="tnum font-semibold hover:text-primary"
                  >
                    {order.code}
                  </Link>
                </td>
                <td className="text-ink2">{order.kind}</td>
                <td>
                  <StatusBadge status={order.status} />
                </td>
                <td>
                  <Money amount={order.amount} />
                </td>
                <td className="text-ink2">{timeAgo(order.createdAt)}</td>
              </tr>
            ))}
            {orders.length === 0 ? <EmptyRow span={5}>No orders yet.</EmptyRow> : null}
          </Table>
        </Card>

        <Card title="Meals" subtitle={`${kitchen._count.meals} published`} pad={false}>
          <Table head={['Meal', 'Serve', 'Slot', 'Status']}>
            {meals.map((meal) => (
              <tr key={meal.id}>
                <td className="max-w-[200px] truncate font-medium">{meal.title}</td>
                <td className="tnum text-ink2">{meal.serveDate}</td>
                <td className="text-ink2 capitalize">{meal.slot}</td>
                <td>
                  <StatusBadge status={meal.status} />
                </td>
              </tr>
            ))}
            {meals.length === 0 ? <EmptyRow span={4}>No meals.</EmptyRow> : null}
          </Table>
        </Card>
      </div>

      <p className="mt-6 text-[11.5px] text-ink3">
        Kitchen id {kitchen.id} · last updated {fmtDateTime(kitchen.updatedAt)}
      </p>
    </>
  );
}
