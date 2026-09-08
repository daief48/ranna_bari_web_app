import { Schema, model } from 'mongoose';

/**
 * Smart Meal Management — storage.
 *
 * Every collection in this file is prefixed `mm_` and belongs to this module
 * alone. Nothing outside `src/modules/meal-management` reads or writes them,
 * and this module writes nothing outside them: the only thing it borrows from
 * the rest of the backend is the identity on the bearer token. That is the
 * whole isolation guarantee, and it is enforced by convention plus the prefix
 * — a stray `Order` or `Kitchen` import in this directory is a bug.
 *
 * The entity list follows §7 of the specification. Shapes follow the host
 * codebase: string ids rather than ObjectId refs, days as 'YYYY-MM-DD'
 * calendar strings compared as strings, months as 'YYYY-MM', money in taka as
 * a Number, `_id: false` on bounded embedded arrays, and anything unbounded
 * given its own collection.
 *
 * Two structural rules run through the whole file and are worth stating once:
 *
 *   **Every mess-scoped row carries `messId` and is indexed on it.** §4.17
 *   asks for data isolation between messes, and isolation you have to
 *   remember to write is isolation you will one day forget. Every query in
 *   the service layer is scoped by a `messId` the caller was proved to belong
 *   to.
 *
 *   **Financial rows carry a `status`, and only `approved` counts.** §4.6 is
 *   explicit that the engine uses approved records only, so the status is on
 *   the row rather than in a parallel table, and the aggregation that builds
 *   a month filters on it.
 */

const opts = { versionKey: false, timestamps: true } as const;

/** The approval lifecycle §8 gives bazar, expenses and deposits alike. */
export const APPROVAL_FLOW = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_FLOW)[number];

/* ------------------------------------------------------------------ *
 * 4.1 — the mess, and who is in it
 * ------------------------------------------------------------------ */

/**
 * Mess settings, embedded rather than given a collection of their own.
 *
 * They are read on essentially every request — a cutoff check needs them, a
 * rate needs the rounding rule, an expense needs the allocation default — so
 * a separate document would mean a second round trip on the hot path for data
 * that is a few hundred bytes and changes monthly at most.
 */
const settingsSchema = new Schema(
  {
    /**
     * Which day of the calendar month an accounting month starts on.
     *
     * 1 for almost everybody. A mess that settles on the 5th sets 5, and the
     * month a day belongs to shifts accordingly — see `calc.monthOfDay`.
     */
    monthStartDay: { type: Number, default: 1 },

    /** Meal values a member may pick, beyond plain on/off. §4.2. */
    allowedMealValues: { type: [Number], default: [0.5, 1, 1.5, 2] },

    /** Guest meals a single member may add to one sitting. */
    maxGuestPerMeal: { type: Number, default: 10 },

    /**
     * How a rate is rounded before it is shown or billed.
     *
     * 'none' keeps full precision, which is what the arithmetic actually is;
     * the others exist because §9 lists rounding residue as an edge case a
     * mess may prefer to avoid by rounding the rate itself.
     */
    rounding: { type: String, default: 'none' },
    /** Decimal places kept when `rounding` is not 'none'. */
    roundingDigits: { type: Number, default: 2 },

    /**
     * The accounting policy §4.6 warns about.
     *
     * False — the default, and the specification's recommendation — means
     * rent, wifi and electricity never reach the meal rate; they allocate by
     * their own mode instead. True folds every approved expense into the
     * rate, which some messes genuinely do want.
     */
    allExpensesInMealRate: { type: Boolean, default: false },

    /* Which approvals this mess actually enforces. A two-person flat wants
       none of them; a thirty-person hostel wants all four. */
    requireBazarApproval: { type: Boolean, default: true },
    requireExpenseApproval: { type: Boolean, default: true },
    requireDepositApproval: { type: Boolean, default: true },
    requireJoinApproval: { type: Boolean, default: true },

    /** §4.17 marks this cell "Configurable" for a co-admin. */
    coAdminCanEditOthersMeal: { type: Boolean, default: true },
    /** Whether a member may see the whole mess's reports or only their own. */
    membersSeeFullReports: { type: Boolean, default: true },

    /** Minutes before a sitting that its entry locks, when no per-type cutoff is set. */
    defaultCutoffMinutes: { type: Number, default: 0 },

    /** Carry an unsettled balance into the next month instead of zeroing it. §4.8. */
    carryForwardBalances: { type: Boolean, default: true },

    currency: { type: String, default: 'BDT' },
    /** IANA zone the cutoffs are evaluated in. A cutoff is a wall clock, not an instant. */
    timezone: { type: String, default: 'Asia/Dhaka' },
  },
  { _id: false },
);

