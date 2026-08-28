import 'server-only';

import { db } from './db';

/**
 * Platform configuration.
 *
 * Everything here was a hardcoded constant in the app: `DELIVERY_FEE = 40`
 * and `PLATFORM_FEE = 10` in CartContext, the 37-name `KNOWN_AREAS` array,
 * the 0.85 cook rate, the slot cutoffs. A constant in a mobile bundle can
 * only be changed by shipping a new build to the app stores, which is not a
 * pricing lever — it is a release. These are rows now.
 */

export type PlatformSettings = {
  /** ৳ added once per basket. Was CartContext.DELIVERY_FEE. */
  deliveryFee: number;
  /** ৳ added once per basket. Was CartContext.PLATFORM_FEE. */
  platformFee: number;

  /** The platform's cut of an order's food value, per system. Gap #2. */
  commissionCod: number;
  commissionMeal: number;
  commissionStore: number;
  commissionRequest: number;

  /**
   * Days after `delivered` that escrow releases without the customer.
   * Gap #7 — the app nudges daily and never resolves.
   */
  escrowAutoReleaseDays: number;

  /** Flag a product that has been out of stock for this long. */
  stockAlarmDays: number;

  /** A request whose serve date has passed expires after this many days. */
  requestExpiryDays: number;

  /** Below this, a payout run skips the cook rather than paying pennies. */
  payoutMinimum: number;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  deliveryFee: 40,
  platformFee: 10,
  // 0.15 matches the app's COOK_PAYOUT_RATE = 0.85 on the COD path. The
  // escrow systems took nothing at all, so they start at the same number
  // rather than at zero — the point of the gap was that it was unset.
  commissionCod: 0.15,
  commissionMeal: 0.15,
  commissionStore: 0.12,
  commissionRequest: 0.1,
  escrowAutoReleaseDays: 3,
  stockAlarmDays: 3,
  requestExpiryDays: 1,
  payoutMinimum: 100,
};

export const SETTING_META: Record<
  keyof PlatformSettings,
  { label: string; help: string; kind: 'money' | 'rate' | 'days' }
> = {
  deliveryFee: {
    label: 'Delivery fee',
    help: 'Charged once per basket, not once per kitchen. Was hardcoded in the app.',
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
    help: 'Days after delivery that held money releases without the customer confirming.',
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
  payoutMinimum: {
    label: 'Payout minimum',
    help: 'A cook owed less than this is carried to the next run.',
    kind: 'money',
  },
};

const CACHE_KEY = '__rb_settings__';
type CacheHolder = { [CACHE_KEY]?: { at: number; value: PlatformSettings } };

/**
 * Settings, cached for a few seconds.
 *
 * Read on nearly every page and on every money transition, and changed a
 * handful of times a year. A short TTL keeps a saved change visible almost
 * immediately without hitting the row on every render.
 */
export async function getSettings(): Promise<PlatformSettings> {
  const holder = globalThis as unknown as CacheHolder;
  const cached = holder[CACHE_KEY];
  if (cached && Date.now() - cached.at < 5_000) return cached.value;

  const rows = await db.setting.findMany();
  const value = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in value)) continue;
    const parsed = Number(JSON.parse(row.value));
    if (Number.isFinite(parsed)) {
      (value as unknown as Record<string, number>)[row.key] = parsed;
    }
  }

  holder[CACHE_KEY] = { at: Date.now(), value };
  return value;
}

export function invalidateSettings() {
  delete (globalThis as unknown as CacheHolder)[CACHE_KEY];
}

export async function saveSetting(key: keyof PlatformSettings, value: number, by: string) {
  await db.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value), updatedBy: by },
    update: { value: JSON.stringify(value), updatedBy: by },
  });
  invalidateSettings();
}

/* ------------------------------------------------------------------ *
 * feature flags
 * ------------------------------------------------------------------ */

export const DEFAULT_FLAGS = [
  { key: 'system.cod', description: 'Cash-on-delivery ordering', enabled: true },
  { key: 'system.meals', description: 'Pre-booked meals', enabled: true },
  { key: 'system.stores', description: 'Cook stores', enabled: true },
  { key: 'system.requests', description: 'Food requests and bidding', enabled: true },
  { key: 'system.topup', description: 'Wallet top-ups', enabled: true },
  { key: 'signup.cook', description: 'New cook signups', enabled: true },
];

export async function getFlags() {
  const rows = await db.featureFlag.findMany({ orderBy: { key: 'asc' } });
  if (rows.length) return rows;
  return DEFAULT_FLAGS.map((f) => ({ ...f, updatedAt: new Date(), updatedBy: null }));
}
