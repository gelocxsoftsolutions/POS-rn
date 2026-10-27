# Phase 1 implementation and human verification

Scope: NCT POS only. Dealership sales/backups and POS locking remain outside this change.
POS branch: `feat/phase1-pos-completion`, created from fetched `origin/staging`.

See [FILES.md](FILES.md) for the exact files in each task commit. Every task below includes implementation details, SQL status, risks and a human acceptance checklist.

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

## Task 3 — Branch stock and product requests

Files: OMS POS inventory query, Branch Inventory component, device inventory endpoint, direct transfer endpoint; POS OMS inventory sync service.

NCT branch stock is filtered on the server by that branch's devices before fetching, without the global 500-row cap. General/unassigned stock is not invented as branch stock. Device inventory requests are restricted to the authenticated device; a complete snapshot is required before missing products can be reset to zero. Dealership inventory behavior is retained. No POS product-request UI was present in this branch; the legacy device-initiated stock transfer endpoint is disabled for NCT. Management's OMS allocations and approved-transfer receipt remain available.

SQL: none.

### Human acceptance checks (not executed)

1. Compare Branch Inventory with read-only stock rows for every device in that branch, including zero stock. Use branches with overlapping products and more than 500 inventory rows globally.
2. Verify an empty branch shows zero/empty stock and never inherits another branch or the general pool.
3. Refresh POS stock, make an offline sale, refresh after reconnect, and check pending quantities are deducted exactly once. Simulate an incomplete/old-server response; local quantities must remain intact.
4. Request another device's inventory with the wrong device key: expect rejection. Verify NCT direct product requests/transfers return 403 and no stock changes.
5. Check Dealership inventory and normal OMS-managed transfers still behave as before.

Risk: stock is derived from recorded device allocations; this change cannot correct inaccurate historical allocations or transfer records without reviewed data reconciliation. No live stock/transfer write test was performed.

## Task 4 — Offline catch-up and reconnection

Files: NCT checkout service, local-operation transaction helper, sale service, sync worker/network listener, sale/stock sync coordinator; OMS registration route/service, device reconnect router and inventory snapshot endpoint.

NCT checkout atomically saves the sale, items, net payment, receipt, stock ledger/deduction and sale audit in SQLite. Integer cents keep receipt/report amounts consistent; change is not recorded as revenue. Pending sales are discovered from durable local rows after restart. Network recovery triggers immediate catch-up in addition to the timer. Sales delivery and stock snapshots are serialized without holding a local checkout lock over network requests. Stock snapshots include server-acknowledged pending UUIDs, so a committed sale with a lost response is not deducted twice locally.

NCT reconnection now generates an explicitly bound one-time token without revoking the working key first. Redemption rotates credentials on the SAME device ID, preserving branch stock/assignments and pending sale attribution. Normal registration cannot silently replace an existing installation. Activation tokens are claimed atomically to prevent simultaneous redemption.

SQL: `sql/004_nct_device_reconnect_tokens.proposed.sql`, NOT APPLIED. Reconnect initiation reports setup pending until applied. Receipt deduplication still requires SQL 001; employee attribution requires SQL 002.

Automated checks: `node tests/phase1-checkout.cjs` uses the actual local schema and in-memory SQLite to exercise saved records, tender/change accounting, whole-checkout rollback on insufficient stock and concurrent stock consumption. `node tests/phase1-sales.cjs` checks the client/server receipt contract. No OMS writes or device reconnection were exercised.

### Human acceptance checks (not executed)

1. Disconnect an NCT device. Complete several sales, terminate/restart POS, and confirm receipts/stock remain local. Reconnect and compare all three reporting views.
2. Interrupt delivery immediately after OMS commits but before POS receives the response. Retry repeatedly and concurrently: one OMS sale and one stock deduction. Refresh inventory before the local synced flag is saved; availability must remain correct.
3. Queue more than 100 sales. Verify batches drain without loss; stock snapshot application waits until the pending candidate list fits its safe request bound.
4. Generate a reconnect token in OMS. Confirm the device still works with the old key until redemption. Scan on that same installation; verify unchanged device ID, branch stock and assignments, with new credentials and pending sales retained.
5. Try a normal/new-device token on an existing installation, a token for another device, an expired token and concurrent token redemption. Expect rejection without deleting local records or creating stray replacement devices.
6. Simulate a lost reconnect response. Obtain a new administrator-issued reconnect token; verify recovery retains the same device ID. Old sessions/refresh tokens must be revoked after successful redemption.
7. Force insufficient OMS stock, missing products and identity conflicts. Local completed sales must remain visible as failed/requiring reconciliation; do not silently delete them or mark them synced.
8. During a local checkout failure, verify no partial payment/items/receipt/stock ledger remains. Run two checkouts competing for the last stock; only one may succeed.

Risks: end-to-end recovery is unverified; conflict reconciliation remains an operator decision. Exact “nothing lost or duplicated” acceptance requires the live fault-injection checks above. Deliberately retained historical sales with incomplete identity cannot be auto-attributed safely.

