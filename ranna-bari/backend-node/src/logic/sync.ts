import { Account, Dish, Dispute, Kitchen, Order, Review, type OrderDoc } from '../models/index.js';
import { getSettings } from './settings.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { normaliseServiceAreas, type ServiceArea } from '../lib/bd-areas.js';
import { quotePromotion, redeem } from './promotions.js';
import { balanceFor, post } from './ledger.js';
import { tx } from '../config/db.js';
import type { AppIdentity } from '../auth/app-auth.js';

/**
 * Bringing the app's own records to the server.
 *
 * The app places orders into AsyncStorage and always has. That was the whole
 * design — it works on a plane — and nothing here changes it. But a chat
 * between a customer and their cook needs the server to *independently* know
 * the order is real and who is on it, or "message the kitchen" is a string
 * anybody can post at any kitchen.
 *
 * So this is a bridge, not a migration. The device stays the place an order
 * is created; the server gets told, checks what it can, and becomes the
 * authority on who may talk to whom about it.
 */

/* ------------------------------------------------------------------ *
 * kitchens
 * ------------------------------------------------------------------ */

/**
 * Resolve whatever the app called a kitchen into a row here.
 *
 * Three shapes arrive and all three are legitimate: a bundle id (`4`), an
 * `_id`, and `local-1`. The last is only meaningful relative to a caller — it
 * means *their* kitchen — so it resolves through the account, not by id.
 */
export async function resolveKitchen(chefId: string, caller?: AppIdentity | null) {
  const raw = String(chefId ?? '').trim();
  if (!raw) return null;

  if (raw === 'local-1' || raw === 'local') {
    if (!caller) return null;
    return Kitchen.findOne({ accountId: caller.accountId });
  }

  if (/^\d+$/.test(raw)) return Kitchen.findOne({ legacyId: Number(raw) });

  return Kitchen.findById(raw).catch(() => null);
}

/**
 * Register the caller's own kitchen.
 *
 * A cook builds a kitchen offline — `KitchenContext` creates it the moment
 * they sign up as a cook, and it lives on that device as `local-1`. Nothing
 * here knows it exists, so nobody can message it and no order naming it can
 * be recorded. This is how it arrives.
 *
 * It comes in unverified, and nothing in the body can change that. A kitchen
 * appearing because somebody typed a name into their phone has proved only
 * that they hold a phone number; the KYC queue checks the rest.
 */
/**
 * May this kitchen take on new business?
 *
 * Approval is an operator's decision, and until they make it a kitchen can be
 * set up but not sold from. Registration writes `kycStatus: 'pending'`, so a
 * kitchen that has never been looked at answers false without anything
 * special needing to be written for it.
 *
 * A missing kitchen answers false too. The caller has already proved it owns
 * one, so not finding it means it was deleted mid-request, and the safe
 * reading of that is "no".
 */
export async function kitchenMayTrade(kitchenId: string): Promise<boolean> {
  const kitchen = await Kitchen.findById(kitchenId)
    .select({ kycStatus: 1 })
    .lean()
    .catch(() => null);
  return kitchen?.kycStatus === 'approved';
}

