import { Schema, model, type InferSchemaType } from 'mongoose';

export { LedgerEntry, AppendOnlyError, type LedgerEntryDoc } from './LedgerEntry.js';

/**
 * Every collection except the ledger, which has its own file because it has
 * its own guard.
 *
 * Field names are the app's, verbatim. The Expo client reads them back, so a
 * rename here is a break there that nothing will catch at compile time.
 *
 * The embed-or-reference decisions follow one rule — the 16MB document limit
 * — and are noted where they are not obvious. Anything unbounded is its own
 * collection, however convenient an array would be today.
 */

/* `as const` matters: without it TypeScript widens `false` to `boolean` and
   Mongoose's options type rejects it. */
const opts = { versionKey: false, timestamps: true } as const;

/* ------------------------------------------------------------------ *
 * identity
 * ------------------------------------------------------------------ */

const accountSchema = new Schema(
  {
    /** (email || phone || 'guest').toLowerCase(), or the normalised phone. */
    customerKey: { type: String, required: true, unique: true },
    role: { type: String, default: 'user', index: true },
    name: { type: String, default: '' },
    phone: { type: String, default: null, index: true },
    email: { type: String, default: null },
    kitchenName: { type: String, default: null },
    /**
     * The primary. Every card, list and search result shows one, and this is
     * the field they read — kept as a plain string so none of them change.
     */
    specialty: { type: String, default: null },
    /**
     * The rest. A kitchen doing Sylheti home cooking *and* pitha had to pick
     * one and leave the other unsaid; this is where the other goes. The first
     * entry is the primary above.
     */
    specialties: { type: [String], default: [] },
    /** National ID. KYC only — never returned on a customer-facing endpoint. */
    nid: { type: String, default: null },
    /*
     * The delivery address, flat.
     *
     * These stay, and stay authoritative, because orders, the meals board and
     * the shop directory all read them and all mean "where this person is
     * right now". They are kept as a projection of whichever entry in
     * `addresses` is selected — one place to read, one place to choose.
     */
    area: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    addressDetail: { type: String, default: null },
    addressLabel: { type: String, default: null },

    /**
     * Every address this account has saved.
     *
     * Home and office is the ordinary case in food delivery, and the single
     * flat address above could not express it — `addressLabel` said "HOME"
     * with nothing to contrast against. `selected` marks which one the flat
     * fields currently mirror.
     */
    addresses: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          label: { type: String, default: 'Home' },
          area: { type: String, default: '' },
          detail: { type: String, default: '' },
          instructions: { type: String, default: '' },
          lat: { type: Number, default: null },
          lng: { type: Number, default: null },
          selected: { type: Boolean, default: false },
        },
      ],
      default: [],
    },

    deliveryRadiusKm: { type: Number, default: null },
    avatar: { type: String, default: null },
    bio: { type: String, default: '' },

    /**
     * Shops this account has kept.
     *
     * On the account rather than in a join collection: it is a short list a
     * person curates by hand, it is read on every shop page to draw one
     * button, and it has no attributes of its own — no note, no rank, nothing
     * a row would carry. A collection would buy a query per shop view and
     * nothing else.
     *
     * Store ids as strings, matching how `storeId` is held everywhere else.
     */
    savedStores: { type: [String], default: [] },

    suspended: { type: Boolean, default: false, index: true },
    suspendedReason: { type: String, default: null },

    /** Null until somebody proves they hold the handset. */
    phoneVerifiedAt: { type: Date, default: null },
    /** Bumped to revoke every token this account holds at once. */
    tokenVersion: { type: Number, default: 0 },

    signedInAt: { type: Date, default: null },
  },
  opts,
);

export const Account = model('Account', accountSchema);
export type AccountDoc = InferSchemaType<typeof accountSchema>;

