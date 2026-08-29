import { Types, type ClientSession } from 'mongoose';

import {
  Cart,
  Notification,
  Order,
  Product,
  Store,
  StoreCategory,
} from '../models/index.js';
import { tx } from '../config/db.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { makeCode, taka } from '../lib/format.js';
import { balanceFor, post, refundEscrow } from './ledger.js';

/**
 * Cook stores: a shop per kitchen, with its own categories, products and
 * stock, selling into the wallet that `ledger.ts` owns.
 *
 * Two rules shape almost everything here, and both survive the move off the
 * device intact.
 *
 * **Stock is the truth, and it is checked where it is changed.** Validation
 * and decrement happen inside one transition against the live document, so
 * there is no window between "is there enough" and "take one" for a second
 * tap to slip through. Overselling is not prevented by a lock; it is
 * prevented by never separating the two steps. On a device that meant one
 * synchronous reducer; here it means one transaction, with `{ session }` on
 * every query inside it — a read that escapes the session is a read of a
 * world the write is not based on, and the two-step window opens right back
 * up.
 *
 * **Out of stock is not the end of the conversation.** A cook who is willing
 * to make more can leave pre-orders on, and then a zero-stock product still
 * sells — but as a request the cook has to accept, not as an order that
 * commits them to baking a cake tonight.
 */

/* ------------------------------------------------------------------ *
 * shapes
 * ------------------------------------------------------------------ */

export type Availability = 'gone' | 'off' | 'closed' | 'in-stock' | 'preorder' | 'out';

/** One choice on a product — "Large", "+৳50". */
export type ProductChoice = { label: string; priceDelta: number };
export type ProductOptions = { label: string; choices: ProductChoice[] } | null;

/**
 * A basket line, exactly as the app writes it.
 *
 * `key` is a product *and* the option chosen on it: two sizes of the same
 * cake are two lines, not one line with a confused quantity.
 */
export type CartLine = {
  key: string;
  productId: string;
  option: string | null;
  qty: number;
  addedAt: Date;
};

/** Ids reach this layer from a client. A malformed one is a miss, not a crash. */
const objectId = (id: unknown): Types.ObjectId | null =>
  Types.ObjectId.isValid(String(id ?? '')) ? new Types.ObjectId(String(id)) : null;

/* ------------------------------------------------------------------ *
 * reads
 * ------------------------------------------------------------------ */

export function storeForKitchen(kitchenId: string, session?: ClientSession) {
  return Store.findOne({ kitchenId: String(kitchenId) })
    .session(session ?? null)
    .lean();
}

export async function storeById(storeId: string, session?: ClientSession) {
  const id = objectId(storeId);
  if (!id) return null;
  return Store.findById(id).session(session ?? null).lean();
}

/** A store's categories in the order the cook arranged them. */
export function categoriesOf(storeId: string, session?: ClientSession) {
  return StoreCategory.find({ storeId: String(storeId) })
    .sort({ order: 1 })
    .session(session ?? null)
    .lean();
}

export function productsOf(
  storeId: string,
  categoryId?: string | null,
  session?: ClientSession,
) {
  return Product.find({
    storeId: String(storeId),
    ...(categoryId ? { categoryId: String(categoryId) } : {}),
  })
    .session(session ?? null)
    .lean();
}

export async function productById(productId: string, session?: ClientSession) {
  const id = objectId(productId);
  if (!id) return null;
  return Product.findById(id).session(session ?? null).lean();
}

/**
 * What a customer can do with a product right now.
 *
 * One function rather than a scatter of `stock > 0` checks, because the
 * three states — buy it, pre-order it, look at it — are what every card,
 * badge and button on the customer side branches on.
 */
export function availability(
  product: { active?: boolean; stock?: number | null; preorder?: boolean } | null | undefined,
  store: { isOpen?: boolean } | null | undefined,
): Availability {
  if (!product || !store) return 'gone';
  if (!product.active) return 'off';
  if (!store.isOpen) return 'closed';
  if ((product.stock ?? 0) > 0) return 'in-stock';
  return product.preorder ? 'preorder' : 'out';
}

export const canOrder = (
  product: Parameters<typeof availability>[0],
  store: Parameters<typeof availability>[1],
) => (['in-stock', 'preorder'] as Availability[]).includes(availability(product, store));

/** The unit price with the chosen option's difference folded in. */
export function unitPriceOf(
  product: { price?: number | null; options?: ProductOptions | null } | null | undefined,
  optionLabel?: string | null,
): number {
  const base = product?.price ?? 0;
  const choices = product?.options?.choices;
  if (!optionLabel || !choices?.length) return base;
  const choice = choices.find((c) => c.label === optionLabel);
  return base + (choice?.priceDelta ?? 0);
}

/* ------------------------------------------------------------------ *
 * notifications
 * ------------------------------------------------------------------ */

/**
 * File a notification, unless the same one is already sitting unread.
 *
 * Keyed on the event rather than the text, so re-wording a string does not
 * defeat the dedupe. The app could leave `audience: 'cook'` to mean *the*
 * cook — there was only ever one on the device. Here it has to say which, or
 * every kitchen gets everybody's orders.
 */
async function notify(
  session: ClientSession,
  note: {
    audience: 'customer' | 'cook';
    kind: string;
    key: string;
    title: string;
    body: string;
    customerKey?: string | null;
    kitchenId?: string | null;
    orderId?: string | null;
  },
): Promise<void> {
  const existing = await Notification.findOne({ key: note.key, read: false })
    .session(session)
    .lean();
  if (existing) return;

  await Notification.create(
    [
      {
        key: note.key,
        audience: note.audience,
        kind: note.kind,
        title: note.title,
        body: note.body,
        customerKey: note.customerKey ?? null,
        kitchenId: note.kitchenId ?? null,
        orderId: note.orderId ?? null,
      },
    ],
    { session },
  );
}

