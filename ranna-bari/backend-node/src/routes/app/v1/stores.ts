import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { bearerFrom, identify, type AppIdentity } from '../../../auth/app-auth.js';
import { ERR, errText } from '../../../lib/domain.js';
import {
  acceptPreorder,
  addCategory,
  addToCart,
  availability,
  categoriesOf,
  checkout,
  clearCart,
  moveCategory,
  pendingPreorders,
  priceCart,
  productById,
  productsOf,
  rejectPreorder,
  removeCategory,
  removeFromCart,
  removeProduct,
  saveProduct,
  saveStore,
  setCartQty,
  setStock,
  storeById,
  storeForKitchen,
  storeOverview,
  toggleProduct,
  togglePreorder,
  toggleStoreOpen,
  updateCategory,
} from '../../../logic/stores.js';
import { Kitchen, Product, Store } from '../../../models/index.js';

/**
 * Cook stores over HTTP — the shop, its shelves, the basket and checkout.
 *
 * `logic/stores.ts` holds every rule about stock, money and pre-orders, and
 * this file adds exactly one thing on top of it: **who is asking**. On the
 * device that question had no answer worth writing down, because the only
 * store in the process was the cook's own. Here it is the whole security
 * model, and it takes two shapes.
 *
 * **A `mine` route resolves the store from the caller's kitchen.** Not from a
 * body field, not from a query parameter, not from a store id the app happens
 * to be holding. `myStore()` is the only way into a write, so there is no
 * endpoint where forgetting the check is possible — the store id the logic
 * layer receives was derived from the token, never read from the request.
 *
 * **An id-addressed write is looked up through the caller's own store first.**
 * `/products/:id/stock` and `/categories/:id/move` name a row directly, so
 * each one is fetched via the caller's shop and compared before the logic
 * layer sees the id. A row belonging to another cook is a 404, which is also
 * the honest answer: as far as this caller is concerned it does not exist.
 */

/* Fastify's reply, narrowed to what a refusal needs — the same structural
   type the rest of the app routes use. */
type Refusable = { status: (n: number) => { send: (b: unknown) => unknown } };

/**
 * `detail` rides alongside the two standard fields rather than replacing them.
 * The logic layer works out how short a wallet is, how much stock is left, and
 * what the per-product ceiling was; a refusal that drops all of it leaves the
 * app able to say "no" and nothing else.
 */
const fail = (
  reply: Refusable,
  code: string,
  status = 400,
  detail?: Record<string, unknown>,
) =>
  reply
    .status(status)
    .send({ error: code, message: errText(code), ...(detail ? { detail } : {}) });

/* Gone is 404 wherever the refusal came from. Everything else is the server
   declining a state change it understood perfectly well, which is a 400. */
const MISSING: string[] = [ERR.NO_STORE, ERR.NO_PRODUCT, ERR.NO_ORDER];
const statusFor = (code: string) => (MISSING.includes(code) ? 404 : 400);

const callerOf = (request: FastifyRequest) =>
  identify(bearerFrom(request.headers.authorization));

/* Taken from the logic module's own return types rather than restated here,
   so a field renamed in a schema breaks this file at compile time instead of
   silently dropping out of a response. */
type StoreDoc = NonNullable<Awaited<ReturnType<typeof storeForKitchen>>>;
type ProductDoc = NonNullable<Awaited<ReturnType<typeof productById>>>;
type CategoryDoc = Awaited<ReturnType<typeof categoriesOf>>[number];
type OrderDoc = Awaited<ReturnType<typeof pendingPreorders>>[number];
type PricedCart = Awaited<ReturnType<typeof priceCart>>;
type PricedLine = PricedCart['lines'][number];

/** An identity that has already proved it owns a kitchen. */
type Cook = AppIdentity & { kitchenId: string };

/* ------------------------------------------------------------------ *
 * who is asking
 * ------------------------------------------------------------------ */

async function cookOf(request: FastifyRequest, reply: Refusable): Promise<Cook | null> {
  const caller = await callerOf(request);
  if (!caller) {
    fail(reply, 'unauthenticated', 401);
    return null;
  }
  /* The same refusal `/offers` gives a caller with no kitchen. It is not a
     404 — there is no shop of theirs to miss — and not a bad request, because
     the request was fine and the account is not. */
  if (!caller.kitchenId) {
    fail(reply, ERR.NOT_ELIGIBLE, 403);
    return null;
  }
  return { ...caller, kitchenId: caller.kitchenId };
}