const messSchema = new Schema(
  {
    name: { type: String, required: true },
    area: { type: String, default: '' },
    /** The account that owns the mess; its `customerKey`. Moves on transfer. */
    ownerKey: { type: String, required: true, index: true },
    /** Short human-typable join code. Unique while the mess is live. */
    code: { type: String, required: true, unique: true },
    settings: { type: settingsSchema, default: () => ({}) },
    active: { type: Boolean, default: true },
    /** An archived mess is readable and frozen. §5 asks for archive, not delete. */
    archived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
  },
  opts,
);

export const MmMess = model('MmMess', messSchema, 'mm_messes');

/** Roles, strongest first. Index order is the comparison order. */
export const ROLES = ['admin', 'coadmin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const MEMBER_STATES = ['pending', 'active', 'inactive', 'suspended', 'left'] as const;
export type MemberState = (typeof MEMBER_STATES)[number];

/**
 * A person in a mess.
 *
 * The row is the accounting identity, not the account: `customerKey` is null
 * for a ghost member (§4.1), so every meal, expense share and deposit points
 * at `memberId` rather than at an app account. That indirection is what makes
 * "record meals for someone without the app" and "a member leaves but their
 * history stays" the same mechanism rather than two special cases.
 */
const memberSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    /** Null for a ghost member — somebody the mess accounts for but who has no account. */
    customerKey: { type: String, default: null, index: true },
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    avatar: { type: String, default: '' },

    role: { type: String, default: 'member' },
    status: { type: String, default: 'active' },
    ghost: { type: Boolean, default: false },

    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },

    /**
     * Membership history — §4.1 asks for join/leave dates to be kept.
     *
     * Bounded in practice (a person joins and leaves a mess a handful of
     * times), so it embeds rather than earning a collection.
     */
    history: {
      type: [{ _id: false, status: String, at: Date, by: String, note: String }],
      default: [],
    },

    /**
     * The member's usual meals, used to prefill a day that has no entry.
     *
     * A *template*, never a count. §4.6's rule that only recorded meals are
     * billed means this can prefill a form and can never reach the engine.
     */
    mealDefaults: { type: Schema.Types.Mixed, default: {} },

    /** §4.13 food preference: liked and avoided dishes, free text keys. */
    preferences: {
      type: {
        _id: false,
        likes: { type: [String], default: [] },
        avoid: { type: [String], default: [] },
        note: { type: String, default: '' },
      },
      default: () => ({}),
    },

    /**
     * How far this member has read the mess room.
     *
     * A watermark rather than a read receipt per message: unread is then one
     * `countDocuments({ at: { $gt } })` instead of a row per member per
     * message, which for a ten-person mess is ten times the writes for a
     * number nobody needs to be exact about.
     */
    chatReadAt: { type: Date, default: null },
  },
  opts,
);

/* A person holds at most one live membership per mess; ghosts are exempt
   because they have no key to collide on. */
memberSchema.index(
  { messId: 1, customerKey: 1 },
  { unique: true, partialFilterExpression: { customerKey: { $type: 'string' } } },
);

export const MmMember = model('MmMember', memberSchema, 'mm_members');