/* ------------------------------------------------------------------ *
 * the store itself
 * ------------------------------------------------------------------ */

export type StorePatch = Partial<{
  name: string;
  tagline: string;
  description: string;
  logo: string;
  cover: string;
  phone: string;
  area: string;
  lat: number | null;
  lng: number | null;
  deliveryRadiusKm: number | null;
  deliveryFee: number;
  freeDeliveryOver: number | null;
  isOpen: boolean;
}>;

/**
 * Only the fields a cook actually edits.
 *
 * The app spread the whole patch into the record, which is safe when the
 * patch came from the screen next door. Over HTTP it is mass assignment, so
 * the shape is enumerated here instead — and the two money fields are rounded
 * on the way in, because a fee of 39.99 would ride into every order total the
 * store ever places.
 */
function storeFields(patch: StorePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const key of ['name', 'tagline', 'description', 'logo', 'cover', 'phone', 'area'] as const) {
    if (patch[key] != null) out[key] = String(patch[key]).trim();
  }
  for (const key of ['lat', 'lng', 'deliveryRadiusKm'] as const) {
    if (patch[key] !== undefined) {
      out[key] = patch[key] === null ? null : Number(patch[key]);
    }
  }
  for (const key of ['deliveryFee', 'freeDeliveryOver'] as const) {
    if (patch[key] !== undefined) {
      out[key] = patch[key] === null ? null : Math.round(Number(patch[key]));
    }
  }
  if (patch.isOpen !== undefined) out.isOpen = !!patch.isOpen;

  return out;
}

/**
 * Create or update the kitchen's store.
 *
 * One store per kitchen: the storefront *is* the kitchen's shop window, and a
 * cook with two of them would be two sellers wearing one name. The app kept
 * that true by looking first; here the unique index on `kitchenId` keeps it
 * true even when two devices save at once, which is why this is one upsert
 * rather than a find and a create.
 *
 * A new shop opens shut — the schema's default — because the cook decides
 * when the shelves are ready.
 */