/**
 * The caller's own shop, or a refusal.
 *
 * Every write below goes through here. Nothing downstream accepts a store id
 * from the request, so a body naming another cook's shop is not rejected — it
 * is never read at all, which is the only version of this rule that survives
 * somebody adding the next endpoint in a hurry.
 */
async function myStore(
  request: FastifyRequest,
  reply: Refusable,
): Promise<{ cook: Cook; store: StoreDoc } | null> {
  const cook = await cookOf(request, reply);
  if (!cook) return null;

  const store = await storeForKitchen(cook.kitchenId);
  if (!store) {
    fail(reply, ERR.NO_STORE, 404);
    return null;
  }
  return { cook, store };
}

/** A product, but only one of this store's. */
async function myProduct(store: StoreDoc, productId: string): Promise<ProductDoc | null> {
  const product = await productById(productId);
  if (!product) return null;
  return String(product.storeId) === String(store._id) ? product : null;
}

/**
 * A category, found by scanning the store's own shelves rather than by id.
 *
 * A category belonging to somebody else is simply not in the list, so there is
 * no ownership comparison here to get backwards. The list is one store's
 * shelves — bounded by what a cook is willing to scroll past.
 */
async function myCategory(store: StoreDoc, categoryId: string): Promise<CategoryDoc | null> {
  const categories = await categoriesOf(String(store._id));
  return categories.find((c) => String(c._id) === String(categoryId)) ?? null;
}

/**
 * A pending pre-order from this kitchen's own queue.
 *
 * Same construction as `myCategory`: accepting or declining is a decision that
 * moves somebody's money, so the order has to come out of a list that was
 * already filtered to this cook rather than out of a lookup by id.
 */
async function myPreorder(cook: Cook, orderId: string): Promise<OrderDoc | null> {
  const pending = await pendingPreorders(cook.kitchenId);
  return pending.find((row) => String(row._id) === String(orderId)) ?? null;
}

/* ------------------------------------------------------------------ *
 * response shapes
 * ------------------------------------------------------------------ */

/** The fields a shop borrows from its kitchen when it has none of its own. */
type KitchenFace = {
  avatar?: string;
  coverImage?: string;
  lat?: number | null;
  lng?: number | null;
  deliveryRadiusKm?: number | null;
} | null;

/**
 * A shop, and what it inherits from the kitchen it belongs to.
 *
 * A cook opening a shop does not upload a second set of photographs, so
 * `logo` and `cover` start empty — and a shop page rendering two empty image
 * boxes looks broken rather than new. The kitchen behind it already has a
 * portrait and a cover, and it is the same cook and the same premises, so the
 * shop shows those until it is given its own.
 *
 * The same argument applies to the map: a shop with no coordinates cannot be
 * told how far away it is, and the kitchen's pin is where the food is coming
 * from. Falling back here rather than at each of the four call sites means a
 * shop cannot be shown with a blank face by a screen that forgot.
 *
 * Only *blank* is replaced. A cook who has set their own logo keeps it, and a
 * shop deliberately pinned somewhere other than the kitchen stays there.
 */
const shapeStore = (store: StoreDoc, kitchen?: KitchenFace) => ({
  id: String(store._id),
  kitchenId: store.kitchenId,
  name: store.name,
  tagline: store.tagline,
  description: store.description,
  logo: store.logo || kitchen?.avatar || '',
  cover: store.cover || kitchen?.coverImage || '',
  phone: store.phone,
  area: store.area,
  lat: store.lat ?? kitchen?.lat ?? null,
  lng: store.lng ?? kitchen?.lng ?? null,
  deliveryRadiusKm: store.deliveryRadiusKm ?? kitchen?.deliveryRadiusKm ?? null,
  deliveryFee: store.deliveryFee,
  freeDeliveryOver: store.freeDeliveryOver,
  isOpen: store.isOpen,
});

