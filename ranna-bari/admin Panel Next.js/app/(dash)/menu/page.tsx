import Link from 'next/link';

import { get } from '@/lib/backend';
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

  const data = await get<DishList>(`/dishes?${query}`).catch(down);
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

      <GapNote>
        <strong>What this is.</strong> The cook&rsquo;s app has a{' '}
        <strong>Menu</strong> tab where they add dishes and flip each one available
        or not for the day. Until now the panel could only see one kitchen&rsquo;s
        menu at a time, through that kitchen&rsquo;s own page — so &ldquo;who sells
        biryani&rdquo;, &ldquo;what is switched off right now&rdquo; and &ldquo;what
        does a dish cost across the platform&rdquo; had no answer. The availability
        switch belongs to the cook; nothing here writes it.
      </GapNote>

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
            /* A dish has no page of its own — there is no `GET /dishes/:id`,
               and the place a dish actually lives is its kitchen's menu. */
            <RowLink
              key={dish.id}
              href={`/kitchens/${dish.kitchenId}`}
              className={dish.available ? '' : 'opacity-60'}
            >
              <td className="max-w-[280px]">
                <span className="block truncate font-medium text-ink">{dish.name}</span>
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
        order. That is a different thing from a <Link href="/meals" className="text-ink2 hover:text-primary">meal</Link>,
        which is one service on one date with a fixed number of seats, and from a{' '}
        <Link href="/stores" className="text-ink2 hover:text-primary">shop product</Link>,
        which has stock that runs out.
      </p>
    </>
  );
}
