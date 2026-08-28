/**
 * Cook stores: a shop per kitchen, with its own categories, products and
 * stock, selling into the wallet that `ledger.js` owns.
 *
 * Two rules shape almost everything here.
 *
 * **Stock is the truth, and it is checked where it is changed.** Validation
 * and decrement happen inside one transition against the live document, so
 * there is no window between "is there enough" and "take one" for a second
 * tap to slip through. Overselling is not prevented by a lock; it is
 * prevented by never separating the two steps.
 *
 * **Out of stock is not the end of the conversation.** A cook who is willing
 * to make more can leave pre-orders on, and then a zero-stock product still
 * sells -- but as a request the cook has to accept, not as an order that
 * commits them to baking a cake tonight.
 */
import {
  ERR,
  balances,
  bump,
  done,
  fail,
  makeCode,
  notify,
  post,
  refundInto,
  setStatus,
} from './ledger';

/* ------------------------------------------------------------------ *
 * reads
 * ------------------------------------------------------------------ */

export const storeForKitchen = (state, kitchenId) =>
  state.stores.find((s) => String(s.kitchenId) === String(kitchenId)) ?? null;

export const storeById = (state, storeId) =>
  state.stores.find((s) => s.id === storeId) ?? null;

/** A store's categories in the order the cook arranged them. */
export const categoriesOf = (state, storeId) =>
  state.categories
    .filter((c) => c.storeId === storeId)
    .slice()
    .sort((a, b) => a.order - b.order);

export const productsOf = (state, storeId, categoryId) =>
  state.products.filter(
    (p) => p.storeId === storeId && (!categoryId || p.categoryId === categoryId),
  );

export const productById = (state, productId) =>
  state.products.find((p) => p.id === productId) ?? null;

/**
 * What a customer can do with a product right now.
 *
 * One function rather than a scatter of `stock > 0` checks, because the
 * three states -- buy it, pre-order it, look at it -- are what every card,
 * badge and button on the customer side branches on.
 */
export function availability(product, store) {
  if (!product || !store) return 'gone';
  if (!product.active) return 'off';
  if (!store.isOpen) return 'closed';
  if ((product.stock ?? 0) > 0) return 'in-stock';
  return product.preorder ? 'preorder' : 'out';
}

export const canOrder = (product, store) =>
  ['in-stock', 'preorder'].includes(availability(product, store));

/** The unit price with the chosen option's difference folded in. */
export function unitPriceOf(product, optionLabel) {
  const base = product?.price ?? 0;
  if (!optionLabel || !product?.options?.choices?.length) return base;
  const choice = product.options.choices.find((c) => c.label === optionLabel);
  return base + (choice?.priceDelta ?? 0);
}

/* ------------------------------------------------------------------ *
 * the store itself
 * ------------------------------------------------------------------ */

/**
 * Create or update the kitchen's store.
 *
 * One store per kitchen: the storefront *is* the kitchen's shop window, and
 * a cook with two of them would be two sellers wearing one name.
 */
export function saveStore(state, { kitchenId, patch, now }) {
  if (patch?.name != null && !String(patch.name).trim()) {
    return fail(state, ERR.NAME_REQUIRED);
  }

  const existing = storeForKitchen(state, kitchenId);
  if (existing) {
    const updated = { ...existing, ...patch, updatedAt: now };
    return done(
      { ...state, stores: state.stores.map((s) => (s.id === existing.id ? updated : s)) },
      updated,
    );
  }

  const [seq, id] = bump(state, 'store');
  const store = {
    id,
    kitchenId,
    name: '',
    tagline: '',
    description: '',
    logo: '',
    cover: '',
    phone: '',
    area: '',
    lat: null,
    lng: null,
    deliveryRadiusKm: null,
    deliveryFee: 0,
    freeDeliveryOver: null,
    // A shop opens shut. The cook decides when the shelves are ready.
    isOpen: false,
    createdAt: now,
    ...patch,
  };
  return done({ ...state, seq, stores: [store, ...state.stores] }, store);
}

