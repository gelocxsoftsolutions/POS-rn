-- PROPOSED ONLY; NOT APPLIED. NCT backup metadata is separate from Dealership.
BEGIN;
CREATE TABLE pos.database_backups (
  id uuid PRIMARY KEY,
  device_id varchar(36) NOT NULL REFERENCES pos.pos_devices(id) ON DELETE RESTRICT,
  business_id text NOT NULL,
  client_key text NOT NULL,
  object_key text NOT NULL UNIQUE,
  content_hash char(64) NOT NULL,
  database_hash char(64) NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 33554432),
  schema_version integer NOT NULL,
  source varchar(20) NOT NULL CHECK (source IN ('MANUAL','AUTOMATIC','LEGACY')),
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY')),
  source_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, client_key)
);
CREATE INDEX nct_database_backup_device_date_idx ON pos.database_backups(device_id, source_created_at DESC);
COMMIT;
