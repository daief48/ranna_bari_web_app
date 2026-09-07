import { Schema, model } from 'mongoose';

/**
 * Smart Mess Meal Management — storage.
 *
 * Every collection in this file is prefixed `mm_` and belongs to this module
 * alone. Nothing outside `src/modules/meal-management` reads or writes them,
 * and this module writes nothing outside them: the only thing it borrows from
 * the rest of the backend is the identity on the bearer token. That is the
 * whole isolation guarantee, and it is enforced by convention plus the prefix
 * — a stray `Order` or `Kitchen` import in this directory is a bug.
 *
 * Shapes follow the host codebase: string ids rather than ObjectId refs, days
 * as 'YYYY-MM-DD' calendar strings compared as strings, months as 'YYYY-MM',
 * whole taka, `_id: false` on bounded embedded arrays, and anything unbounded
 * given its own collection.
 */

const opts = { versionKey: false, timestamps: true } as const;

/* ------------------------------------------------------------------ *
 * the mess, and who is in it
 * ------------------------------------------------------------------ */

/**
 * A mess.
 *
 * The user-side module gives every account a personal mess on first use, so
 * the feature stands alone without a manager having to exist. The multi-user
 * shape from the specification is kept — members, roles, per-mess accounting
 * — so a shared mess is a row away rather than a migration away.
 */
const messSchema = new Schema(
  {
    /** The account that owns this mess; its `customerKey`. */
    ownerKey: { type: String, required: true, index: true },
    name: { type: String, default: 'My mess' },
    /** A personal mess is the single-user case, not a different kind of thing. */
    personal: { type: Boolean, default: true },
    /**
     * Which expense categories count toward the meal rate.
     *
     * The specification puts this in an administrator's hands. In a personal
     * mess the owner *is* that administrator for their own books, and this is
     * their own budget setting — it reaches no other account's figures.
     */
    applicableCategories: { type: [String], default: ['bazar', 'gas', 'utility', 'other'] },
    active: { type: Boolean, default: true },
  },
  opts,
);

export const MmMess = model('MmMess', messSchema, 'mm_messes');

const memberSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    name: { type: String, default: '' },
    /** 'owner' | 'manager' | 'member' — scoped to this mess, never to the app. */
    role: { type: String, default: 'member' },
    active: { type: Boolean, default: true },
    joinedAt: { type: Date, default: Date.now },
  },
  opts,
);

memberSchema.index({ messId: 1, customerKey: 1 }, { unique: true });

export const MmMember = model('MmMember', memberSchema, 'mm_members');

/* ------------------------------------------------------------------ *
 * what a person eats, and what they would like to
 * ------------------------------------------------------------------ */

/**
 * Meal schedule and food preferences, per member.
 *
 * The schedule is an *input to the planner* and nothing else. It says which
 * sittings this person normally takes, which is how expected meal count is
 * derived — it is never counted as a meal. Actual meals live in
 * `mm_daily_meals` and only there.
 */
const profileSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },

    /* schedule — planner input */
    breakfast: { type: Boolean, default: false },
    lunch: { type: Boolean, default: true },
    dinner: { type: Boolean, default: true },

    /** What the person is aiming to pay per meal. Null until they say. */
    targetRate: { type: Number, default: null },

    /* preferences — recommendation input */
    /** Food keys to keep out of a plan entirely. */
    avoid: { type: [String], default: [] },
    /** `{ food, level }` where level is 'high' | 'medium' | 'low'. */
    likes: {
      type: [{ _id: false, food: String, level: String }],
      default: [],
    },
    /** `{ food, perWeek }` — "chicken three days a week". */
    proteins: {
      type: [{ _id: false, food: String, perWeek: Number }],
      default: [],
    },
    /** How many breakfasts a week the person actually wants planned. */
    breakfastPerWeek: { type: Number, default: 7 },
    /** Refuse the same dish on consecutive days. */
    avoidRepeat: { type: Boolean, default: true },
  },
  opts,
);

profileSchema.index({ messId: 1, customerKey: 1 }, { unique: true });

export const MmProfile = model('MmProfile', profileSchema, 'mm_profiles');

