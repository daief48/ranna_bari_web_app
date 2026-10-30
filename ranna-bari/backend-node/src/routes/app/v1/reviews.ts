import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Types } from 'mongoose';

import { ERR, errText } from '../../../lib/domain.js';
import { Kitchen, Review } from '../../../models/index.js';

/**
 * The cook's reviews, in public.
 *
 * A customer deciding whether to order a dish or a pantry item wants to know
 * what people who already ate from this cook said. The aggregate on the card
 * (`rating (reviewCount)`) says how many and how high; this says why. Reviews
 * belong to the kitchen, not to a product, so the dish page, the product page
 * and the chef page all read this one endpoint.
 *
 * Public and unauthenticated like the directory. What it never returns:
 * `customerKey` and `orderId` (who bought what is not for strangers), and any
 * hidden review (a moderator hid it for a reason, and hidden reviews are
 * already excluded from the kitchen's rating, so the summary below is computed
 * over the very same set and the two can never disagree).
 */
export async function reviewRoutes(app: FastifyInstance) {
  app.get('/kitchens/:id/reviews', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!Types.ObjectId.isValid(id)) {
      return reply
        .status(404)
        .send({ error: ERR.NO_KITCHEN, message: errText(ERR.NO_KITCHEN) });
    }

    const kitchen = await Kitchen.findById(id).select({ _id: 1 }).lean();
    if (!kitchen) {
      return reply
        .status(404)
        .send({ error: ERR.NO_KITCHEN, message: errText(ERR.NO_KITCHEN) });
    }

    const parsed = z
      .object({
        take: z.coerce.number().int().min(1).max(50).default(5),
        before: z.string().optional(),
      })
      .safeParse(request.query ?? {});
    const take = parsed.success ? parsed.data.take : 5;
    const beforeRaw = parsed.success ? parsed.data.before : undefined;
    const since =
      beforeRaw && !Number.isNaN(new Date(beforeRaw).getTime()) ? new Date(beforeRaw) : null;

    /* Fetch one extra row: it tells us whether another page exists without a
       second count query (an Atlas round trip is the cost that matters). */
    const [rows, buckets] = await Promise.all([
      Review.find({
        kitchenId: id,
        hidden: false,
        ...(since ? { createdAt: { $lt: since } } : {}),
      })
        .select({ name: 1, avatar: 1, area: 1, rating: 1, text: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(take + 1)
        .lean(),
      Review.aggregate<{ _id: number; n: number }>([
        { $match: { kitchenId: id, hidden: false } },
        { $group: { _id: { $round: ['$rating', 0] }, n: { $sum: 1 } } },
      ]),
    ]);

    const page = rows.slice(0, take);
    const histogram: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let total = 0;
    let sum = 0;
    for (const b of buckets) {
      const star = Math.min(5, Math.max(1, Number(b._id)));
      histogram[String(star)] += b.n;
      total += b.n;
      sum += star * b.n;
    }

    reply.header('cache-control', 'public, max-age=30, stale-while-revalidate=120');
    return {
      reviews: page.map((r) => ({
        id: String(r._id),
        name: r.name,
        avatar: r.avatar,
        area: r.area,
        rating: r.rating,
        text: r.text ?? '',
        createdAt: r.createdAt,
      })),
      /* The next page starts strictly before the last row shown; null when
         the extra row was not there. */
      cursor: rows.length > take ? page[page.length - 1].createdAt : null,
      summary: {
        /* One decimal, the same rounding the kitchen card uses. */
        rating: total ? Math.round((sum / total) * 10) / 10 : 0,
        reviewCount: total,
        histogram,
      },
    };
  });
}
