-- The ledger is append-only, and that is enforced by the database rather than
-- by convention. A correction is a new entry in the opposite direction; if a
-- code path tries to UPDATE or DELETE a ledger row the transaction dies here.
--
-- Applied by `lib/db.ts` on first connection, and by `prisma/seed.ts`.
-- On Postgres the equivalent is a BEFORE UPDATE OR DELETE trigger raising an
-- exception, plus REVOKE UPDATE, DELETE ON "LedgerEntry".

DROP TRIGGER IF EXISTS ledger_no_update;
CREATE TRIGGER ledger_no_update
BEFORE UPDATE ON "LedgerEntry"
BEGIN
  SELECT RAISE(ABORT, 'ledger-append-only: a ledger entry cannot be updated. Post a reversing entry instead.');
END;

DROP TRIGGER IF EXISTS ledger_no_delete;
CREATE TRIGGER ledger_no_delete
BEFORE DELETE ON "LedgerEntry"
BEGIN
  SELECT RAISE(ABORT, 'ledger-append-only: a ledger entry cannot be deleted. Post a reversing entry instead.');
END;

-- The audit log is evidence for every money action, so it is immutable too.
DROP TRIGGER IF EXISTS audit_no_update;
CREATE TRIGGER audit_no_update
BEFORE UPDATE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'audit-append-only: an audit row cannot be updated.');
END;

DROP TRIGGER IF EXISTS audit_no_delete;
CREATE TRIGGER audit_no_delete
BEFORE DELETE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'audit-append-only: an audit row cannot be deleted.');
END;