/** A shareable invitation — §4.1's code or link. */
const inviteSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    code: { type: String, required: true, unique: true },
    createdBy: { type: String, default: '' },
    expiresAt: { type: Date, default: null },
    /** 0 means unlimited. */
    maxUses: { type: Number, default: 0 },
    uses: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  opts,
);

export const MmInvite = model('MmInvite', inviteSchema, 'mm_invites');

/** A pending request to join. §8: Pending → Approved / Rejected / Cancelled. */
const joinRequestSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    note: { type: String, default: '' },
    status: { type: String, default: 'pending', index: true },
    decidedBy: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
  },
  opts,
);

export const MmJoinRequest = model('MmJoinRequest', joinRequestSchema, 'mm_join_requests');

/* ------------------------------------------------------------------ *
 * 4.2 — meal types, and the meals themselves
 * ------------------------------------------------------------------ */

export const SESSION_STATES = ['open', 'closing', 'closed', 'archived'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/**
 * A configurable sitting. §4.2 asks for breakfast/lunch/dinner *and* custom.
 *
 * Per-mess rather than global, because the cutoff is the interesting field and
 * a cutoff is a house rule. `countsInRate` exists for a mess that runs, say, a
 * paid-separately Friday special: it is still a meal on the calendar and not
 * a meal in the divisor.
 */
const mealTypeSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    label: { type: String, required: true },
    /** Display and cutoff order — breakfast before lunch before dinner. */
    order: { type: Number, default: 0 },
    /** Value written when somebody turns this sitting on without picking one. */
    defaultValue: { type: Number, default: 1 },
    /**
     * Wall-clock cutoff, 'HH:MM', in the mess's timezone.
     *
     * Empty means no cutoff: the sitting stays editable until the month
     * closes. §4.2 wants a cutoff *per meal type*, because breakfast has to
     * be decided the night before and dinner does not.
     */
    cutoff: { type: String, default: '' },
    /**
     * Which day the cutoff belongs to, relative to the meal.
     *
     * 0 = the same morning, -1 = the evening before. Breakfast is the case
     * that needs -1 and the reason this is not a plain time comparison.
     */
    cutoffDayOffset: { type: Number, default: 0 },
    countsInRate: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  opts,
);

mealTypeSchema.index({ messId: 1, key: 1 }, { unique: true });

export const MmMealType = model('MmMealType', mealTypeSchema, 'mm_meal_types');

/**
 * One row per member per day — the accounting truth.
 *
 * This is the *only* source of a meal count anywhere in the module. No
 * template, prediction or menu may stand in for it, which is §4.6's central
 * rule and §12's acceptance criterion.
 *
 * `values` and `guests` are keyed by meal-type key rather than fixed fields,
 * because the types are configurable. `weighted` is their sum, written on
 * every save so a month is an aggregation rather than a fold in application
 * code.
 */
const mealEntrySchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    /** Calendar day, 'YYYY-MM-DD'. Compared as a string, never parsed to a Date. */
    date: { type: String, required: true, index: true },
    /** The accounting month this day falls in, honouring `monthStartDay`. */
    month: { type: String, required: true, index: true },

    /** `{ breakfast: 1, lunch: 0.5 }` — absent key means the sitting was not taken. */
    values: { type: Schema.Types.Mixed, default: {} },
    /** `{ lunch: 2 }` — extra plates this member is answerable for. */
    guests: { type: Schema.Types.Mixed, default: {} },

    /** Σ values + Σ guests, over types that count in the rate. */
    weighted: { type: Number, default: 0 },
    /** Σ values + Σ guests over *every* type, for the calendar's own totals. */
    total: { type: Number, default: 0 },

    /** True once every sitting on this day is past its cutoff. */
    locked: { type: Boolean, default: false },
    /** 'member' | 'admin' | 'correction' | 'leave' | 'assistant' */
    source: { type: String, default: 'member' },

    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  opts,
);

