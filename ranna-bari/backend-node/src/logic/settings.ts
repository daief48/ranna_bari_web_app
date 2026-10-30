import { Setting, FeatureFlag } from '../models/index.js';

/**
 * Platform configuration.
 *
 * Everything here was a hardcoded constant in the app: `DELIVERY_FEE = 40`
 * and `PLATFORM_FEE = 10` in CartContext, the 37-name `KNOWN_AREAS` array,
 * the 0.85 cook rate. A constant in a mobile bundle can only be changed by
 * shipping a build to the app stores, which is not a pricing lever — it is a
 * release.
 */

export type PlatformSettings = {
  /** ৳ added once per basket. Was CartContext.DELIVERY_FEE. */
  deliveryFee: number;
  /** ৳ added once per basket. Was CartContext.PLATFORM_FEE. */
  platformFee: number;

  /** The platform's cut of an order's food value, per system. */
  commissionCod: number;
  commissionMeal: number;
  commissionStore: number;
  commissionRequest: number;

  /** Days after `delivered` that escrow releases without the customer. */
  escrowAutoReleaseDays: number;
  /** Flag a product that has been out of stock this long. */
  stockAlarmDays: number;
  /** Days past the wanted-for date before an unpaid request expires. */
  requestExpiryDays: number;
  /** Hours an agreed price waits for payment before the request reopens. */
  requestPayWindowHours: number;
  /** Below this, a payout run carries a cook to the next run. */
  payoutMinimum: number;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  deliveryFee: 40,
  platformFee: 10,
  /* 0.15 matches the app's COOK_PAYOUT_RATE = 0.85 on the COD path. The
     escrow systems took nothing at all, so they start at the same number
     rather than at zero — the point of the gap was that it was unset. */
  commissionCod: 0.15,
  commissionMeal: 0.15,
  commissionStore: 0.12,
  commissionRequest: 0.1,
  escrowAutoReleaseDays: 3,
  stockAlarmDays: 3,
  requestExpiryDays: 1,
  requestPayWindowHours: 24,
  payoutMinimum: 100,
};

export const SETTING_META: Record<
  keyof PlatformSettings,
  { label: string; help: string; kind: 'money' | 'rate' | 'days' | 'hours' }
> = {
  deliveryFee: {
    label: 'Delivery fee',
    help: 'Charged once per basket, not once per kitchen.',
    kind: 'money',
  },
  platformFee: {
    label: 'Platform fee',
    help: 'Charged once per basket alongside delivery.',
    kind: 'money',
  },
  commissionCod: {
    label: 'Commission — cash on delivery',
    help: 'The app already took this: the cook keeps 85% of subtotal.',
    kind: 'rate',
  },
  commissionMeal: {
    label: 'Commission — pre-booked meals',
    help: 'The app took nothing here. Escrow released 100% to the cook.',
    kind: 'rate',
  },
  commissionStore: {
    label: 'Commission — cook stores',
    help: 'Taken off the food value at release, never off the delivery fee.',
    kind: 'rate',
  },
  commissionRequest: {
    label: 'Commission — food requests',
    help: 'The cook named this price themselves, so the cut is lighter.',
    kind: 'rate',
  },
  escrowAutoReleaseDays: {
    label: 'Escrow auto-release',
    help: 'Days after delivery that held money releases without the customer.',
    kind: 'days',
  },
  stockAlarmDays: {
    label: 'Stock alarm',
    help: 'Flag an active product that has sat at zero stock this long.',
    kind: 'days',
  },
  requestExpiryDays: {
    label: 'Request expiry',
    help: 'Days past the wanted-for date before an unpaid request expires.',
    kind: 'days',
  },
  requestPayWindowHours: {
    label: 'Request payment window',
    help: 'Hours an agreed price waits for the customer to pay before the request reopens.',
    kind: 'hours',
  },
  payoutMinimum: {
    label: 'Payout minimum',
    help: 'A cook owed less than this is carried to the next run.',
    kind: 'money',
  },
};

let cache: { at: number; value: PlatformSettings } | null = null;

/**
 * Settings, cached for a few seconds.
 *
 * Read on nearly every money transition and changed a handful of times a
 * year. A short TTL keeps a saved change visible almost immediately without
 * hitting the collection on every release.
 */
export async function getSettings(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < 5_000) return cache.value;

  const rows = await Setting.find().lean();
  const value = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    const key = String(row._id) as keyof PlatformSettings;
    if (!(key in value)) continue;
    const parsed = Number(row.value);
    if (Number.isFinite(parsed)) value[key] = parsed;
  }

  cache = { at: Date.now(), value };
  return value;
}

