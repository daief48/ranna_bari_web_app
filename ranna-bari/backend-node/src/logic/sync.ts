import { Account, Kitchen, Order } from '../models/index.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
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
export async function registerKitchen(
  caller: AppIdentity,
  kitchen: {
    name?: string;
    ownerName?: string;
    avatar?: string;
    coverImage?: string;
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
  const name = String(kitchen.name ?? '').trim();
  if (!name) return fail(ERR.NAME_REQUIRED);

  const existing = await Kitchen.findOne({ accountId: caller.accountId });

  /* Only the fields a cook actually edits are taken. Verification, rating and
     suspension are the platform's answers, not the device's — letting a
     client post them would make the KYC queue decorative. */
  const editable = {
    name,
    ownerName: kitchen.ownerName?.trim() || existing?.ownerName || caller.name || name,
    avatar: kitchen.avatar ?? existing?.avatar ?? '',
    coverImage: kitchen.coverImage ?? existing?.coverImage ?? '',
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
  kind?: 'cod' | 'meal' | 'store' | 'request';
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

    status: draft.status ?? 'placed',
    // Cash on delivery never touches escrow — the rider takes the money.
    payment: kind === 'cod' ? 'cod' : 'held',

    history: draft.history ?? [{ status: draft.status ?? 'placed', at: createdAt.toISOString() }],
    createdAt,
  });

  return ok({ orderId: String(order._id), code, created: true });
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

  return rows.map((row) => ({
    id: String(row._id),
    code: row.code,
    kind: row.kind,
    status: row.status,
    title: row.title,
    cookName: row.cookName,
    customerName: row.customerName,
    kitchenId: row.kitchenId,
    amount: row.amount,
    createdAt: row.createdAt,
  }));
}
