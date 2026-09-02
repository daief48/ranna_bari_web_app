'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { requireCapability } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import { BackendError, patch, post } from '@/lib/backend';
import { ERR, ROLES } from '@/lib/domain';
import type { PlatformSettings } from '@/lib/settings';
import { good, bad, guard, type ActionResult } from './shared';

/**
 * Configuration, content and access.
 *
 * Everything here replaces a constant that used to live inside the mobile
 * bundle, where the only way to change it was to ship a new build to the app
 * stores. A price you can only change by shipping is not a price, it is a
 * release.
 */

/**
 * Run an action body, and answer a backend refusal in the backend's own words.
 *
 * `guard()` builds its sentence by looking a thrown message up as an error
 * *code*, and answers anything it cannot find with "That did not work." A
 * `BackendError` already arrives carrying the refusal as a sentence, so it is
 * returned from here rather than thrown into that lookup and flattened into a
 * shrug. Everything else still throws, and `guard()` still catches it.
 */
async function attempt(body: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await body();
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    return bad(
      error.status === 0
        ? 'The backend is not answering. Start it with: cd backend-node && npm run dev'
        : error.message,
    );
  }
}

/* ------------------------------------------------------------------ *
 * settings — gaps #3 and #7
 * ------------------------------------------------------------------ */

export async function updateSetting(
  key: keyof PlatformSettings,
  value: number,
): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('config.write');
      if (!Number.isFinite(value) || value < 0) return bad(ERR.BAD_AMOUNT);
      // A commission over 100% would pay the cook a negative amount.
      if (key.startsWith('commission') && value > 1) {
        return bad('A commission rate is a fraction — 0.15 is fifteen per cent.');
      }

      await patch('/settings', { key, value });

      revalidatePath('/settings');
      revalidatePath('/');
      return good('Saved.');
    }),
  );
}

/**
 * Turn a whole system off without a deploy.
 *
 * Left on Prisma. The backend hands the flags out on `GET /settings` but has
 * no route that writes one, so a panel that read them over HTTP and wrote them
 * here would show an operator a switch that never moves. The settings page
 * reads `getFlags()` from the same database for exactly that reason, and the
 * audit row stays local because no backend saw the change.
 */
export async function toggleFlag(key: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('config.write');

    const existing = await db.featureFlag.findUnique({ where: { key } });
    const next = !(existing?.enabled ?? true);

    await db.featureFlag.upsert({
      where: { key },
      create: { key, enabled: next, description: '', updatedBy: user.email },
      update: { enabled: next, updatedBy: user.email },
    });

    await audit(user, {
      action: 'config.flag',
      targetType: 'FeatureFlag',
      targetId: key,
      summary: `${key} ${next ? 'enabled' : 'disabled'}`,
      before: { enabled: existing?.enabled ?? true },
      after: { enabled: next },
    });

    revalidatePath('/settings');
    return good(next ? 'Enabled.' : 'Disabled — the app will stop offering it.');
  });
}

/* ------------------------------------------------------------------ *
 * zones — gap #4
 * ------------------------------------------------------------------ */

export async function saveZone(
  id: string | null,
  name: string,
  deliveryFee: number | null,
  active: boolean,
): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('config.write');
      const clean = name.trim();
      if (!clean) return bad(ERR.NAME_REQUIRED);

      if (id) {
        /* `name` is absent from the patch, and there is no path to it on the
           backend either: the name *is* the join. A kitchen's `area`, a meal's
           `area` and a request's `area` are all that one string matched
           literally, so a rename orphans every row carrying the old spelling
           at once. The editor only ever sends the name back unchanged. */
        await patch(`/zones/${id}`, { deliveryFee, active });
      } else {
        await post('/zones', { name: clean, deliveryFee, active });
      }

      revalidatePath('/settings');
      return good('Saved.');
    }),
  );
}

/* ------------------------------------------------------------------ *
 * taxonomy — gap #5, the "future admin screen"
 * ------------------------------------------------------------------ */