export function toggleStoreOpen(state, { storeId }) {
  const store = storeById(state, storeId);
  if (!store) return fail(state, ERR.NO_STORE);
  return done(
    {
      ...state,
      stores: state.stores.map((s) =>
        s.id === storeId ? { ...s, isOpen: !s.isOpen } : s,
      ),
    },
    !store.isOpen,
  );
}

/* ------------------------------------------------------------------ *
 * categories
 * ------------------------------------------------------------------ */

export function addCategory(state, { storeId, name, emoji, now }) {
  if (!String(name ?? '').trim()) return fail(state, ERR.NAME_REQUIRED);
  if (!storeById(state, storeId)) return fail(state, ERR.NO_STORE);

  const [seq, id] = bump(state, 'cat');
  const order = categoriesOf(state, storeId).length;
  const category = {
    id,
    storeId,
    name: String(name).trim(),
    emoji: emoji ?? '',
    order,
    createdAt: now,
  };
  return done({ ...state, seq, categories: [...state.categories, category] }, category);
}

export function updateCategory(state, { categoryId, patch }) {
  const category = state.categories.find((c) => c.id === categoryId);
  if (!category) return fail(state, ERR.NO_PRODUCT);
  if (patch?.name != null && !String(patch.name).trim()) {
    return fail(state, ERR.NAME_REQUIRED);
  }
  return done(
    {
      ...state,
      categories: state.categories.map((c) =>
        c.id === categoryId ? { ...c, ...patch } : c,
      ),
    },
    null,
  );
}

/**
 * Delete a category, but only an empty one.
 *
 * Deleting one with products in it would either orphan them or delete a
 * cook's work as a side effect of tidying a menu. Refusing and saying how
 * many are in the way is the honest answer.
 */
export function removeCategory(state, { categoryId }) {
  const category = state.categories.find((c) => c.id === categoryId);
  if (!category) return fail(state, ERR.NO_PRODUCT);

  const inUse = state.products.filter((p) => p.categoryId === categoryId).length;
  if (inUse) return fail(state, ERR.CATEGORY_IN_USE, { count: inUse });

  const left = categoriesOf(state, category.storeId)
    .filter((c) => c.id !== categoryId)
    .map((c, i) => ({ ...c, order: i }));

  return done(
    {
      ...state,
      categories: [
        ...state.categories.filter((c) => c.storeId !== category.storeId),
        ...left,
      ],
    },
    null,
  );
}

/** Move a category up or down its store's list. */
export function moveCategory(state, { categoryId, delta }) {
  const category = state.categories.find((c) => c.id === categoryId);
  if (!category) return fail(state, ERR.NO_PRODUCT);

  const list = categoriesOf(state, category.storeId);
  const from = list.findIndex((c) => c.id === categoryId);
  const to = from + delta;
  if (to < 0 || to >= list.length) return fail(state, ERR.WRONG_STATE);

  const moved = list.slice();
  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item);

  const renumbered = moved.map((c, i) => ({ ...c, order: i }));
  return done(
    {
      ...state,
      categories: [
        ...state.categories.filter((c) => c.storeId !== category.storeId),
        ...renumbered,
      ],
    },
    null,
  );
}

/* ------------------------------------------------------------------ *
 * products
 * ------------------------------------------------------------------ */

const NUMERIC = ['price', 'stock', 'minQty', 'maxQty'];

/** Create or update one product. */
export function saveProduct(state, { productId, storeId, patch, now }) {
  const clean = { ...patch };
  for (const key of NUMERIC) {
    if (clean[key] != null && clean[key] !== '') clean[key] = Math.round(Number(clean[key]));
  }

  if (clean.name != null && !String(clean.name).trim()) {
    return fail(state, ERR.NAME_REQUIRED);
  }
  if (clean.price != null && (!Number.isFinite(clean.price) || clean.price <= 0)) {
    return fail(state, ERR.BAD_AMOUNT);
  }
  if (clean.stock != null && (!Number.isFinite(clean.stock) || clean.stock < 0)) {
    return fail(state, ERR.BAD_AMOUNT);
  }

  if (productId) {
    const existing = productById(state, productId);
    if (!existing) return fail(state, ERR.NO_PRODUCT);
    const updated = { ...existing, ...clean, updatedAt: now };
    return done(
      { ...state, products: state.products.map((p) => (p.id === productId ? updated : p)) },
      updated,
    );
  }

  if (!storeById(state, storeId)) return fail(state, ERR.NO_STORE);

  const [seq, id] = bump(state, 'prod');
  const product = {
    id,
    storeId,
    categoryId: null,
    name: '',
    description: '',
    images: [],
    price: 0,
    stock: 0,
    minQty: 1,
    maxQty: null,
    active: true,
    preorder: false,
    prepTime: '',
    deliveryNote: '',
    options: null,
    createdAt: now,
    ...clean,
  };
  return done({ ...state, seq, products: [product, ...state.products] }, product);
}

