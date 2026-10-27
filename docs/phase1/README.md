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

## Task 2 — Employees and audit logs

Files: employee/scope/action-audit/audit-sync services, cashier authentication/authorization, employee cache, root navigation, service operation wrappers; OMS user creation modal/router, branch Users & Roles, device-scoped user/auth/audit endpoints, employee directory helper. Dealership directory behavior is preserved separately.

NCT identities come from the actual Employees screen's `LegacyUser` (`public.users`). Existing `pos_users` stores only branch-specific POS access/role/PIN settings linked to that employee. Names/usernames are derived from Employees. New users must be selected from active Employees. The device caches assigned employees and permissions for offline use; local user creation/profile credential changes and the separate built-in administrator are unavailable for NCT. OMS SHA-256 PIN verifiers are used for NCT, preserving Dealership's existing authentication behavior. Offline employee revocation takes effect after the next successful directory refresh.

Auditing covers business service operations, login/logout/failed attempts and screen navigation. It records actor, action, target where available, original UTC time and branch/device. Raw arguments, PINs and passwords are excluded. Durable local events are retried with their UUIDs; OMS stores them in the existing `pos.pos_audit_logs` and deduplicates UUIDs. Action audit capture is currently best-effort after the operation; a process kill between an operation and its audit write is a known gap, so this is not a tamper-proof compliance log or a claim of exhaustive individual UI click capture.

SQL: `sql/002_nct_employee_access.proposed.sql` creates stable employee/access links; NOT APPLIED. Existing POS accounts need explicit reviewed mappings, not guessed name matching. `sql/003_nct_audit_logs.proposed.sql` documents the existing audit layout and optional investigation indexes; NOT APPLIED. Audit ingestion itself does not require these optional indexes.

### Human acceptance checks (not executed)

1. After approving/applying the employee-access SQL, explicitly link existing POS accounts to the correct Employees. Add a new employee's branch POS access through the selector; verify arbitrary identities cannot be created via UI or direct API.
2. Assign that employee to a device in the same branch. Refresh the POS directory and sign in with the OMS-configured 6-digit PIN/password. Verify directory permissions and canonical employee name.
3. Verify a device cannot fetch another branch's users, unassigned employees, held/inactive employees or unrestricted OMS login password hashes.
4. Verify NCT local-account creation/profile credential changes and the built-in administrator cannot bypass Employees. Check Dealership login remains unchanged.
5. Disconnect, sign in using the cached employee, perform sales/settings/transfer operations and navigate screens. Reconnect and inspect audit records in OMS Users & Roles > Audit Logs. Compare actor, target, branch/device and original occurrence time; search using existing API filters or read-only SQL.
6. Simulate a lost audit-upload response and retry: one stored event per client UUID. Confirm no PIN/password or raw credential payload appears in local/OMS audit details.
7. Disable/hold or unassign an employee in OMS, reconnect and refresh; verify cached access is revoked. Rename the Employee and confirm POS displays the canonical new name without creating a second user.
8. Confirm required setup missing/HTTP errors preserve the last complete offline cache, rather than replacing it with an empty or partial failed response.