mealEntrySchema.index({ messId: 1, memberId: 1, date: 1 }, { unique: true });
mealEntrySchema.index({ messId: 1, month: 1 });
mealEntrySchema.index({ messId: 1, date: 1 });

export const MmMealEntry = model('MmMealEntry', mealEntrySchema, 'mm_meal_entries');

/**
 * A correction to a locked entry, and its decision. §4.2.
 *
 * The requested values are held here rather than written to the entry, so a
 * pending correction changes nothing about the month's figures. Only approval
 * moves the entry — which is what "only the final approved meal value is
 * included in accounting" means in code.
 */
const mealRequestSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },

    /** What the entry held when the request was raised. */
    current: { type: Schema.Types.Mixed, default: {} },
    /** What the member is asking for: `{ values, guests }`. */
    requested: { type: Schema.Types.Mixed, default: {} },
    reason: { type: String, default: '' },

    status: { type: String, default: 'pending', index: true },
    raisedBy: { type: String, default: '' },
    decidedBy: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '' },
  },
  opts,
);

/* One open correction per member per day — a second would race the first. */
mealRequestSchema.index(
  { messId: 1, memberId: 1, date: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

export const MmMealRequest = model('MmMealRequest', mealRequestSchema, 'mm_meal_requests');

/**
 * Away for a stretch of days. §4.2's leave/away mode.
 *
 * Kept as a range rather than expanded into entries at creation, so that
 * cancelling a leave is one delete and not a hunt for the days it touched.
 * Applying it writes real entries — the engine still only ever counts those.
 */
const leaveSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    note: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  opts,
);

leaveSchema.index({ messId: 1, memberId: 1, from: 1 });

export const MmLeave = model('MmLeave', leaveSchema, 'mm_leaves');

/* ------------------------------------------------------------------ *
 * 4.3 — bazar
 * ------------------------------------------------------------------ */

/**
 * One shopping trip. The header; its items live next door.
 *
 * `total` is written from the items rather than typed, so the figure the
 * engine bills can always be reconciled against a list of things that were
 * actually bought. §4.3's workflow ends at approval, and only an approved
 * bazar reaches the rate.
 */
const bazarSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    /** Who did the shopping. */
    buyerId: { type: String, required: true, index: true },
    /** Who paid, when that is somebody else. Defaults to the buyer. */
    payerId: { type: String, required: true, index: true },
    /** Σ of item totals, recomputed on every item change. */
    total: { type: Number, default: 0 },
    note: { type: String, default: '' },
    /** `mm_attachments` id, not the bytes. */
    receiptId: { type: String, default: '' },

    status: { type: String, default: 'draft', index: true },
    submittedAt: { type: Date, default: null },
    decidedBy: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '' },

    createdBy: { type: String, default: '' },
  },
  opts,
);

bazarSchema.index({ messId: 1, month: 1, status: 1 });

export const MmBazar = model('MmBazar', bazarSchema, 'mm_bazar_entries');

const bazarItemSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    bazarId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    qty: { type: Number, default: 1 },
    unit: { type: String, default: 'piece' },
    unitPrice: { type: Number, default: 0 },
    /** qty × unitPrice, written on save so a bazar total is one aggregation. */
    total: { type: Number, default: 0 },
  },
  opts,
);

export const MmBazarItem = model('MmBazarItem', bazarItemSchema, 'mm_bazar_items');

/** Whose turn it is to shop. §4.3's duty schedule and rotation. */
const dutySchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    /** 'assigned' | 'done' | 'skipped' | 'swapped' */
    status: { type: String, default: 'assigned' },
    note: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  opts,
);

dutySchema.index({ messId: 1, date: 1, memberId: 1 }, { unique: true });

export const MmDuty = model('MmDuty', dutySchema, 'mm_bazar_duties');

/* ------------------------------------------------------------------ *
 * 4.4 — expenses and how they split
 * ------------------------------------------------------------------ */

