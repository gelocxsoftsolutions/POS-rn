# Phase 1 changed files

This is the historical combined implementation inventory. The POS-only staging promotion excludes every `oms-staging/` path, `docs/phase1/sql/` and the listed OMS helper scripts. Those files remain on feature snapshot `84a7511`; entries below do not mean they are present or deployed in staging.

OMS paths under `oms-staging/` mirror the source copied into the sibling `nctalavera-system` development folder. Copies are versioned here because OMS changes must remain reviewable independently of OMS git history. No deployment was performed.

Task 6 also includes formatting of new files and the final employee permission/date integration fixes. See README.md for behavior, tests, risks and unapplied SQL.

## Task 1 — Sales and Finance (fd2b2cf)

- `.gitignore`
- `docs/phase1/README.md`
- `docs/phase1/sql/001_nct_sale_sync_receipts.proposed.sql`
- `oms-staging/manifest.json`
- `oms-staging/src/app/(dashboard)/finance/page.tsx`
- `oms-staging/src/app/(dashboard)/pos/page.tsx`
- `oms-staging/src/app/api/pos/sales/route.ts`
- `oms-staging/src/components/pos/branch-detail-view.tsx`
- `oms-staging/src/components/pos/pos-summary-report.tsx`
- `oms-staging/src/server/api/routers/finance.ts`
- `oms-staging/src/server/api/routers/pos.ts`
- `oms-staging/src/server/pos/sale-contract.ts`
- `oms-staging/src/server/pos/sales-report.ts`
- `scripts/apply-oms-staging-source.ps1`
- `scripts/check-oms-staging.cjs`
- `src/lib/services/nct-sale-payload.ts`
- `src/lib/services/oms-sync.service.ts`
- `src/lib/services/sale-sync.service.ts`
- `src/lib/services/sync-worker.ts`
- `tests/phase1-sales.cjs`
- `tsconfig.json`

## Task 2 — Employees and audits (a1e615b)

- `docs/phase1/README.md`
- `docs/phase1/sql/002_nct_employee_access.proposed.sql`
- `docs/phase1/sql/003_nct_audit_logs.proposed.sql`
- `oms-staging/manifest.json`
- `oms-staging/src/app/api/pos/audit/route.ts`
- `oms-staging/src/app/api/pos/auth/route.ts`
- `oms-staging/src/app/api/pos/sales/route.ts`
- `oms-staging/src/app/api/pos/users/route.ts`
- `oms-staging/src/components/pos/branch-detail-view.tsx`
- `oms-staging/src/components/pos/create-user-modal.tsx`
- `oms-staging/src/components/pos/pos-users-devices-tab.tsx`
- `oms-staging/src/server/api/routers/pos-user.ts`
- `oms-staging/src/server/pos/dealership-users.ts`
- `oms-staging/src/server/pos/employee-directory.ts`
- `scripts/apply-oms-staging-source.ps1`
- `scripts/update-oms-staging-manifest.ps1`
- `src/app/(auth)/index.tsx`
- `src/app/(auth)/register.tsx`
- `src/app/_layout.tsx`
- `src/lib/services/action-audit.ts`
- `src/lib/services/audit-sync.service.ts`
- `src/lib/services/audit.service.ts`
- `src/lib/services/authorization.service.ts`
- `src/lib/services/cashier.service.ts`
- `src/lib/services/customer.service.ts`
- `src/lib/services/device.service.ts`
- `src/lib/services/discount.service.ts`
- `src/lib/services/employee-sync.service.ts`
- `src/lib/services/inventory.service.ts`
- `src/lib/services/nct-scope.ts`
- `src/lib/services/permission.service.ts`
- `src/lib/services/product.service.ts`
- `src/lib/services/receipt.service.ts`
- `src/lib/services/return.service.ts`
- `src/lib/services/sale.service.ts`
- `src/lib/services/settings.service.ts`
- `src/lib/services/sync-worker.ts`
- `src/lib/services/transfer.service.ts`
- `tsconfig.json`

## Task 3 — Inventory (03ca138)

- `docs/phase1/README.md`
- `oms-staging/manifest.json`
- `oms-staging/src/app/api/pos/inventory/route.ts`
- `oms-staging/src/app/api/pos/transfer/route.ts`
- `oms-staging/src/components/pos/branch-inventory-sub-tab.tsx`
- `oms-staging/src/server/api/routers/pos.ts`
- `src/lib/services/oms-sync.service.ts`

## Task 4 — Offline and reconnect (506b2a5)

- `docs/phase1/README.md`
- `docs/phase1/sql/004_nct_device_reconnect_tokens.proposed.sql`
- `oms-staging/manifest.json`
- `oms-staging/src/app/api/device/register/route.ts`
- `oms-staging/src/app/api/pos/inventory/route.ts`
- `oms-staging/src/server/api/routers/pos-device.ts`
- `oms-staging/src/server/services/device-registration.service.ts`
- `src/lib/db/local-operation.ts`
- `src/lib/services/device.service.ts`
- `src/lib/services/nct-checkout.service.ts`
- `src/lib/services/nct-sync-coordinator.ts`
- `src/lib/services/network.service.ts`
- `src/lib/services/oms-sync.service.ts`
- `src/lib/services/sale.service.ts`
- `src/lib/services/sync-worker.ts`
- `tests/phase1-checkout.cjs`