export async function registerKitchen(
  caller: AppIdentity,
  kitchen: {
    name?: string;
    ownerName?: string;
    avatar?: string;
    coverImage?: string;
    photos?: string[];
    specialty?: string;
    specialties?: string[];
    description?: string;
    tags?: string[];
    area?: string;
    lat?: number;
    lng?: number;
    deliveryRadiusKm?: number;
    serviceAreas?: ServiceArea[];
    allBangladesh?: boolean;
    isOpen?: boolean;
    payoutMethod?: string;
    payoutAccount?: string;
  },
): Promise<Result<{ kitchenId: string; created: boolean }>> {
  const existing = await Kitchen.findOne({ accountId: caller.accountId });

  /*
   * A name is required to *create* a kitchen, not to touch one.
   *
   * This checked the body before looking anything up, so it demanded a name
   * on every call — including the partial patches this endpoint also serves.
   * Flipping "open for orders", or picking a new cover photograph, posts one
   * field and nothing else, and each of those came back `name-required` and
   * did nothing. The toggle looked broken because it was.
   *
   * `name` now falls back to the stored one exactly as every other field
   * below already did; it is only missing, and only refused, when there is no
   * kitchen yet to take it from.
   */
  const name = String(kitchen.name ?? '').trim() || String(existing?.name ?? '').trim();
  if (!name) return fail(ERR.NAME_REQUIRED);

  /* Only the fields a cook actually edits are taken. Verification, rating and
     suspension are the platform's answers, not the device's — letting a
     client post them would make the KYC queue decorative. */
  const editable = {
    name,
    ownerName: kitchen.ownerName?.trim() || existing?.ownerName || caller.name || name,
    avatar: kitchen.avatar ?? existing?.avatar ?? '',
    coverImage: kitchen.coverImage ?? existing?.coverImage ?? '',
    /* Replaced wholesale, not merged: the cook's screen sends the gallery it
       is showing, so a removal has to be able to remove. */
    photos: kitchen.photos ?? existing?.photos ?? [],
    specialty: kitchen.specialty ?? existing?.specialty ?? 'Traditional Heritage',
    /* Replaced wholesale rather than merged — the picker sends the set it is
       showing, so unticking one has to be able to remove it. */
    specialties: kitchen.specialties ?? existing?.specialties ?? [],
    description: kitchen.description ?? existing?.description ?? '',
    tags: kitchen.tags ?? existing?.tags ?? [],
    area: kitchen.area ?? existing?.area ?? '',
    lat: typeof kitchen.lat === 'number' ? kitchen.lat : (existing?.lat ?? 0),
    lng: typeof kitchen.lng === 'number' ? kitchen.lng : (existing?.lng ?? 0),
    deliveryRadiusKm:
      typeof kitchen.deliveryRadiusKm === 'number'
        ? kitchen.deliveryRadiusKm
        : (existing?.deliveryRadiusKm ?? 3),
    /* Replaced wholesale, like the photo sets: the picker sends the divisions
       it is showing, so unticking a district has to be able to untick it.
       Normalised rather than trusted — this arrives as arbitrary JSON. */
    serviceAreas: normaliseServiceAreas(kitchen.serviceAreas ?? existing?.serviceAreas ?? []),
    allBangladesh:
      typeof kitchen.allBangladesh === 'boolean'
        ? kitchen.allBangladesh
        : (existing?.allBangladesh ?? false),
    isOpen: typeof kitchen.isOpen === 'boolean' ? kitchen.isOpen : (existing?.isOpen ?? false),
    /* Where the cook's money goes. The cook names it, the panel reads it —
       the operator paying a run has a place to look besides a chat thread. */
    payoutMethod: kitchen.payoutMethod ?? existing?.payoutMethod ?? '',
    payoutAccount: kitchen.payoutAccount ?? existing?.payoutAccount ?? '',
  };

  if (existing) {
    await Kitchen.updateOne({ _id: existing._id }, editable);
    return ok({ kitchenId: String(existing._id), created: false });
  }

  const created = await Kitchen.create({
    accountId: caller.accountId,
    ...editable,
    isVerified: false,
    kycStatus: 'pending',
  });

  // The account is a cook's account now, so its next token says so.
  await Account.updateOne(
    { _id: caller.accountId },
    { role: 'cook', kitchenName: name },
  );

  return ok({ kitchenId: String(created._id), created: true });
}

/* ------------------------------------------------------------------ *
 * orders
 * ------------------------------------------------------------------ */

