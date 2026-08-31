import Link from 'next/link';
import { notFound } from 'next/navigation';
import { get } from '@/lib/backend';

import { db } from '@/lib/db';
import { taka, fmtDateTime, fmtDate, timeAgo } from '@/lib/format';
import {
  Badge,
  Card,
  Field,
  Grid,
  LinkButton,
  Meter,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
} from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/** Orders that consume a seat. A cancelled order gives its capacity back. */
const LIVE = ['pending', 'placed', 'confirmed', 'accepted', 'preparing', 'cooking', 'ready', 'delivering', 'on_the_way', 'delivered', 'completed'];

/**
 * Prisma stores the interested list as a JSON string; Mongo returns a real
 * array. Handing an array to `JSON.parse` throws and would silently zero the
 * count, so the shape is checked rather than assumed.
 */
function parseInterested(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

type MealView = {
  id: string;
  code: string;
  kitchenId: string;
  title: string;
  description: string;
  price: number;
  capacity: number;
  serveDate: string;
  slot: string;
  deadline: Date | string;
  handover: string;
  handoverNote: string;
  area: string;
  deliveryRadiusKm: number;
  status: string;
  cancelReason: string | null;
  interested: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  kitchen: { id: string; name: string };
  orders: {
    id: string;
    code: string;
    customerName: string;
    status: string;
    payment: string;
    amount: number;
    createdAt: Date | string;
  }[];
};

/**
 * The meal, from whichever store holds it.
 *
 * `/meals` serves the board, so its ids are the backend's and reading only
 * the panel's mirror here answered every one of them with a 404.
 */
async function loadMeal(id: string): Promise<MealView | null> {
  const remote = await get<{
    meal: Record<string, unknown> & { id: string; kitchenId: string };
    kitchen: { id: string; name: string } | null;
    orders: MealView['orders'];
  }>(`/meals/${id}`).catch(() => null);

  if (remote) {
    const m = remote.meal as unknown as MealView;
    return {
      ...m,
      id: remote.meal.id,
      kitchen: remote.kitchen ?? { id: remote.meal.kitchenId, name: 'unknown kitchen' },
      orders: remote.orders,
    };
  }

  const meal = await db.meal.findUnique({
    where: { id },
    include: {
      kitchen: { select: { id: true, name: true, area: true, isVerified: true } },
      orders: { orderBy: { createdAt: 'desc' } },
    },
  });
  return (meal as unknown as MealView) ?? null;
}

export default async function MealDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('order.read');
  const { id } = await params;

  const meal = await loadMeal(id);
  if (!meal) notFound();

  const interested = parseInterested(meal.interested);
  const sold = meal.orders.filter((o) => LIVE.includes(o.status)).length;
  const revenue = meal.orders
    .filter((o) => LIVE.includes(o.status))
    .reduce((sum, o) => sum + o.amount, 0);

  /* Interest that never became an order. The gap is the whole reason a cook
     would look at this screen. */
  const converted = interested.length > 0 ? sold / interested.length : null;
  const past = new Date(meal.deadline).getTime() < Date.now();

  return (
    <>
      <PageHeader
        title={meal.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tnum">{meal.code}</span>
            <span className="text-ink3">·</span>
            <Link href={`/kitchens/${meal.kitchen.id}`} className="hover:text-primary">
              {meal.kitchen.name}
            </Link>
            <span className="text-ink3">·</span>
            <StatusBadge status={meal.status} />
          </span>
        }
        actions={
          <>
            <LinkButton href={`/orders?q=${encodeURIComponent(meal.code)}`}>
              Its orders →
            </LinkButton>
            <LinkButton href="/meals">← All meals</LinkButton>
          </>
        }
      />

      <Grid cols={4}>
        <Stat label="Price" value={taka(meal.price)} sub={`${meal.slot} · ${meal.handover}`} />
        <Stat
          label="Seats taken"
          value={`${sold} / ${meal.capacity}`}
          tone={sold >= meal.capacity ? 'good' : sold === 0 ? 'warn' : 'neutral'}
          sub={sold >= meal.capacity ? 'Sold out' : `${meal.capacity - sold} left`}
        />
        <Stat
          label="Taken so far"
          value={taka(revenue)}
          sub={`${meal.orders.length} order${meal.orders.length === 1 ? '' : 's'} in total`}
        />
        <Stat
          label="Marked interested"
          value={interested.length}
          tone={converted != null && converted < 0.25 && interested.length > 3 ? 'warn' : 'neutral'}
          sub={
            converted == null
              ? 'Nobody has flagged it'
              : `${Math.round(converted * 100)}% of them ordered`
          }
        />
      </Grid>

      <Card className="mt-3">
        <Meter value={sold} max={meal.capacity} />
        <p className="mt-2 text-[12.5px] text-ink2">
          {sold} of {meal.capacity} seats sold
          {past ? ' — the deadline has passed' : `, ordering closes ${timeAgo(meal.deadline)}`}
        </p>
      </Card>

      <Grid cols={2}>
        <Card className="mt-3" title="The meal">
          <Field label="Code">
            <span className="tnum">{meal.code}</span>
          </Field>
          <Field label="Price">
            <Money amount={meal.price} />
          </Field>
          <Field label="Capacity">{meal.capacity}</Field>
          <Field label="Serve date">{meal.serveDate}</Field>
          <Field label="Slot">
            <Badge tone="neutral">{meal.slot}</Badge>
          </Field>
          <Field label="Ordering closes">{fmtDateTime(meal.deadline)}</Field>
          <Field label="Status">
            <StatusBadge status={meal.status} />
          </Field>
          {meal.cancelReason ? <Field label="Cancelled because">{meal.cancelReason}</Field> : null}
        </Card>

        <Card className="mt-3" title="Where and how">
          <Field label="Kitchen">
            <Link href={`/kitchens/${meal.kitchen.id}`} className="hover:text-primary">
              {meal.kitchen.name}
            </Link>
          </Field>
          <Field label="Area">{meal.area}</Field>
          <Field label="Handover">
            <Badge tone="neutral">{meal.handover}</Badge>
          </Field>
          {meal.handoverNote ? <Field label="Handover note">{meal.handoverNote}</Field> : null}
          <Field label="Delivery radius">{meal.deliveryRadiusKm} km</Field>
          <Field label="Listed">{fmtDate(meal.createdAt)}</Field>
          <Field label="Last changed">{fmtDateTime(meal.updatedAt)}</Field>
        </Card>
      </Grid>

      {meal.description ? (
        <Card className="mt-3" title="Description">
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink2">
            {meal.description}
          </p>
        </Card>
      ) : null}

      <Card
        className="mt-3"
        title="Orders for this meal"
        subtitle={`${meal.orders.length} in total`}
        pad={false}
      >
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Money</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {meal.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      href={`/orders/${order.id}`}
                      className="tnum font-semibold hover:text-primary"
                    >
                      {order.code}
                    </Link>
                  </td>
                  <td className="max-w-[160px] truncate text-ink2">{order.customerName}</td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                  <td>
                    <StatusBadge status={order.payment} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Money amount={order.amount} />
                  </td>
                  <td className="whitespace-nowrap text-ink2">{timeAgo(order.createdAt)}</td>
                </tr>
              ))}
              {meal.orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[13px] text-ink3">
                    Nobody has ordered this meal.
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
