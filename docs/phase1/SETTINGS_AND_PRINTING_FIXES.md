# Settings visibility, barcode printing and monetary display

These source changes follow commit `77bfd88`. The owner requested that APK building remain on hold. No APK containing these changes has been built.

## Super Admin settings

The Settings menu hid Users and Roles & Permissions for every NCT device before considering Super Admin access. Permission enforcement already allowed the built-in account, so a permission-only check missed this separate visibility restriction.

Super Admin can now see all 17 Settings sections. NCT Users shows the assigned OMS employees and the separate built-in device account. Roles & Permissions shows all 14 built-in grants and the actual cached grants for assigned OMS roles. Refresh from OMS refreshes the employee directory; offline or failed refreshes retain the saved data. Manage in OMS opens the configured OMS `/pos` page without passing device credentials in the URL. NCT user creation, credentials and role changes remain managed by OMS. No employee was promoted and no server grants were changed.

Files: `src/app/(pos)/settings.tsx`, `src/components/ui/nct-access-settings.tsx`, `src/lib/permissions/settings-access.ts`, `tests/phase1-settings-access.cjs`.

## Missing printed barcodes on newer products

Read-only staging checks confirmed the transferred products have barcodes and the inventory/transfer APIs include them. The clarified issue is physical printing, rather than missing product metadata.

The native printer used Code 128B with a fixed two-dot module width. The newer barcode `NCTTPP(5U1015-2GOT` requires 466 dots with that command, exceeding the existing 384-dot print-area assumption. Shorter older codes can fit. Epson documents that an oversized barcode cannot be specified with its native barcode command: https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lk.html . This explains the observed old/new difference, but the physical printer has not been tested by the implementation agent.

The printer now renders Code 128B into ESC/POS raster data with integer scaling, checksum and quiet zones. The same newer code fits into a 256-dot raster, preserving its value. Short codes retain two-dot modules where they fit; longer codes use one-dot modules. Unsupported characters or codes too long to fit are rejected explicitly. Product-label and receipt barcode printing use this common native writer. The success alert says Barcode Sent because a completed Bluetooth write does not confirm physical output.

Files: `plugins/bluetooth-printer/Code128Raster.java`, `plugins/bluetooth-printer/BluetoothPrinterModule.kt`, `plugins/with-bluetooth-printer.js`, `src/app/(pos)/products.tsx`, `tests/printing-and-money.cjs`.

The next APK must regenerate the Android plugin sources, including the new Java helper. This is a native change; the existing APK does not include it.

## Monetary commas

`src/lib/formatting/money.ts` adds thousands separators while preserving the existing two-decimal rounding. Monetary displays in Sales, Products, Returns, Customers, receipt previews/designer, receipt HTML, stored receipt text and thermal receipts/end-of-day output now use it. For example, 1000 displays as `1,000.00`. Dashboard/report views already used grouped formatting.

Calculations, API amounts, editable numeric inputs, tax-rate editing, quantities and identifiers are unchanged. No schema or dependency changes are needed.

## Verification and human checks

- POS TypeScript checking passed.
- `node tests/phase1-settings-access.cjs`: all 17 real section definitions, restricted-user access, all 14 built-in permissions, and employee/role/cache isolation using the actual local SQLite schema.
- Isolated React Native Web browser fixtures: desktop/mobile users and permissions, offline/error retention, successful refresh, correct OMS link, and ordinary-role isolation passed. No real device or OMS grants were modified by those fixtures.
- `node tests/printing-and-money.cjs`: compiles only the pure Java raster helper with the existing JDK, verifies encoded pixels/checksum against the existing Code 128 encoder, tests older/newer/braced/long barcodes, width limits and invalid data. Also checks grouped monetary values, unchanged rounding/calculations and fixed-width receipt text. This test does not build an APK.

When an updated APK is authorized and installed:

1. Sign in as the built-in Super Admin, open Users and Roles & Permissions, and verify all Settings sections and all 14 built-in grants. Refresh while online and offline; check employee names and ordinary role permissions.
2. Print an older short barcode and the newer transferred product's barcode. Verify both contain visible bars and readable text; scan each with the POS scanner and confirm the exact matching product. Test a receipt barcode as well.
3. Check values above 1,000 in Products, checkout totals/tender/change, receipts, customer totals and returns. Compare previews and physical receipts against the stored amounts.

Risks/open: physical barcode quality and scanning remain unverified. No APK was built, no OMS deployment was performed, and no staging/production rows or schema were changed for these fixes.