/** The last settings read, or the defaults — for sync shapers that cannot await. */
export const peekSettings = (): PlatformSettings => cache?.value ?? DEFAULT_SETTINGS;

export function invalidateSettings() {
  cache = null;
}

export async function saveSetting(
  key: keyof PlatformSettings,
  value: number,
  by: string,
) {
  await Setting.updateOne({ _id: key }, { value, updatedBy: by }, { upsert: true });
  invalidateSettings();
}

/* ------------------------------------------------------------------ *
 * manual top-up destination
 * ------------------------------------------------------------------ */

/**
 * Where a customer sends money to fund their wallet.
 *
 * Text, not a number, so it lives beside `PlatformSettings` rather than in it
 * (that bag is parsed with `Number()`), in the same `settings` collection under
 * `topup.*` ids. Empty by default and deliberately never hard-coded: with no
 * number set the app shows "top-up is not configured" and `POST
 * /wallet/topup-requests` refuses, so nobody can be told to pay a number
 * the operator never chose. Edited by finance (`payout.write`) in the admin
 * Top-ups screen.
 */
export type TopupConfig = { bkash: string; nagad: string; note: string };

const TOPUP_KEYS = { bkash: 'topup.bkash', nagad: 'topup.nagad', note: 'topup.note' } as const;

/** Bounds of one manual top-up, whole taka. */
export const TOPUP_MIN = 50;
export const TOPUP_MAX = 50_000;

export async function getTopupConfig(): Promise<TopupConfig> {
  const rows = await Setting.find({ _id: { $in: Object.values(TOPUP_KEYS) } }).lean();
  const pick = (key: string) => {
    const value = rows.find((row) => String(row._id) === key)?.value;
    return typeof value === 'string' ? value.trim() : '';
  };
  return {
    bkash: pick(TOPUP_KEYS.bkash),
    nagad: pick(TOPUP_KEYS.nagad),
    note: pick(TOPUP_KEYS.note),
  };
}

export const topupConfigured = (config: TopupConfig) => !!(config.bkash || config.nagad);

export async function saveTopupConfig(patch: Partial<TopupConfig>, by: string) {
  for (const field of ['bkash', 'nagad', 'note'] as const) {
    const value = patch[field];
    if (typeof value !== 'string') continue;
    await Setting.updateOne(
      { _id: TOPUP_KEYS[field] },
      { value: value.trim(), updatedBy: by },
      { upsert: true },
    );
  }
}

export const DEFAULT_FLAGS = [
  /* Retired for new orders: the wallet is the only way to pay. The flag stays
     (off) so legacy cash orders keep their meaning, and `recordOrder` refuses
     a new `cod` order whatever this says. */
  { key: 'system.cod', description: 'Cash-on-delivery ordering (retired)', enabled: false },
  { key: 'system.meals', description: 'Pre-booked meals', enabled: true },
  { key: 'system.stores', description: 'Cook stores', enabled: true },
  { key: 'system.requests', description: 'Food requests and bidding', enabled: true },
  { key: 'system.topup', description: 'Wallet top-ups', enabled: true },
  { key: 'signup.cook', description: 'New cook signups', enabled: true },
];

export async function getFlags() {
  const rows = await FeatureFlag.find().sort({ _id: 1 }).lean();
  if (rows.length) {
    return rows.map((row) => ({
      key: String(row._id),
      enabled: row.enabled,
      description: row.description,
    }));
  }
  return DEFAULT_FLAGS;
}

export type FeatureKey = (typeof DEFAULT_FLAGS)[number]['key'];

let flagCache: { at: number; off: Set<string> } | null = null;

/**
 * Is a system switched on?
 *
 * The flags were read by `/config` and shown to the app, and nothing on the
 * server looked at them — an operator who paused the meal system paused the
 * button, not the booking. Every route that opens one of these systems asks
 * here first.
 *
 * Only the *off* rows are kept, because absence means on: a flag nobody has
 * written is a system nobody has switched off, and a fresh database with no
 * flag rows at all must trade. Cached on the same short TTL as the settings,
 * for the same reason — read on every order, changed a handful of times a
 * year.
 */
export async function featureOn(key: FeatureKey | string): Promise<boolean> {
  if (!flagCache || Date.now() - flagCache.at >= 5_000) {
    const rows = await FeatureFlag.find({ enabled: false }).select({ _id: 1 }).lean();
    flagCache = { at: Date.now(), off: new Set(rows.map((row) => String(row._id))) };
  }
  return !flagCache.off.has(key);
}

export function invalidateFlags() {
  flagCache = null;
}
