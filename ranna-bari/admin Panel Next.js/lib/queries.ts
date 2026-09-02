import 'server-only';

import { BackendError, get } from './backend';
import { db } from './db';
import { getSettings } from './settings';
import { dayKey } from './format';
import type { FoldedAccount } from './domain';

/**
 * The reads the dashboard and the health boards are assembled from.
 *
 * They live together because most of them are the same question asked of
 * different columns — "what is waiting on a person" — and keeping them in one
 * file makes it obvious when two screens disagree about what "waiting" means.
 *
 * The counters and the reconciliation state come from `backend-node`. The
 * money aggregates below it do not: nothing on the admin API folds a GMV
 * series or a per-system split, and `/orders` pages rows rather than
 * aggregating them, so those three helpers still read the panel's own
 * database. Each says so at its head.
 */

const DAY = 86_400_000;

/* ------------------------------------------------------------------ *
 * shapes the backend answers with
 * ------------------------------------------------------------------ */

export type Balances = Record<FoldedAccount, number>;

/** What `reconcile()` folds to: what is there, what should be, and the gap. */
export type Books = {
  balances: Balances;
  totals: Record<string, number>;
  expected: Balances;
  drift: Balances;
};

type OverviewResponse = {
  balances: Balances;
  books: Books;
  attention: {
    kyc: number;
    disputes: number;
    escrowAged: number;
    preorders: number;
    stockZero: number;
    reviewsFlagged: number;
  };
  escrow: {
    aging: { bucket: string; amount: number; overdue: boolean }[];
    count: number;
  };
};

export type DeadRequest = {
  id: string;
  title: string;
  area: string | null;
  budget: number | null;
  createdAt: string;
  reached: number;
};

/**
 * A total off a board this operator's role may not be allowed to open.
 *
 * The dashboard is the one screen every role can see, but the queues it links
 * to are not — a support agent has no `ledger.read`, so `requirePage` would
 * bounce them straight back off /topups. A 403 here is that same refusal
 * arriving one screen earlier, so the row is left off rather than taking the
 * whole page down. Anything else is a real fault and throws.
 */
async function totalOrForbidden(path: string): Promise<number | null> {
  try {
    const { total } = await get<{ total: number }>(path);
    return total;
  } catch (error) {
    if (error instanceof BackendError && error.status === 403) return null;
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * the dashboard's counters
 * ------------------------------------------------------------------ */

/**
 * Balances, the books, and everything currently waiting on a human.
 *
 * This is the list the dashboard leads with, because an operator opening the
 * panel is asking one question — what needs me — and every other number on
 * the page is context for it.
 *
 * `/overview` carries six of the eight counts. The other two are one row's
 * worth of `total` off boards that already exist, which is cheaper than
 * asking the overview to grow two more aggregates that could then disagree
 * with the lists behind them.
 */
export async function overview() {
  const [core, staleMeals, orphanTopups] = await Promise.all([
    get<OverviewResponse>('/overview'),
    totalOrForbidden('/meals?view=stale&take=1'),
    totalOrForbidden('/topups?state=orphan&take=1'),
  ]);

  return {
    balances: core.balances,
    books: core.books,
    attention: {
      kycPending: core.attention.kyc,
      disputesOpen: core.attention.disputes,
      escrowAged: core.attention.escrowAged,
      preordersWaiting: core.attention.preorders,
      staleMeals,
      stockZero: core.attention.stockZero,
      orphanTopups,
      reviewsFlagged: core.attention.reviewsFlagged,
    },
    /* Bucketed by the database over every held order, rather than by the page
       over the first hundred it could fetch. */
    escrow: core.escrow ?? { aging: [], count: 0 },
  };
}

/**
 * Requests whose broadcast reached nobody — a coverage bug, not a quiet day.
 *
 * `total` rather than the row count, because the card shows a handful and the
 * attention line has to name the whole pile.
 */
export async function deadBroadcasts(take = 6) {
  try {
    const out = await get<{ requests: DeadRequest[]; total: number }>(
      `/requests?view=dead&take=${take}`,
    );
    return { rows: out.requests, total: out.total as number | null };
  } catch (error) {
    // `request.read` is no part of finance, and /requests would refuse them
    // too. Same reasoning as totalOrForbidden.
    if (error instanceof BackendError && error.status === 403) {
      return { rows: [] as DeadRequest[], total: null };
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * money aggregates — still on the panel's database
 * ------------------------------------------------------------------ */

/**
 * Revenue is the platform's cut, not GMV. GMV is what customers paid.
 *
 * Still local: the admin API has no aggregate over orders. `/overview` folds
 * balances, not turnover, and `/orders` pages at 100 rows, so thirty days of
 * GMV cannot be assembled from it honestly. Wanted: a `GET /reports/money`
 * carrying gmv, order count, posted commission and the per-kind split for a
 * window.
 */
export async function moneyOverview(days = 30) {
  const since = new Date(Date.now() - days * DAY);
  const settings = await getSettings();

  try {
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
      db.order.aggregate({
        where: { kind: 'cod', status: 'delivered', createdAt: { gte: since } },
        _sum: { subtotal: true },
      }),
    ]);

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
  } catch {
    return { gmv: 0, orders: 0, commission: 0, codCommission: 0, revenue: 0, byKind: [] };
  }
}

/**
 * GMV per day for the last `days`, oldest first, gaps filled with zero.
 *
 * Still local, for the same reason as `moneyOverview` — and this one needs
 * every order in the window, which is thirty pages of `/orders` at best.
 * Wanted: a `GET /reports/gmv?days=` returning the bucketed series.
 */
export async function dailySeries(days = 30) {
  const since = new Date(Date.now() - days * DAY);
  const buckets = new Map<string, { day: string; gmv: number; orders: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * DAY));
    buckets.set(key, { day: key, gmv: 0, orders: 0 });
  }

  try {
    const orders = await db.order.findMany({
      where: { createdAt: { gte: since }, status: { notIn: ['cancelled', 'rejected'] } },
      select: { createdAt: true, amount: true, kind: true },
    });

    for (const order of orders) {
      const key = dayKey(order.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.gmv += order.amount;
      bucket.orders += 1;
    }
  } catch {
    // DB unavailable — return empty series
  }

  return Array.from(buckets.values());
}

/**
 * What is happening right now.
 *
 * Still local. Only one of the four is answerable over HTTP —
 * `/requests?status=open` carries a total — and `/kitchens` has no `isOpen`
 * filter, `/stores` has none either, and `/orders` takes a single status
 * where this needs eight. Splitting one coherent question across two stores
 * to migrate a quarter of it would make the card harder to trust, not
 * easier. Wanted: a `live` block on `/overview`.
 */
export async function liveCounts() {
  try {
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
  } catch {
    return { inFlight: 0, kitchensOpen: 0, storesOpen: 0, openRequests: 0 };
  }
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
