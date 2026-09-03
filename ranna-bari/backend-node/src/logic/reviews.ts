/**
 * Reviews, and the score a kitchen carries because of them.
 *
 * A customer had no way to leave one. The collection existed, the admin panel
 * moderated it, the app read it — and nothing anywhere could write one. Every
 * review in the database arrived with the seed.
 *
 * The admin side already keeps `Kitchen.rating` honest: hiding a review
 * recomputes the average from what is still visible, in the same transaction,
 * for the reason its own comment gives. `recomputeKitchen` here is the same
 * arithmetic for the other direction — a review arriving rather than leaving.
 * It is deliberately a read-back of every visible review rather than an
 * adjustment of the stored mean, which makes it self-correcting: a score that
 * has drifted comes back right the next time anybody rates.
 */
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { Kitchen, Order, Review } from '../models/index.js';

/** Statuses where the food has actually reached the customer. */
const ARRIVED = ['delivered', 'completed'];

/**
 * Recompute a kitchen's public score from the reviews that still count.
 *
 * Hidden reviews are excluded, which is the whole point of hiding one. A
 * kitchen whose every review has been hidden goes back to zero rather than
 * keeping its last average — an unrated kitchen and a kitchen whose reviews
 * were all withdrawn are the same thing to a customer reading the card.
 */
export async function recomputeKitchen(kitchenId: string): Promise<void> {
  const [agg] = await Review.aggregate<{ _id: null; avg: number; count: number }>([
    { $match: { kitchenId, hidden: false } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await Kitchen.updateOne(
    { _id: kitchenId },
    {
      /* One decimal place, because that is what the card shows. Storing the
         full float would make two kitchens that both display 4.7 sort against
         each other on digits nobody can see. */
      rating: agg ? Math.round(agg.avg * 10) / 10 : 0,
      reviewCount: agg?.count ?? 0,
    },
  ).catch(() => {
    /* A kitchen deleted between the aggregate and the write is not an error
       worth failing a review over. */
  });
}

/**
 * One review, from the customer an order belongs to.
 *
 * The order is the permission: you may rate a kitchen you bought from, once,
 * after the food arrived. That is stricter than "any signed-in customer may
 * post a rating", and deliberately so — a score anybody can write is a score
 * nobody can trust, and this one decides who appears first on the home screen.
 */
export async function leaveReview(args: {
  orderId: string;
  customerKey: string;
  rating: number;
  text?: string;
}): Promise<Result<{ reviewId: string; rating: number; reviewCount: number }>> {
  const rating = Math.round(Number(args.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return fail(ERR.BAD_AMOUNT);

  const order = await Order.findById(args.orderId)
    .lean()
    .catch(() => null);
  if (!order) return fail(ERR.NO_ORDER);

  /* Yours, and arrived. Both are refusals rather than silent no-ops, because
     the app only offers this button on an order that passes both — reaching
     here without them means something is wrong, not that the user was early. */
  if (order.customerKey !== args.customerKey) return fail(ERR.FORBIDDEN);
  if (!ARRIVED.includes(order.status)) return fail(ERR.WRONG_STATE);

  /* One per order. The unique index does the real enforcing against two taps
     racing; this is the readable refusal for the ordinary second visit. */
  const already = await Review.findOne({ orderId: args.orderId }).lean();
  if (already) return fail(ERR.DUPLICATE);

  const area =
    (order.address as { area?: string } | null)?.area ?? '';

  const created = await Review.create({
    kitchenId: order.kitchenId,
    orderId: args.orderId,
    customerKey: order.customerKey,
    name: order.customerName || 'A customer',
    area,
    rating,
    text: String(args.text ?? '').trim().slice(0, 1000),
    date: new Date().toISOString().slice(0, 10),
  }).catch(() => null);

  /* The index rejected it, which means the other tap won. That is the
     outcome the customer wanted either way. */
  if (!created) return fail(ERR.DUPLICATE);

  await recomputeKitchen(order.kitchenId);

  const kitchen = await Kitchen.findById(order.kitchenId)
    .select({ rating: 1, reviewCount: 1 })
    .lean()
    .catch(() => null);

  return ok({
    reviewId: String(created._id),
    rating: kitchen?.rating ?? rating,
    reviewCount: kitchen?.reviewCount ?? 1,
  });
}
