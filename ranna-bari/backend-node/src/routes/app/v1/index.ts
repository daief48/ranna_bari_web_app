import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import {
  bearerFrom,
  identify,
  requestOtp,
  verifyOtp,
  type AppIdentity,
} from '../../../auth/app-auth.js';
import { readSession } from '../../../auth/admin-auth.js';
import { getFlags, getSettings } from '../../../logic/settings.js';
import {
  markRead,
  messagesFor,
  openThread,
  sendMessage,
  shapeThread,
  threadFor,
  threadsFor,
  unreadTotal,
  type Viewer,
} from '../../../logic/chat.js';
import { iconsOf } from '../../../logic/icons.js';
import { specialtiesOf } from '../../../logic/specialties.js';
import { quotePromotion } from '../../../logic/promotions.js';
import {
  kitchenMayTrade,
  orderFor,
  ordersFor,
  recordOrder,
  registerKitchen,
} from '../../../logic/sync.js';
import { publish, isOnline } from '../../../realtime/hub.js';
import {
  Account,
  Dish,
  Kitchen,
  Notification,
  Offer,
  TaxonomyCategory,
  Zone,
} from '../../../models/index.js';
import { ERR, errText } from '../../../lib/domain.js';

/**
 * The Expo client's API.
 *
 * Every response shape here is the app's own — `chefs.json` field for field,
 * the same `ERR` codes, the same order rails. The app has not been wired to
 * these yet; designing them now is what stops the admin panel's needs from
 * quietly becoming the only shape the API can take.
 */

const fail = (reply: { status: (n: number) => { send: (b: unknown) => unknown } }, code: string, status = 400) =>
  reply.status(status).send({ error: code, message: errText(code) });

const callerOf = (request: FastifyRequest) =>
  identify(bearerFrom(request.headers.authorization));

/* ------------------------------------------------------------------ *
 * the account's profile
 * ------------------------------------------------------------------ */

/**
 * One saved address, as this file handles it.
 *
 * Named rather than inferred from the schema: Mongoose types an array of
 * subdocuments as `DocumentArray`, which cannot be assigned plain objects
 * even after `.lean()`. The list is rebuilt whole on every write, so plain is
 * what it actually is.
 */
type SavedAddress = {
  id: string;
  label: string;
  area: string;
  detail: string;
  instructions: string;
  lat?: number | null;
  lng?: number | null;
  selected?: boolean;
};

/** The account as the app reads it. `nid` is KYC's and never leaves here. */
const shapeAccount = (account: {
  _id: unknown;
  customerKey: string;
  role: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  avatar?: string | null;
  bio?: string;
  area?: string | null;
  lat?: number | null;
  lng?: number | null;
  addressDetail?: string | null;
  addressLabel?: string | null;
  addresses?: unknown[];
}) => ({
  id: String(account._id),
  customerKey: account.customerKey,
  role: account.role,
  name: account.name,
  phone: account.phone ?? '',
  email: account.email ?? '',
  avatar: account.avatar ?? '',
  bio: account.bio ?? '',
  /* The selected address, flat — the shape every existing screen reads. */
  area: account.area ?? '',
  lat: account.lat ?? null,
  lng: account.lng ?? null,
  addressDetail: account.addressDetail ?? '',
  addressLabel: account.addressLabel ?? '',
  addresses: account.addresses ?? [],
});

/**
 * Write the address list, and mirror the selected one into the flat fields.
 *
 * The mirroring is the whole point. Orders, the meals board and the shop
 * directory all read `account.lat` and always have; making them read into a
 * list instead would mean changing every one of them and getting the "which
 * one" question wrong in a new place each time. So the list is what a person
 * curates and the flat fields are what the platform reads, kept in step here
 * — the one function that can move either.
 */
async function saveAddresses(customerKey: string, list: SavedAddress[]) {
  const chosen = list.find((a) => a.selected) ?? list[0] ?? null;

  await Account.updateOne(
    { customerKey },
    {
      $set: {
        addresses: list,
        area: chosen?.area ?? null,
        addressDetail: chosen?.detail ?? null,
        addressLabel: chosen?.label ?? null,
        lat: chosen?.lat ?? null,
        lng: chosen?.lng ?? null,
      },
    },
  );
}

/**
 * The caller, only if they cook.
 *
 * Answers the reply itself and returns null, so a handler is one `if` rather
 * than two — and so "no kitchen" and "no token" cannot be told apart by a
 * caller probing for which accounts have kitchens.
 */