export async function saveStore({
  kitchenId,
  patch,
}: {
  kitchenId: string;
  patch?: StorePatch;
}): Promise<Result<Record<string, unknown>>> {
  if (patch?.name != null && !String(patch.name).trim()) return fail(ERR.NAME_REQUIRED);

  const fields = storeFields(patch ?? {});
  const key = String(kitchenId);

  const store = await Store.findOneAndUpdate(
    { kitchenId: key },
    // An empty `$set` is rejected by the server, so an insert-only save says so.
    Object.keys(fields).length ? { $set: fields } : { $setOnInsert: { kitchenId: key } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return ok(store as Record<string, unknown>);
}

/** Flipped in the document rather than read-then-written: two taps, one shop. */
export async function toggleStoreOpen({
  storeId,
}: {
  storeId: string;
}): Promise<Result<boolean>> {
  const id = objectId(storeId);
  if (!id) return fail(ERR.NO_STORE);

  const store = await Store.findOneAndUpdate(
    { _id: id },
    [{ $set: { isOpen: { $not: ['$isOpen'] } } }],
    { new: true },
  ).lean();
  if (!store) return fail(ERR.NO_STORE);

  return ok(!!store.isOpen);
}

/* ------------------------------------------------------------------ *
 * categories
 * ------------------------------------------------------------------ */

/* The ERR map has no category-missing code — the app reports a missing
   category as ERR.NO_PRODUCT and three codebases branch on that string, so
   inventing one here would break a switch in two of them. */

export async function addCategory({
  storeId,
  name,
  emoji,
}: {
  storeId: string;
  name: string;
  emoji?: string;
}): Promise<Result<Record<string, unknown>>> {
  if (!String(name ?? '').trim()) return fail(ERR.NAME_REQUIRED);

  return tx(async (session) => {
    const store = await storeById(storeId, session);
    if (!store) return fail(ERR.NO_STORE);

    /* The new shelf goes on the end. Counting inside the transaction is what
       stops two adds landing on the same `order` and rendering in whichever
       arbitrary sequence the index feels like. */
    const order = await StoreCategory.countDocuments({ storeId: String(storeId) }).session(
      session,
    );

    const [category] = await StoreCategory.create(
      [
        {
          storeId: String(storeId),
          name: String(name).trim(),
          emoji: emoji ?? '',
          order,
        },
      ],
      { session },
    );

    return ok(category.toObject() as Record<string, unknown>);
  });
}

export async function updateCategory({
  categoryId,
  patch,
}: {
  categoryId: string;
  patch?: { name?: string; emoji?: string };
}): Promise<Result<null>> {
  if (patch?.name != null && !String(patch.name).trim()) return fail(ERR.NAME_REQUIRED);

  const id = objectId(categoryId);
  if (!id) return fail(ERR.NO_PRODUCT);

  const category = await StoreCategory.findById(id).lean();
  if (!category) return fail(ERR.NO_PRODUCT);

  const fields: Record<string, unknown> = {};
  if (patch?.name != null) fields.name = String(patch.name).trim();
  if (patch?.emoji !== undefined) fields.emoji = String(patch.emoji ?? '');

  if (Object.keys(fields).length) await StoreCategory.updateOne({ _id: id }, fields);
  return ok(null);
}

/**
 * Delete a category, but only an empty one.
 *
 * Deleting one with products in it would either orphan them or delete a
 * cook's work as a side effect of tidying a menu. Refusing and saying how
 * many are in the way is the honest answer.
 *
 * The delete and the renumber are one transaction because a list with a hole
 * in its ordering is a list that reorders itself the next time somebody drags
 * a row.
 */
export async function removeCategory({
  categoryId,
}: {
  categoryId: string;
}): Promise<Result<null>> {
  const id = objectId(categoryId);
  if (!id) return fail(ERR.NO_PRODUCT);

  return tx(async (session) => {
    const category = await StoreCategory.findById(id).session(session).lean();
    if (!category) return fail(ERR.NO_PRODUCT);

    const inUse = await Product.countDocuments({ categoryId: String(id) }).session(session);
    if (inUse) return fail(ERR.CATEGORY_IN_USE, { count: inUse });

    await StoreCategory.deleteOne({ _id: id }, { session });

    const left = await StoreCategory.find({ storeId: category.storeId })
      .sort({ order: 1 })
      .session(session)
      .lean();

    if (left.length) {
      await StoreCategory.bulkWrite(
        left.map((c, i) => ({
          updateOne: { filter: { _id: c._id }, update: { $set: { order: i } } },
        })),
        { session },
      );
    }

    return ok(null);
  });
}

/** Move a category up or down its store's list. */
export async function moveCategory({
  categoryId,
  delta,
}: {
  categoryId: string;
  delta: number;
}): Promise<Result<null>> {
  const id = objectId(categoryId);
  if (!id) return fail(ERR.NO_PRODUCT);

  /* Rejected up front rather than clamped: `splice` reads a NaN index as 0,
     so an unparseable step would silently move the row to the top instead of
     refusing. */
  const step = Math.round(Number(delta));
  if (!Number.isFinite(step)) return fail(ERR.BAD_AMOUNT);

  return tx(async (session) => {
    const category = await StoreCategory.findById(id).session(session).lean();
    if (!category) return fail(ERR.NO_PRODUCT);

    const list = await StoreCategory.find({ storeId: category.storeId })
      .sort({ order: 1 })
      .session(session)
      .lean();

    const from = list.findIndex((c) => String(c._id) === String(id));
    const to = from + step;
    if (from < 0 || to < 0 || to >= list.length) return fail(ERR.WRONG_STATE);

    const moved = list.slice();
    const [item] = moved.splice(from, 1);
    moved.splice(to, 0, item);

    /* The whole list is renumbered, not just the pair that swapped: `order`
       stays a dense 0..n-1 run, so `addCategory`'s count is always the next
       free slot. */
    await StoreCategory.bulkWrite(
      moved.map((c, i) => ({
        updateOne: { filter: { _id: c._id }, update: { $set: { order: i } } },
      })),
      { session },
    );

    return ok(null);
  });
}

/* ------------------------------------------------------------------ *
 * products
 * ------------------------------------------------------------------ */

const NUMERIC = ['price', 'stock', 'minQty', 'maxQty'] as const;

export type ProductPatch = Partial<{
  categoryId: string | null;
  name: string;
  description: string;
  images: string[];
  price: number | string;
  stock: number | string;
  minQty: number | string;
  maxQty: number | string | null;
  active: boolean;
  preorder: boolean;
  prepTime: string;
  deliveryNote: string;
  options: ProductOptions;
}>;

function normaliseOptions(options: ProductOptions | null | undefined): ProductOptions {
  if (!options || !Array.isArray(options.choices)) return null;

  const choices = options.choices
    .filter((choice) => choice && String(choice.label ?? '').trim())
    .map((choice) => ({
      label: String(choice.label).trim(),
      // A delta can be negative — the small size is cheaper, not free.
      priceDelta: Math.round(Number(choice.priceDelta ?? 0)) || 0,
    }));

  return choices.length ? { label: String(options.label ?? '').trim(), choices } : null;
}

/** Enumerated for the same reason `storeFields` is: this arrives over HTTP. */
function productFields(patch: ProductPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (patch.categoryId !== undefined) out.categoryId = patch.categoryId || null;

  for (const key of ['name', 'description', 'prepTime', 'deliveryNote'] as const) {
    if (patch[key] != null) out[key] = String(patch[key]).trim();
  }
  if (patch.images !== undefined) out.images = (patch.images ?? []).map(String);

  for (const key of NUMERIC) {
    const raw = patch[key];
    // An empty form field means "left alone", not "zero".
    if (raw == null || raw === '') continue;
    out[key] = Math.round(Number(raw));
  }
  // maxQty is the one number a cook clears rather than sets: no ceiling.
  if (patch.maxQty === null) out.maxQty = null;

  if (patch.active !== undefined) out.active = !!patch.active;
  if (patch.preorder !== undefined) out.preorder = !!patch.preorder;
  if (patch.options !== undefined) out.options = normaliseOptions(patch.options);

  return out;
}

/**
 * When the shelf went empty.
 *
 * The stock alarm ages off this, so it has to survive every edit that leaves
 * the count at zero — a value rewritten each time the cook opens the form
 * would mean the alarm never fires. It is stamped on the way down and cleared
 * on the way up, and only then.
 */
const outOfStockClock = (next: number, current: Date | null | undefined, at: Date) =>
  next > 0 ? null : (current ?? at);

/** Create or update one product. */
export async function saveProduct({
  productId,
  storeId,
  patch,
}: {
  productId?: string | null;
  storeId?: string | null;
  patch?: ProductPatch;
}): Promise<Result<Record<string, unknown>>> {
  const clean = productFields(patch ?? {});

  if (patch?.name != null && !String(patch.name).trim()) return fail(ERR.NAME_REQUIRED);

  const price = clean.price as number | undefined;
  if (price !== undefined && (!Number.isFinite(price) || price <= 0)) {
    return fail(ERR.BAD_AMOUNT);
  }
  const stock = clean.stock as number | undefined;
  if (stock !== undefined && (!Number.isFinite(stock) || stock < 0)) {
    return fail(ERR.BAD_AMOUNT);
  }

  return tx(async (session) => {
    const at = new Date();

    if (productId) {
      const id = objectId(productId);
      if (!id) return fail(ERR.NO_PRODUCT);

      const existing = await Product.findById(id).session(session).lean();
      if (!existing) return fail(ERR.NO_PRODUCT);

      const fields = { ...clean };
      if (stock !== undefined) {
        fields.outOfStockSince = outOfStockClock(stock, existing.outOfStockSince, at);
      }

      const updated = await Product.findOneAndUpdate(
        { _id: id },
        fields,
        { new: true, session },
      ).lean();
      return ok(updated as Record<string, unknown>);
    }

    const store = await storeById(String(storeId ?? ''), session);
    if (!store) return fail(ERR.NO_STORE);

    const [created] = await Product.create(
      [
        {
          storeId: String(store._id),
          ...clean,
          /* A product created with nothing on the shelf starts its clock now:
             an empty listing left up for a week is exactly what the alarm is
             for. */
          outOfStockSince: outOfStockClock(stock ?? 0, null, at),
        },
      ],
      { session },
    );

    return ok(created.toObject() as Record<string, unknown>);
  });
}

export async function removeProduct({
  productId,
}: {
  productId: string;
}): Promise<Result<null>> {
  const id = objectId(productId);
  if (!id) return fail(ERR.NO_PRODUCT);

  return tx(async (session) => {
    const deleted = await Product.deleteOne({ _id: id }, { session });
    if (!deleted.deletedCount) return fail(ERR.NO_PRODUCT);

    /* Anything in a basket pointing at it goes too, or checkout would refuse
       forever on a line nobody can see or remove. The two writes are one
       transaction for that reason: a deleted product with live cart lines is
       a permanently un-checkoutable basket. */
    await Cart.updateMany(
      { 'lines.productId': String(id) },
      { $pull: { lines: { productId: String(id) } } },
      { session },
    );

    return ok(null);
  });
}

/**
 * Restock, or correct a count.
 *
 * Separate from `saveProduct` so the cook's inventory screen can be a list of
 * steppers rather than a list of forms. The count and its out-of-stock clock
 * move in one document update, so a stepper held down never lands between the
 * two.
 */
export async function setStock({
  productId,
  stock,
}: {
  productId: string;
  stock: number | string;
}): Promise<Result<number>> {
  const value = Math.round(Number(stock));
  if (!Number.isFinite(value) || value < 0) return fail(ERR.BAD_AMOUNT);

  const id = objectId(productId);
  if (!id) return fail(ERR.NO_PRODUCT);

  const updated = await Product.findOneAndUpdate(
    { _id: id },
    [
      {
        $set: {
          stock: value,
          outOfStockSince:
            value > 0 ? null : { $ifNull: ['$outOfStockSince', new Date()] },
        },
      },
    ],
    { new: true },
  ).lean();
  if (!updated) return fail(ERR.NO_PRODUCT);

  return ok(value);
}

const flip =
  (field: 'active' | 'preorder') =>
  async ({ productId }: { productId: string }): Promise<Result<boolean>> => {
    const id = objectId(productId);
    if (!id) return fail(ERR.NO_PRODUCT);

    const updated = await Product.findOneAndUpdate(
      { _id: id },
      [{ $set: { [field]: { $not: [`$${field}`] } } }],
      { new: true },
    ).lean();
    if (!updated) return fail(ERR.NO_PRODUCT);

    return ok(!!updated[field]);
  };

/** Take it off sale without deleting the cook's work. */
export const toggleProduct = flip('active');
export const togglePreorder = flip('preorder');

/* ------------------------------------------------------------------ *
 * cart
 * ------------------------------------------------------------------ */

/** One basket per customer, keyed the same way orders are. */
export async function cartOf(
  customerKey: string,
  session?: ClientSession,
): Promise<CartLine[]> {
  const cart = await Cart.findOne({ customerKey }).session(session ?? null).lean();
  return ((cart?.lines as CartLine[] | undefined) ?? []).filter(Boolean);
}

const lineKey = (productId: string, option?: string | null) =>
  `${productId}::${option ?? ''}`;

const writeCart = (customerKey: string, lines: CartLine[], session: ClientSession) =>
  Cart.updateOne({ customerKey }, { lines }, { upsert: true, session });

/**
 * Put something in the basket.
 *
 * The quantity limits are enforced here as well as at checkout. Checkout is
 * the one that matters — the basket can go stale while it sits there — but
 * refusing at the point of tapping is how someone finds out in time to do
 * something about it.
 */
export async function addToCart({
  customerKey,
  productId,
  qty = 1,
  option,
}: {
  customerKey: string;
  productId: string;
  qty?: number;
  option?: string | null;
}): Promise<Result<CartLine>> {
  return tx(async (session) => {
    const product = await productById(productId, session);
    if (!product) return fail(ERR.NO_PRODUCT);

    const store = await storeById(String(product.storeId), session);
    if (!store) return fail(ERR.NO_STORE);
    if (!store.isOpen) return fail(ERR.STORE_CLOSED);
    if (!product.active) return fail(ERR.PRODUCT_OFF);

    const avail = availability(product, store);
    if (avail === 'out') return fail(ERR.NO_STOCK);

    const lines = await cartOf(customerKey, session);
    const key = lineKey(String(product._id), option);
    const found = lines.find((line) => line.key === key);

    /* A first add jumps straight to the minimum order quantity — asking for
       one when the cook only sells four is a refusal nobody learns from. */
    const min = product.minQty ?? 1;
    const added = Math.max(1, Math.round(Number(qty)) || 1);
    const wanted = found ? found.qty + added : Math.max(added, min);

    const max = product.maxQty ?? null;
    if (max != null && wanted > max) return fail(ERR.ABOVE_MAX, { max });
    // A pre-order is not limited by a stock level that is, by definition, zero.
    if (avail === 'in-stock' && wanted > (product.stock ?? 0)) {
      return fail(ERR.SHORT_STOCK, { stock: product.stock });
    }

    const line: CartLine = {
      key,
      productId: String(product._id),
      option: option ?? null,
      qty: wanted,
      addedAt: new Date(),
    };

    await writeCart(
      customerKey,
      found ? lines.map((l) => (l.key === key ? line : l)) : [...lines, line],
      session,
    );

    return ok(line);
  });
}

export async function setCartQty({
  customerKey,
  key,
  qty,
}: {
  customerKey: string;
  key: string;
  qty: number | string;
}): Promise<Result<number>> {
  return tx(async (session) => {
    const lines = await cartOf(customerKey, session);
    const found = lines.find((line) => line.key === key);
    if (!found) return fail(ERR.NO_PRODUCT);

    const value = Math.round(Number(qty));
    if (!Number.isFinite(value) || value < 0) return fail(ERR.BAD_AMOUNT);
    if (value === 0) {
      await writeCart(customerKey, lines.filter((line) => line.key !== key), session);
      return ok(0);
    }

    const product = await productById(found.productId, session);
    if (!product) return fail(ERR.NO_PRODUCT);
    const store = await storeById(String(product.storeId), session);

    const max = product.maxQty ?? null;
    if (max != null && value > max) return fail(ERR.ABOVE_MAX, { max });
    if (availability(product, store) === 'in-stock' && value > (product.stock ?? 0)) {
      return fail(ERR.SHORT_STOCK, { stock: product.stock });
    }

    await writeCart(
      customerKey,
      lines.map((line) => (line.key === key ? { ...line, qty: value } : line)),
      session,
    );

    return ok(value);
  });
}

export async function removeFromCart({
  customerKey,
  key,
}: {
  customerKey: string;
  key: string;
}): Promise<Result<null>> {
  await Cart.updateOne({ customerKey }, { $pull: { lines: { key } } });
  return ok(null);
}

export async function clearCart({
  customerKey,
}: {
  customerKey: string;
}): Promise<Result<null>> {
  await Cart.updateOne({ customerKey }, { lines: [] });
  return ok(null);
}

/**
 * Price the basket, revalidating every line against the live product.
 *
 * Nothing the cart stored is trusted: the price, the availability and the
 * limits are all read again from the product record, because a basket can sit
 * for a day while the cook changes their mind about all three.
 *
 * Returns the same shape whether or not it is orderable, so the cart screen
 * can show the problem next to the line that has it rather than as one banner
 * at the bottom.
 *
 * Takes a session so `checkout` can price inside its own transaction — the
 * prices it charges and the stock it takes must come from the same read of
 * the world as the writes that follow.
 */
export async function priceCart(customerKey: string, session?: ClientSession) {
  const raw = await cartOf(customerKey, session);

  const productIds = [...new Set(raw.map((line) => String(line.productId)))].filter((id) =>
    Types.ObjectId.isValid(id),
  );
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
        .session(session ?? null)
        .lean()
    : [];
  const byProduct = new Map(products.map((product) => [String(product._id), product]));

  const storeIds = [...new Set(products.map((product) => String(product.storeId)))].filter(
    (id) => Types.ObjectId.isValid(id),
  );
  const stores = storeIds.length
    ? await Store.find({ _id: { $in: storeIds } })
        .session(session ?? null)
        .lean()
    : [];
  const byStore = new Map(stores.map((store) => [String(store._id), store]));

  const lines = raw.map((line) => {
    const product = byProduct.get(String(line.productId)) ?? null;
    const store = product ? (byStore.get(String(product.storeId)) ?? null) : null;
    const avail = availability(product, store);
    const unitPrice = unitPriceOf(product, line.option);
    const min = product?.minQty ?? 1;
    const max = product?.maxQty ?? null;

    let problem: string | null = null;
    if (!product) problem = ERR.NO_PRODUCT;
    else if (!store) problem = ERR.NO_STORE;
    else if (!store.isOpen) problem = ERR.STORE_CLOSED;
    else if (!product.active) problem = ERR.PRODUCT_OFF;
    else if (avail === 'out') problem = ERR.NO_STOCK;
    else if (avail === 'in-stock' && line.qty > (product.stock ?? 0)) problem = ERR.SHORT_STOCK;
    else if (line.qty < min) problem = ERR.BELOW_MIN;
    else if (max != null && line.qty > max) problem = ERR.ABOVE_MAX;

    return {
      ...line,
      product,
      store,
      unitPrice,
      lineTotal: unitPrice * line.qty,
      preorder: avail === 'preorder',
      availability: avail,
      problem,
    };
  });

  /* Delivery is charged once per store, not once per line and not once per
     order — a basket split into a normal order and a pre-order is still one
     trip for the rider. */
  const perStore = new Map<string, { store: NonNullable<(typeof lines)[number]['store']>; subtotal: number }>();
  for (const line of lines) {
    if (!line.store || line.problem) continue;
    const id = String(line.store._id);
    const bucket = perStore.get(id) ?? { store: line.store, subtotal: 0 };
    bucket.subtotal += line.lineTotal;
    perStore.set(id, bucket);
  }

  let delivery = 0;
  for (const { store, subtotal } of perStore.values()) {
    const free = store.freeDeliveryOver != null && subtotal >= store.freeDeliveryOver;
    delivery += free ? 0 : (store.deliveryFee ?? 0);
  }

  const subtotal = lines.reduce((sum, line) => sum + (line.problem ? 0 : line.lineTotal), 0);

  return {
    lines,
    subtotal,
    delivery,
    total: subtotal + delivery,
    /* Carried with its `problem` narrowed to a string, so the caller that
       reports the first one does not have to re-check what it just filtered. */
    problems: lines.flatMap((line) =>
      line.problem ? [{ ...line, problem: line.problem }] : [],
    ),
    hasPreorder: lines.some((line) => line.preorder && !line.problem),
  };
}

/* ------------------------------------------------------------------ *
 * checkout
 * ------------------------------------------------------------------ */

/** A short human name for a basket, for notifications and order lists. */
const titleFor = (lines: { name: string }[]) =>
  lines.length === 1 ? lines[0].name : `${lines[0].name} +${lines.length - 1}`;

/**
 * Turn the basket into orders, take the money, and move the stock.
 *
 * Everything that can refuse runs first, over the whole basket, so there is
 * no path that charges for one line and then discovers the next is sold out.
 * The plan is built in full — every group, its fee and its total — and only
 * once nothing in it can refuse does the second loop write anything. A
 * refusal returns before the first write, so the transaction it aborts out of
 * was empty anyway.
 *
 * The basket splits per store, and again by whether a line is a pre-order: an
 * order the cook has already committed to and a request they have not yet
 * agreed to cannot share a status.
 */
export async function checkout({
  customerKey,
  customer,
}: {
  customerKey: string;
  customer: {
    name?: string;
    phone?: string;
    address?: unknown;
  };
}): Promise<Result<Record<string, unknown>[]>> {
  return tx(async (session) => {
    const priced = await priceCart(customerKey, session);
    if (!priced.lines.length) return fail(ERR.EMPTY_CART);
    if (priced.problems.length) {
      const first = priced.problems[0];
      return fail(first.problem, {
        productName: first.product?.name,
        stock: first.product?.stock,
      });
    }

    const balance = await balanceFor('customer', customerKey, session);
    if (balance < priced.total) {
      return fail(ERR.LOW_BALANCE, {
        short: priced.total - balance,
        balance,
        total: priced.total,
      });
    }

    /* `problems` being empty already guarantees both of these; this is the
       type system's copy of the check, not a second one. */
    const ready = priced.lines.flatMap((line) =>
      line.product && line.store ? [{ ...line, product: line.product, store: line.store }] : [],
    );

    /* ---- group ---- */
    const groups = new Map<
      string,
      { store: (typeof ready)[number]['store']; preorder: boolean; lines: typeof ready }
    >();
    for (const line of ready) {
      const key = `${String(line.store._id)}::${line.preorder ? 'pre' : 'now'}`;
      const group = groups.get(key) ?? { store: line.store, preorder: line.preorder, lines: [] };
      group.lines.push(line);
      groups.set(key, group);
    }

    /* ---- plan ---- */
    /* Delivery rides on the first order for each store, so a split basket is
       charged the same as an unsplit one. The free-delivery threshold is
       measured against the store's whole basket rather than this group's —
       a customer who spent enough to earn free delivery does not lose it
       because one of the things they bought has to be baked to order. */
    const feeTaken = new Set<string>();
    const plan = [];

    for (const group of groups.values()) {
      const storeId = String(group.store._id);
      const subtotal = group.lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const storeSubtotal = ready
        .filter((line) => String(line.store._id) === storeId)
        .reduce((sum, line) => sum + line.lineTotal, 0);

      const free =
        group.store.freeDeliveryOver != null && storeSubtotal >= group.store.freeDeliveryOver;
      const fee = feeTaken.has(storeId) || free ? 0 : (group.store.deliveryFee ?? 0);
      feeTaken.add(storeId);

      plan.push({
        store: group.store,
        storeId,
        preorder: group.preorder,
        lines: group.lines,
        subtotal,
        fee,
        amount: subtotal + fee,
      });
    }

    /* An order worth nothing cannot be held, and `post()` throws rather than
       refusing on one. Caught here, where a refusal is still a refusal. */
    if (plan.some((entry) => entry.amount <= 0)) return fail(ERR.BAD_AMOUNT);

    /* ---- execute ---- */
    const at = new Date();
    const buyer = customer.name?.trim() || 'A customer';
    const created: Record<string, unknown>[] = [];

    for (const entry of plan) {
      const status = entry.preorder ? 'pending' : 'confirmed';

      const lines = entry.lines.map((line) => ({
        productId: String(line.product._id),
        name: line.product.name,
        image: line.product.images?.[0] ?? '',
        option: line.option,
        unitPrice: line.unitPrice,
        qty: line.qty,
        lineTotal: line.lineTotal,
      }));

      const [order] = await Order.create(
        [
          {
            code: makeCode(),
            kind: 'store',
            storeId: entry.storeId,
            kitchenId: entry.store.kitchenId,
            cookName: entry.store.name,
            title: titleFor(lines),
            image: lines[0].image,
            handover: 'delivery',

            customerKey,
            customerName: customer.name ?? '',
            phone: customer.phone ?? '',
            address: customer.address ?? null,

            lines,
            subtotal: entry.subtotal,
            deliveryFee: entry.fee,
            price: entry.amount,
            amount: entry.amount,

            preorder: entry.preorder,
            status,
            payment: 'held',
            history: [{ status, at: at.toISOString() }],
          },
        ],
        { session },
      );

      const orderId = String(order._id);

      /* The money leaves the customer either way. A pre-order the cook turns
         down is refunded; holding it in the meantime is what makes the
         request worth the cook's attention.

         `fromRef` is the customer's key, not decoration — `balanceFor` folds
         a debit only when it can see whose it was, so a hold posted without
         it would leave the wallet reading as though nothing had been spent. */
      await post(session, {
        kind: 'hold',
        amount: entry.amount,
        from: 'customer',
        to: 'held',
        fromRef: customerKey,
        orderId,
        note: `Held for ${order.title}`,
        idemKey: `hold:${orderId}`,
      });

      // Stock only moves for what is actually on the shelf.
      if (!entry.preorder) {
        const taken = new Map<string, { qty: number; product: (typeof entry.lines)[number]['product'] }>();
        for (const line of entry.lines) {
          const id = String(line.product._id);
          const seen = taken.get(id);
          taken.set(id, {
            qty: (seen?.qty ?? 0) + line.qty,
            product: line.product,
          });
        }

        for (const [productId, { qty, product }] of taken) {
          /* The count came out of this transaction's own read, so the write
             is based on the value it was checked against; a concurrent
             decrement conflicts and the whole checkout replays. */
          const left = Math.max(0, (product.stock ?? 0) - qty);
          await Product.updateOne(
            { _id: productId },
            {
              stock: left,
              outOfStockSince: outOfStockClock(left, product.outOfStockSince, at),
            },
            { session },
          );
        }
      }

      await notify(session, {
        audience: 'cook',
        kind: entry.preorder ? 'preorder-new' : 'store-order-new',
        key: `cook:${entry.preorder ? 'preorder-new' : 'store-order-new'}:${orderId}`,
        title: entry.preorder ? 'New pre-order request' : 'New store order',
        body: entry.preorder
          ? `${buyer} asked to pre-order ${order.title}. Accept or decline.`
          : `${buyer} ordered ${order.title} — ${taka(entry.amount)}.`,
        kitchenId: entry.store.kitchenId,
        orderId,
      });

      await notify(session, {
        audience: 'customer',
        kind: entry.preorder ? 'preorder-sent' : 'order-placed',
        key: `customer:${entry.preorder ? 'preorder-sent' : 'order-placed'}:${orderId}`,
        title: entry.preorder ? 'Pre-order sent' : 'Order confirmed',
        body: entry.preorder
          ? `${taka(entry.amount)} is held while ${entry.store.name || 'the kitchen'} decides. You get it back if they decline.`
          : `${taka(entry.amount)} is held until you confirm the food arrived.`,
        customerKey,
        orderId,
      });

      created.push(order.toObject() as Record<string, unknown>);
    }

    await Cart.updateOne({ customerKey }, { lines: [] }, { session });

    return ok(created);
  });
}

/* ------------------------------------------------------------------ *
 * pre-orders
 * ------------------------------------------------------------------ */

export function pendingPreorders(kitchenId?: string | null, session?: ClientSession) {
  return Order.find({
    kind: 'store',
    status: 'pending',
    ...(kitchenId == null ? {} : { kitchenId: String(kitchenId) }),
  })
    .sort({ createdAt: -1 })
    .session(session ?? null)
    .lean();
}

type OrderLine = { productId?: string; qty?: number };

/**
 * The cook agrees to make it.
 *
 * Nothing moves financially: the money was held when the request was sent,
 * and it stays held until the customer says the food arrived, exactly like
 * every other order.
 *
 * The stock does move, and this is where. Checkout took none — a pre-order is
 * by definition something that was not on the shelf, and reserving units the
 * cook had not agreed to make would have been reserving nothing. Now that
 * they have agreed, the units come off, so a cook who restocked while the
 * request sat there cannot sell the same jar twice.
 */
export async function acceptPreorder({
  orderId,
}: {
  orderId: string;
}): Promise<Result<null>> {
  const id = objectId(orderId);
  if (!id) return fail(ERR.NO_ORDER);

  return tx(async (session) => {
    const order = await Order.findById(id).session(session).lean();
    if (!order) return fail(ERR.NO_ORDER);
    if (order.kind !== 'store') return fail(ERR.WRONG_STATE);
    if (order.status !== 'pending') return fail(ERR.WRONG_STATE);

    const at = new Date();

    const taken = new Map<string, number>();
    for (const line of ((order.lines ?? []) as OrderLine[]).filter(Boolean)) {
      const productId = String(line.productId ?? '');
      const qty = Math.round(Number(line.qty ?? 0));
      if (!productId || !Number.isFinite(qty) || qty <= 0) continue;
      taken.set(productId, (taken.get(productId) ?? 0) + qty);
    }

    for (const [productId, qty] of taken) {
      const pid = objectId(productId);
      if (!pid) continue;

      const product = await Product.findById(pid).session(session).lean();
      // A product deleted since the request was sent does not block the cook.
      if (!product) continue;

      const left = Math.max(0, (product.stock ?? 0) - qty);
      await Product.updateOne(
        { _id: pid },
        {
          stock: left,
          outOfStockSince: outOfStockClock(left, product.outOfStockSince, at),
        },
        { session },
      );
    }

    await Order.updateOne(
      { _id: id },
      {
        status: 'confirmed',
        $push: { history: { status: 'confirmed', at: at.toISOString() } },
      },
      { session },
    );

    await notify(session, {
      audience: 'customer',
      kind: 'preorder-accepted',
      key: `customer:preorder-accepted:${orderId}`,
      title: 'Pre-order accepted',
      body: `${order.cookName || 'The kitchen'} accepted your pre-order for ${order.title}.`,
      customerKey: order.customerKey,
      orderId,
    });

    return ok(null);
  });
}

/**
 * The cook says no, and the money goes straight back.
 *
 * No stock is returned because none was taken — that is the whole point of a
 * pre-order entering at `pending`.
 */
export async function rejectPreorder({
  orderId,
  reason,
}: {
  orderId: string;
  reason?: string;
}): Promise<Result<number>> {
  const id = objectId(orderId);
  if (!id) return fail(ERR.NO_ORDER);

  return tx(async (session) => {
    const order = await Order.findById(id).session(session).lean();
    if (!order) return fail(ERR.NO_ORDER);
    if (order.kind !== 'store') return fail(ERR.WRONG_STATE);
    if (order.status !== 'pending') return fail(ERR.WRONG_STATE);
    if (order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

    const note = reason?.trim() || 'Pre-order declined by the kitchen';

    // Idempotent on `refund:<orderId>`, so a double-tapped decline pays once.
    const refunded = await refundEscrow(session, orderId, { note });
    if (!refunded.ok) return refunded;

    const at = new Date();
    await Order.updateOne(
      { _id: id },
      {
        status: 'rejected',
        cancelReason: note,
        completedAt: at,
        $push: { history: { status: 'rejected', at: at.toISOString() } },
      },
      { session },
    );

    await notify(session, {
      audience: 'customer',
      kind: 'preorder-rejected',
      key: `customer:preorder-rejected:${orderId}`,
      title: 'Pre-order declined',
      body: `${order.cookName || 'The kitchen'} could not take ${order.title}. ${taka(
        refunded.result.refunded,
      )} is back in your wallet.`,
      customerKey: order.customerKey,
      orderId,
    });

    return ok(refunded.result.refunded);
  });
}

/* ------------------------------------------------------------------ *
 * dashboard
 * ------------------------------------------------------------------ */

const FINISHED = ['completed', 'cancelled', 'rejected'];

/**
 * Everything the cook's store overview counts.
 *
 * Counted in the database rather than over a loaded list: the app could fold
 * its whole state in one pass because the whole state was one document, and
 * a store with a year of orders behind it is not.
 */
export async function storeOverview(storeId: string) {
  const store = await storeById(storeId);
  if (!store) return null;

  const id = String(store._id);

  const [productStats, orderStats, categories] = await Promise.all([
    Product.aggregate<{
      products: number;
      active: number;
      outOfStock: number;
      preorderable: number;
    }>([
      { $match: { storeId: id } },
      {
        $group: {
          _id: null,
          products: { $sum: 1 },
          active: { $sum: { $cond: ['$active', 1, 0] } },
          outOfStock: {
            $sum: {
              $cond: [
                { $and: ['$active', { $lte: [{ $ifNull: ['$stock', 0] }, 0] }] },
                1,
                0,
              ],
            },
          },
          preorderable: { $sum: { $cond: ['$preorder', 1, 0] } },
        },
      },
    ]),
    Order.aggregate<{
      pendingPreorders: number;
      activeOrders: number;
      completedOrders: number;
      earned: number;
      pending: number;
    }>([
      { $match: { kind: 'store', storeId: id } },
      {
        $group: {
          _id: null,
          pendingPreorders: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          activeOrders: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $not: [{ $in: ['$status', FINISHED] }] },
                    { $ne: ['$status', 'pending'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          /* What the cook actually received, not what the customer paid. The
             app summed `amount` because it had no commission to subtract;
             now it has one, and a dashboard reading gross would be promising
             a payout the payout run will not make. */
          earned: {
            $sum: {
              $cond: [
                { $eq: ['$payment', 'released'] },
                { $ifNull: ['$cookAmount', '$amount'] },
                0,
              ],
            },
          },
          // Still in escrow, so still gross — the split has not happened yet.
          pending: {
            $sum: { $cond: [{ $eq: ['$payment', 'held'] }, '$amount', 0] },
          },
        },
      },
    ]),
    StoreCategory.countDocuments({ storeId: id }),
  ]);

  return {
    products: productStats[0]?.products ?? 0,
    categories,
    active: productStats[0]?.active ?? 0,
    outOfStock: productStats[0]?.outOfStock ?? 0,
    preorderable: productStats[0]?.preorderable ?? 0,
    pendingPreorders: orderStats[0]?.pendingPreorders ?? 0,
    activeOrders: orderStats[0]?.activeOrders ?? 0,
    completedOrders: orderStats[0]?.completedOrders ?? 0,
    earned: orderStats[0]?.earned ?? 0,
    pending: orderStats[0]?.pending ?? 0,
  };
}

/** The filters on the cook's order screen, in the order they are shown. */
export const ORDER_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pre-orders' },
  { key: 'confirmed', label: 'New' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivering', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

/** Applied to a page of orders the caller already fetched, as on the device. */
export function filterOrders<T extends { status: string }>(orders: T[], key: string): T[] {
  if (key === 'all') return orders;
  // "Cancelled" is the customer's word for both ways an order can end badly.
  if (key === 'cancelled') {
    return orders.filter((o) => o.status === 'cancelled' || o.status === 'rejected');
  }
  return orders.filter((o) => o.status === key);
}
