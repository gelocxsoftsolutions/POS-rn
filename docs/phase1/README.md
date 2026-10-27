# Phase 1 implementation and human verification

Scope: NCT POS only. Dealership sales/backups and POS locking remain outside this change.
POS branch: `feat/phase1-pos-completion`, created from fetched `origin/staging`.

OMS changes are versioned in `oms-staging/src`, preserving their OMS paths.
`scripts/apply-oms-staging-source.ps1` previews the exact copies; `-Apply` copies only application source, checks original hashes, and saves originals under `docs/phase1/oms-source-backups`.
It does not deploy or execute SQL. Do not rebuild production from this working source.
Deployment, required SQL approval/application, and live acceptance testing remain separate owner actions.

## Task 1 — Sales and Finance

Files: POS sale payload/retry, OMS sync service and worker; OMS POS/Finance pages, branch detail, POS and Finance routers, shared report/query, receipt contract and sales endpoint. See `oms-staging/manifest.json` for exact OMS paths.

Implemented: all-branch POS Summary Report replaces the primary User & Role tab; Branch Sales view; Finance POS Summary Report; Philippine calendar date filters; complete aggregate totals with latest 50 transactions; errors and unavailable historical attribution are explicit. Finance reads the same receipts without manufacturing FIFO costs or accounting postings.

Sales sync is limited to registered NCT-dependent devices without a Dealership connection. Independent sales are never replayed. Receipt UUID, original device/branch/time/prices/discount/tax and net total survive retries. Server uses a durable unique mapping and transaction-level serialization; stock changes and receipt recording commit together, and stock updates are device-scoped and conditional. Conflicts are preserved for human reconciliation.

SQL: `sql/001_nct_sale_sync_receipts.proposed.sql`, NOT APPLIED. The new endpoint returns retryable 503 until this schema exists. Existing sales remain reportable, with historical records shown as unattributed rather than assigned to invented branches.

Automated checks: `node tests/phase1-sales.cjs` (receipt payload/validation, no network/database); `node node_modules/typescript/bin/tsc --noEmit`; `node --max-old-space-size=4096 scripts/check-oms-staging.cjs` checks the OMS overlay against its source/dependencies without executing the app. OMS has existing project-wide type diagnostics; inspect `oms-typecheck.log` and check patched-file diagnostics separately.

### Human acceptance checks (not executed)

Prerequisites: explicitly authorize writes to staging before these tests; approve/apply the proposed SQL; build/deploy the OMS source to the staging application ONLY. Do not use production DB `nctalavera-system:5432`.

1. Connect an NCT device to a test branch. Make a sale with known prices, discount, payment and change. Confirm receipt amount and original time.
2. Confirm exactly one matching transaction in that branch's Branch Sales, all-branch POS Summary Report, and Finance POS Summary Report. Compare totals using identical filters.
3. Change a product's current price after checkout but before upload; the uploaded receipt must retain the checkout price and total.
4. Retry the same sale after simulating a lost response. Confirm one OMS sale and one stock deduction. Repeat with concurrent retries.
5. Reuse a client ID with different data: expect conflict, no extra sale or stock deduction, and a visible retained local sale for investigation.
6. Use another device/branch's identity: expect rejection. Verify another branch's inventory does not change.
7. Exercise empty results, invalid date range, errors, and more than 50 matching sales. Aggregate totals must cover all records, while recent transactions remain limited to 50.
8. Check Philippine midnight boundaries and delayed offline uploads against the original checkout date.
9. Verify an account without sales-report permission cannot query the report directly; Finance access follows Finance permissions.
10. Verify Dealership/Independent sales remain local and the existing backup behavior is unchanged.

Open: required schema is unapplied; live acceptance checks are unverified; historical branch/cashier attribution cannot be reconstructed reliably from the existing sale rows. Finance exposes POS revenue separately; FIFO COGS/profit posting needs an explicit accounting rule if desired.