/** The kitchen behind a shop, for the fields the shop borrows from it. */
const faceOf = (kitchenId: string): Promise<KitchenFace> =>
  Kitchen.findById(kitchenId)
    .select({ avatar: 1, coverImage: 1, lat: 1, lng: 1, deliveryRadiusKm: 1 })
    .lean()
    .catch(() => null) as Promise<KitchenFace>;

const shapeCategory = (category: CategoryDoc) => ({
  id: String(category._id),
  storeId: category.storeId,
  name: category.name,
  emoji: category.emoji,
  order: category.order,
});

/**
 * `availability` travels with the product rather than being recomputed on the
 * client, so the badge, the button and the checkout refusal all come from one
 * reading of the same three fields.
 */
const shapeProduct = (product: ProductDoc, store: StoreDoc) => ({
  id: String(product._id),
  storeId: product.storeId,
  categoryId: product.categoryId,
  name: product.name,
  description: product.description,
  images: product.images ?? [],
  price: product.price,
  stock: product.stock,
  minQty: product.minQty,
  maxQty: product.maxQty,
  active: product.active,
  preorder: product.preorder,
  prepTime: product.prepTime,
  deliveryNote: product.deliveryNote,
  options: product.options,
  availability: availability(product, store),
});

const shapeCartLine = (line: PricedLine) => ({
  key: line.key,
  productId: line.productId,
  option: line.option,
  qty: line.qty,
  unitPrice: line.unitPrice,
  lineTotal: line.lineTotal,
  availability: line.availability,
  preorder: line.preorder,
  problem: line.problem,
  /* Denormalised onto the line because a basket screen renders it and the
     product may since have been deleted — a line with a `problem` and no name
     is a row the customer cannot identify well enough to remove. */
  name: line.product?.name ?? '',
  image: line.product?.images?.[0] ?? '',
  stock: line.product?.stock ?? 0,
  minQty: line.product?.minQty ?? 1,
  maxQty: line.product?.maxQty ?? null,
  storeId: line.store ? String(line.store._id) : null,
  storeName: line.store?.name ?? '',
});

const shapeCart = (priced: PricedCart) => ({
  lines: priced.lines.map(shapeCartLine),
  subtotal: priced.subtotal,
  delivery: priced.delivery,
  total: priced.total,
  hasPreorder: priced.hasPreorder,
  /* Checkout refuses on the first of these, so the cart screen can disable its
     button for exactly the reason the server would have given. */
  problems: priced.problems.map((line) => ({
    key: line.key,
    problem: line.problem,
    name: line.product?.name ?? '',
  })),
});

const shapeOrder = (order: OrderDoc) => ({
  id: String(order._id),
  code: order.code,
  kind: order.kind,
  storeId: order.storeId,
  kitchenId: order.kitchenId,
  cookName: order.cookName,
  title: order.title,
  image: order.image,
  customerKey: order.customerKey,
  customerName: order.customerName,
  phone: order.phone,
  address: order.address,
  lines: order.lines,
  subtotal: order.subtotal,
  deliveryFee: order.deliveryFee,
  amount: order.amount,
  preorder: order.preorder,
  status: order.status,
  payment: order.payment,
  history: order.history,
  createdAt: order.createdAt,
});

/* ------------------------------------------------------------------ *
 * input
 * ------------------------------------------------------------------ */

/**
 * Unknown keys are stripped rather than rejected.
 *
 * The app round-trips objects it was handed — a saved store arrives back with
 * its `id` still attached — and a `.strict()` schema would turn every one of
 * those into a 400. Stripping is safe because `storeFields` in the logic layer
 * enumerates what it writes: a `kitchenId` smuggled into the body reaches
 * neither the schema's output nor the update.
 */
