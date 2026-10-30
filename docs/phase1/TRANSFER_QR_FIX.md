# Transfer QR confirmation fix

The NCT action-audit proxy wrapped `parseTransferQr()` in an async function. The scanner calls this parser synchronously, so it received a Promise and read `undefined` for the transfer number. This caused valid OMS transfer QRs to fail confirmation.

Pure parsing methods now bypass the business-operation audit wrapper, preserving their synchronous return values. Transfer receipt operations still use the existing audit and OMS validation paths. Device/branch checks and receipt deduplication are unchanged.

Files: `src/lib/services/action-audit.ts`, `tests/phase1-audit.cjs`.

Verification: `node tests/phase1-audit.cjs` checks synchronous transfer-number access, malformed input, no parsing audit event, and existing operation auditing. POS TypeScript checking passed. These tests do not exercise a native camera or a live transfer receipt.

Device acceptance:

1. Install a POS build containing this fix. An older APK will retain the bug even after OMS deployment.
2. Open an approved transfer for this device and complete its quantity checklist. Scan that transfer's OMS QR; it must retain its transfer number and proceed to receipt validation.
3. Scan a different transfer QR and malformed/non-transfer QR; reject both without changing stock.
4. Retry after a lost response and confirm one receipt/stock effect. Check the OMS status and POS stock, including shortage notes if applicable.

No POS dependencies or database schema changes are needed for this correction. OMS UI and employee-access setup are separate staging changes.
