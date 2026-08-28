'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { requireCapability } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import { ERR, ROLES } from '@/lib/domain';
import { saveSetting, invalidateSettings, type PlatformSettings } from '@/lib/settings';
import { good, bad, guard, type ActionResult } from './shared';

/**
 * Configuration, content and access.
 *
 * Everything here replaces a constant that used to live inside the mobile
 * bundle, where the only way to change it was to ship a new build to the app
 * stores. A price you can only change by shipping is not a price, it is a
 * release.
 */

/* ------------------------------------------------------------------ *
 * settings — gaps #3 and #7
 * ------------------------------------------------------------------ */

export async function updateSetting(
  key: keyof PlatformSettings,
  value: number,
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('config.write');
    if (!Number.isFinite(value) || value < 0) return bad(ERR.BAD_AMOUNT);
    // A commission over 100% would pay the cook a negative amount.
    if (key.startsWith('commission') && value > 1) {
      return bad('A commission rate is a fraction — 0.15 is fifteen per cent.');
    }

    const existing = await db.setting.findUnique({ where: { key } });
    await saveSetting(key, value, user.email);

    await audit(user, {
      action: 'config.setting',
      targetType: 'Setting',
      targetId: key,
      summary: `${key} → ${value}`,
      before: existing ? { value: JSON.parse(existing.value) } : null,
      after: { value },
    });

    revalidatePath('/settings');
    revalidatePath('/');
    return good('Saved.');
  });
}

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
  return guard(async () => {
    const user = await requireCapability('config.write');
    const clean = name.trim();
    if (!clean) return bad(ERR.NAME_REQUIRED);

    if (id) {
      const before = await db.zone.findUnique({ where: { id } });
      await db.zone.update({
        where: { id },
        data: { name: clean, deliveryFee, active },
      });
      await audit(user, {
        action: 'config.zone.update',
        targetType: 'Zone',
        targetId: id,
        summary: `${clean}${deliveryFee != null ? ` — ৳${deliveryFee} delivery` : ''}`,
        before: before ? { name: before.name, deliveryFee: before.deliveryFee, active: before.active } : null,
        after: { name: clean, deliveryFee, active },
      });
    } else {
      const duplicate = await db.zone.findUnique({ where: { name: clean } });
      if (duplicate) return bad('That zone already exists.');

      const count = await db.zone.count();
      const created = await db.zone.create({
        data: { name: clean, deliveryFee, active, order: count },
      });
      await audit(user, {
        action: 'config.zone.create',
        targetType: 'Zone',
        targetId: created.id,
        summary: clean,
        after: { name: clean, deliveryFee, active },
      });
    }

    revalidatePath('/settings');
    return good('Saved.');
  });
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
  return guard(async () => {
    const user = await requireCapability('config.write');
    const clean = label.trim();
    if (!clean) return bad(ERR.NAME_REQUIRED);

    if (id) {
      const before = await db.taxonomyCategory.findUnique({ where: { id } });
      await db.taxonomyCategory.update({
        where: { id },
        // `key` is deliberately not editable: it is the tag stored on every
        // dish and kitchen, so changing it would orphan the filter.
        data: { label: clean, emoji: emoji.trim() },
      });
      await audit(user, {
        action: 'config.category.update',
        targetType: 'TaxonomyCategory',
        targetId: id,
        summary: `${before?.key} → "${clean}"`,
        before: before ? { label: before.label, emoji: before.emoji } : null,
        after: { label: clean, emoji },
      });
    } else {
      const slug = (key ?? clean).trim().toLowerCase().replace(/\s+/g, '-');
      const duplicate = await db.taxonomyCategory.findUnique({ where: { key: slug } });
      if (duplicate) return bad(ERR.CATEGORY_IN_USE);

      const count = await db.taxonomyCategory.count();
      const created = await db.taxonomyCategory.create({
        data: { key: slug, label: clean, emoji: emoji.trim(), order: count },
      });
      await audit(user, {
        action: 'config.category.create',
        targetType: 'TaxonomyCategory',
        targetId: created.id,
        summary: `${slug} — "${clean}"`,
        after: { key: slug, label: clean, emoji },
      });
    }

    revalidatePath('/settings');
    return good('Saved.');
  });
}

/**
 * Retire a category rather than delete it.
 *
 * The key is written on dishes and kitchens as a tag. Deleting the row would
 * leave those tags pointing at nothing, and a filter that silently matches
 * zero results is worse than one that is visibly switched off.
 */
