import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { taka, fmtDate, fmtDateTime } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyRow,
  Field,
  Grid,
  LinkButton,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
} from '@/components/ui';
import { requirePage } from '@/lib/guard';

import { MealRelease } from './release';

export const dynamic = 'force-dynamic';

type Item = {
  orderId: string;
  date: string;
  slot: string;
  name: string;
  amount: number;
  code: string | null;
  status: string | null;
  payment: string | null;
  /** The realised split. Zero until this meal is released. */
  cookAmount: number;
  platformAmount: number;
  deliveredAt: string | null;
  receivedAt: string | null;
};

type BookingDetail = {
  booking: {
    id: string;
    code: string;
    customerKey: string;
    customerName: string;
    phone: string;
    kitchenId: string;
    cookName: string;
    categoryKey: string;
    categoryLabel: string;
    month: string;
    rate: number;
    minMeals: number;
    maxMeals: number;
    status: string;
    createdAt: string;
    address: { label?: string; line?: string; area?: string } | null;
  };
  kitchen: { id: string; name: string; area: string } | null;
  items: Item[];
};

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * One booking, meal by meal.
 *
 * The operator screen the specification asks for: every meal on the month with
 * its delivery, the customer's confirmation, and the payment — and a release
 * button on each one rather than on the booking. That is not a UI choice. A
 * cook who served Monday and Tuesday is owed for Monday and Tuesday whatever
 * happens on Wednesday, and a single button for the month would make a bad
 * Thursday into a dispute about all of it.
 *
 * The left column is the snapshot the booking stored when the money moved; the
 * status columns are read live off each order. Where they disagree the order
 * is right — the snapshot is deliberately frozen so an old receipt keeps
 * saying what the customer actually paid.
 */
