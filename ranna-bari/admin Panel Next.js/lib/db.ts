import path from 'path';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  // __dirname here resolves to the directory of this compiled module.
  // Using an absolute path ensures Prisma can find dev.db both locally
  // and inside Netlify's serverless lambda (where CWD is unpredictable).
  const dbPath = path.resolve(__dirname, '../dev.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
}


/**
 * One client per process. Next's dev server re-evaluates modules on every
 * edit, and a fresh PrismaClient each time exhausts the connection pool
 * within a minute of working, so it is parked on globalThis.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  appendOnlyApplied?: boolean;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/**
 * The append-only guards, as executable statements.
 *
 * They live here rather than being parsed out of `prisma/append-only.sql`
 * because a trigger body contains its own semicolons and splitting SQL on `;`
 * shreds it. The .sql file is kept alongside as the Postgres reference.
 */
const APPEND_ONLY = [
  `DROP TRIGGER IF EXISTS ledger_no_update`,
  `CREATE TRIGGER ledger_no_update BEFORE UPDATE ON "LedgerEntry"
     BEGIN SELECT RAISE(ABORT, 'ledger-append-only: post a reversing entry instead of updating one'); END`,
  `DROP TRIGGER IF EXISTS ledger_no_delete`,
  `CREATE TRIGGER ledger_no_delete BEFORE DELETE ON "LedgerEntry"
     BEGIN SELECT RAISE(ABORT, 'ledger-append-only: post a reversing entry instead of deleting one'); END`,
  `DROP TRIGGER IF EXISTS audit_no_update`,
  `CREATE TRIGGER audit_no_update BEFORE UPDATE ON "AuditLog"
     BEGIN SELECT RAISE(ABORT, 'audit-append-only: an audit row cannot be updated'); END`,
  `DROP TRIGGER IF EXISTS audit_no_delete`,
  `CREATE TRIGGER audit_no_delete BEFORE DELETE ON "AuditLog"
     BEGIN SELECT RAISE(ABORT, 'audit-append-only: an audit row cannot be deleted'); END`,
];

/**
 * Install the append-only triggers.
 *
 * `prisma db push` rebuilds the schema and drops triggers with it, so this
 * re-applies rather than assuming a migration ran. Every statement is
 * DROP IF EXISTS followed by CREATE, so it is safe to call repeatedly.
 */
export async function ensureAppendOnly() {
  if (globalForPrisma.appendOnlyApplied) return;
  for (const statement of APPEND_ONLY) {
    await db.$executeRawUnsafe(statement);
  }
  globalForPrisma.appendOnlyApplied = true;
}