const otpSchema = new Schema(
  {
    phone: { type: String, required: true, index: true },
    /** scrypt of the six digits. Never the digits. */
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    ip: { type: String, default: null },
  },
  { versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

/* Spent codes clean themselves up an hour after they expire. Keeping them is
   a growing table of hashes nobody will ever read. */
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
otpSchema.index({ phone: 1, createdAt: -1 });

export const OtpChallenge = model('OtpChallenge', otpSchema);

const sessionSchema = new Schema(
  {
    accountId: { type: String, required: true, index: true },
    /** Matches the token's `jti`. */
    tokenId: { type: String, required: true, unique: true },
    device: { type: String, default: '' },
    platform: { type: String, default: '' },
    lastSeenAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true, index: true },
    /* Revoking stamps rather than deletes, so a stolen token can be traced
       after the fact. */
    revokedAt: { type: Date, default: null },
  },
  opts,
);

export const AppSession = model('AppSession', sessionSchema);

/* ------------------------------------------------------------------ *
 * kitchens
 * ------------------------------------------------------------------ */

const kitchenSchema = new Schema(
  {
    /* No field-level `index: true` here — the partial unique index below
       covers the same key, and two declarations collide on the auto-generated
       name `accountId_1`. */
    accountId: { type: String, default: null },
    /**
     * The id this kitchen has in the app bundle (`chefs.json`, 1–20).
     *
     * Two id spaces exist and both are real. An order the app places names
     * `chefId: 4`, and without this there is no way to say which kitchen that
     * is. Null for a kitchen a cook registered from their own device.
     */
    legacyId: { type: Number, default: null },

    name: { type: String, required: true },
    ownerName: { type: String, default: '' },
    avatar: { type: String, default: '' },
    /**
     * The banner. Kept as its own field rather than reading photos[0],
     * because every card, list and share preview already draws it and a cook
     * reordering their gallery should not silently change what customers see.
     */
    coverImage: { type: String, default: '' },
    /**
     * The rest of the kitchen, as many as the cook wants to show.
     *
     * One picture was a KYC document — evidence for an operator. A gallery is
     * a different thing: it is what a customer scrolls before deciding to
     * order, so it is unbounded by intent.
     */
    photos: { type: [String], default: [] },
    specialty: { type: String, default: '' },
    /**
     * The rest of what this kitchen cooks best. `specialty` above stays the
     * primary because every card and search result reads one string; this is
     * the full set a cook ticked, with the primary as its first entry.
     */
    specialties: { type: [String], default: [] },
    description: { type: String, default: '' },

    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },

    /** Short and bounded — embedded. Derived from the kitchen's dishes. */
    tags: { type: [String], default: [] },
    ecoBadge: { type: String, default: 'Eco-Packaging' },
    isVerified: { type: Boolean, default: false, index: true },

    area: { type: String, default: '', index: true },
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },
    deliveryRadiusKm: { type: Number, default: 3 },
    isOpen: { type: Boolean, default: false, index: true },

    suspended: { type: Boolean, default: false, index: true },
    suspendedReason: { type: String, default: null },

    /** 'pending' | 'approved' | 'rejected' */
    kycStatus: { type: String, default: 'pending', index: true },
    kycNote: { type: String, default: null },
    kycDecidedAt: { type: Date, default: null },
    kycDecidedBy: { type: String, default: null },

    nextDishSeq: { type: Number, default: 1 },
  },
  opts,
);

kitchenSchema.index(
  { legacyId: 1 },
  { unique: true, partialFilterExpression: { legacyId: { $type: 'number' } } },
);
kitchenSchema.index({ accountId: 1 }, { unique: true, partialFilterExpression: { accountId: { $type: 'string' } } });

export const Kitchen = model('Kitchen', kitchenSchema);
export type KitchenDoc = InferSchemaType<typeof kitchenSchema>;

/* A menu grows and dishes are queried on their own, so a collection rather
   than an array on the kitchen. */
const dishSchema = new Schema(
  {
    kitchenId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true },
    image: { type: String, default: '' },
    tags: { type: [String], default: [] },
    available: { type: Boolean, default: true },
  },
  opts,
);

export const Dish = model('Dish', dishSchema);

