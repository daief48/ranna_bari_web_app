import { Account, Kitchen, Order, type OrderDoc } from '../models/index.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
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
    description?: string;
    tags?: string[];
    area?: string;
    lat?: number;
    lng?: number;
    deliveryRadiusKm?: number;
    isOpen?: boolean;
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
    description: kitchen.description ?? existing?.description ?? '',
    tags: kitchen.tags ?? existing?.tags ?? [],
    area: kitchen.area ?? existing?.area ?? '',
    lat: typeof kitchen.lat === 'number' ? kitchen.lat : (existing?.lat ?? 0),
    lng: typeof kitchen.lng === 'number' ? kitchen.lng : (existing?.lng ?? 0),
    deliveryRadiusKm:
      typeof kitchen.deliveryRadiusKm === 'number'
        ? kitchen.deliveryRadiusKm
        : (existing?.deliveryRadiusKm ?? 3),
    isOpen: typeof kitchen.isOpen === 'boolean' ? kitchen.isOpen : (existing?.isOpen ?? false),
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
  deliveryFee?: number;
  platformFee?: number;
  total?: number;
  status?: string;
  handover?: string;
  contact?: { name?: string; phone?: string };
  address?: { label?: string; line?: string; area?: string; instructions?: string };
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
 * What is **not** trusted: the customer. Whoever holds the token is the
 * customer on the order, whatever the body says. Everything else on a
 * cash-on-delivery order is the device's business — no money moves here, the
 * rider takes cash — so totals are recorded as sent rather than recomputed.
 * An escrow order would be a different function, because there the amount
 * decides what gets held.
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

  const kitchen = await resolveKitchen(draft.chefId, caller);
  if (!kitchen) return fail(ERR.NO_KITCHEN);

  const items = draft.items ?? [];
  const subtotal =
    draft.subtotal ?? items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const deliveryFee = draft.deliveryFee ?? 0;
  const platformFee = draft.platformFee ?? 0;
  const total = draft.total ?? subtotal + deliveryFee + platformFee;
  const createdAt = draft.createdAt ? new Date(draft.createdAt) : new Date();
  const kind = draft.kind ?? 'cod';

  /*
   * Wallet orders take the money now; cash orders take it at the door.
   *
   * Checked before the order exists rather than after: an order written and
   * then found unaffordable would have to be deleted, and a half-written
   * order is exactly the state the ledger is meant to make impossible.
   */
  const payFromWallet = kind === 'wallet';

  if (payFromWallet) {
    const balance = await balanceFor('customer', caller.customerKey);
    if (balance < total) {
      return fail(ERR.LOW_BALANCE, { short: total - balance, balance });
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
    status: draft.status ?? (payFromWallet ? 'confirmed' : 'placed'),
    /* Cash on delivery never touches escrow — the rider takes the money.
       Anything else is held until the customer says the food arrived. */
    payment: kind === 'cod' ? 'cod' : 'held',

    history: draft.history ?? [
      {
        status: draft.status ?? (payFromWallet ? 'confirmed' : 'placed'),
        at: createdAt.toISOString(),
      },
    ],
    createdAt,
  });

  if (payFromWallet) {
    /* `fromRef` is the customer's key and not decoration: `balanceFor` folds
       a debit only when it can see whose it was, so a hold posted without one
       leaves the wallet reading as though nothing had been spent. */
    await tx(async (session) =>
      post(session, {
        kind: 'hold',
        amount: total,
        from: 'customer',
        to: 'held',
        fromRef: caller.customerKey,
        orderId: String(order._id),
        note: `Held for ${order.title}`,
        idemKey: `hold:${String(order._id)}`,
      }),
    );
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
export function shapeOrder(row: OrderDoc & { _id: unknown }) {
  return {
    id: String(row._id),
    code: row.code,
    kind: row.kind,

    mealId: row.mealId ?? null,
    storeId: row.storeId ?? null,
    requestId: row.requestId ?? null,
    offerId: row.offerId ?? null,

    kitchenId: row.kitchenId,
    cookName: row.cookName,
    title: row.title,
    image: row.image,

    customerKey: row.customerKey,
    customerName: row.customerName,
    phone: row.phone,
    address: row.address,

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

    history: row.history ?? [],
    createdAt: row.createdAt,
  };
}

/** Every order this caller is on — as the customer, or as the kitchen. */
export async function ordersFor(caller: AppIdentity, take = 50) {
  const rows = await Order.find(
    caller.kitchenId
      ? { $or: [{ customerKey: caller.customerKey }, { kitchenId: caller.kitchenId }] }
      : { customerKey: caller.customerKey },
  )
    .sort({ createdAt: -1 })
    .limit(take)
    .lean();

  return rows.map((row) => shapeOrder(row as unknown as OrderDoc & { _id: unknown }));
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

  return row ? shapeOrder(row as unknown as OrderDoc & { _id: unknown }) : null;
}
