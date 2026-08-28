/**
 * SQLite has no array or JSON column, so those fields are stored as JSON
 * strings. These mappers are the only place that knows it.
 *
 * Everything above this line works in the app's own shapes — `tags` is a
 * `string[]`, `history` is an array of stamps — which is what keeps the API
 * responses byte-identical to what the Expo client already parses.
 *
 * On Postgres these become `Json` / `String[]` columns and the mappers
 * collapse to identity functions.
 */

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    const value = JSON.parse(raw);
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export const toJson = (value: unknown) => JSON.stringify(value ?? null);

/* ------------------------------------------------------------------ *
 * shapes the app already knows
 * ------------------------------------------------------------------ */

export type StatusStamp = { status: string; at: string; by?: string };
export type PriceStamp = { by: 'cook' | 'customer'; amount: number; at: string };
export type OrderLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string;
  option?: string | null;
  lineTotal?: number;
};
export type Address = {
  label?: string;
  line?: string;
  area?: string;
  instructions?: string;
} | null;
export type ProductOption = { label: string; price: number };
export type DisputeNote = { at: string; by: string; text: string };

/* ------------------------------------------------------------------ *
 * row -> domain
 * ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

export function mapKitchen<T extends Row>(row: T) {
  return { ...row, tags: parseJson<string[]>(row.tags as string, []) };
}

export function mapDish<T extends Row>(row: T) {
  return { ...row, tags: parseJson<string[]>(row.tags as string, []) };
}

export function mapMeal<T extends Row>(row: T) {
  return { ...row, interested: parseJson<string[]>(row.interested as string, []) };
}

export function mapProduct<T extends Row>(row: T) {
  return {
    ...row,
    images: parseJson<string[]>(row.images as string, []),
    options: parseJson<ProductOption[] | null>(row.options as string, null),
  };
}

export function mapRequest<T extends Row>(row: T) {
  return { ...row, eligible: parseJson<string[]>(row.eligible as string, []) };
}

export function mapOffer<T extends Row>(row: T) {
  return { ...row, history: parseJson<PriceStamp[]>(row.history as string, []) };
}

export function mapOrder<T extends Row>(row: T) {
  return {
    ...row,
    lines: parseJson<OrderLine[]>(row.lines as string, []),
    address: parseJson<Address>(row.address as string, null),
    history: parseJson<StatusStamp[]>(row.history as string, []),
  };
}

export function mapDispute<T extends Row>(row: T) {
  return { ...row, notes: parseJson<DisputeNote[]>(row.notes as string, []) };
}

export function mapAudit<T extends Row>(row: T) {
  return {
    ...row,
    before: parseJson<unknown>(row.before as string, null),
    after: parseJson<unknown>(row.after as string, null),
  };
}

export type MappedOrder = ReturnType<typeof mapOrder>;
export type MappedKitchen = ReturnType<typeof mapKitchen>;

/** Append one stamp to a JSON history column. */
export function pushHistory(raw: string, stamp: StatusStamp): string {
  const list = parseJson<StatusStamp[]>(raw, []);
  return toJson([...list, stamp]);
}

/** Append one price to an offer's history. Never rewrites what is there. */
export function pushPrice(raw: string, stamp: PriceStamp): string {
  const list = parseJson<PriceStamp[]>(raw, []);
  return toJson([...list, stamp]);
}