export default async function MealBookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage('order.read');
  const { id } = await params;
  const user = await currentUser();
  const canMoney = can(user?.role ?? '', 'payout.write');

  let data: BookingDetail;
  try {
    data = await get<BookingDetail>(`/meal-bookings/${id}`);
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return <BackendDown title="Booking" subtitle="A month of meals" />;
    }
    if (error instanceof BackendError) notFound();
    throw error;
  }

  const { booking, kitchen, items } = data;

  const held = items.filter((i) => i.payment === 'held');
  const released = items.filter((i) => i.payment === 'released');
  /* Confirmed by the customer and still holding money — the queue this page
     exists to clear. `status` rather than the timestamp: reaching 'completed'
     *is* the customer confirming, and it is the field the release endpoint
     itself checks. The stamp is for showing when. */
  const releasable = held.filter((i) => i.status === 'completed');
  const total = items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <>
      <PageHeader
        title={booking.code}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{booking.categoryLabel || booking.categoryKey}</Badge>
            <span>{monthLabel(booking.month)}</span>
            <span className="text-ink3">·</span>
            <span>booked {fmtDateTime(booking.createdAt)}</span>
          </span>
        }
        actions={<LinkButton href="/meal-bookings">← All bookings</LinkButton>}
      />

      {releasable.length > 0 ? (
        <div className="mb-5 rounded-[10px] border border-sage-100 bg-sage-50 px-3.5 py-2.5 text-[13px] text-ink2">
          <strong className="text-sage">
            {releasable.length} {releasable.length === 1 ? 'meal is' : 'meals are'} ready
            to release.
          </strong>{' '}
          The customer confirmed these arrived, so the cook is owed for them —{' '}
          {taka(releasable.reduce((sum, i) => sum + i.amount, 0))} in total.
        </div>
      ) : null}

      <Grid cols={4}>
        <Stat label="Meals booked" value={items.length} sub={`at ${taka(booking.rate)} each`} />
        <Stat label="Advance paid" value={taka(total)} />
        <Stat
          label="Still held"
          value={held.length}
          tone={held.length ? 'warn' : 'good'}
          sub={held.length ? taka(held.reduce((s, i) => s + i.amount, 0)) : 'nothing outstanding'}
        />
        {/* The cook's own share, not the escrow that came out. Adding up
            `amount` here would count the platform's commission as money the
            cook received — which is the one figure on this screen somebody
            would quote back at a cook. */}
        <Stat
          label="Released to cook"
          value={released.length}
          tone="good"
          sub={`${taka(released.reduce((s, i) => s + i.cookAmount, 0))} after commission`}
        />
      </Grid>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="Customer" className="lg:col-span-1">
          <Field label="Name">{booking.customerName || '—'}</Field>
          <Field label="Phone">
            <span className="tnum">{booking.phone || '—'}</span>
          </Field>
          <Field label="Key">
            <span className="tnum text-[11.5px]">{booking.customerKey}</span>
          </Field>
          {booking.address ? (
            <Field label="Address">
              <span className="block">{booking.address.label}</span>
              <span className="block text-ink2">{booking.address.line}</span>
              <span className="block text-ink2">{booking.address.area}</span>
            </Field>
          ) : null}
        </Card>

        <Card title="Cook" className="lg:col-span-1">
          <Field label="Kitchen">
            {kitchen ? (
              <Link href={`/kitchens/${kitchen.id}`} className="hover:text-primary">
                {kitchen.name}
              </Link>
            ) : (
              <span className="text-ink3">
                No kitchen record — <span className="tnum">{booking.kitchenId}</span>
              </span>
            )}
          </Field>
          <Field label="Area">{kitchen?.area ?? '—'}</Field>
          <Field label="Cook name">{booking.cookName || '—'}</Field>
        </Card>

        <Card title="What was agreed" className="lg:col-span-1">
          {/* Snapshots, all four. A cook changing any of these afterwards must
              not move a month somebody already paid for. */}
          <Field label="Category">{booking.categoryLabel || booking.categoryKey}</Field>
          <Field label="Rate">
            <span className="tnum">{taka(booking.rate)}</span>
            <span className="ml-1 text-[11.5px] text-ink3">per meal, at booking</span>
          </Field>
          <Field label="Range allowed">
            <span className="tnum">
              {booking.minMeals} – {booking.maxMeals}
            </span>
            <span className="ml-1 text-[11.5px] text-ink3">meals</span>
          </Field>
          <Field label="Booking status">
            <StatusBadge status={booking.status} />
          </Field>
        </Card>
      </div>

      <Card
        className="mt-3"
        pad={false}
        title="The meals"
        subtitle="Delivery, confirmation and payment — tracked and released one at a time"
      >
        <Table
          head={['Date', 'Slot', 'Meal', 'Amount', 'Delivery', 'Confirmed', 'Payment', '']}
        >
          {items.map((item) => (
            <tr key={item.orderId}>
              <td className="tnum whitespace-nowrap text-ink2">{fmtDate(item.date)}</td>
              <td className="text-ink2 capitalize">{item.slot}</td>
              <td className="max-w-[200px] truncate font-medium">
                {item.code ? (
                  <Link href={`/orders/${item.orderId}`} className="hover:text-primary">
                    {item.name || '—'}
                  </Link>
                ) : (
                  item.name || '—'
                )}
                {item.code ? (
                  <span className="tnum block text-[11px] text-ink3">{item.code}</span>
                ) : null}
              </td>
              <td>
                <Money amount={item.amount} />
              </td>
              <td>
                {item.status ? <StatusBadge status={item.status} /> : <span className="text-ink3">—</span>}
              </td>
              <td className="whitespace-nowrap text-[12px] text-ink2">
                {item.receivedAt ? (
                  fmtDate(item.receivedAt)
                ) : (
                  <span className="text-ink3">not yet</span>
                )}
              </td>
              <td>
                <Badge
                  tone={
                    item.payment === 'released'
                      ? 'good'
                      : item.payment === 'refunded'
                        ? 'bad'
                        : item.payment === 'held'
                          ? 'warn'
                          : 'neutral'
                  }
                >
                  {item.payment ?? '—'}
                </Badge>
              </td>
              <td>
                <MealRelease
                  orderId={item.orderId}
                  code={item.code ?? item.orderId}
                  amount={item.amount}
                  payment={item.payment}
                  confirmed={item.status === 'completed'}
                  canMoney={canMoney}
                />
              </td>
            </tr>
          ))}
          {items.length === 0 ? (
            <EmptyRow span={8}>
              This booking has no meals on it, which should not be possible — a booking
              is created from its selections.
            </EmptyRow>
          ) : null}
        </Table>
      </Card>

      <p className="mt-3 text-[12px] leading-relaxed text-ink3">
        A meal becomes releasable when the customer confirms it arrived, not when the
        cook marks it delivered. That gap is deliberate: it is the customer&rsquo;s
        confirmation that moves the money, and it is the only thing in the flow that
        the cook cannot do on their own behalf.
      </p>
    </>
  );
}