/* ------------------------------------------------------------------ *
 * meals
 * ------------------------------------------------------------------ */

const mealSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    kitchenId: { type: String, required: true, index: true },
    cookName: { type: String, default: '' },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    price: { type: Number, required: true },
    /** null is uncapped, which is not the same as zero. */
    capacity: { type: Number, default: null },

    /** Local calendar day in Asia/Dhaka, 'YYYY-MM-DD'. Never a timestamp. */
    serveDate: { type: String, required: true, index: true },
    /** 'breakfast' | 'lunch' | 'dinner' */
    slot: { type: String, required: true },
    deadline: { type: Date, required: true },

    handover: { type: String, default: 'delivery' },
    handoverNote: { type: String, default: '' },

    area: { type: String, default: '' },
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },
    deliveryRadiusKm: { type: Number, default: 3 },

    /** 'published' | 'closed' | 'cancelled' */
    status: { type: String, default: 'published', index: true },
    cancelReason: { type: String, default: null },
  },
  opts,
);

mealSchema.index({ serveDate: 1, slot: 1 });
mealSchema.index({ status: 1, serveDate: 1 });

export const Meal = model('Meal', mealSchema);

/**
 * Interest in a meal.
 *
 * The app holds this as an array of `customerKey` on the meal, which is fine
 * for a device. Capacity is bounded; *interest* is not — a popular meal in a
 * real deployment is thousands of rows, and an unbounded array is how a
 * document reaches 16MB. The API shape stays an array either way.
 */