export async function saveCategory(
  id: string | null,
  label: string,
  emoji: string,
  key?: string,
): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('config.write');
      const clean = label.trim();
      if (!clean) return bad(ERR.NAME_REQUIRED);

      if (id) {
        // `key` is deliberately not editable: it is the tag stored on every
        // dish and kitchen, so changing it would orphan the filter.
        await patch(`/taxonomy/${id}`, { label: clean, emoji: emoji.trim() });
      } else {
        // The slug is the backend's to derive — it owns the uniqueness check
        // that a locally-made one would only be guessing at.
        await post('/taxonomy', { key, label: clean, emoji: emoji.trim() });
      }

      revalidatePath('/settings');
      return good('Saved.');
    }),
  );
}

/**
 * Retire a category rather than delete it.
 *
 * The key is written on dishes and kitchens as a tag. Deleting the row would
 * leave those tags pointing at nothing, and a filter that silently matches
 * zero results is worse than one that is visibly switched off.
 */
export async function retireCategory(id: string, retired: boolean): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('config.write');

      await post(`/taxonomy/${id}/retire`, { retired });

      revalidatePath('/settings');
      return good(retired ? 'Retired.' : 'Back in the list.');
    }),
  );
}

/**
 * Move one category along the list.
 *
 * `move` is signed places rather than an absolute index, because the backend
 * renumbers the whole list to close the gaps a retirement leaves. A step off
 * either end is refused there rather than shrugged off here; the editor
 * disables the arrow at each end, so the refusal is unreachable from the UI.
 */
export async function moveCategory(id: string, delta: number): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('config.write');

      await patch(`/taxonomy/${id}`, { move: delta });

      revalidatePath('/settings');
      return good();
    }),
  );
}

/* ------------------------------------------------------------------ *
 * reviews — gap #10
 * ------------------------------------------------------------------ */

/**
 * Hide or restore a review, and recompute the kitchen's score.
 *
 * A hidden review must not keep counting toward the rating, or hiding it
 * achieves nothing but removing the evidence. The recount happens in the same
 * transaction as the hiding, which is what stops the two ever disagreeing.
 */
export async function moderateReview(
  reviewId: string,
  hidden: boolean,
  note: string,
): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('review.moderate');
      if (hidden && !note.trim()) return bad('Say why it is being hidden.');

      await post(`/reviews/${reviewId}/moderate`, { hidden, note: note.trim() });

      revalidatePath('/reviews');
      return good(hidden ? 'Hidden, and the rating recomputed.' : 'Restored.');
    }),
  );
}

/* ------------------------------------------------------------------ *
 * broadcast — gap #12
 * ------------------------------------------------------------------ */

/**
 * Send a notification from the platform.
 *
 * The "an unread broadcast with this title is already out" refusal went with
 * the write, and deliberately: a broadcast carries no reader, so nothing ever
 * marks it read. A key derived from the title would therefore sit unread for
 * ever and silence every later announcement to that audience. The backend
 * names each send with a fresh id instead.
 */
export async function broadcast(
  audience: 'customer' | 'cook',
  zone: string | null,
  title: string,
  body: string,
): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('notification.broadcast');
      if (!title.trim() || !body.trim()) return bad('A broadcast needs a title and a body.');

      await post('/notifications/broadcast', {
        audience,
        title: title.trim(),
        body: body.trim(),
        /* `undefined` rather than `null`, so a platform-wide send drops the
           field instead of failing the backend's optional-string check. The
           row it writes still stores `zone: null`. */
        zone: zone ?? undefined,
      });

      revalidatePath('/notifications');
      return good(`Sent to ${audience}s${zone ? ` in ${zone}` : ''}.`);
    }),
  );
}

/* ------------------------------------------------------------------ *
 * admin users — gap: nobody could grant access either
 * ------------------------------------------------------------------ */

/*
 * All three left on Prisma.
 *
 * `backend-node` has an `AdminUser` collection and signs operators in against
 * it, but exposes no route that lists, creates or amends one. Minting an
 * endpoint for it from this side is not a decision a migration gets to make —
 * it is who may operate the platform. So operator accounts stay in the panel's
 * own database, and so do their audit rows, because no backend sees the change.
 */