/* ------------------------------------------------------------------ *
 * the accounting truth
 * ------------------------------------------------------------------ */

/**
 * One row per member per day. This is the *only* source of an actual meal
 * count anywhere in the module — no projection, plan or forecast may stand in
 * for it, which is the specification's central accounting rule.
 */
const dailyMealSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    /** Calendar day, 'YYYY-MM-DD'. Compared as a string, never parsed to a Date. */
    date: { type: String, required: true, index: true },
    /** Denormalised 'YYYY-MM' so a month reads without a range scan. */
    month: { type: String, required: true, index: true },

    breakfast: { type: Boolean, default: false },
    lunch: { type: Boolean, default: false },
    dinner: { type: Boolean, default: false },
    /** Extra plates this member is answerable for that day. */
    guest: { type: Number, default: 0 },

    /** breakfast + lunch + dinner + guest, written on every save. */
    total: { type: Number, default: 0 },

    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  opts,
);

dailyMealSchema.index({ messId: 1, customerKey: 1, date: 1 }, { unique: true });
dailyMealSchema.index({ messId: 1, month: 1 });

export const MmDailyMeal = model('MmDailyMeal', dailyMealSchema, 'mm_daily_meals');

/**
 * Every change to a meal entry, kept.
 *
 * Append-only by use rather than by middleware: the module never updates or
 * deletes a row here, so a corrected entry leaves both the old and the new
 * value legible. Bulk actions write one row each, as the specification asks.
 */
const mealAuditSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    date: { type: String, required: true },
    /** 'set' | 'bulk' | 'clear' */
    action: { type: String, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    by: { type: String, default: '' },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export const MmMealAudit = model('MmMealAudit', mealAuditSchema, 'mm_meal_audits');

/* ------------------------------------------------------------------ *
 * food, prices, recipes — reference data
 * ------------------------------------------------------------------ */

/**
 * The food catalogue.
 *
 * Seeded by the module and read-only to a general user: the specification
 * puts food and price management in an administrator's hands, so the app
 * offers no write path to these rows. A price *change* never edits this row's
 * history — it appends to `mm_food_prices` and moves `price` forward.
 */
const foodItemSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    /** 'kg' | 'litre' | 'piece' */
    unit: { type: String, required: true },
    /** Current price for one whole unit, in taka. */
    price: { type: Number, required: true },
    available: { type: Boolean, default: true },
    note: { type: String, default: '' },
  },
  opts,
);

export const MmFoodItem = model('MmFoodItem', foodItemSchema, 'mm_food_items');

/** Append-only price history. A closed month costs what it cost. */
const foodPriceSchema = new Schema(
  {
    foodKey: { type: String, required: true, index: true },
    price: { type: Number, required: true },
    /** 'YYYY-MM-DD' the price took effect. */
    effectiveDate: { type: String, required: true },
    source: { type: String, default: 'system' },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export const MmFoodPrice = model('MmFoodPrice', foodPriceSchema, 'mm_food_prices');

/**
 * A dish, and what it is made of.
 *
 * Ingredients are stored as a quantity in the food item's own unit, so the
 * portion cost is `qty * price` summed — computed live from current prices at
 * read time, never stored as a figure that could go stale against them.
 */
const recipeSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    /** Which sitting this dish belongs to. */
    slot: { type: String, required: true, index: true },
    /** 'chicken' | 'fish' | 'beef' | 'egg' | 'veg' | 'dal' — for preference matching. */
    protein: { type: String, default: 'veg' },
    ingredients: {
      type: [{ _id: false, foodKey: String, qty: Number, unit: String }],
      default: [],
    },
    /** Cost the module cannot derive from ingredients (spices, salt). */
    sundries: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  opts,
);

export const MmRecipe = model('MmRecipe', recipeSchema, 'mm_recipes');

/* ------------------------------------------------------------------ *
 * money in
 * ------------------------------------------------------------------ */

const expenseSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    /** 'YYYY-MM-DD' */
    date: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    /** 'bazar' | 'gas' | 'utility' | 'rent' | 'other' */
    category: { type: String, required: true, index: true },
    vendor: { type: String, default: '' },
    /** 'cash' | 'bkash' | 'card' | 'other' */
    method: { type: String, default: 'cash' },
    note: { type: String, default: '' },
    /** Optional data URI. Kept small by the route, not by this schema. */
    receipt: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  opts,
);