export function removeProduct(state, { productId }) {
  if (!productById(state, productId)) return fail(state, ERR.NO_PRODUCT);
  return done(
    {
      ...state,
      products: state.products.filter((p) => p.id !== productId),
      // Anything in a basket pointing at it goes too, or checkout would
      // refuse on a line nobody can see or remove.
      carts: Object.fromEntries(
        Object.entries(state.carts).map(([key, lines]) => [
          key,
          lines.filter((l) => l.productId !== productId),
        ]),
      ),
    },
    null,
  );
}

/** Restock, or correct a count. Separate from `saveProduct` so the cook's
    inventory screen can be a list of steppers rather than a list of forms. */
export function setStock(state, { productId, stock }) {
  const value = Math.round(Number(stock));
  if (!Number.isFinite(value) || value < 0) return fail(state, ERR.BAD_AMOUNT);
  if (!productById(state, productId)) return fail(state, ERR.NO_PRODUCT);
  return done(
    {
      ...state,
      products: state.products.map((p) => (p.id === productId ? { ...p, stock: value } : p)),
    },
    value,
  );
}

const flip = (field) => (state, { productId }) => {
  const product = productById(state, productId);
  if (!product) return fail(state, ERR.NO_PRODUCT);
  return done(
    {
      ...state,
      products: state.products.map((p) =>
        p.id === productId ? { ...p, [field]: !p[field] } : p,
      ),
    },
    !product[field],
  );
};

/** Take it off sale without deleting the cook's work. */
export const toggleProduct = flip('active');
export const togglePreorder = flip('preorder');

/* ------------------------------------------------------------------ *
 * cart
 * ------------------------------------------------------------------ */

/** One basket per customer, keyed the same way orders are. */
export const cartOf = (state, customerKey) => state.carts[customerKey] ?? [];

const withCart = (state, customerKey, lines) => ({
  ...state,
  carts: { ...state.carts, [customerKey]: lines },
});

/* A line is a product *and* the option chosen on it: two sizes of the same
   cake are two lines, not one line with a confused quantity. */
const lineKey = (productId, option) => `${productId}::${option ?? ''}`;

/**
 * Put something in the basket.
 *
 * The quantity limits are enforced here as well as at checkout. Checkout is
 * the one that matters -- the basket can go stale while it sits there -- but
 * refusing at the point of tapping is how someone finds out in time to do
 * something about it.
 */
export function addToCart(state, { customerKey, productId, qty = 1, option, now }) {
  const product = productById(state, productId);
  if (!product) return fail(state, ERR.NO_PRODUCT);

  const store = storeById(state, product.storeId);
  if (!store) return fail(state, ERR.NO_STORE);
  if (!store.isOpen) return fail(state, ERR.STORE_CLOSED);
  if (!product.active) return fail(state, ERR.PRODUCT_OFF);

  const avail = availability(product, store);
  if (avail === 'out') return fail(state, ERR.NO_STOCK);

  const lines = cartOf(state, customerKey);
  const key = lineKey(productId, option);
  const found = lines.find((l) => l.key === key);

  /* A first add jumps straight to the minimum order quantity -- asking for
     one when the cook only sells four is a refusal nobody learns from. */
  const min = product.minQty ?? 1;
  const added = Math.max(1, Math.round(qty));
  const wanted = found ? found.qty + added : Math.max(added, min);

  const max = product.maxQty ?? null;
  if (max != null && wanted > max) return fail(state, ERR.ABOVE_MAX, { max });
  // A pre-order is not limited by a stock level that is, by definition, zero.
  if (avail === 'in-stock' && wanted > product.stock) {
    return fail(state, ERR.SHORT_STOCK, { stock: product.stock });
  }

  const line = { key, productId, option: option ?? null, qty: wanted, addedAt: now };

  return done(
    withCart(
      state,
      customerKey,
      found ? lines.map((l) => (l.key === key ? line : l)) : [...lines, line],
    ),
    line,
  );
}