export type OrderDraft = {
  /** The app's own order code, e.g. "RB-4KX9". The natural idempotency key. */
  code: string;
  kind?: 'cod' | 'wallet' | 'meal' | 'store' | 'request';
  chefId: string;
  chefName?: string;
  title?: string;
  image?: string;
  items?: { id?: string; name: string; price: number; qty: number; image?: string }[];
  subtotal?: number;
  /** A promotion code the customer typed. Validated here, not trusted. */
  promoCode?: string;
  deliveryFee?: number;
  platformFee?: number;
  total?: number;
  status?: string;
  handover?: string;
  contact?: { name?: string; phone?: string };
  address?: { label?: string; line?: string; area?: string; instructions?: string };
  /** The customer's words for the cook, capped at 300 by the route. */
  note?: string;
  createdAt?: string;
  history?: { status: string; at: string }[];
};

/**
 * Record an order the app placed.
 *
 * Idempotent on the app's own order code, which is unique here — so a retry
 * after a dropped connection returns the stored order rather than creating a
 * second one, exactly like a replayed chat message.
 *
 * What is **not** trusted: the device. Whoever holds the token is the
 * customer on the order, whatever the body says, and the money is the
 * server's: prices come from the menu, fees from the platform settings, the
 * opening status and clock from here. Cash orders are priced the same way as
 * wallet ones, because release pays the cook out of the recorded amount
 * either way.
 */
