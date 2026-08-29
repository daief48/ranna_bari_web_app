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
    specialty: { type: String, default: null },
    /** National ID. KYC only — never returned on a customer-facing endpoint. */
    nid: { type: String, default: null },
    area: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    addressDetail: { type: String, default: null },
    addressLabel: { type: String, default: null },
    deliveryRadiusKm: { type: Number, default: null },
    avatar: { type: String, default: null },

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
    coverImage: { type: String, default: '' },
    specialty: { type: String, default: '' },
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

/* ------------------------------------------------------------------ *
 * requests and bidding
 * ------------------------------------------------------------------ */

const requestSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    customerKey: { type: String, required: true, index: true },
    title: { type: String, required: true },
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
    /** 'cod' | 'meal' | 'store' | 'request' */
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
    amount: { type: Number, default: 0 },

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