const storePatchSchema = z.object({
  name: z.string().optional(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  logo: z.string().optional(),
  cover: z.string().optional(),
  phone: z.string().optional(),
  area: z.string().optional(),
  lat: z.coerce.number().nullable().optional(),
  lng: z.coerce.number().nullable().optional(),
  deliveryRadiusKm: z.coerce.number().nullable().optional(),
  deliveryFee: z.coerce.number().optional(),
  freeDeliveryOver: z.coerce.number().nullable().optional(),
  isOpen: z.boolean().optional(),
});

/* Numbers arrive from a form as strings, and `productFields` already reads
   `''` as "left alone" rather than as zero. Coercing here would turn a
   cleared price field into a price of 0 and lose that distinction, so the
   string is passed through to the layer that knows what it means. */
const numeric = z.union([z.number(), z.string()]);

const productPatchSchema = z.object({
  categoryId: z.string().nullable().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  price: numeric.optional(),
  stock: numeric.optional(),
  minQty: numeric.optional(),
  maxQty: numeric.nullable().optional(),
  active: z.boolean().optional(),
  preorder: z.boolean().optional(),
  prepTime: z.string().optional(),
  deliveryNote: z.string().optional(),
  options: z
    .object({
      label: z.string().default(''),
      choices: z.array(
        z.object({ label: z.string(), priceDelta: z.coerce.number().default(0) }),
      ),
    })
    .nullable()
    .optional(),
});

/* One endpoint creates and updates, so the id is part of the body. It is
   split off the patch by name below and never reaches `productFields`. */
const productSaveSchema = productPatchSchema.extend({
  id: z.string().optional(),
  productId: z.string().optional(),
});

export async function storeRoutes(app: FastifyInstance) {
  /* ---------------- the directory ---------------- */

  /**
   * Shops a customer can browse.
   *
   * Browsing lists open ones only — a closed shop in a directory is a tap that
   * goes nowhere. `?kitchenId=` is a lookup rather than a filter, so it
   * returns the kitchen's shop whatever its state: the kitchen page has to be
   * able to tell "closed right now" from "never opened a shop", and it has no
   * other way to ask.
   */
  app.get('/stores', async (request, reply) => {
    const query = z.object({ kitchenId: z.string().optional() }).parse(request.query ?? {});

    const stores = await Store.find(
      query.kitchenId ? { kitchenId: query.kitchenId } : { isOpen: true },
    )
      .sort({ name: 1 })
      .lean();

    /* The shop directory draws "12 items" under every name. Counting here is
       one grouped query; the alternative is the app fetching each shop's
       catalogue to count it, which is the directory's length in round trips
       to render a number. Only `active` rows, because that is what a shopper
       would find on the shelf if they tapped through.

       The kitchens come in the same shape of query, for the faces the shops
       borrow — a directory of blank tiles is not a directory. */
    const ids = stores.map((store) => String(store._id));
    const [counts, kitchens] = await Promise.all([
      Product.aggregate<{ _id: string; n: number }>([
        { $match: { storeId: { $in: ids }, active: true } },
        { $group: { _id: '$storeId', n: { $sum: 1 } } },
      ]),
      Kitchen.find({ _id: { $in: stores.map((store) => store.kitchenId) } })
        .select({ avatar: 1, coverImage: 1, lat: 1, lng: 1, deliveryRadiusKm: 1 })
        .lean(),
    ]);

    const countBy = new Map(counts.map((row) => [row._id, row.n]));
    const kitchenBy = new Map(kitchens.map((k) => [String(k._id), k]));

    reply.header('cache-control', 'public, max-age=30, stale-while-revalidate=120');
    return {
      stores: stores.map((store) => ({
        ...shapeStore(store, kitchenBy.get(String(store.kitchenId))),
        productCount: countBy.get(String(store._id)) ?? 0,
      })),
    };
  });

  /**
   * One shop, its shelves and everything on them.
   *
   * Public, but not identical for everybody: a product the cook has taken off
   * sale is a draft rather than a listing, and only the owner gets it back —
   * this is also the screen they manage the shop from. No `cache-control`
   * for that reason; a shared cache cannot tell the owner from a shopper and
   * would serve one of them the other's answer.
   */
  app.get('/stores/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const store = await storeById(id);
    if (!store) return fail(reply, ERR.NO_STORE, 404);

    const caller = await callerOf(request);
    const mine = !!caller?.kitchenId && String(caller.kitchenId) === String(store.kitchenId);

    const [categories, products, kitchen] = await Promise.all([
      categoriesOf(String(store._id)),
      productsOf(String(store._id)),
      faceOf(store.kitchenId),
    ]);

    const visible = mine ? products : products.filter((product) => product.active);

    return {
      store: shapeStore(store, kitchen),
      mine,
      categories: categories.map(shapeCategory),
      products: visible.map((product) => shapeProduct(product, store)),
      /* The counts the cook's dashboard draws, in the same round trip as the
         catalogue it draws them next to. Owner-only, because they include
         money. */
      ...(mine ? { overview: await storeOverview(String(store._id)) } : {}),
    };
  });

  /**
   * Everything on every open shelf, for search.
   *
   * The app searches on the device — instant, works offline, and at this
   * catalogue size the whole thing fits in one response. But a shopper
   * looking for "achar" was being told the app has none, because search only
   * ever saw dishes and kitchens: shop goods were fetched one shop at a time,
   * when somebody walked in, and a shop nobody had opened was unsearchable.
   *
   * So the shelves come down in one request. Closed shops are excluded rather
   * than returned and filtered — a result that cannot be bought is not a
   * result — and so are inactive products, which are drafts.
   *
   * The cap is real and the response says when it was hit, so a catalogue
   * that outgrows one fetch reports it here rather than quietly searching a
   * page and calling it the data.
   */
  app.get('/products', async (request, reply) => {
    const query = z
      .object({ take: z.coerce.number().min(1).max(1000).default(500) })
      .safeParse(request.query ?? {});
    if (!query.success) return fail(reply, ERR.BAD_AMOUNT);

    const open = await Store.find({ isOpen: true }).select({ _id: 1 }).lean();
    const storeIds = open.map((s) => String(s._id));

    const rows = await Product.find({ storeId: { $in: storeIds }, active: true })
      .sort({ createdAt: -1 })
      .limit(query.data.take + 1)
      .lean();

    const truncated = rows.length > query.data.take;
    const products = rows.slice(0, query.data.take);

    reply.header('cache-control', 'public, max-age=30, stale-while-revalidate=120');
    return {
      /* Shaped without a store, so `availability` is left off rather than
         computed against the wrong shop — the app pairs each row with the
         store it already holds. */
      products: products.map((product) => ({
        id: String(product._id),
        storeId: product.storeId,
        categoryId: product.categoryId,
        name: product.name,
        description: product.description,
        images: product.images ?? [],
        price: product.price,
        stock: product.stock,
        minQty: product.minQty,
        maxQty: product.maxQty,
        active: product.active,
        preorder: product.preorder,
        prepTime: product.prepTime,
        deliveryNote: product.deliveryNote,
        options: product.options,
      })),
      truncated,
    };
  });

  /**
   * One product, and the shop it sits in.
   *
   * The product screen is reachable by link — from a notification, or a
   * shared URL — so it cannot assume the customer walked in through the shop
   * and has its catalogue already. The store travels with the product because
   * `availability` is a reading of the two together: a jar in stock in a shop
   * that is shut is not something anybody can buy.
   *
   * An inactive product is a draft, and only its owner gets it back.
   */
  app.get('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const product = await productById(id);
    if (!product) return fail(reply, ERR.NO_PRODUCT, 404);

    const store = await storeById(String(product.storeId));
    if (!store) return fail(reply, ERR.NO_STORE, 404);

    const caller = await callerOf(request);
    const mine = !!caller?.kitchenId && String(caller.kitchenId) === String(store.kitchenId);
    if (!product.active && !mine) return fail(reply, ERR.NO_PRODUCT, 404);

    return {
      product: shapeProduct(product, store),
      store: shapeStore(store, await faceOf(store.kitchenId)),
      mine,
    };
  });

  /* ---------------- the cook's own shop ---------------- */

  /**
   * Create or update the caller's store.
   *
   * The only write that does not go through `myStore`, because a cook saving
   * for the first time does not have one yet. The kitchen still comes from the
   * token — `saveStore` upserts on it — so this cannot reach another cook's
   * row either.
   */
  app.post('/stores/mine', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const body = storePatchSchema.safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await saveStore({ kitchenId: cook.kitchenId, patch: body.data });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    /* The logic layer widens its writes to `Record<string, unknown>`, but what
       comes back is the store document the reads shape. Shaping it the same
       way means the app parses one store, not two. */
    return { store: shapeStore(out.result as unknown as StoreDoc) };
  });

  app.post('/stores/mine/open', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const out = await toggleStoreOpen({ storeId: String(mine.store._id) });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { isOpen: out.result };
  });

  /* ---------------- categories ---------------- */

  /* A missing category answers `product-missing`: the ERR map has no code of
     its own for one, and the logic layer already reports it that way. Three
     codebases branch on these strings, so inventing a fourth code here would
     break a switch in two of them. */

  app.post('/stores/mine/categories', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const body = z
      .object({ name: z.string(), emoji: z.string().optional() })
      .safeParse(request.body);
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await addCategory({
      storeId: String(mine.store._id),
      name: body.data.name,
      emoji: body.data.emoji,
    });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { category: shapeCategory(out.result as unknown as CategoryDoc) };
  });

  app.patch('/categories/:id', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const { id } = request.params as { id: string };
    if (!(await myCategory(mine.store, id))) return fail(reply, ERR.NO_PRODUCT, 404);

    const body = z
      .object({ name: z.string().optional(), emoji: z.string().optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await updateCategory({ categoryId: id, patch: body.data });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { ok: true };
  });

  /** Refuses on a shelf that still holds products, and says how many. */
  app.post('/categories/:id/remove', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const { id } = request.params as { id: string };
    if (!(await myCategory(mine.store, id))) return fail(reply, ERR.NO_PRODUCT, 404);

    const out = await removeCategory({ categoryId: id });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { ok: true };
  });

  app.post('/categories/:id/move', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const { id } = request.params as { id: string };
    if (!(await myCategory(mine.store, id))) return fail(reply, ERR.NO_PRODUCT, 404);

    const body = z.object({ delta: z.coerce.number() }).safeParse(request.body);
    if (!body.success) return fail(reply, ERR.BAD_AMOUNT);

    const out = await moveCategory({ categoryId: id, delta: body.data.delta });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { ok: true };
  });

  /* ---------------- products ---------------- */

  /** Create or update one product on the caller's own shelves. */
  app.post('/stores/mine/products', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const body = productSaveSchema.safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const { id, productId, ...patch } = body.data;
    const target = productId ?? id ?? null;

    // An edit is checked against this store; a create is pinned to it.
    if (target && !(await myProduct(mine.store, target))) {
      return fail(reply, ERR.NO_PRODUCT, 404);
    }

    /* A shelf in another cook's shop is not a shelf. Filing a product under a
       foreign category id would not leak anything — products are read by
       store — but it would leave a row referencing a category its owner can
       rename or delete out from under it. */
    if (patch.categoryId && !(await myCategory(mine.store, patch.categoryId))) {
      return fail(reply, ERR.NO_PRODUCT, 404);
    }

    const out = await saveProduct({
      productId: target,
      storeId: String(mine.store._id),
      patch,
    });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { product: shapeProduct(out.result as unknown as ProductDoc, mine.store) };
  });

  app.post('/products/:id/remove', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const { id } = request.params as { id: string };
    if (!(await myProduct(mine.store, id))) return fail(reply, ERR.NO_PRODUCT, 404);

    const out = await removeProduct({ productId: id });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { ok: true };
  });

  /** Restock, or correct a count — the inventory screen's stepper. */
  app.post('/products/:id/stock', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const { id } = request.params as { id: string };
    if (!(await myProduct(mine.store, id))) return fail(reply, ERR.NO_PRODUCT, 404);

    const body = z.object({ stock: numeric }).safeParse(request.body);
    if (!body.success) return fail(reply, ERR.BAD_AMOUNT);

    const out = await setStock({ productId: id, stock: body.data.stock });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { stock: out.result };
  });

  /* Both toggles flip inside the document rather than reading and writing, so
     a double tap lands on one state instead of two. The new value comes back
     because the caller cannot work it out from a request it may have sent
     twice. */

  app.post('/products/:id/toggle', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const { id } = request.params as { id: string };
    if (!(await myProduct(mine.store, id))) return fail(reply, ERR.NO_PRODUCT, 404);

    const out = await toggleProduct({ productId: id });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { active: out.result };
  });

  app.post('/products/:id/preorder-toggle', async (request, reply) => {
    const mine = await myStore(request, reply);
    if (!mine) return;

    const { id } = request.params as { id: string };
    if (!(await myProduct(mine.store, id))) return fail(reply, ERR.NO_PRODUCT, 404);

    const out = await togglePreorder({ productId: id });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { preorder: out.result };
  });

  /* ---------------- cart ---------------- */

  /* Every cart write answers with the repriced basket. It costs one more read
     per tap and saves a round trip on a phone network, and it is the only way
     the app's copy cannot drift from the one checkout will actually charge —
     a line can change price, sell out or vanish between two taps. */

  app.get('/cart', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    return { cart: shapeCart(await priceCart(caller.customerKey)) };
  });

  app.post('/cart', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = z
      .object({
        productId: z.string(),
        qty: z.coerce.number().optional(),
        option: z.string().nullable().optional(),
      })
      .safeParse(request.body);
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await addToCart({
      customerKey: caller.customerKey,
      productId: body.data.productId,
      qty: body.data.qty,
      option: body.data.option ?? null,
    });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { line: out.result, cart: shapeCart(await priceCart(caller.customerKey)) };
  });

  app.patch('/cart', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = z.object({ key: z.string(), qty: numeric }).safeParse(request.body);
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await setCartQty({
      customerKey: caller.customerKey,
      key: body.data.key,
      qty: body.data.qty,
    });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { qty: out.result, cart: shapeCart(await priceCart(caller.customerKey)) };
  });

  app.post('/cart/remove', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = z.object({ key: z.string() }).safeParse(request.body);
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await removeFromCart({ customerKey: caller.customerKey, key: body.data.key });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { cart: shapeCart(await priceCart(caller.customerKey)) };
  });

  app.post('/cart/clear', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const out = await clearCart({ customerKey: caller.customerKey });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { cart: shapeCart(await priceCart(caller.customerKey)) };
  });

  /* ---------------- checkout ---------------- */

  /**
   * Turn the basket into orders, debit the wallet, move the stock.
   *
   * One call, one transaction, and no part of it is retried on its own: the
   * basket, the hold and the decrement either all happen or none do. Whatever
   * refuses — a sold-out line, a wallet that is short — refuses before the
   * first write, and the `detail` on the refusal is what the app needs to say
   * *how* short.
   *
   * A basket spanning two shops comes back as two orders, and a shop's
   * pre-order lines come back as a third: the app is told what was created
   * rather than being left to infer it from a count.
   */
  app.post('/store-checkout', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = z
      .object({
        name: z.string().optional(),
        phone: z.string().optional(),
        address: z.unknown().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await checkout({
      customerKey: caller.customerKey,
      customer: {
        /* Falls back to the account rather than requiring the body to carry
           it. The customer key is never taken from the request at all — it is
           the token's, so a basket cannot be charged to a wallet the caller
           does not hold. */
        name: body.data.name ?? caller.name,
        phone: body.data.phone ?? caller.phone,
        address: body.data.address === undefined ? null : body.data.address,
      },
    });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    // Order documents, widened by the logic layer's signature. See `saveStore`.
    return { orders: (out.result as unknown as OrderDoc[]).map(shapeOrder) };
  });

  /* ---------------- pre-orders ---------------- */

  /**
   * The cook's queue of requests to accept or decline.
   *
   * `pendingPreorders(null)` is every kitchen's queue, so the kitchen from the
   * token is doing real work in this call rather than narrowing a list that
   * was already this cook's.
   */
  app.get('/preorders', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const rows = await pendingPreorders(cook.kitchenId);
    return { preorders: rows.map(shapeOrder) };
  });

  /** Agreed: the money stays held, and the stock comes off now. */
  app.post('/preorders/:id/accept', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const { id } = request.params as { id: string };
    if (!(await myPreorder(cook, id))) return fail(reply, ERR.NO_ORDER, 404);

    const out = await acceptPreorder({ orderId: id });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { ok: true };
  });

  /** Declined: the hold is refunded in the same transaction, in full. */
  app.post('/preorders/:id/reject', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const { id } = request.params as { id: string };
    if (!(await myPreorder(cook, id))) return fail(reply, ERR.NO_ORDER, 404);

    const body = z.object({ reason: z.string().optional() }).safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await rejectPreorder({ orderId: id, reason: body.data.reason });
    if (!out.ok) return fail(reply, out.error, statusFor(out.error), out.detail);

    return { ok: true, refunded: out.result };
  });
}
