# Configurable dealership POS platform

The application remains a single Expo/React Native POS backed by the existing local `expo-sqlite` database. Existing installations migrate to schema version 8 and default to `NCT_DEPENDENT`, preserving NCT behavior and records.

## Operating modes

- `NCT_DEPENDENT`: NCT catalog/inventory synchronization and the existing QR transfer workflow are enabled. Checkout still commits locally first.
- `INDEPENDENT`: local product variations, opening stock, receiving, adjustments, and device-scoped Code 128 identifiers are enabled. NCT catalog imports and transfer routes/services are disabled. EOD and backup uploads remain enabled.

Super administrators configure the mode under **Settings → Dealership Platform → Business & Branding**. Mode changes are audited. Pending synchronization blocks a mode change. Switching back to OMS-dependent mode requires a written stock-resolution note and explicit NCT variation mappings for independent variations with stock.

## Branding and receipts

Branding is stored in `StoreSettings` and mirrored to persisted device storage so it is available before login. Logos are copied into the app document directory, limited to PNG/JPEG/WebP files of at most 2 MB, and included in backup envelopes.

The receipt designer supports 58 mm and 80 mm output, header/footer messages, alignment, business-name emphasis, optional cashier/customer/payment fields, receipt barcode/QR visibility, live sample preview, reset, save, and test print. The same structured settings feed screen preview, HTML/system print, and Android ESC/POS output. Each completed sale stores its receipt-template version and JSON snapshot for historical reprints.

## Backup and EOD recovery

Closing an EOD from Reports or closing a shift creates two durable queue entries:

- `EndOfDay` → `POST /api/pos/dealership/end-of-day`
- `DatabaseBackup` → `POST /api/pos/dealership/backups`

Payloads carry `businessId`, `deviceId`, schema version, and an idempotency key. Backup payloads contain a SQLite serialization, SHA-256 checksum, record totals, and local branding assets. Jobs use the existing persistent retry queue and survive restarts. A restore is refused unless the target installation has no products, sales, or transfers; it validates format, schema version, checksum, business identity, and post-restore totals.

OMS must implement the two endpoints above, scope storage and idempotency by `businessId`, and return a stable backup reference. Device registration should return stable `businessId`, optional `businessName`/`posSystemName`, and `operatingMode`. Registration without these fields retains the existing NCT defaults.

## Validation

Run the repository contract checks on Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\dealership-platform.validation.ps1
```

Physical Bluetooth printer/scanner behavior still requires checks on supported hardware. Source validation does not constitute physical verification or tax/regulatory certification.
