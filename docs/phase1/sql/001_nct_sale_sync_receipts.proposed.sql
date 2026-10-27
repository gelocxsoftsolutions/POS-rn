-- PROPOSED ONLY. Do not apply without the owner's database-change approval.
-- Staging target only: nctalavera-system-staging, host port 5433.
-- The existing pos.pos_sales schema has no client receipt/device/branch identity.
-- Keep this mapping permanently: deleting it removes retry deduplication history.
BEGIN;
CREATE TABLE pos.sale_sync_receipts (
  device_id text NOT NULL,
  client_sale_id uuid NOT NULL,
  pos_sale_id integer NOT NULL UNIQUE REFERENCES pos.pos_sales(id),
  receipt_number varchar(100) NOT NULL,
  branch_id bigint NOT NULL,
  cashier_id text NOT NULL,
  cashier_name varchar(255) NOT NULL,
  payload_hash char(64) NOT NULL,
  subtotal numeric(10,2) NOT NULL CHECK (subtotal >= 0),
  discount numeric(10,2) NOT NULL CHECK (discount >= 0),
  tax numeric(10,2) NOT NULL CHECK (tax >= 0),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, client_sale_id),
  UNIQUE (device_id, receipt_number)
);
CREATE INDEX sale_sync_receipts_branch_date_idx
  ON pos.sale_sync_receipts(branch_id, occurred_at);
COMMIT;
