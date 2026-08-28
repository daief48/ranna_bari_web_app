import { NextResponse, type NextRequest } from 'next/server';

import { db } from '@/lib/db';
import { parseJson } from '@/lib/mappers';

export const dynamic = 'force-dynamic';

/**
 * The kitchen directory, shaped exactly like a row of `chefs.json`.
 *
 * Field for field identical to what the app already bundles, so swapping
 * `import chefs from './chefs.json'` for a fetch of this endpoint needs no
 * change anywhere downstream — `useChefs`, the browse filters, the map and
 * the distance gate all keep working on the same shape.
 *
 * A suspended kitchen is simply absent. The app has no concept of suspension
 * and does not need one: it cannot render what it was never sent.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const area = params.get('area');
  const menus = params.get('menus') === '1';

  /* `dishes` is always selected and dropped when it was not asked for. A
     conditional `include` widens the result to a union that every field
     access then has to narrow, which costs more in casts than the query costs
     in rows. */
  const kitchens = await db.kitchen.findMany({
    where: {
      suspended: false,
      ...(area && area !== 'all' ? { area } : {}),
    },
    orderBy: { rating: 'desc' },
    include: {
      dishes: menus
        ? { where: { available: true }, orderBy: { createdAt: 'asc' } }
        : { where: { id: '' } },
    },
  });

  const chefs = kitchens.map((kitchen) => ({
    id: kitchen.id,
    name: kitchen.name,
    avatar: kitchen.avatar,
    coverImage: kitchen.coverImage,
    specialty: kitchen.specialty,
    description: kitchen.description,
    rating: kitchen.rating,
    reviewCount: kitchen.reviewCount,
    tags: parseJson<string[]>(kitchen.tags, []),
    ecoBadge: kitchen.ecoBadge,
    isVerified: kitchen.isVerified,
    area: kitchen.area,
    lat: kitchen.lat,
    lng: kitchen.lng,
    deliveryRadiusKm: kitchen.deliveryRadiusKm,
    isOpen: kitchen.isOpen,
  }));

  const body: Record<string, unknown> = { chefs };

  if (menus) {
    body.menus = kitchens.map((kitchen) => ({
      chefId: kitchen.id,
      items: kitchen.dishes.map((dish) => ({
        id: dish.id,
        name: dish.name,
        description: dish.description,
        price: dish.price,
        image: dish.image,
        tags: parseJson<string[]>(dish.tags, []),
      })),
    }));
  }

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' },
  });
}