export function setCartQty(state, { customerKey, key, qty }) {
  const lines = cartOf(state, customerKey);
  const found = lines.find((l) => l.key === key);
  if (!found) return fail(state, ERR.NO_PRODUCT);

  const value = Math.round(Number(qty));
  if (!Number.isFinite(value) || value < 0) return fail(state, ERR.BAD_AMOUNT);
  if (value === 0) {
    return done(withCart(state, customerKey, lines.filter((l) => l.key !== key)), 0);
  }

  const product = productById(state, found.productId);
  if (!product) return fail(state, ERR.NO_PRODUCT);
  const store = storeById(state, product.storeId);
  const max = product.maxQty ?? null;
  if (max != null && value > max) return fail(state, ERR.ABOVE_MAX, { max });
  if (availability(product, store) === 'in-stock' && value > product.stock) {
    return fail(state, ERR.SHORT_STOCK, { stock: product.stock });
  }

  return done(
    withCart(
      state,
      customerKey,
      lines.map((l) => (l.key === key ? { ...l, qty: value } : l)),
    ),
    value,
  );
}

export function removeFromCart(state, { customerKey, key }) {
  const lines = cartOf(state, customerKey);
  return done(withCart(state, customerKey, lines.filter((l) => l.key !== key)), null);
}

export function clearCart(state, { customerKey }) {
  return done(withCart(state, customerKey, []), null);
}

/**
 * Price the basket, revalidating every line against the live product.
 *
 * Nothing the cart stored is trusted: the price, the availability and the
 * limits are all read again from the product record, because a basket can
 * sit for a day while the cook changes their mind about all three.
 *
 * Returns the same shape whether or not it is orderable, so the cart screen
 * can show the problem next to the line that has it rather than as one
 * banner at the bottom.
 */