## Task 5 — Backup and restore (c7b3eef)

- `docs/phase1/README.md`
- `docs/phase1/sql/005_nct_database_backups.proposed.sql`
- `oms-staging/manifest.json`
- `oms-staging/src/app/api/pos/backups/[id]/route.ts`
- `oms-staging/src/app/api/pos/backups/route.ts`
- `oms-staging/src/components/pos/branch-detail-view.tsx`
- `oms-staging/src/components/pos/nct-backups-tab.tsx`
- `oms-staging/src/server/pos/nct-backups.ts`
- `src/app/(pos)/settings.tsx`
- `src/lib/api/http.ts`
- `src/lib/backup/nct-restore.service.ts`
- `src/lib/backup/nct-schedule.ts`
- `src/lib/backup/recovery.service.ts`
- `src/lib/services/auto-backup.service.ts`
- `src/lib/services/nct-backup.service.ts`
- `src/lib/services/sync-queue.service.ts`
- `tests/phase1-backups.cjs`

## Task 6 — Transfers and final integration (c0f335a)

- `.gitattributes`
- `docs/phase1/README.md`
- `oms-staging/manifest.json`
- `oms-staging/src/app/(dashboard)/pos/page.tsx`
- `oms-staging/src/app/api/pos/inventory/route.ts`
- `oms-staging/src/app/api/pos/sales/route.ts`
- `oms-staging/src/app/api/pos/transfers/receive/route.ts`
- `oms-staging/src/components/pos/create-transfer-dialog.tsx`
- `oms-staging/src/components/pos/nct-backups-tab.tsx`
- `oms-staging/src/components/pos/nct-create-transfer-dialog.tsx`
- `oms-staging/src/components/pos/pos-summary-report.tsx`
- `oms-staging/src/components/pos/pos-users-devices-tab.tsx`
- `oms-staging/src/server/api/routers/pos-transfer.ts`
- `oms-staging/src/server/api/routers/pos.ts`
- `oms-staging/src/server/pos/dealership-transfer-receive.ts`
- `oms-staging/src/server/pos/nct-backups.ts`
- `oms-staging/src/server/pos/nct-pending-allocations.ts`
- `oms-staging/src/server/pos/nct-transfer-create.ts`
- `oms-staging/src/server/pos/sale-contract.ts`
- `oms-staging/src/server/pos/sales-report.ts`
- `scripts/format-phase1.cjs`
- `scripts/update-oms-staging-manifest.ps1`
- `src/app/(pos)/settings.tsx`
- `src/lib/backup/nct-restore.service.ts`
- `src/lib/backup/nct-schedule.ts`
- `src/lib/db/local-operation.ts`
- `src/lib/permissions/nct-permission-map.ts`
- `src/lib/permissions/use-role-permissions.ts`
- `src/lib/repositories/sale.repository.ts`
- `src/lib/services/action-audit.ts`
- `src/lib/services/audit-sync.service.ts`
- `src/lib/services/employee-sync.service.ts`
- `src/lib/services/nct-backup.service.ts`
- `src/lib/services/nct-checkout.service.ts`
- `src/lib/services/nct-sale-payload.ts`
- `src/lib/services/nct-scope.ts`
- `src/lib/services/nct-transfer-receive.service.ts`
- `src/lib/services/oms-sync.service.ts`
- `src/lib/services/sale.service.ts`
- `src/lib/services/sync-worker.ts`
- `src/lib/services/transfer.service.ts`
- `tests/phase1-audit.cjs`
- `tests/phase1-backups.cjs`
- `tests/phase1-checkout.cjs`
- `tests/phase1-sales.cjs`
- `tests/phase1-transfers.cjs`

## Final handoff and scope guards

The final handoff documents same-device recovery using persisted identity when the SQLite Device row is missing, preserves Dealership-specific audit/quantity behavior, respects employee login flags, and delivers NCT end-of-day closure evidence with acknowledgement-based retry.

- `docs/phase1/README.md`
- `docs/phase1/FILES.md`
- `oms-staging/manifest.json`
- `oms-staging/src/app/api/pos/inventory/route.ts`
- `oms-staging/src/server/api/routers/pos.ts`
- `scripts/format-phase1.cjs`
- `src/lib/backup/end-of-day.service.ts`
- `src/lib/services/audit.service.ts`
- `src/lib/services/cashier.service.ts`
- `src/lib/services/device.service.ts`
- `src/lib/services/end-of-day-sync.service.ts`
- `src/lib/services/sync-worker.ts`
- `tests/phase1-audit.cjs`