const mealInterestSchema = new Schema(
  {
    mealId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    at: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

mealInterestSchema.index({ mealId: 1, customerKey: 1 }, { unique: true });

export const MealInterest = model('MealInterest', mealInterestSchema);

/* ------------------------------------------------------------------ *
 * cook stores
 * ------------------------------------------------------------------ */

const storeSchema = new Schema(
  {
    kitchenId: { type: String, required: true, unique: true },
    name: { type: String, default: '' },
    tagline: { type: String, default: '' },
    description: { type: String, default: '' },
    logo: { type: String, default: '' },
    cover: { type: String, default: '' },
    phone: { type: String, default: '' },
    area: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    deliveryRadiusKm: { type: Number, default: null },
    deliveryFee: { type: Number, default: 0 },
    freeDeliveryOver: { type: Number, default: null },
    isOpen: { type: Boolean, default: false, index: true },
  },
  opts,
);

export const Store = model('Store', storeSchema);

/** One cook's shelves. Distinct from TaxonomyCategory, which is platform-wide. */
const storeCategorySchema = new Schema(
  {
    storeId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    emoji: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  opts,
);

storeCategorySchema.index({ storeId: 1, order: 1 });

export const StoreCategory = model('StoreCategory', storeCategorySchema);

const productSchema = new Schema(
  {
    storeId: { type: String, required: true, index: true },
    categoryId: { type: String, default: null },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    images: { type: [String], default: [] },

    price: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    minQty: { type: Number, default: 1 },
    maxQty: { type: Number, default: null },

    active: { type: Boolean, default: true },
    preorder: { type: Boolean, default: false },

    prepTime: { type: String, default: '' },
    deliveryNote: { type: String, default: '' },
    /** [{ label, price }] — bounded, always read with the product. */
    options: { type: Schema.Types.Mixed, default: null },

    /** When stock last reached zero, so the alarm can age it honestly. */
    outOfStockSince: { type: Date, default: null },
  },
  opts,
);

productSchema.index({ active: 1, stock: 1 });

export const Product = model('Product', productSchema);

const cartSchema = new Schema(
  {
    customerKey: { type: String, required: true, unique: true },
    lines: { type: Schema.Types.Mixed, default: [] },
  },
  opts,
);

export const Cart = model('Cart', cartSchema);

/* ------------------------------------------------------------------ *
 * taxonomy
 * ------------------------------------------------------------------ */

const taxonomySchema = new Schema(
  {
    /** The tag as it appears on a dish, so filtering is a straight match. */
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    emoji: { type: String, default: '' },
    order: { type: Number, default: 0, index: true },
    retired: { type: Boolean, default: false },
  },
  opts,
);

export const TaxonomyCategory = model('TaxonomyCategory', taxonomySchema);

/*
 * What a kitchen cooks best.
 *
 * Same shape and same rules as the taxonomy above, and separate from it on
 * purpose: those are the words a *dish* is filed under, these describe a
 * whole kitchen. Folding them together would mean every taxonomy query
 * growing a discriminator to avoid offering "Biryani & Rice" as a dish tag.
 *
 *  is unique and never edited — a kitchen stores this string on its own
 * row, so renaming one would orphan every kitchen that chose it.
 */
const specialtySchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    emoji: { type: String, default: '' },
    order: { type: Number, default: 0, index: true },
    retired: { type: Boolean, default: false },
  },
  opts,
);

export const Specialty = model('Specialty', specialtySchema);

/*
 * The shared library of little pictures.
 *
 * Three things carry one — dish categories, kitchen specialties and a cook's
 * shelves — and each used to ask for it with a text box. Nobody could see
 * what the platform already used, so near-identical emoji accumulated. This
 * is the set a picker offers.
 *
 *  is unique and never edited: the things that point at a picture
 * store the character itself, so editing it here would rename nothing and
 * only make the library disagree with the screen.
 */
const iconSchema = new Schema(
  {
    value: { type: String, required: true, unique: true },
    /** Words the picker searches — "fire", not "flame emoji". */
    label: { type: String, default: '' },
    /** 'emoji' renders as text; 'image' renders as a URL. */
    kind: { type: String, default: 'emoji' },
    order: { type: Number, default: 0, index: true },
    retired: { type: Boolean, default: false },
  },
  opts,
);

export const Icon = model('Icon', iconSchema);

/*
 * A promotion, and the record of it being used.
 *
 * `code` is unique and never edited — it is printed on posters and typed
 * from memory, so a campaign whose code changes underneath it is a support
 * queue. A wrong code is deactivated and a right one made.
 */
const promotionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    /** 'percent' takes a share off; 'flat' takes a fixed number of taka. */
    kind: { type: String, default: 'percent' },
    value: { type: Number, required: true },
    /** The basket has to reach this before the code applies. 0 = no minimum. */
    minOrder: { type: Number, default: 0 },
    /** Ceiling on a percentage discount. 0 = uncapped. */
    maxDiscount: { type: Number, default: 0 },
    firstOrderOnly: { type: Boolean, default: false },
    /** Total redemptions allowed across everybody. 0 = unlimited. */
    usageLimit: { type: Number, default: 0 },
    /** Redemptions allowed per customer. 0 = unlimited. */
    perCustomer: { type: Number, default: 1 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
  },
  opts,
);

export const Promotion = model('Promotion', promotionSchema);