export function priceCart(state, customerKey) {
  const lines = cartOf(state, customerKey).map((line) => {
    const product = productById(state, line.productId);
    const store = product ? storeById(state, product.storeId) : null;
    const avail = availability(product, store);
    const unitPrice = unitPriceOf(product, line.option);
    const min = product?.minQty ?? 1;
    const max = product?.maxQty ?? null;

    let problem = null;
    if (!product) problem = ERR.NO_PRODUCT;
    else if (!store) problem = ERR.NO_STORE;
    else if (!store.isOpen) problem = ERR.STORE_CLOSED;
    else if (!product.active) problem = ERR.PRODUCT_OFF;
    else if (avail === 'out') problem = ERR.NO_STOCK;
    else if (avail === 'in-stock' && line.qty > product.stock) problem = ERR.SHORT_STOCK;
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
     order -- a basket split into a normal order and a pre-order is still one
     trip for the rider. */
  const stores = new Map();
  for (const line of lines) {
    if (!line.store || line.problem) continue;
    const bucket = stores.get(line.store.id) ?? { store: line.store, subtotal: 0 };
    bucket.subtotal += line.lineTotal;
    stores.set(line.store.id, bucket);
  }

  let delivery = 0;
  for (const { store, subtotal } of stores.values()) {
    const free = store.freeDeliveryOver != null && subtotal >= store.freeDeliveryOver;
    delivery += free ? 0 : (store.deliveryFee ?? 0);
  }

  const subtotal = lines.reduce((sum, l) => sum + (l.problem ? 0 : l.lineTotal), 0);

  return {
    lines,
    subtotal,
    delivery,
    total: subtotal + delivery,
    problems: lines.filter((l) => l.problem),
    hasPreorder: lines.some((l) => l.preorder && !l.problem),
  };
}

/* ------------------------------------------------------------------ *
 * checkout
 * ------------------------------------------------------------------ */

/** A short human name for a basket, for notifications and order lists. */
const titleFor = (lines) =>
  lines.length === 1
    ? lines[0].name
    : `${lines[0].name} +${lines.length - 1}`;

/**
 * Turn the basket into orders, take the money, and move the stock.
 *
 * Everything that can refuse runs first, over the whole basket, so there is
 * no path that charges for one line and then discovers the next is sold out.
 * Only once the entire order is known to be payable does anything change.
 *
 * The basket splits per store, and again by whether a line is a pre-order:
 * an order the cook has already committed to and a request they have not yet
 * agreed to cannot share a status.
 */
export function checkout(state, { customerKey, customer, now, rand }) {
  const priced = priceCart(state, customerKey);
  if (!priced.lines.length) return fail(state, ERR.EMPTY_CART);
  if (priced.problems.length) {
    const first = priced.problems[0];
    return fail(state, first.problem, {
      productName: first.product?.name,
      stock: first.product?.stock,
    });
  }

  const balance = balances(state.ledger).customer;
  if (balance < priced.total) {
    return fail(state, ERR.LOW_BALANCE, {
      short: priced.total - balance,
      balance,
      total: priced.total,
    });
  }

  /* ---- group ---- */
  const groups = new Map();
  for (const line of priced.lines) {
    const key = `${line.store.id}::${line.preorder ? 'pre' : 'now'}`;
    const group = groups.get(key) ?? {
      store: line.store,
      preorder: line.preorder,
      lines: [],
    };
    group.lines.push(line);
    groups.set(key, group);
  }

  /* Delivery rides on the first order for each store, so a split basket is
     charged the same as an unsplit one. */
  const feeTaken = new Set();
  let next = state;
  const created = [];

  for (const group of groups.values()) {
    const subtotal = group.lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const storeSubtotal = priced.lines
      .filter((l) => l.store.id === group.store.id)
      .reduce((sum, l) => sum + l.lineTotal, 0);
    const free =
      group.store.freeDeliveryOver != null &&
      storeSubtotal >= group.store.freeDeliveryOver;
    const fee = feeTaken.has(group.store.id) || free ? 0 : (group.store.deliveryFee ?? 0);
    feeTaken.add(group.store.id);

    const amount = subtotal + fee;
    const [seq, id] = bump(next, 'order');

    const lines = group.lines.map((l) => ({
      productId: l.productId,
      name: l.product.name,
      image: l.product.images?.[0] ?? '',
      option: l.option,
      unitPrice: l.unitPrice,
      qty: l.qty,
      lineTotal: l.lineTotal,
    }));

    const order = {
      id,
      kind: 'store',
      code: makeCode(rand),
      storeId: group.store.id,
      kitchenId: group.store.kitchenId,
      cookName: group.store.name,
      title: titleFor(lines),
      image: lines[0].image,
      handover: 'delivery',
      customerKey,
      customerName: customer.name,
      phone: customer.phone,
      address: customer.address,
      lines,
      subtotal,
      deliveryFee: fee,
      amount,
      preorder: group.preorder,
      status: group.preorder ? 'pending' : 'confirmed',
      payment: 'held',
      history: [{ status: group.preorder ? 'pending' : 'confirmed', at: now }],
      createdAt: now,
    };

    next = { ...next, seq, orders: [order, ...next.orders] };

    /* The money leaves the customer either way. A pre-order the cook turns
       down is refunded; holding it in the meantime is what makes the
       request worth the cook's attention. */
    next = post(next, {
      kind: 'hold',
      amount,
      from: 'customer',
      to: 'held',
      orderId: id,
      note: 'Held for {title}',
      now,
    });

    // Stock only moves for what is actually on the shelf.
    if (!group.preorder) {
      const taken = new Map();
      for (const line of lines) {
        taken.set(line.productId, (taken.get(line.productId) ?? 0) + line.qty);
      }
      next = {
        ...next,
        products: next.products.map((p) =>
          taken.has(p.id) ? { ...p, stock: Math.max(0, p.stock - taken.get(p.id)) } : p,
        ),
      };
    }

    next = notify(next, {
      audience: 'cook',
      kind: group.preorder ? 'preorder-new' : 'store-order-new',
      key: `cook:${group.preorder ? 'preorder-new' : 'store-order-new'}:${id}`,
      title: group.preorder ? 'New pre-order request' : 'New store order',
      body: group.preorder
        ? '{customer} asked to pre-order {title}. Accept or decline.'
        : '{customer} ordered {title} — ৳{amount}.',
      orderId: id,
      now,
    });

    next = notify(next, {
      audience: 'customer',
      kind: group.preorder ? 'preorder-sent' : 'order-placed',
      key: `customer:${group.preorder ? 'preorder-sent' : 'order-placed'}:${id}`,
      title: group.preorder ? 'Pre-order sent' : 'Order confirmed',
      body: group.preorder
        ? '৳{amount} is held while {cook} decides. You get it back if they decline.'
        : '৳{amount} is held until you confirm the food arrived.',
      orderId: id,
      now,
    });

    created.push(order);
  }

  next = withCart(next, customerKey, []);
  return done(next, created);
}

/* ------------------------------------------------------------------ *
 * pre-orders
 * ------------------------------------------------------------------ */

export const pendingPreorders = (state, kitchenId) =>
  state.orders.filter(
    (o) =>
      o.kind === 'store' &&
      o.status === 'pending' &&
      (kitchenId == null || String(o.kitchenId) === String(kitchenId)),
  );

/**
 * The cook agrees to make it.
 *
 * Nothing moves financially: the money was held when the request was sent,
 * and it stays held until the customer says the food arrived, exactly like
 * every other order. All that changes is that the cook has committed.
 */
export function acceptPreorder(state, { orderId, now }) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return fail(state, ERR.NO_ORDER);
  if (order.status !== 'pending') return fail(state, ERR.WRONG_STATE);

  let next = setStatus(state, orderId, 'confirmed', now);
  next = notify(next, {
    audience: 'customer',
    kind: 'preorder-accepted',
    key: `customer:preorder-accepted:${orderId}`,
    title: 'Pre-order accepted',
    body: '{cook} accepted your pre-order for {title}.',
    orderId,
    now,
  });
  return done(next, null);
}

/** The cook says no, and the money goes straight back. */
export function rejectPreorder(state, { orderId, reason, now }) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return fail(state, ERR.NO_ORDER);
  if (order.status !== 'pending') return fail(state, ERR.WRONG_STATE);
  if (order.payment !== 'held') return fail(state, ERR.ALREADY_SETTLED);

  let next = refundInto(
    state,
    order,
    reason ?? 'Pre-order declined by the kitchen',
    now,
    'rejected',
  );

  next = notify(next, {
    audience: 'customer',
    kind: 'preorder-rejected',
    key: `customer:preorder-rejected:${orderId}`,
    title: 'Pre-order declined',
    body: '{cook} could not take {title}. ৳{amount} is back in your wallet.',
    orderId,
    now,
  });

  return done(next, order.amount);
}

