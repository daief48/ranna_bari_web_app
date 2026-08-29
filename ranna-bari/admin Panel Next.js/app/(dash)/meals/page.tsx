import Link from 'next/link';

import { get } from '@/lib/backend';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { can, SLOTS } from '@/lib/domain';
import { todayKey } from '@/lib/format';
import { paging, pageCount } from '@/lib/queries';
import {
  Badge,
  Card,
  Grid,
  GapNote,
  Meter,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  EmptyRow,
} from '@/components/ui';
import { FilterSelect, Pager } from '@/components/ui/client';
import { BackendDown, down } from '@/components/backend-down';
import { MealControls } from './controls';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Meals · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/** One meal as `GET /meals` sends it. */
type MealRow = {
  id: string;
  code: string;
  kitchenId: string;
  cookName: string;
  title: string;
  price: number;
  capacity: number;
  serveDate: string;
  slot: string;
  status: string;
  /**
   * Orders on the meal that are not cancelled, folded per meal by the endpoint
   * in one grouped count. This is what the capacity meter reads as sold — the
   * panel used to exclude `rejected` as well, which the backend does not, so a
   * rejected order now counts against capacity.
   */
  confirmed: number;
  held: number;
  /**
   * Interest left the meal document on the way to Mongo — it is a collection of
   * its own now, and `GET /meals` does not fold it back in. Optional rather
   * than dropped, so the column fills itself in the day the endpoint carries it.
   */
  interested?: string[];
};

type MealList = { meals: MealRow[]; total: number };

/** How many rows one scan request pulls, and how many requests a scan will make. */
const SCAN_SIZE = 100;
const SCAN_PAGES = 5;

const listUrl = (query: URLSearchParams, skip: number, take: number) => {
  const out = new URLSearchParams(query);
  out.set('skip', String(skip));
  out.set('take', String(take));
  return `/meals?${out}`;
};

/**
 * Every meal matching `query`, a hundred at a time.
 *
 * `GET /meals` filters on status and on the stale view and on nothing else, so
 * a serve-date or slot filter has to be applied here — and applying one to a
 * single page of twenty-five would leave the pager counting rows the filter had
 * already thrown away. The ceiling is what stops a board with two years of
 * history behind it turning one render into fifty round trips; a `serveDate`
 * and `slot` parameter on the endpoint retires this whole function.
 */
async function scanMeals(query: URLSearchParams): Promise<MealRow[]> {
  const first = await get<MealList>(listUrl(query, 0, SCAN_SIZE));
  const pages = Math.min(SCAN_PAGES, Math.ceil(first.total / SCAN_SIZE));
  if (pages <= 1) return first.meals;

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      get<MealList>(listUrl(query, (i + 1) * SCAN_SIZE, SCAN_SIZE)),
    ),
  );
  return [first.meals, ...rest.map((page) => page.meals)].flat();
}

