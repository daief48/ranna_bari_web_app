/*
 * No `server-only` guard — same reason as `lib/logic/chat.ts`: `server.ts`
 * loads this outside the Next bundle. Prisma is what keeps it off a client.
 */
import { db } from '../db';
import { ERR, fail, ok, type Result } from '../domain';
import { toJson } from '../mappers';
import type { AppIdentity } from '../app-auth';

/**
 * Bringing the app's orders to the server.
 *
 * The app places orders into AsyncStorage and always has. That was the whole
 * design — it works on a plane — and nothing here changes it. But a chat
 * between a customer and their cook needs the server to *independently* know
 * the order is real and who is on it, or "message the kitchen" is just a
 * string anybody can post to any kitchen.
 *
 * So this is a bridge, not a migration. The device stays the place an order
 * is created; the server gets told about it, checks what it can, and becomes
 * the authority on who may talk to whom about it.
 *
 * ## The two id spaces
 *
 * The app ships twenty kitchens numbered 1–20 in `chefs.json` and this
 * database gives everything a cuid, so `chefId: 4` means nothing here without
 * `Kitchen.legacyId`. A cook's own kitchen is a third case: it exists only on
 * their device as `local-1` until they register it, which is what
 * `registerKitchen` is for.
 */

/* ------------------------------------------------------------------ *
 * kitchens
 * ------------------------------------------------------------------ */

/**
 * Resolve whatever the app called a kitchen into a row here.
 *
 * Three shapes arrive: a bundle id (`4`), a cuid, and `local-1`. The last one
 * is only meaningful relative to a caller — it means *their* kitchen — so it
 * is resolved through the account rather than by id.
 */
export async function resolveKitchen(chefId: string, caller?: AppIdentity | null) {
  const raw = String(chefId ?? '').trim();
  if (!raw) return null;

  if (raw === 'local-1' || raw === 'local') {
    if (!caller) return null;
    return db.kitchen.findFirst({ where: { accountId: caller.accountId } });
  }

  if (/^\d+$/.test(raw)) {
    return db.kitchen.findUnique({ where: { legacyId: Number(raw) } });
  }

  return db.kitchen.findUnique({ where: { id: raw } });
}

/**
 * Register the caller's own kitchen.
 *
 * A cook builds a kitchen offline — `KitchenContext` creates it the moment
 * they sign up as a cook, and it lives on that device with the id `local-1`.
 * Nothing on the server knows it exists, so nobody can message it. This is
 * how it arrives, once, on the account that owns it.
 *
 * It comes in unverified. A kitchen appearing because somebody typed a name
 * into their phone has proved nothing except that they hold a phone number,
 * and the KYC queue is where the rest gets checked.
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

  const existing = await db.kitchen.findFirst({ where: { accountId: caller.accountId } });

  if (existing) {
    /* Only the fields a cook actually edits are taken. Verification status,
       rating and suspension are the platform's answers, not the device's, and
       letting a client post them would make the KYC queue decorative. */
    const updated = await db.kitchen.update({
      where: { id: existing.id },
      data: {
        name,
        ownerName: kitchen.ownerName?.trim() || existing.ownerName,
        avatar: kitchen.avatar || existing.avatar,
        coverImage: kitchen.coverImage || existing.coverImage,
        specialty: kitchen.specialty || existing.specialty,
        description: kitchen.description || existing.description,
        tags: kitchen.tags ? toJson(kitchen.tags) : existing.tags,
        area: kitchen.area || existing.area,
        lat: typeof kitchen.lat === 'number' ? kitchen.lat : existing.lat,
        lng: typeof kitchen.lng === 'number' ? kitchen.lng : existing.lng,
        deliveryRadiusKm:
          typeof kitchen.deliveryRadiusKm === 'number'
            ? kitchen.deliveryRadiusKm
            : existing.deliveryRadiusKm,
        isOpen: typeof kitchen.isOpen === 'boolean' ? kitchen.isOpen : existing.isOpen,
      },
    });
    return ok({ kitchenId: updated.id, created: false });
  }

  const created = await db.kitchen.create({
    data: {
      accountId: caller.accountId,
      name,
      ownerName: kitchen.ownerName?.trim() || caller.name || name,
      avatar: kitchen.avatar ?? '',
      coverImage: kitchen.coverImage ?? '',
      specialty: kitchen.specialty ?? 'Traditional Heritage',
      description: kitchen.description ?? '',
      tags: toJson(kitchen.tags ?? []),
      area: kitchen.area ?? '',
      lat: kitchen.lat ?? 0,
      lng: kitchen.lng ?? 0,
      deliveryRadiusKm: kitchen.deliveryRadiusKm ?? 3,
      isOpen: kitchen.isOpen ?? false,
      isVerified: false,
      kycStatus: 'pending',
    },
  });

  // The account is a cook's account now, so its token says so on next refresh.
  await db.account.update({
    where: { id: caller.accountId },
    data: { role: 'cook', kitchenName: name },
  });

  return ok({ kitchenId: created.id, created: true });
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
 * Idempotent on the app's own order code, which is already unique in this
 * table — so a retry after a dropped connection returns the stored order
 * rather than creating a second one, exactly like a replayed chat message.
 *
 * What is *not* trusted: the customer. Whoever holds the token is the
 * customer on the order, whatever the body says. Everything else on a
 * cash-on-delivery order is the device's business — no money moves here, the
 * rider takes cash — so the totals are recorded as sent rather than
 * recomputed. An escrow order would be a different function, because there
 * the amount decides what gets held.
 */
export async function recordOrder(
  caller: AppIdentity,
  draft: OrderDraft,
): Promise<Result<{ orderId: string; code: string; created: boolean }>> {
  const code = String(draft.code ?? '').trim();
  if (!code) return fail(ERR.NAME_REQUIRED);

  const existing = await db.order.findUnique({ where: { code } });
  if (existing) {
    // A replay from somebody else's device is not a replay.
    if (existing.customerKey !== caller.customerKey) return fail(ERR.FORBIDDEN);
    return ok({ orderId: existing.id, code, created: false });
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

  const order = await db.order.create({
    data: {
      code,
      kind: draft.kind ?? 'cod',
      kitchenId: kitchen.id,
      cookName: draft.chefName || kitchen.name,
      title: draft.title || items[0]?.name || 'Order',
      image: draft.image ?? items[0]?.image ?? '',

      customerKey: caller.customerKey,
      customerName: draft.contact?.name || caller.name || '',
      phone: draft.contact?.phone || caller.phone || '',
      address: toJson(draft.address ?? null),

      handover: draft.handover ?? 'delivery',
      lines: toJson(items),

      subtotal,
      deliveryFee,
      platformFee,
      price: total,
      amount: total,

      status: draft.status ?? 'placed',
      // Cash on delivery never touches escrow — the rider takes the money.
      payment: (draft.kind ?? 'cod') === 'cod' ? 'cod' : 'held',

      history: toJson(draft.history ?? [{ status: draft.status ?? 'placed', at: createdAt.toISOString() }]),
      createdAt,
    },
  });

  return ok({ orderId: order.id, code, created: true });
}

/** Every order this caller is on — as the customer, or as the kitchen. */
export async function ordersFor(caller: AppIdentity, take = 50) {
  return db.order.findMany({
    where: caller.kitchenId
      ? { OR: [{ customerKey: caller.customerKey }, { kitchenId: caller.kitchenId }] }
      : { customerKey: caller.customerKey },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      code: true,
      kind: true,
      status: true,
      title: true,
      cookName: true,
      customerName: true,
      kitchenId: true,
      amount: true,
      createdAt: true,
    },
  });
}