/* ------------------------------------------------------------------ *
 * dashboard
 * ------------------------------------------------------------------ */

/** Everything the cook's store overview counts, in one pass. */
export function storeOverview(state, store) {
  if (!store) return null;
  const products = state.products.filter((p) => p.storeId === store.id);
  const orders = state.orders.filter((o) => o.kind === 'store' && o.storeId === store.id);

  const open = orders.filter(
    (o) => !['completed', 'cancelled', 'rejected'].includes(o.status),
  );

  return {
    products: products.length,
    categories: categoriesOf(state, store.id).length,
    active: products.filter((p) => p.active).length,
    outOfStock: products.filter((p) => p.active && (p.stock ?? 0) <= 0).length,
    preorderable: products.filter((p) => p.preorder).length,
    pendingPreorders: orders.filter((o) => o.status === 'pending').length,
    activeOrders: open.filter((o) => o.status !== 'pending').length,
    completedOrders: orders.filter((o) => o.status === 'completed').length,
    earned: orders
      .filter((o) => o.payment === 'released')
      .reduce((sum, o) => sum + o.amount, 0),
    pending: orders
      .filter((o) => o.payment === 'held')
      .reduce((sum, o) => sum + o.amount, 0),
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

export function filterOrders(orders, key) {
  if (key === 'all') return orders;
  if (key === 'cancelled') {
    return orders.filter((o) => o.status === 'cancelled' || o.status === 'rejected');
  }
  return orders.filter((o) => o.status === key);
}