export const MmExpense = model('MmExpense', expenseSchema, 'mm_expenses');

/* ------------------------------------------------------------------ *
 * the month, closed
 * ------------------------------------------------------------------ */

/**
 * A month's settlement snapshot.
 *
 * Written when the month is closed and never recomputed: the figures inside
 * are what the books said at that moment, which is what makes a closed month
 * safe to show months later. Re-opening is deliberately not offered here.
 */
const monthSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    /** 'YYYY-MM' */
    month: { type: String, required: true, index: true },
    closed: { type: Boolean, default: false },
    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: '' },

    /* the snapshot — all deterministic, all frozen */
    applicableCost: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    totalMeals: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    members: {
      type: [
        {
          _id: false,
          customerKey: String,
          name: String,
          meals: Number,
          breakfast: Number,
          lunch: Number,
          dinner: Number,
          share: Number,
        },
      ],
      default: [],
    },
    categories: {
      type: [{ _id: false, category: String, amount: Number, applicable: Boolean }],
      default: [],
    },
  },
  opts,
);

monthSchema.index({ messId: 1, month: 1 }, { unique: true });

export const MmMonth = model('MmMonth', monthSchema, 'mm_months');

/* ------------------------------------------------------------------ *
 * the smart layer
 * ------------------------------------------------------------------ */

/**
 * A generated monthly plan.
 *
 * Items are bounded — at most three a day for one month — so they embed. Each
 * carries the cost estimated *at generation time*; the actual cost of that day
 * never overwrites it, because the specification wants estimated and actual
 * side by side rather than reconciled into one number.
 */
const planSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },

    targetRate: { type: Number, required: true },
    expectedMeals: { type: Number, default: 0 },
    targetBudget: { type: Number, default: 0 },

    items: {
      type: [
        {
          _id: false,
          date: String,
          slot: String,
          recipeKey: String,
          name: String,
          /** Estimated at generation. Frozen. */
          estCost: Number,
          /** True once the user swapped this item for an alternative. */
          replaced: { type: Boolean, default: false },
        },
      ],
      default: [],
    },

    projectedCost: { type: Number, default: 0 },
    projectedRate: { type: Number, default: 0 },
    /** 'ok' | 'risk' | 'over' */
    status: { type: String, default: 'ok' },
    /** 0..1, from how much of the plan rests on real prices and real history. */
    confidence: { type: Number, default: 0 },
    explanation: { type: String, default: '' },
  },
  opts,
);

planSchema.index({ messId: 1, customerKey: 1, month: 1 }, { unique: true });

export const MmPlan = model('MmPlan', planSchema, 'mm_plans');

/**
 * What the engine suggested, and what the person did about it.
 *
 * This is the training set the specification asks for: estimated against
 * actual, accepted against rejected. Nothing reads it yet beyond the insights
 * screen — it accrues so that a model has something to learn from later.
 */
const recommendationSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    month: { type: String, default: '', index: true },
    /** 'plan' | 'swap' | 'insight' */
    kind: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    /** null until the person acts on it. */
    accepted: { type: Boolean, default: null },
    actedAt: { type: Date, default: null },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export const MmRecommendation = model(
  'MmRecommendation',
  recommendationSchema,
  'mm_recommendations',
);

/* ------------------------------------------------------------------ *
 * traces
 * ------------------------------------------------------------------ */

const activitySchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    action: { type: String, required: true },
    summary: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export const MmActivity = model('MmActivity', activitySchema, 'mm_activity');

/**
 * The module's own inbox.
 *
 * Deliberately not the app's `Notification` collection: a budget warning is
 * this feature's business and should not appear in, or count toward, the
 * notification surface the rest of the app owns.
 */
const noticeSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    /** 'target-risk' | 'target-over' | 'plan-updated' | 'swap-available' | 'month-closed' */
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    read: { type: Boolean, default: false },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

noticeSchema.index({ customerKey: 1, read: 1 });

export const MmNotice = model('MmNotice', noticeSchema, 'mm_notices');