/**
 * The cook behind a request, and — where it matters — whether they may trade.
 *
 * `trading` is asked for by the routes that create or extend an obligation to
 * a customer: listing a dish, making one available, publishing a meal, opening
 * a shop, accepting a pre-order. Those wait for an operator's approval.
 *
 * The routes that wind trade *down* deliberately do not ask for it. A kitchen
 * that is suspended or still pending must still be able to cancel a meal,
 * reject a pre-order, remove a dish and move an order that is already out for
 * delivery — otherwise a customer's money sits held with nobody able to return
 * it, which is a worse failure than an unapproved kitchen taking one more
 * order.
 */
async function cookOf(
  request: FastifyRequest,
  reply: Parameters<typeof fail>[0],
  opts: { trading?: boolean } = {},
) {
  const caller = await callerOf(request);
  if (!caller) {
    fail(reply, 'unauthenticated', 401);
    return null;
  }
  if (!caller.kitchenId) {
    fail(reply, ERR.NO_KITCHEN, 403);
    return null;
  }

  /* Suspension needs no check here: `toIdentity` drops kitchenId for a
     suspended kitchen, so those callers were refused above. */
  if (opts.trading && !(await kitchenMayTrade(caller.kitchenId))) {
    fail(reply, ERR.KITCHEN_UNAPPROVED, 403);
    return null;
  }

  return caller as typeof caller & { kitchenId: string };
}

/** A menu row, the shape `chefs.json` menus already have. */
const shapeDish = (dish: {
  _id: unknown;
  name: string;
  description?: string;
  price: number;
  image?: string;
  tags?: string[];
  available?: boolean;
}) => ({
  id: String(dish._id),
  name: dish.name,
  description: dish.description ?? '',
  price: dish.price,
  image: dish.image ?? '',
  tags: dish.tags ?? [],
  available: dish.available ?? true,
});

/**
 * Who is calling, as a chat viewer.
 *
 * Accepts either credential — an app bearer token, or the operator session —
 * so one set of chat endpoints serves the phone and the support desk without
 * either learning the other's rules.
 */
async function viewerFor(request: FastifyRequest): Promise<Viewer | null> {
  const account = await callerOf(request);
  if (account) {
    if (account.role === 'cook' && account.kitchenId) {
      return {
        side: 'cook',
        kitchenId: account.kitchenId,
        customerKey: account.customerKey,
        name: account.kitchenName || account.name || 'Kitchen',
      };
    }
    return {
      side: 'customer',
      customerKey: account.customerKey,
      name: account.name || 'Customer',
    };
  }

  const cookie = request.headers.cookie ?? '';
  const token = cookie
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('rb_admin_session='))
    ?.slice('rb_admin_session='.length);

  const operator = await readSession(token);
  if (operator) return { side: 'admin', email: operator.email, name: operator.name };

  return null;
}

