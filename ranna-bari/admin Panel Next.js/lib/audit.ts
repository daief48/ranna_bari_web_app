import 'server-only';

import { headers } from 'next/headers';
import type { Prisma } from '@prisma/client';

import { db } from './db';
import { toJson } from './mappers';
import type { Session } from './auth';

/**
 * Every state-changing action in the panel writes one of these.
 *
 * A money action without an audit row is an unattributable movement, which is
 * the same as no control at all. The table is append-only at the database
 * level (see lib/db.ts), so a row cannot be tidied away afterwards.
 */
export async function audit(
  actor: Session,
  entry: {
    action: string;
    targetType: string;
    targetId: string;
    summary?: string;
    before?: unknown;
    after?: unknown;
  },
  /** Pass the transaction client so the audit row lands or rolls back with the change. */
  tx: Prisma.TransactionClient | typeof db = db,
) {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = clientIp(h);
  } catch {
    /* Outside a request scope (a seed, a cron) there are no headers. */
  }

  await tx.auditLog.create({
    data: {
      actorId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      summary: entry.summary ?? '',
      before: entry.before === undefined ? null : toJson(entry.before),
      after: entry.after === undefined ? null : toJson(entry.after),
      ip,
    },
  });
}

/**
 * The address a request actually came from, as far as this panel can know.
 *
 * `x-forwarded-for` is a list the client gets to start: anybody can send
 * `x-forwarded-for: 1.2.3.4` and the first value is then whatever they typed,
 * so an audit row that read it was recording the attacker's choice of alibi.
 * Each proxy *appends* the address it saw, so the rightmost value is the one
 * written by the hop closest to us — the only one not under the client's
 * control. Netlify also sets `x-nf-client-connection-ip` from its own edge,
 * which is the same fact stated by the one party here we trust, so it wins.
 */
function clientIp(h: Headers): string | null {
  const edge = h.get('x-nf-client-connection-ip')?.trim();
  if (edge) return edge;

  const forwarded = h
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded?.length) return forwarded[forwarded.length - 1];

  return h.get('x-real-ip')?.trim() || null;
}

/** Narrow a record down to the fields an audit diff should carry. */
export function pick<T extends object, K extends keyof T>(row: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = row[key];
  return out;
}