const redemptionSchema = new Schema(
  {
    promotionId: { type: String, required: true, index: true },
    /** Copied, not joined: what the customer typed, as they typed it. */
    code: { type: String, required: true },
    customerKey: { type: String, required: true, index: true },
    orderId: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  opts,
);

/* One redemption per order. This is what makes a retried checkout safe: the
   second attempt collides rather than counting twice against a limit. */
redemptionSchema.index({ promotionId: 1, orderId: 1 }, { unique: true });

export const Redemption = model('Redemption', redemptionSchema);

/* ------------------------------------------------------------------ *
 * requests and bidding
 * ------------------------------------------------------------------ */

const requestSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    customerKey: { type: String, required: true, index: true },
    /**
     * The headline, derived from `items` when there are any.
     *
     * Kept, and kept required, because a great deal reads it: every offer, the
     * order a selected offer becomes, the customer's list, the cook's inbox
     * and the operator's console. Making all of those iterate a list to build
     * a sentence would be the same string composed five different ways.
     */
    title: { type: String, required: true },

    /**
     * What was actually asked for, line by line.
     *
     * A custom order is rarely one thing — a party is a cake *and* twenty
     * samosas *and* a tray of biryani — and the single title line forced all
     * of that into one sentence a cook then had to parse and price as a
     * whole. Listing them lets a cook see the shape of the job.
     *
     * Empty for the older single-line requests, which is why `title` is still
     * the thing to read when you want one string.
     */
    items: {
      type: [
        {
          _id: false,
          name: { type: String, required: true },
          qty: { type: Number, default: 1 },
        },
      ],
      default: [],
    },

    description: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    budget: { type: Number, default: null },

    /** 'all' for a broadcast, otherwise a kitchenId. */
    target: { type: String, default: 'all' },
    /** Kitchens it actually reached. Empty is a coverage bug, not a quiet day. */
    eligible: { type: [String], default: [] },

    wantedFor: { type: String, default: null },
    category: { type: String, default: null },
    area: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },

    status: { type: String, default: 'open', index: true },
    selectedOfferId: { type: String, default: null },
    orderId: { type: String, default: null },
  },
  opts,
);

export const Request = model('Request', requestSchema);

const offerSchema = new Schema(
  {
    requestId: { type: String, required: true, index: true },
    kitchenId: { type: String, required: true, index: true },
    cookName: { type: String, default: '' },
    status: { type: String, default: 'interested', index: true },

    price: { type: Number, default: null },
    agreedPrice: { type: Number, default: null },
    note: { type: String, default: '' },
    prepTime: { type: String, default: '' },

    /**
     * [{ by, amount, at }] — append-only, and bounded: a negotiation is a
     * handful of prices, so it embeds. Nothing is ever overwritten, which is
     * what lets `turnOf()` fall out of the history rather than being tracked
     * separately and disagreeing with it.
     */
    history: { type: Schema.Types.Mixed, default: [] },
  },
  opts,
);

/* One offer per kitchen per request. Two would mean a cook could bid against
   themselves and the "whose turn is it" rule would have no answer. */
offerSchema.index({ requestId: 1, kitchenId: 1 }, { unique: true });

export const Offer = model('Offer', offerSchema);

/* ------------------------------------------------------------------ *
 * orders
 * ------------------------------------------------------------------ */

const orderSchema = new Schema(
  {
    /** The app's own code, `RB-XXXXXX`. Its natural idempotency key. */
    code: { type: String, required: true, unique: true },
    /** 'cod' | 'wallet' | 'meal' | 'store' | 'request' */
    kind: { type: String, required: true, index: true },

    mealId: { type: String, default: null, index: true },
    storeId: { type: String, default: null, index: true },
    requestId: { type: String, default: null },
    offerId: { type: String, default: null },

    kitchenId: { type: String, required: true, index: true },
    cookName: { type: String, default: '' },
    title: { type: String, default: '' },
    image: { type: String, default: '' },

    customerKey: { type: String, required: true, index: true },
    customerName: { type: String, default: '' },
    phone: { type: String, default: '' },
    /** One object, never queried alone — embedded. */
    address: { type: Schema.Types.Mixed, default: null },

    handover: { type: String, default: 'delivery' },
    serveDate: { type: String, default: null },
    slot: { type: String, default: null },

    /** Bounded and always read with the order — embedded. */
    lines: { type: Schema.Types.Mixed, default: [] },

    subtotal: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    /**
     * The gross. What the cook's share is computed from and what
     * `releaseEscrow` splits — a promotion never reduces it, because a
     * marketing decision must not cut what a cook was promised.
     */
    amount: { type: Number, default: 0 },
    /** What came off, and the code that did it. Zero on most orders. */
    discount: { type: Number, default: 0 },
    promoCode: { type: String, default: null },
    /**
     * What the customer actually handed over: amount − discount. Null on
     * everything ordered before promotions existed, which reads as "the same
     * as amount" and is why the refund path falls back to it.
     */
    paid: { type: Number, default: null },

    preorder: { type: Boolean, default: false },

    status: { type: String, required: true, index: true },
    /** 'cod' | 'held' | 'released' | 'refunded' */
    payment: { type: String, default: 'held', index: true },

    cookAmount: { type: Number, default: null },
    platformAmount: { type: Number, default: null },

    rejectReason: { type: String, default: null },
    cancelReason: { type: String, default: null },

    /** [{ status, at, by? }] — a rail has six steps. Embedded. */
    history: { type: Schema.Types.Mixed, default: [] },

    deliveredAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  opts,
);

/* The escrow ageing board's query, which runs on every dashboard render. */
orderSchema.index({ payment: 1, status: 1, deliveredAt: 1 });
orderSchema.index({ kitchenId: 1, createdAt: -1 });
orderSchema.index({ customerKey: 1, createdAt: -1 });

export const Order = model('Order', orderSchema);
export type OrderDoc = InferSchemaType<typeof orderSchema>;

/* ------------------------------------------------------------------ *
 * payouts and reconciliation
 * ------------------------------------------------------------------ */

const payoutRunSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    status: { type: String, default: 'draft', index: true },
    method: { type: String, default: 'bKash' },
    note: { type: String, default: '' },
    total: { type: Number, default: 0 },
    cookCount: { type: Number, default: 0 },
    createdBy: { type: String, required: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: String, default: null },
  },
  opts,
);