export async function appRoutes(app: FastifyInstance) {
  /* ---------------- config ---------------- */

  /**
   * Everything the app currently hardcodes.
   *
   * `DELIVERY_FEE`, `PLATFORM_FEE`, `KNOWN_AREAS` and the category vocabulary
   * are constants inside the mobile bundle today, so changing a price means
   * shipping a build. Fetching this on launch — and falling back to the
   * bundled constants when it fails — is the smallest change that turns them
   * into configuration.
   *
   * Unauthenticated on purpose: it is the same public information every
   * install already carries, and gating it would mean the app cannot start
   * without a session.
   */
  app.get('/config', async (_request, reply) => {
    const [settings, flags, zones, taxonomy] = await Promise.all([
      getSettings(),
      getFlags(),
      Zone.find({ active: true }).sort({ order: 1 }).lean(),
      TaxonomyCategory.find({ retired: false }).sort({ order: 1 }).lean(),
    ]);

    reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    return {
      fees: { deliveryFee: settings.deliveryFee, platformFee: settings.platformFee },
      /* The app shows the cook their share, so it needs the rate rather than
         the commission. 0.85 was COOK_PAYOUT_RATE. */
      payoutRates: {
        cod: 1 - settings.commissionCod,
        meal: 1 - settings.commissionMeal,
        store: 1 - settings.commissionStore,
        request: 1 - settings.commissionRequest,
      },
      escrow: { autoReleaseDays: settings.escrowAutoReleaseDays },
      /* Longest first, which is what `normaliseArea` needs so "Old Dhaka" is
         matched before "Dhaka". */
      areas: zones.map((z) => z.name).sort((a, b) => b.length - a.length),
      zoneFees: Object.fromEntries(
        zones.filter((z) => z.deliveryFee != null).map((z) => [z.name, z.deliveryFee]),
      ),
      taxonomy: taxonomy.map((c) => ({
        id: String(c._id),
        key: c.key,
        label: c.label,
        emoji: c.emoji,
        order: c.order,
      })),
      flags: Object.fromEntries(flags.map((f) => [f.key, f.enabled])),
    };
  });

  /* ---------------- kitchens ---------------- */

  /**
   * The directory, shaped exactly like a row of `chefs.json`.
   *
   * Field for field identical to what the app already bundles, so swapping
   * the import for a fetch needs no change anywhere downstream. A suspended
   * kitchen is simply absent — the app has no concept of suspension and does
   * not need one; it cannot render what it was never sent.
   */
  app.get('/kitchens', async (request, reply) => {
    const query = z
      .object({ area: z.string().optional(), menus: z.string().optional() })
      .parse(request.query ?? {});

    const kitchens = await Kitchen.find({
      suspended: false,
      ...(query.area && query.area !== 'all' ? { area: query.area } : {}),
    })
      .sort({ rating: -1 })
      .lean();

    const chefs = kitchens.map((k) => ({
      id: String(k._id),
      name: k.name,
      avatar: k.avatar,
      coverImage: k.coverImage,
      specialty: k.specialty,
      description: k.description,
      rating: k.rating,
      reviewCount: k.reviewCount,
      tags: k.tags ?? [],
      ecoBadge: k.ecoBadge,
      isVerified: k.isVerified,
      area: k.area,
      lat: k.lat,
      lng: k.lng,
      deliveryRadiusKm: k.deliveryRadiusKm,
      isOpen: k.isOpen,
    }));

    const body: Record<string, unknown> = { chefs };

    if (query.menus === '1') {
      const dishes = await Dish.find({
        kitchenId: { $in: kitchens.map((k) => String(k._id)) },
        available: true,
      })
        .sort({ createdAt: 1 })
        .lean();

      const byKitchen = new Map<string, typeof dishes>();
      for (const dish of dishes) {
        const list = byKitchen.get(dish.kitchenId) ?? [];
        list.push(dish);
        byKitchen.set(dish.kitchenId, list);
      }

      body.menus = kitchens.map((k) => ({
        chefId: String(k._id),
        items: (byKitchen.get(String(k._id)) ?? []).map((d) => ({
          id: String(d._id),
          name: d.name,
          description: d.description,
          price: d.price,
          image: d.image,
          tags: d.tags ?? [],
        })),
      }));
    }

    reply.header('cache-control', 'public, max-age=30, stale-while-revalidate=120');
    return body;
  });

  /** Register the caller's own kitchen — the one that lived only on a device. */
  /**
   * The specialties a kitchen may claim.
   *
   * Read by the sign-up form and the kitchen editor. Open to any caller: it is
   * the same list the picker shows and there is nothing in it that is not
   * already on a public kitchen card.
   *
   * Retired ones are left out. A cook choosing today should not be offered
   * something the platform has stopped using — the kitchens already carrying
   * it keep it, which is the whole reason retiring exists rather than
   * deleting.
   */
  /**
   * The picture library, for a cook naming their own shelves.
   *
   * Open like `/specialties` and for the same reason: it is a list of emoji,
   * and every one of them is already drawn on a public category card.
   */
  app.get('/icons', async (_request, _reply) => {
    return { icons: await iconsOf() };
  });

  app.get('/specialties', async (_request, _reply) => {
    return { specialties: await specialtiesOf() };
  });

  app.post('/kitchens/mine', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const out = await registerKitchen(caller, (request.body ?? {}) as never);
    if (!out.ok) return fail(reply, out.error);
    return out.result;
  });

  /* ---------------- the cook's own menu ---------------- */

  /**
   * A cook's kitchen and every dish on it — the unavailable ones included.
   *
   * `/kitchens?menus=1` is the shopper's view and filters to `available`,
   * which is right for a directory and wrong for the screen the cook manages
   * the menu from: a dish taken off the menu has to still be there to put
   * back. That difference is the whole reason this is a separate endpoint
   * rather than a flag on the other.
   */
  app.get('/kitchens/mine', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const kitchen = await Kitchen.findOne({ accountId: caller.accountId }).lean();
    if (!kitchen) return { kitchen: null, dishes: [] };

    const dishes = await Dish.find({ kitchenId: String(kitchen._id) })
      .sort({ createdAt: 1 })
      .lean();

    return {
      kitchen: {
        id: String(kitchen._id),
        name: kitchen.name,
        ownerName: kitchen.ownerName,
        avatar: kitchen.avatar,
        coverImage: kitchen.coverImage,
        specialty: kitchen.specialty,
        description: kitchen.description,
        rating: kitchen.rating,
        reviewCount: kitchen.reviewCount,
        tags: kitchen.tags ?? [],
        ecoBadge: kitchen.ecoBadge,
        isVerified: kitchen.isVerified,
        kycStatus: kitchen.kycStatus,
        /* The reason, and when. A cook told only "rejected" has been given a
           verdict and no way to act on it; the note is what an operator
           wrote for exactly this purpose and it was going nowhere. */
        kycNote: kitchen.kycNote,
        kycDecidedAt: kitchen.kycDecidedAt,
        area: kitchen.area,
        lat: kitchen.lat,
        lng: kitchen.lng,
        deliveryRadiusKm: kitchen.deliveryRadiusKm,
        isOpen: kitchen.isOpen,
      },
      dishes: dishes.map(shapeDish),
    };
  });

  /**
   * Add a dish, or edit one.
   *
   * One route for both, keyed on whether `dishId` came with the body, because
   * the app's dish editor is one screen either way — `/cook/dish/new` and
   * `/cook/dish/:id` differ by a parameter and nothing else.
   *
   * The kitchen comes from the token, never the body: a cook editing a dish
   * cannot name somebody else's kitchen as its home, and the update is scoped
   * to `kitchenId` so an id belonging to another kitchen matches nothing.
   */
  app.post('/kitchens/mine/dishes', async (request, reply) => {
    const cook = await cookOf(request, reply, { trading: true });
    if (!cook) return;

    const body = z
      .object({
        dishId: z.string().optional(),
        name: z.string().trim().min(1).optional(),
        description: z.string().optional(),
        price: z.coerce.number().finite().positive().optional(),
        image: z.string().optional(),
        tags: z.array(z.string()).optional(),
        available: z.boolean().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const { dishId, ...patch } = body.data;

    if (dishId) {
      const dish = await Dish.findOneAndUpdate(
        { _id: dishId, kitchenId: cook.kitchenId },
        patch,
        { new: true },
      )
        .lean()
        .catch(() => null);
      if (!dish) return fail(reply, ERR.NO_PRODUCT, 404);
      return { dish: shapeDish(dish) };
    }

    /* A new dish needs the two fields a menu row cannot render without. The
       update path does not, because it is patching a row that already has
       them. */
    if (!patch.name || patch.price == null) return fail(reply, ERR.NAME_REQUIRED);

    const created = await Dish.create({ ...patch, kitchenId: cook.kitchenId });
    return { dish: shapeDish(created.toObject()) };
  });

  app.post('/dishes/:id/toggle', async (request, reply) => {
    const cook = await cookOf(request, reply, { trading: true });
    if (!cook) return;

    const { id } = request.params as { id: string };
    const dish = await Dish.findOne({ _id: id, kitchenId: cook.kitchenId })
      .catch(() => null);
    if (!dish) return fail(reply, ERR.NO_PRODUCT, 404);

    dish.available = !dish.available;
    await dish.save();
    return { dish: shapeDish(dish.toObject()) };
  });

  app.post('/dishes/:id/remove', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const { id } = request.params as { id: string };
    const out = await Dish.deleteOne({ _id: id, kitchenId: cook.kitchenId }).catch(
      () => null,
    );
    if (!out?.deletedCount) return fail(reply, ERR.NO_PRODUCT, 404);

    return { ok: true };
  });

  /* ---------------- auth ---------------- */

  app.post('/auth/request-otp', async (request, reply) => {
    const body = z.object({ phone: z.string() }).safeParse(request.body);
    if (!body.success) return fail(reply, 'phone-required');

    const ip =
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      request.ip;

    const out = await requestOtp(body.data.phone, ip);
    if (!out.ok) {
      return reply
        .status(out.retryAfterSeconds ? 429 : 400)
        .send({ error: 'otp-refused', message: out.error });
    }

    return {
      ok: true,
      expiresAt: out.expiresAt,
      /* Dev only. `requestOtp` refuses to reach this branch once a provider
         is configured, so it cannot survive into production by accident. */
      ...(out.devCode ? { devCode: out.devCode } : {}),
    };
  });

  app.post('/auth/verify-otp', async (request, reply) => {
    const body = z
      .object({
        phone: z.string(),
        code: z.string(),
        device: z.object({ name: z.string().optional(), platform: z.string().optional() }).optional(),
      })
      .safeParse(request.body);
    if (!body.success) return fail(reply, 'phone-and-code-required');

    const out = await verifyOtp(body.data.phone, body.data.code, body.data.device);
    if (!out.ok) {
      return reply.status(401).send({ error: 'otp-invalid', message: out.error });
    }

    return { ok: true, token: out.token, expiresAt: out.expiresAt, account: out.account };
  });

  /**
   * Who this token is.
   *
   * The app calls it on launch: a token can be perfectly well-signed and
   * still dead, because the session was revoked or the account suspended.
   */
  app.get('/auth/me', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);
    return { account: caller };
  });

  /* ---------------- the account's own profile ---------------- */

  /**
   * The full profile, which `/auth/me` deliberately is not.
   *
   * `/auth/me` answers "is this token alive and whose is it" and is kept to
   * the few claims a token carries. This is the record behind it — the name,
   * the contact details, and every saved address.
   *
   * It needed to exist because none of that was on the server at all. The
   * profile editor wrote to AsyncStorage and stopped there, so a customer's
   * delivery address lived on one handset: it did not survive a reinstall,
   * did not follow them to a second device, and — worse — was invisible to
   * the server that computes what can reach them. Every account row in the
   * database had a null `lat`, which is why the meals board could measure a
   * distance from nowhere and quietly show nothing.
   */
  app.get('/account', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const account = await Account.findOne({ customerKey: caller.customerKey }).lean();
    if (!account) return fail(reply, 'unauthenticated', 401);

    return { account: shapeAccount(account) };
  });

  /**
   * Save the profile.
   *
   * Only the fields a person edits about themselves. `role`, `customerKey`,
   * `suspended` and the kitchen link are the platform's, and a body naming
   * them is not rejected — it is not read.
   */
  app.post('/account', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = z
      .object({
        name: z.string().optional(),
        email: z.string().optional(),
        avatar: z.string().optional(),
        bio: z.string().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, 'name-required');

    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'email', 'avatar', 'bio'] as const) {
      const value = body.data[key];
      if (typeof value === 'string') patch[key] = value.trim();
    }
    /* An empty name would leave somebody nameless on every order they place;
       the rest may legitimately be cleared. */
    if (patch.name === '') delete patch.name;

    if (Object.keys(patch).length) {
      await Account.updateOne({ customerKey: caller.customerKey }, { $set: patch });
    }

    const account = await Account.findOne({ customerKey: caller.customerKey }).lean();
    return { account: shapeAccount(account!) };
  });

  /**
   * Add an address, or edit one.
   *
   * One route for both, keyed on whether an `id` came with the body — the
   * editor is the same screen either way. A new address is selected on
   * arrival when it is the only one, because a list of one with nothing
   * chosen is a state nobody meant to create.
   */
  app.post('/account/addresses', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = z
      .object({
        id: z.string().optional(),
        label: z.string().default('Home'),
        area: z.string().default(''),
        detail: z.string().default(''),
        instructions: z.string().default(''),
        lat: z.coerce.number().nullable().optional(),
        lng: z.coerce.number().nullable().optional(),
        select: z.boolean().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, 'name-required');

    /* `.lean()`: the list is rebuilt and written whole by `saveAddresses`,
       so plain objects are what is wanted — a hydrated DocumentArray cannot
       be assigned to from one. */
    const account = await Account.findOne({ customerKey: caller.customerKey }).lean();
    if (!account) return fail(reply, 'unauthenticated', 401);

    const list = [...((account.addresses ?? []) as SavedAddress[])];
    const id = body.data.id ?? randomUUID();
    const at = list.findIndex((a) => a.id === id);

    const entry = {
      id,
      label: body.data.label.trim() || 'Home',
      area: body.data.area.trim(),
      detail: body.data.detail.trim(),
      instructions: body.data.instructions.trim(),
      lat: body.data.lat ?? (at >= 0 ? list[at]!.lat : null),
      lng: body.data.lng ?? (at >= 0 ? list[at]!.lng : null),
      selected: at >= 0 ? !!list[at]!.selected : false,
    };

    if (at >= 0) list[at] = entry;
    else list.push(entry);

    /* Selected when asked, or when it is the only one there is. */
    const select = body.data.select || list.length === 1;
    if (select) for (const a of list) a.selected = a.id === id;

    await saveAddresses(caller.customerKey, list);

    const after = await Account.findOne({ customerKey: caller.customerKey }).lean();
    return { account: shapeAccount(after!) };
  });

  /** Deliver here from now on. */
  app.post('/account/addresses/:id/select', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    /* `.lean()`: the list is rebuilt and written whole by `saveAddresses`,
       so plain objects are what is wanted — a hydrated DocumentArray cannot
       be assigned to from one. */
    const account = await Account.findOne({ customerKey: caller.customerKey }).lean();
    if (!account) return fail(reply, 'unauthenticated', 401);

    const list = [...((account.addresses ?? []) as SavedAddress[])];
    if (!list.some((a) => a.id === id)) return fail(reply, 'not-found', 404);

    for (const a of list) a.selected = a.id === id;
    await saveAddresses(caller.customerKey, list);

    const after = await Account.findOne({ customerKey: caller.customerKey }).lean();
    return { account: shapeAccount(after!) };
  });

  /**
   * Forget an address.
   *
   * Removing the selected one promotes whatever is left rather than leaving
   * the account with addresses and none chosen — the flat fields have to
   * mirror *something*, and an order placed against nothing is not an order.
   */
  app.post('/account/addresses/:id/remove', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    /* `.lean()`: the list is rebuilt and written whole by `saveAddresses`,
       so plain objects are what is wanted — a hydrated DocumentArray cannot
       be assigned to from one. */
    const account = await Account.findOne({ customerKey: caller.customerKey }).lean();
    if (!account) return fail(reply, 'unauthenticated', 401);

    const list = ((account.addresses ?? []) as SavedAddress[]).filter((a) => a.id !== id);
    if (list.length && !list.some((a) => a.selected)) list[0]!.selected = true;

    await saveAddresses(caller.customerKey, list);

    const after = await Account.findOne({ customerKey: caller.customerKey }).lean();
    return { account: shapeAccount(after!) };
  });

  /* ---------------- orders ---------------- */

  app.get('/orders', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);
    return { orders: await ordersFor(caller) };
  });

  /**
   * One order, whole.
   *
   * The app's tracker draws the rail, the receipt and the refund line off a
   * single object, so this returns the whole document rather than the list's
   * row. Scoped in the query: an id that is neither this customer's nor this
   * kitchen's is a 404, which is also the honest answer to an id somebody
   * guessed.
   */
  app.get('/orders/:id', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    const order = await orderFor(caller, id);
    if (!order) return fail(reply, ERR.NO_ORDER, 404);

    return { order };
  });

  /**
   * Record orders the app placed.
   *
   * A basket spanning two kitchens is two orders, so the app sends them
   * together. One failing must not lose the other, and the reply says what
   * happened to each rather than collapsing to a single status.
   */
  app.post('/orders', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = request.body as { orders?: unknown[]; order?: unknown };
    const drafts = (body?.orders ?? (body?.order ? [body.order] : [])) as never[];
    if (!drafts.length) return fail(reply, 'name-required');

    const results = [];
    for (const draft of drafts) {
      const out = await recordOrder(caller, draft);
      results.push(
        out.ok
          ? { ok: true, ...out.result }
          : { ok: false, code: (draft as { code?: string }).code, error: out.error },
      );
    }
    return { results };
  });

  /**
   * What a code is worth on this basket.
   *
   * The failure reply carries the reason, not just a flag, because every one
   * of them tells the customer something they can act on: how much more to
   * add, that the code was for a first order, that it has already been used.
   * "Invalid code" is the one answer that helps nobody.
   */
  app.post('/promotions/quote', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = request.body as { code?: string; amount?: number };
    const out = await quotePromotion({
      code: String(body?.code ?? ''),
      customerKey: caller.customerKey,
      amount: Number(body?.amount ?? 0),
    });

    if (!out.ok) return fail(reply, out.error);
    return { quote: out.result };
  });

  /* ---------------- offers ---------------- */

  /**
   * A cook's own offers, and never anybody else's.
   *
   * This endpoint makes one of the app's three load-bearing rules an
   * *authorisation* guarantee rather than a UI one. From `requestLogic.js`:
   *
   *   > A cook never sees a competitor's price. [...] On a device this is a
   *   > UI guarantee; on a server it would need to be an authorisation one.
   *
   * So the filter is on `kitchenId` in the query itself. There is no path
   * through this handler that returns a row belonging to another kitchen.
   */
  app.get('/offers', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller?.kitchenId) return fail(reply, 'request-not-eligible', 403);

    const query = z.object({ requestId: z.string().optional() }).parse(request.query ?? {});

    const offers = await Offer.find({
      kitchenId: caller.kitchenId,
      ...(query.requestId ? { requestId: query.requestId } : {}),
    })
      .sort({ createdAt: -1 })
      .lean();

    /* The *count* of competing offers is returned because a cook deciding
       whether to bid deserves to know they are one of five. The prices are
       not. */
    const competingOffers = query.requestId
      ? await Offer.countDocuments({
          requestId: query.requestId,
          kitchenId: { $ne: caller.kitchenId },
        })
      : 0;

    return {
      offers: offers.map((o) => ({
        id: String(o._id),
        requestId: o.requestId,
        kitchenId: o.kitchenId,
        cookName: o.cookName,
        status: o.status,
        price: o.price,
        agreedPrice: o.agreedPrice,
        note: o.note,
        prepTime: o.prepTime,
        history: o.history ?? [],
        createdAt: o.createdAt,
      })),
      competingOffers,
    };
  });

  /* ---------------- notifications ---------------- */

  app.get('/notifications', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const audience = caller.kitchenId ? 'cook' : 'customer';
    const rows = await Notification.find({
      audience,
      $or: [
        { customerKey: caller.customerKey },
        { kitchenId: caller.kitchenId ?? '__none__' },
        { customerKey: null, kitchenId: null },
      ],
    })
      .sort({ at: -1 })
      .limit(100)
      .lean();

    return {
      notifications: rows.map((n) => ({
        id: String(n._id),
        key: n.key,
        audience: n.audience,
        kind: n.kind,
        title: n.title,
        body: n.body,
        read: n.read,
        at: n.at,
      })),
      unread: rows.filter((n) => !n.read).length,
    };
  });

  /* ---------------- chat ---------------- */

  app.get('/chat/threads', async (request, reply) => {
    const viewer = await viewerFor(request);
    if (!viewer) return fail(reply, 'unauthenticated', 401);

    const query = z
      .object({ status: z.string().optional(), kind: z.string().optional() })
      .parse(request.query ?? {});

    const [threads, unread] = await Promise.all([
      threadsFor(viewer, query),
      unreadTotal(viewer),
    ]);

    return { threads: threads.map((t) => shapeThread(t, viewer.side)), unread };
  });

  app.post('/chat/threads', async (request, reply) => {
    const viewer = await viewerFor(request);
    if (!viewer) return fail(reply, 'unauthenticated', 401);

    const body = z
      .object({
        kind: z.enum(['order', 'request', 'support']),
        orderId: z.string().optional(),
        requestId: z.string().optional(),
        kitchenId: z.string().optional(),
        subject: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success) return fail(reply, 'name-required');

    const spec =
      body.data.kind === 'order'
        ? ({ kind: 'order', orderId: String(body.data.orderId) } as const)
        : body.data.kind === 'request'
          ? ({
              kind: 'request',
              requestId: String(body.data.requestId),
              kitchenId: String(body.data.kitchenId),
            } as const)
          : ({ kind: 'support', subject: body.data.subject } as const);

    const out = await openThread(viewer, spec);
    if (!out.ok) return fail(reply, out.error, out.error === 'admin-forbidden' ? 403 : 400);

    const thread = await threadFor(viewer, out.result.threadId);
    if (!thread) return fail(reply, 'order-missing', 404);

    /* A brand-new thread is pushed to the other side straight away. Otherwise
       a support desk only learns a conversation exists when the first message
       lands, which is a second of dead air on every new case. */
    if (out.result.created) {
      publish(
        { customerKey: thread.customerKey, kitchenId: thread.kitchenId },
        { type: 'thread', thread: shapeThread(thread, 'admin') },
      );
    }

    return { thread: shapeThread(thread, viewer.side), created: out.result.created };
  });

  app.get('/chat/messages', async (request, reply) => {
    const viewer = await viewerFor(request);
    if (!viewer) return fail(reply, 'unauthenticated', 401);

    const query = z
      .object({
        threadId: z.string(),
        before: z.string().optional(),
        take: z.coerce.number().max(100).optional(),
      })
      .safeParse(request.query);
    if (!query.success) return fail(reply, 'name-required');

    const out = await messagesFor(viewer, query.data.threadId, {
      before: query.data.before ? new Date(query.data.before) : undefined,
      take: query.data.take,
    });
    if (!out.ok) return fail(reply, out.error, 403);
    return out.result;
  });

  /**
   * Send one message.
   *
   * Over HTTP rather than down the socket, deliberately. A send has to be
   * transactional, idempotent on `clientId`, and able to fail with a status
   * the app's offline outbox can act on. A WebSocket frame has no reply and
   * no status code, so making it the write path means messages that exist on
   * one side of the wire and nowhere else.
   */
  app.post('/chat/messages', async (request, reply) => {
    const viewer = await viewerFor(request);
    if (!viewer) return fail(reply, 'unauthenticated', 401);

    const body = z
      .object({
        threadId: z.string(),
        body: z.string().optional(),
        clientId: z.string(),
        attachments: z.array(z.unknown()).optional(),
        connectionId: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success) return fail(reply, 'name-required');

    const out = await sendMessage(viewer, {
      threadId: body.data.threadId,
      body: body.data.body ?? '',
      clientId: body.data.clientId,
      attachments: body.data.attachments,
    });
    if (!out.ok) return fail(reply, out.error, out.error === 'admin-forbidden' ? 403 : 400);

    /* A replay of a message already stored is fanned out to nobody — the
       recipients saw it the first time, and a second delivery would show it
       twice. */
    if (!out.result.duplicate) {
      const thread = await threadFor(viewer, body.data.threadId);
      if (thread) {
        publish(
          { customerKey: thread.customerKey, kitchenId: thread.kitchenId },
          { type: 'message', threadId: String(thread._id), message: out.result.message },
          body.data.connectionId,
        );
        await queueOfflineNotice(thread, viewer.side, out.result.message.body);
      }
    }

    return { message: out.result.message, duplicate: out.result.duplicate };
  });

  app.post('/chat/read', async (request, reply) => {
    const viewer = await viewerFor(request);
    if (!viewer) return fail(reply, 'unauthenticated', 401);

    const body = z.object({ threadId: z.string() }).safeParse(request.body);
    if (!body.success) return fail(reply, 'name-required');

    const thread = await threadFor(viewer, body.data.threadId);
    if (!thread) return fail(reply, 'admin-forbidden', 403);

    const out = await markRead(viewer, body.data.threadId);
    if (!out.ok) return fail(reply, out.error, 403);

    publish(
      { customerKey: thread.customerKey, kitchenId: thread.kitchenId },
      {
        type: 'read',
        threadId: String(thread._id),
        side: viewer.side,
        at: new Date().toISOString(),
      },
    );

    return { ok: true };
  });
}

/**
 * File a notification for a side that is not currently connected.
 *
 * Keyed on the thread, not the message: a ten-message burst should be one
 * badge, which is the same dedupe contract the rest of the app's
 * notifications hold.
 */
async function queueOfflineNotice(
  thread: { _id: unknown; kind: string; customerKey: string; kitchenId?: string | null },
  from: 'customer' | 'cook' | 'admin',
  preview: string,
) {
  const targets: { audience: 'customer' | 'cook'; customerKey?: string; kitchenId?: string }[] = [];

  if (from !== 'customer' && !isOnline({ customerKey: thread.customerKey })) {
    targets.push({ audience: 'customer', customerKey: thread.customerKey });
  }
  if (from !== 'cook' && thread.kitchenId && !isOnline({ kitchenId: thread.kitchenId })) {
    targets.push({ audience: 'cook', kitchenId: thread.kitchenId });
  }

  for (const target of targets) {
    const key = `${target.audience}:chat:${String(thread._id)}`;
    const existing = await Notification.findOne({ key, read: false });
    if (existing) continue;

    await Notification.create({
      key,
      audience: target.audience,
      kind: 'chat-message',
      title: thread.kind === 'support' ? 'Support replied' : 'New message',
      body: preview.slice(0, 140) || 'You have a new message.',
      customerKey: target.customerKey ?? null,
      kitchenId: target.kitchenId ?? null,
    }).catch(() => {});
  }
}
