import { NextResponse, type NextRequest } from 'next/server';

import { db } from '@/lib/db';
import { ERR } from '@/lib/domain';
import { parseJson, type PriceStamp } from '@/lib/mappers';

export const dynamic = 'force-dynamic';

/**
 * A cook's own offers on a request — and never anybody else's.
 *
 * This endpoint exists to make one of the app's three load-bearing rules an
 * *authorisation* guarantee rather than a UI one. From `requestLogic.js`:
 *
 *   > A cook never sees a competitor's price. There is no function here that
 *   > returns another cook's offer to a cook [...] On a device this is a UI
 *   > guarantee; on a server it would need to be an authorisation one, and
 *   > this is the shape that check should take.
 *
 * So the filter is on `kitchenId` in the query itself. There is no code path
 * through this handler that can return a row belonging to a different
 * kitchen, whatever the caller asks for — the worst a forged `kitchenId` can
 * do is show that kitchen its own offers.
 *
 * The count of competing offers is returned because a cook deciding whether to
 * bid deserves to know they are one of five. The prices are not.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kitchenId = params.get('kitchenId');
  const requestId = params.get('requestId');

  if (!kitchenId) {
    return NextResponse.json({ error: ERR.NOT_ELIGIBLE }, { status: 400 });
  }

  const offers = await db.offer.findMany({
    where: { kitchenId, ...(requestId ? { requestId } : {}) },
    orderBy: { createdAt: 'desc' },
    include: {
      request: {
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          quantity: true,
          budget: true,
          wantedFor: true,
          area: true,
          status: true,
          selectedOfferId: true,
        },
      },
    },
  });

  const competing = requestId
    ? await db.offer.count({ where: { requestId, kitchenId: { not: kitchenId } } })
    : 0;

  return NextResponse.json({
    offers: offers.map((offer) => ({
      id: offer.id,
      requestId: offer.requestId,
      kitchenId: offer.kitchenId,
      cookName: offer.cookName,
      status: offer.status,
      price: offer.price,
      agreedPrice: offer.agreedPrice,
      note: offer.note,
      prepTime: offer.prepTime,
      history: parseJson<PriceStamp[]>(offer.history, []),
      createdAt: offer.createdAt,
      /* Whether this cook was chosen is theirs to know; which other offer was
         chosen instead is not. */
      selected: offer.request.selectedOfferId === offer.id,
      request: { ...offer.request, selectedOfferId: undefined },
    })),
    competingOffers: competing,
  });
}