export const PayoutRun = model('PayoutRun', payoutRunSchema);

const payoutItemSchema = new Schema(
  {
    payoutRunId: { type: String, required: true, index: true },
    kitchenId: { type: String, required: true },
    kitchenName: { type: String, default: '' },
    amount: { type: Number, required: true },
  },
  { versionKey: false },
);

payoutItemSchema.index({ payoutRunId: 1, kitchenId: 1 }, { unique: true });

export const PayoutItem = model('PayoutItem', payoutItemSchema);

const topUpSchema = new Schema(
  {
    customerKey: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    method: { type: String, default: 'bKash' },
    /** 'matched' | 'orphan' | 'disputed' */
    reconciled: { type: String, default: 'orphan', index: true },
    pspRef: { type: String, default: null },
    pspAmount: { type: Number, default: null },
    note: { type: String, default: '' },
    ledgerEntryId: { type: String, default: null },
    at: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

export const TopUp = model('TopUp', topUpSchema);

/* ------------------------------------------------------------------ *
 * disputes, reviews, notifications
 * ------------------------------------------------------------------ */

const disputeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    orderId: { type: String, required: true, unique: true },
    status: { type: String, default: 'open', index: true },
    openedBy: { type: String, default: 'admin' },
    reason: { type: String, required: true },

    resolution: { type: String, default: null },
    resolutionNote: { type: String, default: null },
    refundAmount: { type: Number, default: null },
    releaseAmount: { type: Number, default: null },

    /** [{ at, by, text }] — a case has a handful of notes. Embedded. */
    notes: { type: Schema.Types.Mixed, default: [] },

    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
  },
  opts,
);

export const Dispute = model('Dispute', disputeSchema);

const reviewSchema = new Schema(
  {
    kitchenId: { type: String, required: true, index: true },
    /**
     * The order this review is about, and the right to write it.
     *
     * A review with no order behind it is one anybody could have posted, so
     * the app path always sets this. Null on everything that arrived with the
     * seed, which is why the index below is sparse.
     */
    orderId: { type: String, default: null },
    customerKey: { type: String, default: '' },
    name: { type: String, required: true },
    avatar: { type: String, default: '' },
    area: { type: String, default: '' },
    rating: { type: Number, required: true },
    text: { type: String, default: '' },

    /* Hidden excludes it from the kitchen's rating. Hiding a review that
       still counts achieves nothing but removing the evidence. */
    hidden: { type: Boolean, default: false, index: true },
    hiddenBy: { type: String, default: null },
    hiddenAt: { type: Date, default: null },
    hiddenNote: { type: String, default: null },

    date: { type: String, default: '' },
  },
  opts,
);