async function loadMeals(
  params: Record<string, string | undefined>,
  skip: number,
  take: number,
) {
  const today = todayKey();
  const stale = params.view === 'stale';

  const query = new URLSearchParams();
  if (stale) query.set('view', 'stale');
  else if (params.status) query.set('status', params.status);

  const local = !stale && Boolean(params.slot || params.when);

  const [list, staleList, publishedList] = await Promise.all([
    local
      ? scanMeals(query).then((meals) => ({ meals, total: meals.length }))
      : get<MealList>(listUrl(query, skip, take)),
    get<MealList>('/meals?view=stale&skip=0&take=1'),
    get<MealList>('/meals?status=published&skip=0&take=1'),
  ]);

  const counts = { staleCount: staleList.total, published: publishedList.total };
  if (!local) return { rows: list.meals, total: list.total, ...counts };

  /* `serveDate` is a Dhaka calendar day written 'YYYY-MM-DD', so these are
     string compares — the same reasoning the backend's stale view uses. Against
     a timestamp the board would roll over at UTC midnight, six hours early. */
  const filtered = list.meals.filter(
    (meal) =>
      (!params.slot || meal.slot === params.slot) &&
      (params.when !== 'today' || meal.serveDate === today) &&
      (params.when !== 'upcoming' || meal.serveDate > today) &&
      (params.when !== 'past' || meal.serveDate < today),
  );

  return { rows: filtered.slice(skip, skip + take), total: filtered.length, ...counts };
}

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('order.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);
  const user = await currentUser();
  const canWrite = can(user?.role ?? '', 'meal.write');
  const today = todayKey();

  const stale = params.view === 'stale';

  const board = await loadMeals(params, skip, take).catch(down);
  if (!board) {
    return (
      <BackendDown title="Meals" subtitle="Pre-booked services, by serve date and slot" />
    );
  }

  const { rows, total, staleCount, published } = board;

  /* The last read this page makes of the panel's own database. `GET /meals`
     takes no serveDate parameter, so there is nowhere on the backend for this
     count to come from yet — and it will disagree with every other figure here
     as soon as the two stores diverge. A `serveDate` filter on the endpoint is
     what deletes this line. */
  const todayCount = await db.meal.count({ where: { serveDate: today } });

  return (
    <>
      <PageHeader
        title="Meals"
        subtitle="Pre-booked services, by serve date and slot"
        actions={
          <div className="flex gap-2">
            <Link
              href="/meals"
              className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold ${
                !stale ? 'border-primary-100 bg-primary-50 text-primary' : 'border-line bg-raised text-ink2'
              }`}
            >
              All meals
            </Link>
            <Link
              href="/meals?view=stale"
              className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold ${
                stale ? 'border-primary-100 bg-primary-50 text-primary' : 'border-line bg-raised text-ink2'
              }`}
            >
              Stale ({staleCount})
            </Link>
          </div>
        }
      />

      {stale ? (
        <GapNote>
          <strong>Why this list exists.</strong> These meals are still{' '}
          <code>published</code> — open for orders — but the day they were meant to be
          eaten has already passed. The app has no sweeper: a cook who forgets to close
          a service leaves it open forever, and a customer can still order dinner for
          last Tuesday. Closing them is a manual job, and this is where it happens.
        </GapNote>
      ) : null}

      <Grid cols={4}>
        <Stat label="Meals matching" value={total} />
        <Stat label="Open for orders" value={published} tone="info" />
        <Stat label="Serving today" value={todayCount} />
        <Stat
          label="Open past their date"
          value={staleCount}
          tone={staleCount > 0 ? 'warn' : 'good'}
          href="/meals?view=stale"
        />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title={stale ? 'Meals to close' : 'All meals'}
        actions={
          stale ? null : (
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                name="when"
                allLabel="Any date"
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'upcoming', label: 'Upcoming' },
                  { value: 'past', label: 'Past' },
                ]}
              />
              <FilterSelect
                name="slot"
                allLabel="Any slot"
                options={SLOTS.map((s) => ({ value: s.key, label: s.label }))}
              />
              <FilterSelect
                name="status"
                allLabel="Any status"
                options={[
                  { value: 'published', label: 'Published' },
                  { value: 'closed', label: 'Closed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            </div>
          )
        }
      >
        <Table
          head={['Meal', 'Kitchen', 'Serve', 'Slot', 'Price', 'Sold', 'Interest', 'Status', 'Actions']}
        >
          {rows.map((meal) => {
            const sold = meal.confirmed;
            const overdue = meal.status === 'published' && meal.serveDate < today;

            return (
              <tr key={meal.id}>
                <td className="max-w-[200px]">
                  <span className="block truncate font-medium">{meal.title}</span>
                  <span className="tnum block text-[11px] text-ink3">{meal.code}</span>
                </td>
                <td className="max-w-[140px] truncate text-ink2">
                  {/* `GET /meals` does not join the kitchen, so the name shown is
                      the meal's own copy of it — the same fallback the backend
                      uses on its pre-order board. The link still resolves. */}
                  <Link href={`/kitchens/${meal.kitchenId}`} className="hover:text-primary">
                    {meal.cookName || '—'}
                  </Link>
                </td>
                <td className="tnum whitespace-nowrap">
                  {meal.serveDate}
                  {overdue ? (
                    <Badge tone="warn" title="Serve date has passed">
                      past
                    </Badge>
                  ) : null}
                </td>
                <td className="capitalize text-ink2">{meal.slot}</td>
                <td>
                  <Money amount={meal.price} />
                </td>
                <td className="min-w-[92px]">
                  <div className="tnum mb-1 text-[12px]">
                    {sold} / {meal.capacity}
                  </div>
                  <Meter
                    value={sold}
                    max={meal.capacity}
                    tone={sold >= meal.capacity ? 'good' : 'info'}
                  />
                </td>
                {/* A dash, not a zero: nobody has said this meal interests
                    nobody — the count simply has no source yet. */}
                <td className="tnum text-ink2">{meal.interested?.length ?? '—'}</td>
                <td>
                  <StatusBadge status={meal.status} />
                </td>
                <td>
                  {canWrite ? (
                    <MealControls
                      mealId={meal.id}
                      title={meal.title}
                      status={meal.status}
                      soldCount={sold}
                    />
                  ) : (
                    <span className="text-[11.5px] text-ink3">ops only</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <EmptyRow span={9}>
              {stale ? 'Nothing is open past its serve date.' : 'No meal matches that.'}
            </EmptyRow>
          ) : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink3">
        Closing a meal stops new orders and leaves the ones already placed alone.
        Cancelling refunds every order held against it, one transaction each, and
        notifies each customer — forty people should not go unrefunded because the
        forty-first row is broken.
      </p>
    </>
  );
}