export async function retireCategory(id: string, retired: boolean): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('config.write');
    const before = await db.taxonomyCategory.findUnique({ where: { id } });
    if (!before) return bad('That category no longer exists.');

    await db.taxonomyCategory.update({ where: { id }, data: { retired } });
    await audit(user, {
      action: retired ? 'config.category.retire' : 'config.category.restore',
      targetType: 'TaxonomyCategory',
      targetId: id,
      summary: `${before.key} ${retired ? 'retired' : 'restored'}`,
      before: { retired: before.retired },
      after: { retired },
    });

    revalidatePath('/settings');
    return good(retired ? 'Retired.' : 'Back in the list.');
  });
}

export async function moveCategory(id: string, delta: number): Promise<ActionResult> {
  return guard(async () => {
    await requireCapability('config.write');
    const all = await db.taxonomyCategory.findMany({ orderBy: { order: 'asc' } });
    const index = all.findIndex((c) => c.id === id);
    if (index < 0) return bad('That category no longer exists.');

    const target = index + delta;
    if (target < 0 || target >= all.length) return good();

    const reordered = [...all];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    await db.$transaction(
      reordered.map((c, i) =>
        db.taxonomyCategory.update({ where: { id: c.id }, data: { order: i } }),
      ),
    );

    revalidatePath('/settings');
    return good();
  });
}

/* ------------------------------------------------------------------ *
 * reviews — gap #10
 * ------------------------------------------------------------------ */

/**
 * Hide or restore a review, and recompute the kitchen's score.
 *
 * A hidden review must not keep counting toward the rating, or hiding it
 * achieves nothing but removing the evidence.
 */
export async function moderateReview(
  reviewId: string,
  hidden: boolean,
  note: string,
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('review.moderate');
    const review = await db.review.findUnique({ where: { id: reviewId } });
    if (!review) return bad('That review no longer exists.');
    if (hidden && !note.trim()) return bad('Say why it is being hidden.');

    await db.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: reviewId },
        data: {
          hidden,
          hiddenBy: hidden ? user.email : null,
          hiddenAt: hidden ? new Date() : null,
          hiddenNote: hidden ? note.trim() : null,
        },
      });

      const visible = await tx.review.findMany({
        where: { kitchenId: review.kitchenId, hidden: false },
        select: { rating: true },
      });
      const count = visible.length;
      const average = count
        ? Math.round((visible.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
        : 0;

      await tx.kitchen.update({
        where: { id: review.kitchenId },
        // A kitchen with no visible reviews scores 0, which is what the app
        // renders as "New" rather than as a bad kitchen.
        data: { rating: average, reviewCount: count },
      });

      await audit(
        user,
        {
          action: hidden ? 'review.hide' : 'review.restore',
          targetType: 'Review',
          targetId: reviewId,
          summary: `${review.name} on ${review.kitchenId} — rating now ${average} over ${count}`,
          before: { hidden: review.hidden },
          after: { hidden, rating: average, reviewCount: count },
        },
        tx,
      );
    });

    revalidatePath('/reviews');
    return good(hidden ? 'Hidden, and the rating recomputed.' : 'Restored.');
  });
}

/* ------------------------------------------------------------------ *
 * broadcast — gap #12
 * ------------------------------------------------------------------ */

/**
 * Send a notification from the platform.
 *
 * The dedupe contract is the app's: a notification with the same key that is
 * still unread does not produce a second row. Keying on the broadcast rather
 * than on the text means re-wording a message does not defeat it.
 */
export async function broadcast(
  audience: 'customer' | 'cook',
  zone: string | null,
  title: string,
  body: string,
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('notification.broadcast');
    if (!title.trim() || !body.trim()) return bad('A broadcast needs a title and a body.');

    const key = `${audience}:broadcast:${title.trim().toLowerCase().replace(/\s+/g, '-')}`;

    const existing = await db.notification.findFirst({ where: { key, read: false } });
    if (existing) return bad('An unread broadcast with this title is already out.');

    const created = await db.notification.create({
      data: {
        key,
        audience,
        kind: 'broadcast',
        title: title.trim(),
        body: body.trim(),
        zone,
        broadcastBy: user.email,
      },
    });

    await audit(user, {
      action: 'notification.broadcast',
      targetType: 'Notification',
      targetId: created.id,
      summary: `to ${audience}${zone ? ` in ${zone}` : ''} — "${title.trim()}"`,
      after: { audience, zone, title: title.trim(), body: body.trim() },
    });

    revalidatePath('/notifications');
    return good(`Sent to ${audience}s${zone ? ` in ${zone}` : ''}.`);
  });
}

