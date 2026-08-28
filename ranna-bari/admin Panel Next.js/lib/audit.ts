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
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
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

/** Narrow a record down to the fields an audit diff should carry. */
export function pick<T extends object, K extends keyof T>(row: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = row[key];
  return out;
}
