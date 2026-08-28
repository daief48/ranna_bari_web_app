'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { requireCapability } from '@/lib/auth';
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
    const user = await requireCapability('kyc.decide');

    const kitchen = await db.kitchen.findUnique({ where: { id: kitchenId } });
    if (!kitchen) return bad(ERR.NO_KITCHEN);
    if (decision === 'rejected' && !note.trim()) {
      return bad('A rejection needs a reason — the cook is told what it says.');
    }

    const before = pick(kitchen, ['isVerified', 'kycStatus', 'kycNote']);

    await db.$transaction(async (tx) => {
      await tx.kitchen.update({
        where: { id: kitchenId },
        data: {
          kycStatus: decision,
          kycNote: note.trim() || null,
          kycDecidedAt: new Date(),
          kycDecidedBy: user.email,
          // The badge and the decision move together. Two sources of truth
          // for "is this cook checked" is one too many.
          isVerified: decision === 'approved',
        },
      });

      /* The cook is told either way. A rejection that arrives as silence is
         indistinguishable from the queue being slow. */
      await tx.notification.create({
        data: {
          key: `cook:kyc-${decision}:${kitchenId}`,
          audience: 'cook',
          kind: `kyc-${decision}`,
          kitchenId,
          title: decision === 'approved' ? 'Your kitchen is verified' : 'Verification needs more',
          body:
            decision === 'approved'
              ? 'The verified badge is now on your kitchen.'
              : note.trim(),
          broadcastBy: user.email,
        },
      });

      await audit(
        user,
        {
          action: `kyc.${decision}`,
          targetType: 'Kitchen',
          targetId: kitchenId,
          summary: `${kitchen.name} — ${decision}${note ? `: ${note}` : ''}`,
          before,
          after: { isVerified: decision === 'approved', kycStatus: decision, kycNote: note },
        },
        tx,
      );
    });

    revalidatePath('/kyc');
    revalidatePath('/kitchens');
    revalidatePath(`/kitchens/${kitchenId}`);

    return good(decision === 'approved' ? 'Verified.' : 'Rejected, and the cook has been told.');
  });
}

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
