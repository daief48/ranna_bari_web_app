import 'server-only';

import { BackendError, get } from './backend';

/**
 * Platform configuration — read from `backend-node`.
 *
 * Everything here was a hardcoded constant in the app: `DELIVERY_FEE = 40`
 * and `PLATFORM_FEE = 10` in CartContext, the 37-name `KNOWN_AREAS` array,
 * the 0.85 cook rate, the slot cutoffs. A constant in a mobile bundle can
 * only be changed by shipping a new build to the app stores, which is not a
 * pricing lever — it is a release. These are rows now, and the rows live in
 * Mongo behind the backend, which is the only place the app reads them from.
 *
 * This module used to read the panel's own SQLite. That was a second copy of
 * the configuration that the money transitions never saw: an operator could
 * change the commission here and watch the ledger keep posting the old one.
 * Nothing in the panel opens a database for configuration any more.
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

  /** An agreed request that is still unpaid after this many hours goes back to open. */
  requestPayWindowHours: number;

  /** Below this, a payout run skips the cook rather than paying pennies. */
  payoutMinimum: number;
};

export type FeatureFlag = { key: string; description: string; enabled: boolean };

export type SettingMeta = { label: string; help: string; kind: 'money' | 'rate' | 'days' | 'hours' };

/** What `GET /settings` answers with. */
export type SettingsResponse = {
  settings: PlatformSettings;
  meta: Record<keyof PlatformSettings, SettingMeta>;
  flags: FeatureFlag[];
};

/**
 * DISPLAY-ONLY FALLBACK. Not the configuration.
 *
 * The values the backend ships with (`backend-node/src/logic/settings.ts`),
 * used only to draw a page when the backend is unreachable or this role may
 * not read `/settings` — the dashboard's "past N days" caption, for example.
 * No money decision in the panel reads these: every transition is made on
 * the backend, against the real rows. If the two drift apart the backend is
 * right and this is a stale caption.
 */
export const DEFAULT_SETTINGS: PlatformSettings = {
  deliveryFee: 40,
  platformFee: 10,
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

const CACHE_KEY = '__rb_settings__';
type CacheHolder = { [CACHE_KEY]?: { at: number; value: SettingsResponse } };

/**
 * One read of `/settings`, cached for a few seconds.
 *
 * Read on nearly every page and changed a handful of times a year. The TTL is
 * short enough that a saved change is visible on the next navigation and long
 * enough that a page drawing three of these numbers makes one request.
 *
 * `/settings` needs `config.read`. A role without it — support — gets a 403,
 * which is not an error worth taking the dashboard down for; it is simply a
 * page that has to make do with the display-only defaults above. A dead
 * backend is the same. Anything else is a real fault and throws.
 */
async function readConfig(): Promise<SettingsResponse | null> {
  const holder = globalThis as unknown as CacheHolder;
  const cached = holder[CACHE_KEY];
  if (cached && Date.now() - cached.at < 5_000) return cached.value;

  try {
    const value = await get<SettingsResponse>('/settings');
    holder[CACHE_KEY] = { at: Date.now(), value };
    return value;
  } catch (error) {
    if (error instanceof BackendError && (error.status === 0 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

/** The platform settings, or the display-only defaults when they cannot be read. */
export async function getSettings(): Promise<PlatformSettings> {
  const config = await readConfig();
  return config ? { ...DEFAULT_SETTINGS, ...config.settings } : { ...DEFAULT_SETTINGS };
}

/**
 * The feature flags, from the same rows the app branches on.
 *
 * Empty rather than a default list when the backend cannot be read: a switch
 * drawn from a guess is a switch an operator will flip and believe.
 */
export async function getFlags(): Promise<FeatureFlag[]> {
  const config = await readConfig();
  return config?.flags ?? [];
}

export function invalidateSettings() {
  delete (globalThis as unknown as CacheHolder)[CACHE_KEY];
}
