import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { taka } from '@/lib/format';
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
import { SearchBox, FilterSelect, Pager } from '@/components/ui/client';
import { BackendDown, down } from '@/components/backend-down';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Menus · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/** One dish as `GET /dishes` sends it. */
type DishRow = {
  id: string;
  kitchenId: string;
  kitchenName: string;
  name: string;
  description: string;
  price: number;
  image: string;
  tags: string[];
  available: boolean;
};

type DishList = { dishes: DishRow[]; total: number; unavailable: number };

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('kitchen.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);

  const query = new URLSearchParams({ skip: String(skip), take: String(take) });
  if (params.q) query.set('q', params.q);
  if (params.available) query.set('available', params.available);
  if (params.kitchen) query.set('kitchenId', params.kitchen);

  /**
   * `down` swallows only an unreachable backend and re-throws every 4xx,
   * which is right for a money screen and wrong for exactly one case here:
   * this board is the first caller of `GET /dishes`, so a backend that has
   * not picked up that route yet answers 404. That is a deploy still in
   * flight, not a bug, and it should read as one instead of as a stack trace.
   */
  const data = await get<DishList>(`/dishes?${query}`).catch((error: unknown) => {
    if (error instanceof BackendError && error.status === 404) return 'no-endpoint' as const;
    return down(error);
  });

  if (data === 'no-endpoint') {
    return (
      <>
        <PageHeader
          title="Menus"
          subtitle="Every dish on every kitchen's menu, on one board"
        />
        <div className="rounded-[10px] border border-saffron-100 bg-saffron-50 px-3.5 py-3 text-[13px] leading-relaxed text-ink2">
          <strong className="text-saffron">Menus are not available yet.</strong> The
          service answering right now is an older version that does not serve them.
          Nothing is broken and nothing has been lost — once it is updated, reload
          and the menus appear.
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <BackendDown
        title="Menus"
        subtitle="Every dish on every kitchen's menu, on one board"
      />
    );
  }

  const { dishes, total, unavailable } = data;

  /* Only meaningful across the whole filtered set, which the endpoint does not
     aggregate — so this is the page's own average and is labelled as such. */
  const onPage = dishes.length
    ? Math.round(dishes.reduce((sum, d) => sum + d.price, 0) / dishes.length)
    : 0;

  return (
    <>
      <PageHeader
        title="Menus"
        subtitle="Every dish on every kitchen's menu, on one board"
      />

      <Grid cols={3}>
        <Stat label="Dishes matching" value={total.toLocaleString('en-US')} />
        <Stat
          label="Switched off"
          value={unavailable.toLocaleString('en-US')}
          tone={unavailable > 0 ? 'warn' : 'good'}
          sub={
            unavailable > 0
              ? 'On a menu but not orderable today'
              : 'Everything listed is orderable'
          }
          href="/menu?available=false"
        />
        <Stat
          label="Average price, this page"
          value={taka(onPage)}
          sub={`Across the ${dishes.length} shown`}
        />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title="Dishes"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox placeholder="Dish name or description…" />
            <FilterSelect
              name="available"
              allLabel="Any availability"
              options={[
                { value: 'true', label: 'Available' },
                { value: 'false', label: 'Switched off' },
              ]}
            />
          </div>
        }
      >
        <Table head={['Dish', 'Kitchen', 'Tags', 'Price', 'Today']}>
          {dishes.map((dish) => (
            <RowLink
              key={dish.id}
              href={`/menu/${dish.id}`}
              className={dish.available ? '' : 'opacity-60'}
            >
              <td className="max-w-[280px]">
                <Link
                  href={`/menu/${dish.id}`}
                  className="block truncate font-medium text-ink hover:text-primary"
                >
                  {dish.name}
                </Link>
                {dish.description ? (
                  <span className="block truncate text-[11.5px] text-ink3">
                    {dish.description}
                  </span>
                ) : null}
              </td>
              <td className="max-w-[160px] truncate text-ink2">
                <Link href={`/kitchens/${dish.kitchenId}`} className="hover:text-primary">
                  {dish.kitchenName || <span className="text-ink3">unknown kitchen</span>}
                </Link>
              </td>
              <td className="max-w-[180px]">
                {dish.tags?.length ? (
                  <span className="truncate text-[11.5px] text-ink3">
                    {dish.tags.slice(0, 3).join(' · ')}
                  </span>
                ) : (
                  <span className="text-ink3">—</span>
                )}
              </td>
              <td>
                <Money amount={dish.price} />
              </td>
              <td>
                {dish.available ? (
                  <Badge tone="good">Available</Badge>
                ) : (
                  <Badge tone="neutral">Off</Badge>
                )}
              </td>
            </RowLink>
          ))}
          {dishes.length === 0 ? (
            <EmptyRow span={5}>No dish matches that.</EmptyRow>
          ) : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink3">
        A dish is a standing menu item — always on offer at its price, cooked to
        order. That is a different thing from a{' '}
        <Link href="/meal-plans" className="text-ink2 hover:text-primary">planned meal</Link>,
        which is one slot on one date of a monthly calendar somebody books a whole
        month of, and from a{' '}
        <Link href="/stores" className="text-ink2 hover:text-primary">shop product</Link>,
        which has stock that runs out.
      </p>
    </>
  );
}
