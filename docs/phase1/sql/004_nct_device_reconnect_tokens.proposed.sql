-- PROPOSED ONLY; NOT APPLIED. Explicitly bind one-time tokens to existing devices.
-- A normal registration token must never replace an installation's identity.
BEGIN;
CREATE TABLE pos.device_reconnect_tokens (
  activation_token_id text PRIMARY KEY REFERENCES pos.pos_activation_tokens(id) ON DELETE CASCADE,
  device_id varchar(36) NOT NULL REFERENCES pos.pos_devices(id) ON DELETE CASCADE
);
CREATE INDEX nct_reconnect_device_idx ON pos.device_reconnect_tokens(device_id);
COMMIT;