## Task 5 — Backup scheduling and emergency restore

Files: NCT schedule/upload/restore services, recovery/queue/HTTP timeout/scheduler, POS backup settings UI; OMS NCT backup handlers/storage helper and branch Database Backups view.

The existing Dealership backup implementation is preserved. NCT devices use a separate metadata table and `nct-pos/` object namespace. Uploads validate the envelope, SQLite header, hashes and identity using the existing validation helpers, then read stored content back before marking it READY. A unique device/client key makes upload retries idempotent. Admins can download verified backups from the branch's Database Backups tab, then import them using the existing POS file-selection/credential-confirmation flow.

NCT automatically creates/queues one daily snapshot for 7 PM Philippine time, including when signed out while the app is active. A missed schedule catches up on resume. The app cannot guarantee execution while terminated; a device/background deployment solution would be needed for that requirement. Scheduled local exports are distinguished from confirmed OMS uploads; connection failures retain local files and pending uploads.

NCT restore verifies SQLite integrity/relationships, schema, manifest totals, business/device/branch identity BEFORE replacing the database. It saves a local recovery copy and retains an in-memory rollback snapshot for copy/asset failures, and signs the user out after successful restore. The matching device must be reconnected before emergency restore; replacing the hardware without restoring its device identity needs an administrator-led recovery procedure.

SQL: `sql/005_nct_database_backups.proposed.sql`, NOT APPLIED.
Staging configuration required: `NCT_POS_BACKUP_STORAGE_URL` pointing to a staging-only HTTP object-storage gateway supporting the same PUT/GET protocol as the existing backup adapter. No storage URL, Docker stack, production configuration or live database was changed. NCT uploads return retryable errors until the schema and storage are configured.

Automated checks: `node tests/phase1-backups.cjs` verifies Philippine schedule boundaries/catch-up and restore preflight against in-memory SQLite. This does not verify Expo native backup/copy behavior or live storage.

### Human acceptance checks (not executed)

1. Approve/apply SQL 005 and configure the NCT staging-only object-storage URL. Create a manual backup on a test NCT device; verify it becomes READY in OMS, is downloaded intact, and remains isolated from Dealership backups.
2. Retry the same upload after a lost response: one metadata row/object identity. Reuse the key with different content: expect 409. Simulate storage failure: the local file remains and the upload retries; an unverified object must not appear READY.
3. Keep POS active through 7 PM Philippine time, including when signed out. Confirm automatic local export and eventual OMS upload. Change the device timezone and verify the cutoff remains Philippine time.
4. Close POS through the cutoff and reopen later; confirm one catch-up snapshot. Restart after queueing but before persisting the schedule marker; confirm the daily key reuses its queued file.
5. Download from OMS as an administrator. Use POS Settings > Select Backup File and confirm with the current login PIN. On an isolated test installation for the SAME device/branch/business, compare sale/stock/product totals before and after restore, branding/preferences, and required sign-in afterward.
6. Try corrupted content, mismatched totals, schema, device, branch and business. Reject before overwriting the current database. Simulate copy/branding-write failure; verify rollback and the saved local rescue copy.
7. Restore a snapshot containing pending uploads, reconnect and verify sale/backup deduplication. Confirm a device or unprivileged OMS account cannot download another device's backup.
8. Recheck the already-completed Dealership backup path unchanged. Do not claim the NCT cloud or native restore path works until these tests pass.

## Task 6 — Transfer UI and receipt reliability

Files: OMS NCT create-transfer dialog, shared dialog wrapper, transfer create helper/router, NCT receipt endpoint, pending-allocation helper; POS NCT receipt service and sync ordering. Dealership continues to render its original dialog and use its original receipt handler.

The NCT dialog supports branch/device selection, source-specific stock, searchable variations, quantity review, shared-stock validation, loading/empty/error states, accessible dialog controls, notes and a clear approval step. A single request UUID prevents repeated clicks or lost responses from creating duplicate transfer records; changing a committed request's payload is rejected. Creation saves the transfer/items atomically. NCT approval is guarded against concurrent duplicate approval; rejection cannot race an already-approved transfer.

Receipts are scoped to the intended branch/device, include every variation, record actual quantities/discrepancy notes, and are idempotent. Approval already credits a device allocation: the new path never credits it twice. Unreceived allocations remain excluded from available branch/device stock and cannot be consumed by NCT sales. Quantity shortages correct the allocated balance and remain visible in the transfer/audit records for management reconciliation.

POS applies the acknowledged stock snapshot minus unacknowledged local sales, and saves receipt quantities, ledger entries and final status atomically. A failed local write can retry the same OMS receipt safely. Pending transfers are fetched before inventory to avoid exposing unreceived allocations.

SQL: none beyond the earlier proposed tables used by sales/employee attribution. Existing transfer and audit tables are reused.