/*
 * One review per order — among the reviews that *have* an order.
 *
 * This was sparse first, which was wrong: sparse skips documents where the
 * field is absent, and the field defaults to null here, so every review
 * without an order was still indexed and the second one collided. A seed
 * writing sixteen of them found that immediately.
 *
 * Partial on the type instead. Only reviews carrying a real order id are
 * indexed, which is exactly the set the rule is about.
 */
reviewSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: 'string' } } },
);

export const Review = model('Review', reviewSchema);

const notificationSchema = new Schema(
  {
    /** The dedupe key. Unique only while unread. */
    key: { type: String, required: true, index: true },
    audience: { type: String, required: true, index: true },
    kind: { type: String, required: true, index: true },
    title: { type: String, default: '' },
    body: { type: String, default: '' },

    customerKey: { type: String, default: null, index: true },
    kitchenId: { type: String, default: null, index: true },
    zone: { type: String, default: null },

    mealId: { type: String, default: null },
    orderId: { type: String, default: null },
    requestId: { type: String, default: null },
    offerId: { type: String, default: null },

    broadcastBy: { type: String, default: null },

    read: { type: Boolean, default: false },
    at: { type: Date, default: () => new Date(), index: true },
  },
  { versionKey: false },
);

notificationSchema.index({ audience: 1, read: 1 });
notificationSchema.index({ key: 1, read: 1 });

export const Notification = model('Notification', notificationSchema);

/* ------------------------------------------------------------------ *
 * configuration
 * ------------------------------------------------------------------ */

const zoneSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true, index: true },
    /** Null falls back to the platform Setting. */
    deliveryFee: { type: Number, default: null },
    platformFee: { type: Number, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    order: { type: Number, default: 0 },
  },
  opts,
);

export const Zone = model('Zone', zoneSchema);

/**
 * What people looked for, and whether they found it.
 *
 * A search that returns nothing is the most useful row a marketplace
 * produces. "kacchi, 40 times, Uttara, no results" is not a bug report — it
 * is a list of which cook to recruit and where, and it exists nowhere else:
 * the customer who found nothing leaves without placing an order, so no other
 * collection ever hears about them.
 *
 * Deliberately thin. `customerKey` is stored so one person hammering the same
 * word cannot look like demand, and for nothing else — there is no session,
 * no device, no trail. A term is kept as typed *and* normalised, because the
 * spelling somebody reached for is itself worth reading.
 */
const searchTermSchema = new Schema(
  {
    /** As typed, trimmed. */
    term: { type: String, required: true },
    /** Lower-cased and stripped, so spellings of one word group together. */
    normalised: { type: String, required: true, index: true },
    /** How many rows the app had to show. Zero is the interesting case. */
    results: { type: Number, default: 0, index: true },
    /** Where the searcher was, when they were willing to say. */
    area: { type: String, default: null, index: true },
    /** Only to tell one person searching twice from two people searching. */
    customerKey: { type: String, default: null },
  },
  opts,
);

/* The demand report groups by term and filters to the empty ones. */
searchTermSchema.index({ normalised: 1, createdAt: -1 });
searchTermSchema.index({ results: 1, createdAt: -1 });

export const SearchTerm = model('SearchTerm', searchTermSchema);

const settingSchema = new Schema(
  {
    _id: { type: String },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String, default: null },
  },
  { versionKey: false, timestamps: true, _id: false },
);

export const Setting = model('Setting', settingSchema);

const flagSchema = new Schema(
  {
    _id: { type: String },
    enabled: { type: Boolean, default: true },
    description: { type: String, default: '' },
    updatedBy: { type: String, default: null },
  },
  { versionKey: false, timestamps: true, _id: false },
);

export const FeatureFlag = model('FeatureFlag', flagSchema);

/* ------------------------------------------------------------------ *
 * admin access
 * ------------------------------------------------------------------ */

const adminSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    /** scrypt, as `salt:hash`. */
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'support', index: true },
    active: { type: Boolean, default: true },

    totpSecret: { type: String, default: null },
    totpEnabled: { type: Boolean, default: false },

    lastLoginAt: { type: Date, default: null },
  },
  opts,
);

export const AdminUser = model('AdminUser', adminSchema);

/**
 * Every state-changing action in the panel.
 *
 * Append-only for the same reason the ledger is: a money action without an
 * attributable record is an unattributable movement. The Atlas role covers
 * this collection too.
 */
const auditSchema = new Schema(
  {
    actorId: { type: String, default: null },
    actorEmail: { type: String, required: true, index: true },
    actorRole: { type: String, required: true },

    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    summary: { type: String, default: '' },

    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },

    ip: { type: String, default: null },
    at: { type: Date, default: () => new Date(), index: true },
  },
  { versionKey: false },
);

auditSchema.index({ targetType: 1, targetId: 1 });

for (const operation of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auditSchema.pre(operation as any, function () {
    throw new Error(`audit-append-only: an audit row cannot be ${operation}.`);
  });
}

export const AuditLog = model('AuditLog', auditSchema);

/* ------------------------------------------------------------------ *
 * chat
 * ------------------------------------------------------------------ */

const threadSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    /** 'order' | 'request' | 'support' */
    kind: { type: String, required: true, index: true },

    orderId: { type: String, default: null, index: true },
    requestId: { type: String, default: null },

    /* The two sides. Authorisation is a predicate over these, not a
       membership list somebody has to remember to check. */
    customerKey: { type: String, required: true, index: true },
    kitchenId: { type: String, default: null, index: true },

    openedBy: { type: String, default: 'customer' },
    subject: { type: String, default: '' },

    status: { type: String, default: 'open', index: true },
    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: null },

    /* Denormalised for the inbox. A thread list that has to open every thread
       to render is a list nobody scrolls. */
    lastMessageAt: { type: Date, default: () => new Date(), index: true },
    lastMessageBody: { type: String, default: '' },
    lastMessageFrom: { type: String, default: '' },

    unreadCustomer: { type: Number, default: 0 },
    unreadCook: { type: Number, default: 0 },
    unreadAdmin: { type: Number, default: 0 },
  },
  opts,
);

threadSchema.index({ customerKey: 1, lastMessageAt: -1 });
threadSchema.index({ kitchenId: 1, lastMessageAt: -1 });
threadSchema.index({ kind: 1, status: 1, lastMessageAt: -1 });

export const ChatThread = model('ChatThread', threadSchema);

/**
 * One message. Unbounded, so a collection — a busy thread would burst a
 * document long before anybody noticed.
 *
 * No edit and no delete: these threads are what a dispute gets settled on,
 * and a chat that can be rewritten afterwards is not evidence. A moderator
 * can hide one; the row stays.
 */
const messageSchema = new Schema(
  {
    threadId: { type: String, required: true, index: true },

    /** 'customer' | 'cook' | 'admin' | 'system' */
    senderType: { type: String, required: true },
    senderRef: { type: String, default: null },
    senderName: { type: String, default: '' },

    body: { type: String, default: '' },
    attachments: { type: Schema.Types.Mixed, default: [] },
    systemKind: { type: String, default: null },

    /**
     * The sender's own id, generated on the device before the message left
     * it. An offline outbox replays on reconnect, and this is what stops the
     * replay posting twice.
     */
    clientId: { type: String, required: true, unique: true },

    sentAt: { type: Date, default: () => new Date() },

    readByCustomerAt: { type: Date, default: null },
    readByCookAt: { type: Date, default: null },
    readByAdminAt: { type: Date, default: null },

    hidden: { type: Boolean, default: false },
    hiddenBy: { type: String, default: null },
    hiddenAt: { type: Date, default: null },
    hiddenNote: { type: String, default: null },
  },
  { versionKey: false },
);

messageSchema.index({ threadId: 1, sentAt: 1 });

export const ChatMessage = model('ChatMessage', messageSchema);