export const ALLOCATION_MODES = ['meal', 'equal', 'custom', 'selected', 'individual'] as const;
export type AllocationMode = (typeof ALLOCATION_MODES)[number];

/**
 * A configurable expense category. §4.4 lists eleven; a mess may add more.
 *
 * `foodCost` is the field that matters: it decides whether this category's
 * approved money lands in the meal-rate numerator or is allocated some other
 * way. §4.6's warning about rent and wifi is this boolean.
 */
const categorySchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    label: { type: String, required: true },
    /** Counts toward the meal rate. */
    foodCost: { type: Boolean, default: false },
    /** How this category splits when the person adding it does not say. */
    defaultAllocation: { type: String, default: 'equal' },
    order: { type: Number, default: 0 },
    /** Seeded categories cannot be deleted, only deactivated. */
    system: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  opts,
);

categorySchema.index({ messId: 1, key: 1 }, { unique: true });

export const MmCategory = model('MmCategory', categorySchema, 'mm_expense_categories');

const expenseSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    categoryKey: { type: String, required: true, index: true },
    /** Denormalised at write so a report does not join for a label. */
    categoryLabel: { type: String, default: '' },
    /** True when the category counted as food *at the time of writing*. */
    foodCost: { type: Boolean, default: false },

    /** Who paid it, so the mess can settle up with them. */
    payerId: { type: String, default: '', index: true },
    note: { type: String, default: '' },
    receiptId: { type: String, default: '' },

    allocationMode: { type: String, default: 'equal' },

    status: { type: String, default: 'draft', index: true },
    submittedAt: { type: Date, default: null },
    decidedBy: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '' },

    createdBy: { type: String, default: '' },
  },
  opts,
);

expenseSchema.index({ messId: 1, month: 1, status: 1 });

export const MmExpense = model('MmExpense', expenseSchema, 'mm_expenses');

/**
 * One member's share of one expense. §4.4's allocation table.
 *
 * Written whenever the expense is written, for every mode except `meal` —
 * a meal-based expense has no fixed shares, because its split is the meal
 * rate and is not known until the month's meals are. Storing a share for it
 * would be storing a figure that goes stale the next time somebody eats.
 */
const allocationSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    expenseId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    share: { type: Number, required: true },
  },
  { versionKey: false },
);

allocationSchema.index({ messId: 1, month: 1, memberId: 1 });

export const MmAllocation = model('MmAllocation', allocationSchema, 'mm_expense_allocations');

/* ------------------------------------------------------------------ *
 * 4.5 — deposits
 * ------------------------------------------------------------------ */

export const PAYMENT_METHODS = ['cash', 'bkash', 'nagad', 'bank', 'other'] as const;

const depositSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    method: { type: String, default: 'cash' },
    /** bKash TrxID, bank reference — whatever proves it moved. */
    reference: { type: String, default: '' },
    note: { type: String, default: '' },
    receiptId: { type: String, default: '' },

    status: { type: String, default: 'draft', index: true },
    submittedAt: { type: Date, default: null },
    decidedBy: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '' },

    createdBy: { type: String, default: '' },
  },
  opts,
);

depositSchema.index({ messId: 1, month: 1, status: 1 });

export const MmDeposit = model('MmDeposit', depositSchema, 'mm_deposits');

/**
 * A post-close correction. §4.8's "controlled adjustment entries".
 *
 * A closed month is frozen, so a mistake found afterwards cannot be edited
 * into it. It becomes one of these instead: signed, attributed, reasoned, and
 * visible in the member's statement as its own line rather than as a figure
 * that quietly disagrees with the snapshot above it.
 */
const adjustmentSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    /** Positive credits the member, negative charges them. */
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    createdBy: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export const MmAdjustment = model('MmAdjustment', adjustmentSchema, 'mm_adjustments');

/* ------------------------------------------------------------------ *
 * 4.8 — the monthly accounting session
 * ------------------------------------------------------------------ */