Automated checks: `node tests/phase1-transfers.cjs` exercises local stock application, duplicate local calls, invalid quantities, shared pending-allocation grouping and rollback/retry with real in-memory SQLite and mocked OMS responses. This is NOT a live end-to-end transfer or rendered UI/device test.

### Human acceptance checks (not executed)

1. As an authorized OMS manager, open a branch's Product Transfer dialog. Check keyboard focus/escape, scrolling at tablet/mobile widths, loading/errors/empty stock, device selection and search. Confirm other branches' device stock does not appear.
2. Add individual and shared-stock variations. Try zero, fractions, negatives and a shared total above availability. Verify clear errors and no submission. Change device/direction and confirm the previous selection resets.
3. Create a transfer, approve it, and compare warehouse allocation and device inventory. Unreceived stock must stay unavailable on POS and in the branch's available stock. Verify a role without management permission cannot create/approve/reject via direct API.
4. Double-click create and simulate a lost creation response. Retry the same selection: one transfer. After an uncertain response, check the transfer list before cancelling and starting a different request.
5. On the intended POS, scan and complete the receipt checklist. Confirm the actual quantities, received status, ledger and branch/device stock in OMS and POS. Repeat the same scan/receipt; stock must not increase again.
6. Receive a shortage with notes; confirm the corrected available stock and recorded discrepancy. Try an excess quantity or a shortage without notes: reject without partial changes. Management must reconcile missing physical stock; it is not silently returned to warehouse stock.
7. Lose the receipt response after OMS commits and retry. Simulate a local write failure after acknowledgement, restart if needed and retry: one final local receipt/ledger effect, with pending sales still deducted correctly.
8. Try another device's transfer, mismatched branch/number/ID, rejected/cancelled transfers, concurrent approval and rejection. Reject invalid operations without stock duplication.
9. Test two inbound transfers for the same shared pool; receiving one must not expose the other transfer's unreceived stock. Make/retry sales while inventory snapshots are fetched.
10. Recheck Dealership transfer creation/receipt behavior. No live transfer was run by the implementation agent.

Risks/open: native UI and live transfer acceptance are unverified. An interrupted shortage receipt whose draft was lost may need quantities recovered from OMS transfer details before local retry. Historical transfers with missing/incorrect branch/device/product identities require management reconciliation rather than guessed repairs.

## Final integration notes

No dependencies were added. Expo v57's versioned reference and SQLite documentation were consulted. No containers were rebuilt/restarted and no staging or production rows/schema were changed by this work. OMS source has been copied with backups; deployment is still pending.

Staging SELECT confirmed OMS role codes differ from local POS codes. `src/lib/permissions/nct-permission-map.ts` explicitly translates the existing grants; unknown codes and page-only grants do not gain business actions. Device administration grants backup/settings/audit access, matching the OMS backup/audit administration checks. Review these mappings during employee-role acceptance. NCT employee revocation/role changes sign out stale sessions after successful refresh; permission views refresh with sync. Local standalone user/role creation panels are hidden for NCT. POS device locking logic was not changed.

NCT checkout/dashboard/report dates use Philippine calendar days. The 7 PM setting is the backup schedule, not a redefinition of the reporting calendar day. Source-only OMS patches use LF line endings so manifest hashes survive Windows/Linux checkout.

Final automated suite: POS TypeScript, five isolated scripts (`phase1-sales`, `phase1-audit`, `phase1-checkout`, `phase1-backups`, `phase1-transfers`) and the OMS overlay typecheck. See the final delivery message for actual results. Human live acceptance is intentionally pending, and SQL files are proposals only.

Actual final results: POS TypeScript passed; all five isolated scripts passed; whitespace checks passed. OMS overlay checking reported 718 project-wide diagnostics and zero in patched files. The project-wide OMS check is not a clean pass. Native app rendering, device restore, live sales/reconnect, storage and product transfer end-to-end checks were not executed.

Database-loss recovery on the same device: registration also accepts the installation's persisted device-store identity when the local SQLite Device row is missing. Use an OMS reconnect token for that original device, sign in with the restored OMS employee cache, then import its matching backup. Test this explicitly; replacement hardware that has lost both SQLite and all persisted device identity remains an administrator-led open recovery procedure.

End-of-day closure queue entries are now delivered as idempotent `END_OF_DAY_CLOSED` evidence in the existing OMS audit table, with the original summary, payments, actor and business date. Finance continues to read individual sale receipts, avoiding duplicate revenue from closures. Human check: close a shift/day offline, reconnect, verify the queue is acknowledged and one closure event is stored even after retries.

Legacy `Return` queue entries are retained locally, but this project has no established OMS POS return-ingestion contract. Posting returns/refunds into Finance and deciding their stock/accounting treatment remain open; this work does not guess that contract or claim comprehensive return synchronization. Include a return/refund scenario in the human audit if the “all pending data” requirement is intended to cover returns as well as the listed Phase 1 sale/inventory/audit/backup flows.
