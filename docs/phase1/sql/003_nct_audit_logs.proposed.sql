-- PROPOSED ONLY; NOT APPLIED.
-- Staging already has pos.pos_audit_logs. Reuse it; no new table is required.
-- Schema reference for review (not an instruction to recreate an existing table):
-- id text PRIMARY KEY; deviceId text NULL; cashierUserId text NULL;
-- action varchar(100); entityType varchar(50); entityId varchar(100);
-- details jsonb; ipAddress varchar(45); createdAt timestamp without time zone.
-- details stores branchId, cashierName, description, metadata, source='NCT_POS'.
-- id is the client UUID, so replaying the same audit event is idempotent.
-- createdAt is the original occurrence time (UTC); delivery may be later.
-- Preserve events and avoid placing credentials/payment secrets in details.

-- Optional investigation indexes; existing single-column indexes remain useful.
CREATE INDEX nct_pos_audit_branch_date_idx
  ON pos.pos_audit_logs ((details->>'branchId'), "createdAt");
CREATE INDEX nct_pos_audit_target_date_idx
  ON pos.pos_audit_logs ("entityType", "entityId", "createdAt");