export async function createAdmin(
  email: string,
  name: string,
  role: string,
  password: string,
): Promise<ActionResult> {
  return guard(async () => {
    // Creating an operator is a superadmin act. `kitchen.write` would let
    // ops mint themselves a finance account.
    const user = await requireCapability('*');
    const clean = email.trim().toLowerCase();
    if (!clean || !name.trim()) return bad('Email and name are both required.');
    if (!(ROLES as readonly string[]).includes(role)) return bad('Unknown role.');
    if (password.length < 8) return bad('Use at least eight characters.');

    /* The backend hashes the password and writes its own audit row. Hashing
       here as well would put a second, differently-derived hash in a second
       store for the same person — and sign-in checks the backend's. */
    try {
      await post('/admins', { email: clean, name: name.trim(), role, password });
    } catch (error) {
      if (error instanceof BackendError && error.status === 409) {
        return bad('That email already has an account.');
      }
      throw error;
    }

    revalidatePath('/admins');
    return good('Operator created.');
  });
}

export async function setAdminActive(adminId: string, active: boolean): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('*');
    /* Checked here for the message, and again on the backend for the rule:
       this one is a courtesy, that one is what actually holds. */
    if (adminId === user.sub) return bad('You cannot deactivate yourself.');

    try {
      await post(`/admins/${adminId}/active`, { active });
    } catch (error) {
      if (error instanceof BackendError && error.status === 404) {
        return bad('That operator no longer exists.');
      }
      if (error instanceof BackendError && error.status === 403) {
        return bad('That is the last active superadmin — somebody has to be able to fix this console.');
      }
      throw error;
    }

    revalidatePath('/admins');
    return good(active ? 'Reactivated.' : 'Deactivated — they cannot sign in.');
  });
}

export async function setAdminRole(adminId: string, role: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('*');
    if (!(ROLES as readonly string[]).includes(role)) return bad('Unknown role.');

    if (adminId === user.sub) return bad('You cannot change your own role.');

    try {
      await post(`/admins/${adminId}/role`, { role });
    } catch (error) {
      if (error instanceof BackendError && error.status === 404) {
        return bad('That operator no longer exists.');
      }
      if (error instanceof BackendError && error.status === 403) {
        return bad('That is the last active superadmin — the role cannot be given away.');
      }
      throw error;
    }

    revalidatePath('/admins');
    return good(`Now ${role}.`);
  });
}

/* ------------------------------------------------------------------ *
 * stores — gap #: stock nobody was watching
 * ------------------------------------------------------------------ */

export async function setProductStock(productId: string, stock: number): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('store.write');
      const value = Math.round(stock);
      if (!Number.isFinite(value) || value < 0) return bad(ERR.BAD_AMOUNT);

      /* The out-of-stock clock — started when the count reaches zero, cleared
         the moment it does not — moved with the write. Keeping a copy of that
         rule here would be a second answer to how old an alarm is. */
      await post(`/products/${productId}/stock`, { stock: value });

      revalidatePath('/stores');
      return good('Stock updated.');
    }),
  );
}

export async function toggleProductActive(productId: string): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('store.write');

      /* The flip happens inside the document, so the state that comes back is
         the one that landed — not the one a read-then-write assumed. The empty
         body is not decoration: the client always sends a JSON content type,
         and Fastify refuses that header with nothing behind it. */
      const out = await post<{ active: boolean }>(`/products/${productId}/toggle`, {});

      revalidatePath('/stores');
      return good(out.active ? 'Listed.' : 'Delisted.');
    }),
  );
}

export async function toggleStoreOpen(storeId: string): Promise<ActionResult> {
  return guard(() =>
    attempt(async () => {
      await requireCapability('store.write');

      const out = await post<{ isOpen: boolean }>(`/stores/${storeId}/toggle`, {});

      revalidatePath('/stores');
      return good(out.isOpen ? 'Shop open.' : 'Shop closed.');
    }),
  );
}