/* ------------------------------------------------------------------ *
 * admin users — gap: nobody could grant access either
 * ------------------------------------------------------------------ */

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

    const duplicate = await db.adminUser.findUnique({ where: { email: clean } });
    if (duplicate) return bad('That email already has an account.');

    const created = await db.adminUser.create({
      data: {
        email: clean,
        name: name.trim(),
        role,
        passwordHash: await hashPassword(password),
      },
    });

    await audit(user, {
      action: 'admin.create',
      targetType: 'AdminUser',
      targetId: created.id,
      summary: `${clean} as ${role}`,
      after: { email: clean, name: name.trim(), role },
    });

    revalidatePath('/admins');
    return good('Operator created.');
  });
}

export async function setAdminActive(adminId: string, active: boolean): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('*');
    const target = await db.adminUser.findUnique({ where: { id: adminId } });
    if (!target) return bad('That operator no longer exists.');
    if (target.id === user.sub) return bad('You cannot deactivate yourself.');

    await db.adminUser.update({ where: { id: adminId }, data: { active } });
    await audit(user, {
      action: active ? 'admin.activate' : 'admin.deactivate',
      targetType: 'AdminUser',
      targetId: adminId,
      summary: target.email,
      before: { active: target.active },
      after: { active },
    });

    revalidatePath('/admins');
    return good(active ? 'Reactivated.' : 'Deactivated — they cannot sign in.');
  });
}

export async function setAdminRole(adminId: string, role: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('*');
    if (!(ROLES as readonly string[]).includes(role)) return bad('Unknown role.');

    const target = await db.adminUser.findUnique({ where: { id: adminId } });
    if (!target) return bad('That operator no longer exists.');
    if (target.id === user.sub) return bad('You cannot change your own role.');

    await db.adminUser.update({ where: { id: adminId }, data: { role } });
    await audit(user, {
      action: 'admin.role',
      targetType: 'AdminUser',
      targetId: adminId,
      summary: `${target.email}: ${target.role} → ${role}`,
      before: { role: target.role },
      after: { role },
    });

    revalidatePath('/admins');
    return good(`Now ${role}.`);
  });
}

/* ------------------------------------------------------------------ *
 * stores — gap #: stock nobody was watching
 * ------------------------------------------------------------------ */

export async function setProductStock(productId: string, stock: number): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('store.write');
    const value = Math.round(stock);
    if (!Number.isFinite(value) || value < 0) return bad(ERR.BAD_AMOUNT);

    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) return bad(ERR.NO_PRODUCT);

    await db.product.update({
      where: { id: productId },
      data: {
        stock: value,
        // The clock only starts when stock reaches zero, and is cleared the
        // moment it does not — otherwise the ageing is measured from whenever
        // the row was last touched, which means nothing.
        outOfStockSince: value === 0 ? (product.outOfStockSince ?? new Date()) : null,
      },
    });

    await audit(user, {
      action: 'product.stock',
      targetType: 'Product',
      targetId: productId,
      summary: `${product.name}: ${product.stock} → ${value}`,
      before: { stock: product.stock },
      after: { stock: value },
    });

    revalidatePath('/stores');
    return good('Stock updated.');
  });
}

export async function toggleProductActive(productId: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('store.write');
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) return bad(ERR.NO_PRODUCT);

    await db.product.update({ where: { id: productId }, data: { active: !product.active } });
    await audit(user, {
      action: 'product.toggle',
      targetType: 'Product',
      targetId: productId,
      summary: `${product.name} ${product.active ? 'delisted' : 'relisted'}`,
      before: { active: product.active },
      after: { active: !product.active },
    });

    revalidatePath('/stores');
    return good(product.active ? 'Delisted.' : 'Listed.');
  });
}

export async function toggleStoreOpen(storeId: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('store.write');
    const store = await db.store.findUnique({ where: { id: storeId } });
    if (!store) return bad(ERR.NO_STORE);

    await db.store.update({ where: { id: storeId }, data: { isOpen: !store.isOpen } });
    await audit(user, {
      action: 'store.toggle',
      targetType: 'Store',
      targetId: storeId,
      summary: `${store.name} ${store.isOpen ? 'closed' : 'opened'}`,
      before: { isOpen: store.isOpen },
      after: { isOpen: !store.isOpen },
    });

    revalidatePath('/stores');
    return good(store.isOpen ? 'Shop closed.' : 'Shop open.');
  });
}