export async function recordOrder(
  caller: AppIdentity,
  draft: OrderDraft,
): Promise<Result<{ orderId: string; code: string; created: boolean }>> {
  const code = String(draft.code ?? '').trim();
  if (!code) return fail(ERR.NAME_REQUIRED);

  const existing = await Order.findOne({ code });
  if (existing) {
    // A replay from somebody else's device is not a replay.
    if (existing.customerKey !== caller.customerKey) return fail(ERR.FORBIDDEN);
    return ok({ orderId: String(existing._id), code, created: false });
  }

  /* This endpoint opens the two rails a dish order can run on. Meal, store and
     request orders are created by their own server-side paths, where the
     money is held in the same transaction. Taking `kind` from the body let a
     client file a `store` order as `held` with no hold behind it, and the
     release then paid the cook out of money nobody had deposited. */
  const kind = draft.kind ?? 'cod';
  if (kind !== 'cod' && kind !== 'wallet') return fail(ERR.BAD_REQUEST, { field: 'kind' });

  const kitchen = await resolveKitchen(draft.chefId, caller);
  if (!kitchen) return fail(ERR.NO_KITCHEN);

  /* The same gate every other trading path asks. An unapproved kitchen has
     proved nothing yet, and a cook ordering from their own kitchen is only
     ever moving money in a circle. */
  if (kitchen.kycStatus !== 'approved') return fail(ERR.NO_KITCHEN);
  if (kitchen.accountId === caller.accountId) {
    return fail(ERR.BAD_REQUEST, { field: 'chefId' });
  }

  /*
   * Priced here, from the menu, and never from the device.
   *
   * The old comment argued a cash order moves no money, so the totals could be
   * recorded as sent. They do move money: `confirmReceived` books the order's
   * `amount` as cash collected and release pays the cook out of it, so a total
   * of ৳50,000 on a ৳100 dish was a payout. Every line has to name a dish
   * this kitchen actually sells, and its price is the dish's.
   */
  const sent = draft.items ?? [];
  if (!sent.length || sent.length > 50) return fail(ERR.EMPTY_CART);

  const items: NonNullable<OrderDraft['items']> = [];
  for (const line of sent) {
    const qty = Number(line?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return fail(ERR.BAD_REQUEST, { field: 'qty' });
    }

    const dish = line?.id
      ? await Dish.findOne({ _id: String(line.id), kitchenId: String(kitchen._id) })
          .lean()
          .catch(() => null)
      : null;
    if (!dish || dish.available === false) {
      return fail(ERR.BAD_REQUEST, { field: 'items', id: line?.id ?? null });
    }

    items.push({
      id: String(dish._id),
      name: dish.name,
      price: dish.price,
      qty,
      image: line.image ?? dish.image ?? '',
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  /* Fees are the platform's setting. The app still carries the old 40/10
     constants, so a number above the current setting is clamped to it rather
     than refused — a stale build keeps working, and a hand-made request cannot
     inflate the charge. Below it is taken as sent: the app sends 0 for every
     kitchen after the first in a basket. */
  const settings = await getSettings();
  const clampFee = (sentFee: unknown, ceiling: number) => {
    const n = Math.round(Number(sentFee ?? 0));
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), ceiling) : 0;
  };
  const deliveryFee = clampFee(draft.deliveryFee, settings.deliveryFee);
  const platformFee = clampFee(draft.platformFee, settings.platformFee);

  const total = subtotal + deliveryFee + platformFee;
  if (!Number.isSafeInteger(total) || total <= 0) return fail(ERR.BAD_AMOUNT);

  /* The order's clock is the server's. A backdated `createdAt` is a way to
     make a fresh order look old to anything that ages on it. */
  const createdAt = new Date();

  /* Only the two words an order may open with. The app sends `placed`; the
     escrow rail's own default is `confirmed`. Anything further along the
     rail — `delivered` — is not a way to begin. */
  const openingStatus =
    draft.status === 'placed' || draft.status === 'confirmed'
      ? draft.status
      : kind === 'wallet'
        ? 'confirmed'
        : 'placed';

  /*
   * Wallet orders take the money now; cash orders take it at the door.
   *
   * Checked before the order exists rather than after: an order written and
   * then found unaffordable would have to be deleted, and a half-written
   * order is exactly the state the ledger is meant to make impossible.
   */
  const payFromWallet = kind === 'wallet';

  /*
   * Re-quoted here, and never trusted from the device.
   *
   * Above the balance check on purpose: the customer is charged `paid`, so
   * checking their wallet against the gross would refuse somebody who can
   * comfortably afford the discounted price.
   *
   * A refused code is not a refused order — an expired code simply takes
   * nothing off. The alternative is failing a checkout over a discount the
   * customer would happily have gone without.
   *
   * Wallet only. Cash on delivery never touches escrow (the rider takes the
   * money), so there is no posting for the platform to fund the discount
   * against and nothing that would stop the cook being paid in full. The app
   * offers the field on wallet payments alone for the same reason.
   */
  const quote =
    payFromWallet && draft.promoCode
      ? await quotePromotion({
          code: draft.promoCode,
          customerKey: caller.customerKey,
          amount: total,
        })
      : null;

  const discount = quote?.ok ? quote.result.discount : 0;
  const paid = total - discount;

  if (payFromWallet) {
    const balance = await balanceFor('customer', caller.customerKey);
    if (balance < paid) {
      return fail(ERR.LOW_BALANCE, { short: paid - balance, balance });
    }
  }

  const order = await Order.create({
    code,
    kind,
    kitchenId: String(kitchen._id),
    cookName: draft.chefName || kitchen.name,
    title: draft.title || items[0]?.name || 'Order',
    image: draft.image ?? items[0]?.image ?? '',

    customerKey: caller.customerKey,
    customerName: draft.contact?.name || caller.name || '',
    phone: draft.contact?.phone || caller.phone || '',
    address: draft.address ?? null,
    /* "Jhal kom" — the cook's copy, distinct from address.instructions,
       which is the rider's. Capped upstream by the route's zod body. */
    note: String(draft.note ?? '').slice(0, 300),

    handover: draft.handover ?? 'delivery',
    lines: items,

    subtotal,
    deliveryFee,
    platformFee,
    price: total,
    amount: total,

    /* The two rails start with different words: COD opens at `placed`,
       escrow at `confirmed`, and a wallet order that opened at `placed`
       would sit on a rail with no step of that name. */
    status: openingStatus,
    /* Cash on delivery never touches escrow — the rider takes the money.
       Anything else is held until the customer says the food arrived. */
    payment: kind === 'cod' ? 'cod' : 'held',

    history: [{ status: openingStatus, at: createdAt.toISOString() }],
    createdAt,
  });

  if (payFromWallet) {
    const orderId = String(order._id);

    try {
      await tx(async (session) => {
        /* `fromRef` is the customer's key and not decoration: `balanceFor` folds
           a debit only when it can see whose it was, so a hold posted without one
           leaves the wallet reading as though nothing had been spent. */
        if (paid > 0) {
          await post(session, {
            kind: 'hold',
            amount: paid,
            from: 'customer',
            to: 'held',
            fromRef: caller.customerKey,
            orderId,
            note: `Held for ${order.title}`,
            idemKey: `hold:${orderId}`,
          });
        }

        /* The platform's half. Escrow ends up holding the full gross, so the
           release splits what the cook was promised and the discount lands
           where it belongs — on the platform's own account. */
        if (discount > 0 && quote?.ok) {
          await post(session, {
            kind: 'promo',
            amount: discount,
            from: 'platform',
            to: 'held',
            orderId,
            note: `${quote.result.code} on ${order.title}`,
            idemKey: `promo:${orderId}`,
          });

          await redeem(session, {
            quote: quote.result,
            customerKey: caller.customerKey,
            orderId,
          });

          await Order.updateOne(
            { _id: orderId },
            { discount, promoCode: quote.result.code, paid },
            { session },
          );
        } else {
          await Order.updateOne({ _id: orderId }, { paid }, { session });
        }
      });
    } catch (err) {
      /* The order was written before the hold, so a hold that fails leaves a
         `held` order with nothing behind it — and a retry on the same code
         would take the replay branch above and never repair it. The ledger has
         no entry for this order (the transaction rolled back), so removing the
         row is safe and leaves the customer free to try again. */
      await Order.deleteOne({ _id: orderId }).catch(() => undefined);
      throw err;
    }
  }

  return ok({ orderId: String(order._id), code, created: true });
}

/**
 * One order, whole.
 *
 * The app's order tracker draws the rail, the receipt and the refund line off
 * a single object — `history` for the timestamps under each step, `lines` and
 * `subtotal` for the receipt, `payment` and `cancelReason` for what happened
 * to the money. A summary shape would mean the tracker fetching each of those
 * separately or, worse, rendering a step with no time against it.
 *
 * `lines` and `history` are bounded — a basket and a six-step rail — which is
 * why they are embedded in the document and can be sent with it.
 */
export function shapeOrder(
  row: OrderDoc & { _id: unknown },
  extra: { disputed?: boolean; reviewed?: boolean } = {},
) {
  return {
    id: String(row._id),
    code: row.code,
    kind: row.kind,

    mealId: row.mealId ?? null,
    storeId: row.storeId ?? null,
    requestId: row.requestId ?? null,
    offerId: row.offerId ?? null,
    /* The meal booking this order is one meal of, so an order screen can offer
       the way back to the month it was bought in. */
    bookingId: row.bookingId ?? null,

    kitchenId: row.kitchenId,
    cookName: row.cookName,
    title: row.title,
    image: row.image,

    customerKey: row.customerKey,
    customerName: row.customerName,
    phone: row.phone,
    address: row.address,
    note: row.note ?? '',

    handover: row.handover,
    serveDate: row.serveDate ?? null,
    slot: row.slot ?? null,

    lines: row.lines ?? [],
    subtotal: row.subtotal,
    deliveryFee: row.deliveryFee,
    platformFee: row.platformFee,
    amount: row.amount,

    preorder: row.preorder,
    status: row.status,
    payment: row.payment,

    rejectReason: row.rejectReason ?? null,
    cancelReason: row.cancelReason ?? null,

    /**
     * Whether a case is open against this order.
     *
     * The money answer to a dispute is already visible — `payment` stays
     * `held` while one is running — but "held" is also what every ordinary
     * order says between delivery and confirmation, so the two are
     * indistinguishable from the app. A cook watching an order that should
     * have released days ago had nothing to read but the same word.
     *
     * The reason and the resolution stay off the wire. Those are an
     * operator's working notes about a customer's complaint, and neither side
     * of the order should read them from the other's screen.
     */
    disputed: extra.disputed ?? false,

    /**
     * Whether this order has already been rated.
     *
     * One review per order is enforced here, so without this flag the app has
     * two bad choices: offer the prompt on every visit to a finished order
     * and let the server refuse it, or offer it exactly once and lose anybody
     * who tapped "Not now". Neither is a fact a client can work out alone.
     */
    reviewed: extra.reviewed ?? false,

    history: row.history ?? [],
    createdAt: row.createdAt,
  };
}

/** Which of these orders have already been rated, as one query rather than N. */
async function reviewedAmong(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await Review.find({ orderId: { $in: ids } }, { orderId: 1 })
    .lean()
    .catch(() => []);
  return new Set(rows.map((row) => String(row.orderId)));
}

/** Which of these orders have an unresolved case, as one query rather than N. */
async function disputedAmong(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await Dispute.find(
    { orderId: { $in: ids }, status: { $ne: 'resolved' } },
    { orderId: 1 },
  )
    .lean()
    .catch(() => []);
  return new Set(rows.map((row) => String(row.orderId)));
}

/** Every order this caller is on — as the customer, or as the kitchen. */
/**
 * Every order this caller is on, newest first.
 *
 * `before` is a cursor: a createdAt (ISO) strictly older than the first row
 * of the last page, for scrolling further back. Absent means the first
 * page. Keyset rather than skip — a page fetched by offset can repeat or
 * skip rows when a new order lands mid-scroll, and an order that appears
 * twice on a board is worse than one that arrives a moment late.
 */
export async function ordersFor(caller: AppIdentity, take = 50, before?: string) {
  const since = before && !Number.isNaN(new Date(before).getTime()) ? new Date(before) : null;

  const rows = await Order.find({
    ...(caller.kitchenId
      ? { $or: [{ customerKey: caller.customerKey }, { kitchenId: caller.kitchenId }] }
      : { customerKey: caller.customerKey }),
    ...(since ? { createdAt: { $lt: since } } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(take)
    .lean();

  const ids = rows.map((row) => String(row._id));
  const [disputed, reviewed] = await Promise.all([
    disputedAmong(ids),
    reviewedAmong(ids),
  ]);

  return rows.map((row) =>
    shapeOrder(row as unknown as OrderDoc & { _id: unknown }, {
      disputed: disputed.has(String(row._id)),
      reviewed: reviewed.has(String(row._id)),
    }),
  );
}

/**
 * One order by id, or null if it is not this caller's to read.
 *
 * The ownership test is in the query rather than after it: a caller who is
 * neither the customer nor the kitchen gets no document at all, so there is no
 * branch in which a fetched-then-rejected order could be returned by a later
 * edit that forgets the check.
 */
export async function orderFor(caller: AppIdentity, id: string) {
  const row = await Order.findOne({
    _id: id,
    ...(caller.kitchenId
      ? { $or: [{ customerKey: caller.customerKey }, { kitchenId: caller.kitchenId }] }
      : { customerKey: caller.customerKey }),
  })
    .lean()
    .catch(() => null);

  if (!row) return null;

  const [disputed, reviewed] = await Promise.all([
    disputedAmong([String(row._id)]),
    reviewedAmong([String(row._id)]),
  ]);
  return shapeOrder(row as unknown as OrderDoc & { _id: unknown }, {
    disputed: disputed.has(String(row._id)),
    reviewed: reviewed.has(String(row._id)),
  });
}