/**
 * A month, as an accounting period. §4.8.
 *
 * The snapshot is written when the month closes and never recomputed: the
 * figures inside are what the books said at that moment, which is what makes
 * a closed month safe to show a year later. §12 requires that a closed month
 * stays readable, so nothing here is ever deleted.
 */
const sessionSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    status: { type: String, default: 'open', index: true },

    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: '' },

    /* ---- the frozen settlement ---- */
    foodCost: { type: Number, default: 0 },
    otherCost: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    totalMeals: { type: Number, default: 0 },
    mealRate: { type: Number, default: 0 },
    totalDeposits: { type: Number, default: 0 },
    /** What the arithmetic could not distribute evenly. §9's rounding residue. */
    residual: { type: Number, default: 0 },

    members: {
      type: [
        {
          _id: false,
          memberId: String,
          name: String,
          meals: Number,
          /** Per-type breakdown, `{ breakfast: 30, lunch: 28 }`. */
          byType: Schema.Types.Mixed,
          guestMeals: Number,
          foodCost: Number,
          otherCost: Number,
          totalCharge: Number,
          deposits: Number,
          adjustments: Number,
          /** Positive = advance owed to them, negative = due from them. */
          balance: Number,
          carriedIn: Number,
          carriedOut: Number,
        },
      ],
      default: [],
    },

    categories: {
      type: [{ _id: false, key: String, label: String, amount: Number, foodCost: Boolean }],
      default: [],
    },
  },
  opts,
);

sessionSchema.index({ messId: 1, month: 1 }, { unique: true });

export const MmSession = model('MmSession', sessionSchema, 'mm_monthly_sessions');

/* ------------------------------------------------------------------ *
 * 4.10, 4.11, 4.12 — notifications, notices, polls
 * ------------------------------------------------------------------ */

/**
 * The module's own inbox.
 *
 * Deliberately not the app's `Notification` collection: a bazar approval is
 * this feature's business and should not appear in, or count toward, the
 * notification surface the rest of the app owns.
 */
const notificationSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    /** The recipient's account, or null for a ghost member's row nobody reads. */
    customerKey: { type: String, required: true, index: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    /** An in-module path the app can open, e.g. '/meal-management/bazar/abc'. */
    link: { type: String, default: '' },
    read: { type: Boolean, default: false },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

notificationSchema.index({ customerKey: 1, read: 1, at: -1 });

export const MmNotification = model('MmNotification', notificationSchema, 'mm_notifications');

const noticeSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    pinned: { type: Boolean, default: false },
    important: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    createdBy: { type: String, default: '' },
    createdByName: { type: String, default: '' },
    /** Member ids that have opened it — §4.11's read/unread state. */
    readBy: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  opts,
);

export const MmNotice = model('MmNotice', noticeSchema, 'mm_notices');

const pollSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    question: { type: String, required: true },
    options: {
      type: [{ _id: false, id: String, text: String }],
      default: [],
    },
    /** Whether a voter may pick more than one option. */
    multi: { type: Boolean, default: false },
    startAt: { type: Date, default: Date.now },
    endAt: { type: Date, default: null },
    /** 'live' shows the tally while voting is open; 'final' hides it until close. */
    resultVisibility: { type: String, default: 'live' },
    closed: { type: Boolean, default: false },
    createdBy: { type: String, default: '' },
    createdByName: { type: String, default: '' },
  },
  opts,
);

export const MmPoll = model('MmPoll', pollSchema, 'mm_polls');

const voteSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    pollId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    optionIds: { type: [String], default: [] },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

/* One row per member per poll. Changing a vote updates it; §4.12's "one vote
   per user where configured" is this index plus the poll's own flag. */
voteSchema.index({ pollId: 1, memberId: 1 }, { unique: true });

export const MmVote = model('MmVote', voteSchema, 'mm_poll_votes');

/* ------------------------------------------------------------------ *
 * 4.13, 4.14 — menu and cook
 * ------------------------------------------------------------------ */

const menuSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    /** The meal-type key this menu is for. */
    mealType: { type: String, required: true },
    items: { type: [String], default: [] },
    special: { type: Boolean, default: false },
    note: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  opts,
);

menuSchema.index({ messId: 1, date: 1, mealType: 1 }, { unique: true });

export const MmMenu = model('MmMenu', menuSchema, 'mm_menus');

/** A member's verdict on what was served. §4.13's food rating. */
const ratingSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    menuId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    /** 1..5. */
    rating: { type: Number, required: true },
    comment: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

ratingSchema.index({ menuId: 1, memberId: 1 }, { unique: true });

export const MmRating = model('MmRating', ratingSchema, 'mm_food_ratings');

/** A suggestion for what to cook. §4.13's menu suggestion. */
const suggestionSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    memberName: { type: String, default: '' },
    text: { type: String, required: true },
    mealType: { type: String, default: '' },
    votes: { type: [String], default: [] },
    status: { type: String, default: 'open' },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export const MmSuggestion = model('MmSuggestion', suggestionSchema, 'mm_menu_suggestions');

const cookSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    /** Monthly salary in taka. Charged as an expense, not held here. */
    salary: { type: Number, default: 0 },
    /** Free-text shift description, e.g. "7am, 1pm, 8pm". */
    schedule: { type: String, default: '' },
    joinedAt: { type: String, default: '' },
    active: { type: Boolean, default: true },
    note: { type: String, default: '' },
  },
  opts,
);

export const MmCook = model('MmCook', cookSchema, 'mm_cooks');

const cookDaySchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    cookId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    /** 'present' | 'absent' | 'leave' | 'replaced' */
    status: { type: String, default: 'present' },
    /** Plates prepared, for §4.14's meal preparation count. */
    mealsCooked: { type: Number, default: 0 },
    replacementName: { type: String, default: '' },
    note: { type: String, default: '' },
    recordedBy: { type: String, default: '' },
  },
  opts,
);

cookDaySchema.index({ messId: 1, cookId: 1, date: 1 }, { unique: true });

export const MmCookDay = model('MmCookDay', cookDaySchema, 'mm_cook_attendance');

const cookPaySchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    cookId: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    date: { type: String, required: true },
    amount: { type: Number, required: true },
    method: { type: String, default: 'cash' },
    note: { type: String, default: '' },
    /** The expense row this payment created, so the two never drift. */
    expenseId: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  opts,
);

export const MmCookPay = model('MmCookPay', cookPaySchema, 'mm_cook_payments');

/* ------------------------------------------------------------------ *
 * 4.15, 4.17 — assistant transcript and the audit trail
 * ------------------------------------------------------------------ */

/**
 * What somebody asked the assistant, and what it did about it.
 *
 * Kept because §4.15 requires that an AI-driven financial action is
 * attributable and §4.17 requires an audit trail for financial changes. The
 * assistant never writes anything directly — it proposes an action, the
 * ordinary service function performs it under the ordinary permission check,
 * and this row records the sentence that led there.
 */
const assistantSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    customerKey: { type: String, required: true, index: true },
    /** 'user' | 'assistant' */
    role: { type: String, required: true },
    text: { type: String, default: '' },
    /** The parsed intent, when there was one. */
    action: { type: Schema.Types.Mixed, default: null },
    /** 'proposed' | 'confirmed' | 'performed' | 'refused' | 'none' */
    outcome: { type: String, default: 'none' },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

export const MmAssistantMessage = model(
  'MmAssistantMessage',
  assistantSchema,
  'mm_assistant_messages',
);

/**
 * Every financial and structural change, kept.
 *
 * Append-only by use rather than by middleware: the module never updates or
 * deletes a row here, so a corrected entry leaves both the old and the new
 * value legible. §12's last acceptance criterion — that every important
 * financial modification can be traced — is this collection.
 */
const auditSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    /** The account that did it. */
    actorKey: { type: String, default: '' },
    actorName: { type: String, default: '' },
    /** 'meal.set' | 'bazar.approve' | 'month.close' — dot-separated, entity first. */
    action: { type: String, required: true, index: true },
    entity: { type: String, default: '' },
    entityId: { type: String, default: '' },
    /** A sentence for the activity feed, so a reader needs no schema knowledge. */
    summary: { type: String, default: '' },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

auditSchema.index({ messId: 1, at: -1 });

export const MmAudit = model('MmAudit', auditSchema, 'mm_audit_logs');

/**
 * Uploaded bytes, kept out of the documents that reference them.
 *
 * A receipt photograph is two orders of magnitude larger than the expense row
 * it belongs to. Inline, it would be dragged into every list query that ever
 * touched that expense; here, a list is small and a receipt is one fetch by
 * the screen that actually shows it.
 */
const attachmentSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },
    /** 'bazar' | 'expense' | 'deposit' */
    kind: { type: String, default: '' },
    mime: { type: String, default: 'image/jpeg' },
    size: { type: Number, default: 0 },
    /** The data URI itself. Capped by the route, not by this schema. */
    data: { type: String, required: true },
    uploadedBy: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export const MmAttachment = model('MmAttachment', attachmentSchema, 'mm_attachments');

/* ------------------------------------------------------------------ *
 * the mess's own room
 * ------------------------------------------------------------------ */

/**
 * A message between the people in one mess.
 *
 * One room per mess rather than a thread list: a mess is four to ten people
 * who already share a single set of books, and splitting them into private
 * pairs would fragment exactly the conversation the books depend on — "who is
 * doing bazar tomorrow", "why is gas up this month". Those belong where
 * everybody can see them.
 *
 * Deliberately not the app's `ChatMessage`. That collection is the record a
 * customer–cook dispute gets settled on, it is readable by platform
 * operators, and a mess arguing about its own rent has no business in it.
 * This one is `mm_` like everything else here, and no operator can read it.
 *
 * The message is written once and never edited, for the reason the host
 * chat gives: a conversation that can be rewritten afterwards is not a record
 * of anything. A moderator hides; the row stays.
 */
const messageSchema = new Schema(
  {
    messId: { type: String, required: true, index: true },

    /** The member row, not the account — so a ghost's messages are impossible. */
    memberId: { type: String, required: true, index: true },
    /** Denormalised so a room renders without joining every sender. */
    senderName: { type: String, default: '' },

    /** 'text' | 'system' */
    kind: { type: String, default: 'text' },
    body: { type: String, default: '' },

    /**
     * The message this one answers.
     *
     * Light threading: an id and the quoted line, held here rather than
     * resolved at read time, so a reply still reads correctly after the
     * message it answers is hidden.
     */
    replyToId: { type: String, default: '' },
    replyToName: { type: String, default: '' },
    replyToBody: { type: String, default: '' },

    /**
     * A record this message is about — `{ kind, id, label }`.
     *
     * "About this ৳2,400 bazar" is the sentence a mess argument actually
     * starts with, so the room can carry the thing itself rather than a
     * description of it.
     */
    about: { type: Schema.Types.Mixed, default: null },

    /**
     * The sender's own id, generated on the device before the message left it.
     *
     * An optimistic send that the network then retries must not post twice,
     * which is what the unique index below guarantees.
     */
    clientId: { type: String, required: true },

    at: { type: Date, default: Date.now, index: true },

    hidden: { type: Boolean, default: false },
    hiddenBy: { type: String, default: '' },
    hiddenAt: { type: Date, default: null },
  },
  { versionKey: false },
);

messageSchema.index({ messId: 1, at: -1 });
/* Scoped to the mess rather than global: two messes cannot collide, and a
   replayed send inside one mess is refused by the index rather than by a
   check somebody could forget. */
messageSchema.index({ messId: 1, clientId: 1 }, { unique: true });

export const MmMessage = model('MmMessage', messageSchema, 'mm_messages');
