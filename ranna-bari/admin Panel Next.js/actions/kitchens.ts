'use server';

import { revalidatePath } from 'next/cache';

import { requireCapability } from '@/lib/auth';
import { post, BackendError } from '@/lib/backend';
import { audit, pick } from '@/lib/audit';
import { ERR } from '@/lib/domain';
import { good, bad, guard, type ActionResult } from './shared';

/**
 * Kitchens, and the badge nobody could grant.
 *
 * `isVerified` is written `false` on every kitchen the app creates and there
 * is no code path anywhere in the app that ever flips it — the NID is
 * collected at signup, stored, and never looked at again. These two actions
 * are the missing half of that flow.
 */

export async function decideKyc(
  kitchenId: string,
  decision: 'approved' | 'rejected',
  note: string,
): Promise<ActionResult> {
  return guard(async () => {
    await requireCapability('kyc.decide');

    /* Checked here as well as in the backend because the backend refuses a
       blank rejection with `name-required`, and "A name is required." is not
       what an operator staring at an empty note field needs to read. */
    if (decision === 'rejected' && !note.trim()) {
      return bad('A rejection needs a reason — the cook is told what it says.');
    }

    try {
      await post(`/kitchens/${kitchenId}/kyc`, { decision, note: note.trim() });
    } catch (error) {
      /* `guard()` flattens an unknown throw into "That did not work." A
         refusal from the backend already carries the sentence, so it is
         unwrapped here where it still has one. */
      if (error instanceof BackendError) return bad(error.message);
      throw error;
    }

    revalidatePath('/kyc');
    revalidatePath('/kitchens');
    revalidatePath(`/kitchens/${kitchenId}`);

    return good(decision === 'approved' ? 'Verified.' : 'Rejected, and the cook has been told.');
  });
}

/* The three below now write through the backend, like `decideKyc` does. They
   used to write to the panel's own database with an id that came off a board
   reading the other one, so `findUnique` missed and every one of them told the
   operator the kitchen did not exist. The backend audits each write itself. */

/** Undo a verification. Rare, and audited like everything else. */
export async function setVerified(kitchenId: string, verified: boolean): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('kitchen.write');
    try {
      await post(`/kitchens/${kitchenId}/verified`, { verified });
    } catch (error) {
      if (error instanceof BackendError && error.status === 404) return bad(ERR.NO_KITCHEN);
      throw error;
    }

    revalidatePath('/kitchens');
    revalidatePath(`/kitchens/${kitchenId}`);
    return good(verified ? 'Badge granted.' : 'Badge removed.');
  });
}

/**
 * Suspend a kitchen.
 *
 * Not a delete — the orders, the menu and the history are evidence and stay
 * exactly where they are. `suspended` sits alongside `isOpen` rather than
 * overwriting it, so lifting a suspension does not silently reopen a kitchen
 * whose cook had closed it themselves.
 */
export async function setSuspended(
  kitchenId: string,
  suspended: boolean,
  reason: string,
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('kitchen.write');
    /* Checked here for the message; the backend checks it again, and that is
       the one that holds. */
    if (suspended && !reason.trim()) return bad('A suspension needs a reason.');

    try {
      /* The owner's account is suspended in the same transaction there — a cook
         whose kitchen is hidden but who can still sign in and accept orders is
         not suspended in any sense a customer would notice. */
      await post(`/kitchens/${kitchenId}/suspend`, { suspended, reason: reason.trim() });
    } catch (error) {
      if (error instanceof BackendError && error.status === 404) return bad(ERR.NO_KITCHEN);
      throw error;
    }

    revalidatePath('/kitchens');
    revalidatePath(`/kitchens/${kitchenId}`);
    return good(suspended ? 'Suspended and hidden from browse.' : 'Suspension lifted.');
  });
}

/** Edit the two fields that decide who can see a kitchen at all. */
export async function setCoverage(
  kitchenId: string,
  area: string,
  radiusKm: number,
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('kitchen.write');
    if (!area.trim()) return bad(ERR.NAME_REQUIRED);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
      return bad('A delivery radius has to be between 1 and 50 km.');
    }

    try {
      await post(`/kitchens/${kitchenId}/coverage`, { area: area.trim(), radiusKm });
    } catch (error) {
      if (error instanceof BackendError && error.status === 404) return bad(ERR.NO_KITCHEN);
      throw error;
    }

    revalidatePath(`/kitchens/${kitchenId}`);
    return good('Coverage updated.');
  });
}
