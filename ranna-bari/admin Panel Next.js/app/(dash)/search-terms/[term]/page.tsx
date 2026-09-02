import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { taka, timeAgo } from '@/lib/format';
import {
  Badge,
  Card,
  Grid,
  LinkButton,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
} from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

type MealHit = {
  id: string;
  title: string;
  serveDate: string;
  price: number;
  status: string;
  kitchenId: string;
  kitchenName: string;
};
type KitchenHit = { id: string; name: string; area: string | null; isVerified: boolean };
type ProductHit = {
  id: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  storeId: string;
  storeName: string;
};
type DishHit = { id: string; name: string; price: number; kitchenId: string; kitchenName: string };

/**
 * One search term.
 *
 * Unlike every other detail screen in the panel this one has no record behind
 * it. Search terms arrive from the backend already grouped — there is no
 * `SearchTerm` row to open, and the list row carries every number the
 * endpoint knows.
 *
 * So rather than re-print those numbers, this answers the question the board
 * actually raises. A term with forty searches and forty misses is on that
 * board because nothing matched it; the only useful next question is whether
 * anything matches it *now*, and that is a live query, not a statistic.
 */
export default async function SearchTermDetail({
  params,
}: {
  params: Promise<{ term: string }>;
}) {
  await requirePage('kitchen.read');
  const { term: raw } = await params;
  const term = decodeURIComponent(raw);

  /* Searched against the catalogue the app searches, not the panel's mirror
     of it. On a screen about terms that found nothing, answering from a
     different catalogue could report four matching meals for a search the app
     returns nothing for — exactly backwards. */
  let meals: MealHit[];
  let kitchens: KitchenHit[];
  let products: ProductHit[];
  let dishes: DishHit[];
  try {
    const data = await get<{
      meals: MealHit[];
      kitchens: KitchenHit[];
      products: ProductHit[];
      dishes: DishHit[];
    }>(`/search-terms/${encodeURIComponent(term)}`);
    ({ meals, kitchens, products, dishes } = data);
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return <BackendDown title={term} subtitle="What the catalogue holds for this search" />;
    }
    throw error;
  }

  const hits = meals.length + kitchens.length + products.length + dishes.length;

  return (
    <>
      <PageHeader
        title={term}
        subtitle="What this search finds in the catalogue right now"
        actions={<LinkButton href="/search-terms">← Search terms</LinkButton>}
      />

      <Grid cols={4}>
        <Stat
          label="Matches now"
          value={hits}
          tone={hits === 0 ? 'bad' : 'good'}
          sub={hits === 0 ? 'A customer searching this still finds nothing' : 'Across all four catalogues'}
        />
        <Stat label="Meals" value={meals.length} />
        <Stat label="Kitchens" value={kitchens.length} />
        <Stat label="Shop products" value={products.length} />
      </Grid>

      {hits === 0 ? (
        <Card className="mt-3">
          <p className="text-[13.5px] leading-relaxed text-ink">
            Nothing in the catalogue contains <strong>{term}</strong>.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink2">
            That is what puts a term on the misses board, and there are only three
            reasons for it: nobody cooks this, it is listed under a different word, or
            it is spelled differently here than customers type it. The first is a
            recruiting problem, the second two are a naming one — and the search-terms
            board shows the spellings people actually used.
          </p>
        </Card>
      ) : null}

      {meals.length > 0 ? (
        <Card className="mt-3" title="Meals" pad={false}>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Meal</th>
                  <th>Kitchen</th>
                  <th>Serve</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {meals.map((meal) => (
                  <tr key={meal.id}>
                    <td className="max-w-[240px] truncate">
                      <Link href={`/meals/${meal.id}`} className="font-medium hover:text-primary">
                        {meal.title}
                      </Link>
                    </td>
                    <td className="text-ink2">
                      <Link href={`/kitchens/${meal.kitchenId}`} className="hover:text-primary">
                        {meal.kitchenName}
                      </Link>
                    </td>
                    <td className="tnum whitespace-nowrap text-ink2">{meal.serveDate}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Money amount={meal.price} />
                    </td>
                    <td>
                      <StatusBadge status={meal.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {kitchens.length > 0 ? (
        <Card className="mt-3" title="Kitchens">
          <ul className="divide-y divide-line2">
            {kitchens.map((kitchen) => (
              <li key={kitchen.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/kitchens/${kitchen.id}`} className="text-[13px] hover:text-primary">
                  {kitchen.name}
                </Link>
                <span className="flex items-center gap-2.5 text-[12px] text-ink3">
                  <span>{kitchen.area}</span>
                  {kitchen.isVerified ? <Badge tone="good">Verified</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {dishes.length > 0 ? (
        <Card className="mt-3" title="Dishes on kitchen menus">
          <ul className="divide-y divide-line2">
            {dishes.map((dish) => (
              <li key={dish.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-[13px] text-ink">{dish.name}</span>
                <span className="flex items-center gap-2.5 text-[12px] text-ink3">
                  <Link href={`/kitchens/${dish.kitchenId}`} className="hover:text-primary">
                    {dish.kitchenName}
                  </Link>
                  <span className="tnum text-ink2">{taka(dish.price)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {products.length > 0 ? (
        <Card className="mt-3" title="Shop products">
          <ul className="divide-y divide-line2">
            {products.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-[13px] text-ink">{product.name}</span>
                <span className="flex shrink-0 items-center gap-2.5 text-[12px] text-ink3">
                  <Link href={`/stores/${product.storeId}`} className="hover:text-primary">
                    {product.storeName || 'shop'}
                  </Link>
                  {product.stock === 0 ? <Badge tone="bad">Out</Badge> : null}
                  <span className="tnum text-ink2">{taka(product.price)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="mt-3 text-[12px] leading-relaxed text-ink3">
        Matching is a plain substring, the same way the app&rsquo;s catalogue search
        works — not the ranked search the phone runs. Counts shown here are capped at
        fifteen per catalogue.{' '}
        <Link href="/search-terms" className="text-ink2 hover:text-primary">
          Back to the board
        </Link>{' '}
        for how often it was typed, by how many people, and in which areas.
      </p>
    </>
  );
}
