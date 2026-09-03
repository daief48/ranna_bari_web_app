import Link from 'next/link';
import { notFound } from 'next/navigation';

import { get } from '@/lib/backend';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { balanceFor } from '@/lib/logic/ledger';
import { taka, fmtDate, fmtDateTime, timeAgo } from '@/lib/format';
import { parseJson } from '@/lib/mappers';
import {
  Avatar,
  KitchenPhotos,
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
import { KycDecision } from '../../kyc/decision';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/**
 * One kitchen, from whichever store actually holds it.
 *
 * ## Why there are two reads
 *
 * The list on `/kitchens` is served by `GET /kitchens`, so every id it links
 * with is a Mongo ObjectId. This page used to read Prisma only, whose ids are
 * cuids — so *every* link off that board landed on `notFound()`. The page
 * worked exactly once: against locally seeded rows nothing links to.
 *
 * `GET /kitchens/:id` exists now (it did not when this page was written, which
 * is what the previous comment here said), and it returns the store, dishes,
 * recent orders, meals, counts and money in one round trip. So: try the
 * backend first, because that is where the links come from, and fall back to
 * Prisma for a cuid the backend has never seen.
 *
 * Both are shaped into the same object, so the render below does not know or
 * care which one answered.
 */
type Remote = {
  kitchen: Record<string, unknown> & { id: string; tags?: unknown };
  store:
    | {
        id: string;
        name: string;
        isOpen: boolean;
        deliveryFee: number;
        freeDeliveryOver: number | null;
        productCount: number;
      }
    | null;
  dishes: { id: string; name: string; price: number; available: boolean }[];
  orders: {
    id: string;
    code: string;
    kind: string;
    status: string;
    amount: number;
    createdAt: string;
  }[];
  meals: { id: string; title: string; serveDate: string; slot: string; status: string }[];
  counts: { orders: number; cancelled: number; meals: number; reviews: number };
  money: { gmv: number; owed: number; releasedToCook: number; platformTook: number };
};

/**
 * The shape the render works against, declared once so both branches have to
 * meet it. Without it TypeScript infers a union of two structurally different
 * objects and every `kitchen.name` below stops compiling.
 *
 * Dates are `Date | string` because Prisma hands back the first and JSON the
 * second; `fmtDate` and `timeAgo` already take either.
 */
type KitchenView = {
  kitchen: {
    id: string;
    name: string;
    ownerName: string;
    avatar: string;
    /** The shopfront banner, and the gallery submitted at registration. */
    coverImage: string | null;
    photos: string[] | null;
    specialty: string;
    /** The rest of what they cook — the multi-select, beside the primary. */
    specialties: string[] | null;
    rating: number;
    reviewCount: number;
    accountId: string | null;
    description: string;
    tags: unknown;
    ecoBadge: string;
    isVerified: boolean;
    area: string;
    lat: number;
    lng: number;
    deliveryRadiusKm: number;
    isOpen: boolean;
    suspended: boolean;
    suspendedReason: string | null;
    kycStatus: string;
    kycNote: string | null;
    kycDecidedAt: Date | string | null;
    kycDecidedBy: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    account: { name: string; phone: string | null; email: string | null; nid: string | null } | null;
    store:
      | {
          name: string;
          isOpen: boolean;
          deliveryFee: number;
          freeDeliveryOver: number | null;
          _count: { products: number };
        }
      | null;
    dishes: { id: string; name: string; price: number; available: boolean }[];
    _count: { meals: number; orders: number; reviews: number; offers: number };
  };
  orders: {
    id: string;
    code: string;
    kind: string;
    status: string;
    amount: number;
    createdAt: Date | string;
  }[];
  meals: { id: string; title: string; serveDate: string; slot: string; status: string }[];
  gmv: { _sum: { amount: number | null }; _count: number };
  cancelled: number;
  owed: number;
  released: { _sum: { cookAmount: number | null; platformAmount: number | null } };
};

async function loadKitchen(id: string): Promise<KitchenView | null> {
  const remote = await get<Remote>(`/kitchens/${id}`).catch(() => null);

  if (remote) {
    const k = remote.kitchen as unknown as KitchenView['kitchen'];
    return {
      kitchen: {
        ...k,
        id: remote.kitchen.id,
        /* The owner, joined by the endpoint. This was hardcoded null with
           a comment saying the endpoint did not provide it — which was true,
           and stopped being true the moment it did. A mapper that overrides a
           real field with null is invisible: the type still fits, the page
           still renders, and it quietly claims every cook is a seeded row. */
        account: (remote.kitchen.account ?? null) as
          | { name: string; phone: string | null; email: string | null; nid: string | null }
          | null,
        store: remote.store
          ? { ...remote.store, _count: { products: remote.store.productCount } }
          : null,
        dishes: remote.dishes,
        /* The endpoint carries no offer count, and `orders` here is the
           lifetime figure rather than the ten rows it also returns. */
        _count: {
          meals: remote.counts.meals,
          orders: remote.counts.orders,
          reviews: remote.counts.reviews,
          offers: 0,
        },
      },
      orders: remote.orders,
      meals: remote.meals,
      gmv: { _sum: { amount: remote.money.gmv }, _count: remote.counts.orders },
      cancelled: remote.counts.cancelled,
      owed: remote.money.owed,
      released: {
        _sum: {
          cookAmount: remote.money.releasedToCook,
          platformAmount: remote.money.platformTook,
        },
      },
    };
  }

  /* No fallback to the panel's own database. When the backend cannot answer,
     the honest result is nothing found — a stale mirror rendered as if it were
     live is the failure that hides itself. */
  return null;
}

export default async function KitchenDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('kitchen.read');
  const { id } = await params;
  const user = await currentUser();

  const data = await loadKitchen(id);
  if (!data) notFound();

  const { kitchen, orders, meals, gmv, cancelled, owed, released } = data;

  /* Prisma keeps tags as a JSON string; Mongo hands back a real array. Passing
     an array to `parseJson` would stringify it into `JSON.parse`, fail, and
     silently return the empty fallback — every tag on the page disappearing
     with nothing to show for it. */
  const tags = Array.isArray(kitchen.tags)
    ? (kitchen.tags as string[])
    : parseJson<string[]>(String(kitchen.tags ?? ''), []);
  /* The primary first and never twice: `specialty` is one of `specialties`
     on a kitchen registered since the picker went multi-select, and one that
     registered before it has only the primary. */
  const specialties = [
    kitchen.specialty,
    ...(Array.isArray(kitchen.specialties) ? kitchen.specialties : []),
  ].filter((s, i, all) => s && all.indexOf(s) === i);

  const canWrite = can(user?.role ?? '', 'kitchen.write');
  /* Its own capability, and not `kitchen.write`: deciding whether somebody
     may cook for strangers is a different permission from editing their
     delivery radius, and the backend already separates them. */
  const canDecideKyc = can(user?.role ?? '', 'kyc.decide');

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

      {/* Above the three columns, not inside one: this is the kitchen
          itself, and it is the first thing worth looking at on the page. */}
      <Card
        className="mt-3"
        title="Photographs"
        subtitle="Submitted by the cook — the cover is what customers see on the card"
      >
        <KitchenPhotos
          cover={kitchen.coverImage}
          photos={kitchen.photos}
          empty="No photographs on this kitchen."
        />
      </Card>

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

          <div className="label mb-1.5">Submitted by the cook</div>
          <Field label="Owner">{kitchen.ownerName || '—'}</Field>
          <Field label="Cooks best">
            <span className="flex flex-wrap justify-end gap-1">
              {specialties.length ? (
                specialties.map((s) => <Badge key={s}>{s}</Badge>)
              ) : (
                <span className="text-ink3">none chosen</span>
              )}
            </span>
          </Field>
          <Field label="Area">
            <span className="text-right text-[12px] text-ink2">{kitchen.area || '—'}</span>
          </Field>
          <Field label="Delivery radius">{kitchen.deliveryRadiusKm} km</Field>
          <Field label="Coordinates">
            {/* The pin the cook dropped at signup. A kitchen without one
                cannot be matched to a delivery radius at all, so 0,0 is
                worth seeing rather than hiding behind a formatter. */}
            <span className="tnum text-[12px] text-ink2">
              {kitchen.lat.toFixed(4)}, {kitchen.lng.toFixed(4)}
            </span>
          </Field>
          <Field label="Eco badge">{kitchen.ecoBadge || '—'}</Field>
          <Field label="Tags">
            <span className="flex flex-wrap justify-end gap-1">
              {tags.length ? (
                tags.map((t) => <Badge key={t}>{t}</Badge>)
              ) : (
                <span className="text-ink3">none</span>
              )}
            </span>
          </Field>

          <div className="label mt-3 mb-1.5">Platform</div>
          <Field label="Verified badge">
            {kitchen.isVerified ? <Badge tone="good">Yes</Badge> : <Badge tone="warn">No</Badge>}
          </Field>
          <Field label="Open now">
            {kitchen.isOpen ? <Badge tone="info">Open</Badge> : <Badge>Closed</Badge>}
          </Field>
          <Field label="Rating">
            {kitchen.reviewCount ? (
              <span className="tnum">
                {kitchen.rating.toFixed(1)} · {kitchen.reviewCount}{' '}
                {kitchen.reviewCount === 1 ? 'review' : 'reviews'}
              </span>
            ) : (
              <span className="text-ink3">not rated yet</span>
            )}
          </Field>
          <Field label="Registered">{fmtDate(kitchen.createdAt)}</Field>
          {/* How you tell a kitchen that was set up and abandoned from one
              somebody is actually running. */}
          <Field label="Last edited">
            {kitchen.updatedAt ? timeAgo(kitchen.updatedAt) : '—'}
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
            <>
              <Field label="KYC status">
                <StatusBadge status={kitchen.kycStatus} />
              </Field>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink3">
                No account is linked to this kitchen — it came from the seeded
                directory rather than from a signup, so there are no documents to
                check.
              </p>
            </>
          )}

          {/* Outside the account branch on purpose.

              It used to sit inside it, which meant a kitchen whose owner
              failed to load could not be approved at all — the decision is
              about the kitchen, and it must not depend on a join. */}
          {canDecideKyc ? (
            <div className="mt-3 border-t border-line2 pt-3">
              <KycDecision
                kitchenId={kitchen.id}
                name={kitchen.name}
                status={kitchen.kycStatus}
              />
            </div>
          ) : (
            <p className="mt-3 border-t border-line2 pt-3 text-[11.5px] leading-relaxed text-ink3">
              Approving a kitchen needs the <code>kyc.decide</code> capability.
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
