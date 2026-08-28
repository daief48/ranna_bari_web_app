import 'server-only';

import { db } from './db';
import { getSettings } from './settings';
import { dayKey } from './format';

/**
 * The reads the dashboard and the health boards are assembled from.
 *
 * They live together because most of them are the same question asked of
 * different columns — "what is waiting on a person" — and keeping them in one
 * file makes it obvious when two screens disagree about what "waiting" means.
 */

const DAY = 86_400_000;

/** Revenue is the platform's cut, not GMV. GMV is what customers paid. */
export async function moneyOverview(days = 30) {
  const since = new Date(Date.now() - days * DAY);

  const [gmvRow, commissionRow, byKind, codRow] = await Promise.all([
    db.order.aggregate({
      where: { createdAt: { gte: since }, status: { notIn: ['cancelled', 'rejected'] } },
      _sum: { amount: true },
      _count: true,
    }),
    db.ledgerEntry.aggregate({
      where: { kind: 'commission', at: { gte: since } },
      _sum: { amount: true },
    }),
    db.order.groupBy({
      by: ['kind'],
      where: { createdAt: { gte: since }, status: { notIn: ['cancelled', 'rejected'] } },
      _sum: { amount: true },
      _count: true,
    }),
    /* COD never reaches the ledger — the rider takes cash — so the platform's
       cut on it is implied by the rate rather than posted. Counted separately
       so "revenue" is not quietly understated. */
    db.order.aggregate({
      where: { kind: 'cod', status: 'delivered', createdAt: { gte: since } },
      _sum: { subtotal: true },
    }),
  ]);

  const settings = await getSettings();
  const codCommission = Math.round((codRow._sum.subtotal ?? 0) * settings.commissionCod);

  return {
    gmv: gmvRow._sum.amount ?? 0,
    orders: gmvRow._count,
    commission: commissionRow._sum.amount ?? 0,
    codCommission,
    revenue: (commissionRow._sum.amount ?? 0) + codCommission,
    byKind: byKind.map((row) => ({
      kind: row.kind,
      amount: row._sum.amount ?? 0,
      count: row._count,
    })),
  };
}

/** GMV per day for the last `days`, oldest first, gaps filled with zero. */
export async function dailySeries(days = 30) {
  const since = new Date(Date.now() - days * DAY);
  const orders = await db.order.findMany({
    where: { createdAt: { gte: since }, status: { notIn: ['cancelled', 'rejected'] } },
    select: { createdAt: true, amount: true, kind: true },
  });

  const buckets = new Map<string, { day: string; gmv: number; orders: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * DAY));
    buckets.set(key, { day: key, gmv: 0, orders: 0 });
  }

  for (const order of orders) {
    const key = dayKey(order.createdAt);
    const bucket = buckets.get(key);
    // An order older than the window can slip in on a timezone boundary.
    if (!bucket) continue;
    bucket.gmv += order.amount;
    bucket.orders += 1;
  }

  return Array.from(buckets.values());
}

/**
 * Everything currently waiting on a human.
 *
 * This is the list the dashboard leads with, because an operator opening the
 * panel is asking one question — what needs me — and every other number on
 * the page is context for it.
 */
export async function attentionCounts() {
  const settings = await getSettings();
  const escrowCutoff = new Date(Date.now() - settings.escrowAutoReleaseDays * DAY);
  const stockCutoff = new Date(Date.now() - settings.stockAlarmDays * DAY);
  const today = dayKey();

  const [
    kycPending,
    disputesOpen,
    escrowAged,
    preordersWaiting,
    staleMeals,
    stockZero,
    orphanTopups,
    reviewsFlagged,
  ] = await Promise.all([
    db.kitchen.count({ where: { kycStatus: 'pending' } }),
    db.dispute.count({ where: { status: { in: ['open', 'investigating'] } } }),
    db.order.count({
      where: { payment: 'held', status: 'delivered', deliveredAt: { lt: escrowCutoff } },
    }),
    db.order.count({ where: { status: 'pending', preorder: true } }),
    /* A meal still open for orders whose serve date has already passed. The
       app has no sweeper, so in production these accumulate silently. */
    db.meal.count({ where: { status: 'published', serveDate: { lt: today } } }),
    db.product.count({
      where: { active: true, stock: 0, outOfStockSince: { lt: stockCutoff } },
    }),
    db.topUp.count({ where: { reconciled: 'orphan' } }),
    db.review.count({ where: { hidden: false, rating: 1 } }),
  ]);

  return {
    kycPending,
    disputesOpen,
    escrowAged,
    preordersWaiting,
    staleMeals,
    stockZero,
    orphanTopups,
    reviewsFlagged,
  };
}

/** Requests whose broadcast reached nobody — a coverage bug, not a quiet day. */
export async function deadBroadcasts() {
  const open = await db.request.findMany({
    where: { status: 'open' },
    include: { _count: { select: { offers: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return open.filter((r) => r._count.offers === 0);
}

export async function liveCounts() {
  const [inFlight, kitchensOpen, storesOpen, openRequests] = await Promise.all([
    db.order.count({
      where: {
        status: { in: ['confirmed', 'preparing', 'ready', 'delivering', 'accepted', 'cooking', 'on_the_way', 'placed'] },
      },
    }),
    db.kitchen.count({ where: { isOpen: true, suspended: false } }),
    db.store.count({ where: { isOpen: true } }),
    db.request.count({ where: { status: 'open' } }),
  ]);
  return { inFlight, kitchensOpen, storesOpen, openRequests };
}

/* ------------------------------------------------------------------ *
 * list paging
 * ------------------------------------------------------------------ */

export const PAGE_SIZE = 25;

export function paging(searchParams: Record<string, string | undefined>) {
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  return { page, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));
