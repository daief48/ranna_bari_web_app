'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
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

/* The three actions below still write through Prisma, and still write their
   own audit row, because the admin API mutates a kitchen through exactly one
   endpoint — the KYC decision. There is no PATCH /kitchens/:id, no suspend,
   no coverage. They therefore write to a different store than `decideKyc`
   does; see the migration notes. */

/** Undo a verification. Rare, and audited like everything else. */
export async function setVerified(kitchenId: string, verified: boolean): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('kitchen.write');
    const kitchen = await db.kitchen.findUnique({ where: { id: kitchenId } });
    if (!kitchen) return bad(ERR.NO_KITCHEN);

    await db.$transaction(async (tx) => {
      await tx.kitchen.update({
        where: { id: kitchenId },
        data: {
          isVerified: verified,
          kycStatus: verified ? 'approved' : 'pending',
          kycDecidedAt: new Date(),
          kycDecidedBy: user.email,
        },
      });
      await audit(
        user,
        {
          action: verified ? 'kitchen.verify' : 'kitchen.unverify',
          targetType: 'Kitchen',
          targetId: kitchenId,
          summary: kitchen.name,
          before: pick(kitchen, ['isVerified']),
          after: { isVerified: verified },
        },
        tx,
      );
    });

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
    const kitchen = await db.kitchen.findUnique({ where: { id: kitchenId } });
    if (!kitchen) return bad(ERR.NO_KITCHEN);
    if (suspended && !reason.trim()) return bad('A suspension needs a reason.');

    await db.$transaction(async (tx) => {
      await tx.kitchen.update({
        where: { id: kitchenId },
        data: { suspended, suspendedReason: suspended ? reason.trim() : null },
      });
      if (kitchen.accountId) {
        await tx.account.update({
          where: { id: kitchen.accountId },
          data: { suspended, suspendedReason: suspended ? reason.trim() : null },
        });
      }
      await audit(
        user,
        {
          action: suspended ? 'kitchen.suspend' : 'kitchen.unsuspend',
          targetType: 'Kitchen',
          targetId: kitchenId,
          summary: `${kitchen.name}${reason ? ` — ${reason}` : ''}`,
          before: pick(kitchen, ['suspended', 'suspendedReason']),
          after: { suspended, suspendedReason: reason },
        },
        tx,
      );
    });

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
    const kitchen = await db.kitchen.findUnique({ where: { id: kitchenId } });
    if (!kitchen) return bad(ERR.NO_KITCHEN);
    if (!area.trim()) return bad(ERR.NAME_REQUIRED);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
      return bad('A delivery radius has to be between 1 and 50 km.');
    }

    await db.$transaction(async (tx) => {
      await tx.kitchen.update({
        where: { id: kitchenId },
        data: { area: area.trim(), deliveryRadiusKm: radiusKm },
      });
      await audit(
        user,
        {
          action: 'kitchen.coverage',
          targetType: 'Kitchen',
          targetId: kitchenId,
          summary: `${kitchen.name} → ${area.trim()}, ${radiusKm} km`,
          before: pick(kitchen, ['area', 'deliveryRadiusKm']),
          after: { area: area.trim(), deliveryRadiusKm: radiusKm },
        },
        tx,
      );
    });

    revalidatePath(`/kitchens/${kitchenId}`);
    return good('Coverage updated.');
  });
}
