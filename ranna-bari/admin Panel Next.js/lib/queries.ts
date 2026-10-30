import 'server-only';

import { BackendError, get } from './backend';
import type { FoldedAccount } from './domain';

/**
 * The reads the dashboard and the health boards are assembled from.
 *
 * They live together because most of them are the same question asked of
 * different columns — "what is waiting on a person" — and keeping them in one
 * file makes it obvious when two screens disagree about what "waiting" means.
 *
 * Everything here comes from `backend-node`. The money aggregates — GMV,
 * the per-system split, the daily series, the live counts — used to be read
 * from the panel's own SQLite, which held a different set of orders under
 * different ids and so drew a chart of a database nobody was ordering from.
 * `GET /dashboard` folds them in Mongo now, over the orders the app writes.
 */

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
 * `/overview` carries six of the seven counts. The last is one row's worth of
 * `total` off a board that already exists, which is cheaper than asking the
 * overview to grow another aggregate that could then disagree with the list
 * behind it.
 *
 * There was an eighth — meals left open past their serve date. `fa27cc4`
 * replaced the Meal collection with the meal-plan model and deleted the admin
 * `/meals` endpoints with it, so this asked for a route that no longer
 * answers. A 404 is not a 403, `totalOrForbidden` rethrew it exactly as it is
 * documented to, and the one screen every role can see died on a count that
 * was one of eight. The count is gone rather than caught: the board it linked
 * to is gone too, and a dashboard row pointing at a dead board is worse than
 * no row.
 */
export async function overview() {
  const [core, orphanTopups] = await Promise.all([
    get<OverviewResponse>('/overview'),
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
 * money aggregates — `GET /dashboard`
 * ------------------------------------------------------------------ */

export type DashboardMoney = {
  /** What customers paid, over orders that were not cancelled. */
  gmv: number;
  orders: number;
  /** Commission the ledger actually posted. */
  commission: number;
  /** What cash-on-delivery implies but has not posted — the rider has the cash. */
  codCommission: number;
  revenue: number;
  byKind: { kind: string; amount: number; count: number }[];
};

export type DashboardSeries = { day: string; gmv: number; orders: number }[];

export type DashboardLive = {
  inFlight: number;
  kitchensOpen: number;
  storesOpen: number;
  openRequests: number;
};

/**
 * Revenue is the platform's cut, not GMV; GMV is what customers paid; the
 * series is one bucket per Dhaka day with the empty days present; `live` is
 * what is happening right now.
 *
 * One request for all three because they are one window asked three ways,
 * and the backend groups them in Mongo — a busy month is tens of thousands of
 * orders and the chart wants thirty numbers.
 */
export async function dashboard(days = 30): Promise<{
  money: DashboardMoney;
  series: DashboardSeries;
  live: DashboardLive;
}> {
  return get<{ money: DashboardMoney; series: DashboardSeries; live: DashboardLive }>(
    `/dashboard?days=${days}`,
  );
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

/* ------------------------------------------------------------------ *
 * filtering a list the page already holds
 * ------------------------------------------------------------------ */

/**
 * Match a row against a typed query, over the fields worth searching.
 *
 * For the handful of pages whose endpoint returns a whole bounded list rather
 * than a filtered page — operators, abandoned baskets, coverage gaps, payouts
 * owed, pre-orders. Those tables were the only ones on the console with no
 * way to narrow them at all, and adding a `q` parameter to five backend
 * routes to filter at most a few hundred rows the page is already holding
 * would be the wrong trade.
 *
 * Case- and space-insensitive, and matches on *any* field rather than all:
 * somebody typing into a search box is naming one thing they remember, not
 * building a conjunction.
 *
 * Null and undefined are skipped rather than stringified — `String(null)`
 * makes every row with a missing name match the query "null".
 */
export function matches(query: string, ...fields: unknown[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return fields.some((field) => {
    if (field == null) return false;
    if (Array.isArray(field)) return field.some((f) => matches(q, f));
    return String(field).toLowerCase().includes(q);
  });
}

/** The `q` param, trimmed. Empty string when absent, which `matches` passes. */
export const queryOf = (searchParams: Record<string, string | undefined>) =>
  (searchParams.q ?? '').trim();
