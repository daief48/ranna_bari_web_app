import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether somebody is still standing in the mess.
 *
 * The mess is a *place*, not a mode. A mode would be persisted and the app
 * would open into it — which is what the cook panel does, and rightly, because
 * being a cook is an identity. Three worlds fighting over the front door would
 * mean a mess member opening the app and never seeing the shop.
 *
 * So instead of a mode, one flag with a narrow meaning: **the last time this
 * person was inside, did they leave, or did the app close on them?** It is set
 * on the way in and cleared on the way out, so it is only ever true for
 * somebody who was interrupted. Profile turns that into a Resume chip.
 *
 * That is most of what a mode buys — landing back where you were — without
 * the cost of taking over the app's front door.
 *
 * Every read and write is wrapped: this decides whether one chip is drawn, and
 * a storage failure should never be able to keep somebody out of their
 * profile screen.
 */

const KEY = 'rannabari_mm_inside';

/** Called when the mess world mounts. */
export async function markInside() {
  try {
    await AsyncStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* A missing flag costs a chip, not a feature. */
  }
}

/** Called when somebody walks out through the exit door. */
export async function markLeft() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* Same: worst case the chip lingers until the next visit clears it. */
  }
}

/**
 * Was the last visit interrupted rather than ended?
 *
 * Anything older than a week is treated as no — an app reopened a fortnight
 * later is not resuming anything, and offering to would be the interface
 * remembering something the person has not.
 */
const STALE_AFTER = 7 * 24 * 60 * 60 * 1000;

export async function wasInside() {
  try {
    const at = await AsyncStorage.getItem(KEY);
    if (!at) return false;

    const when = Number(at);
    if (!Number.isFinite(when)) return false;
    if (Date.now() - when > STALE_AFTER) {
      await markLeft();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
