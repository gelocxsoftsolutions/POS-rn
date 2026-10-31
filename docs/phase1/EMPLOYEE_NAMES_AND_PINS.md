# Employee names and shared POS PINs

NCT only. OMS Dealership identity and credential behavior is preserved.

Device registration previously read `pos.pos_users.displayName/username`, while Users & Roles read the linked OMS Employee. This allowed the same access record to appear as Binoy in registration and Chris Buenafe in Users. Registration now reads active, linked Employees for that branch. Access IDs and device assignments are preserved; no identity mappings are guessed or renamed.

NCT PINs are set or changed in POS only:

- Settings > Users > the assigned employee > Set / change employee PIN.
- An employee can change their own PIN through Your Profile.
- Saving requires an OMS connection, a matching six-digit PIN confirmation, and the operator's current PIN. The built-in Super Admin confirms its password locally and supplies the installation's registered device secret as administrator proof. That password is not uploaded.
- The endpoint authenticates a registered device, checks that the target and employee operator are active and assigned, and checks management grants for another employee's PIN. A client-supplied superadmin flag grants nothing. Device administration is recorded as `DEVICE_ADMIN`, not as a verified employee identity.
- OMS stores the SHA-256 verifier in the existing POS access records for that Employee; assigned devices refresh it through the existing employee-directory sync. PIN contents and verifiers are excluded from the audit event.
- New NCT access is created without a usable PIN. An authorized POS manager or the built-in recovery administrator must set it before employee PIN login. Existing PINs remain unchanged until someone explicitly changes them in POS.
- Offline devices retain their last downloaded PIN until their directory refresh succeeds. If a save response is lost, refresh from OMS before retrying; for a self-change that already committed, use the new PIN for confirmation. The existing request limiter is per server process and resets with that process.

OMS hides PIN/password setup for NCT access creation and rejects NCT credential edits through the OMS user-management API. It continues managing employee selection, branch/device assignments, roles and access status. Dealership retains its existing credential fields and API behavior.

## Files

POS: `src/components/ui/employee-pin-editor.tsx`, `src/components/ui/nct-access-settings.tsx`, `src/lib/services/employee-pin.service.ts`, `src/app/(pos)/user.tsx`, `tests/employee-pin.cjs`.

OMS sibling source: `src/server/pos/employee-directory.ts`, `src/server/api/routers/pos-device.ts`, `src/server/api/routers/pos-user.ts`, `src/components/pos/create-user-modal.tsx`, `src/components/pos/register-device-dialog.tsx`, `src/app/api/pos/users/pin/route.ts`.

The new NCT endpoint is `POST /api/pos/users/pin`. It updates linked verifiers and records `EMPLOYEE_PIN_CHANGED` atomically in the existing audit table. No SQL or migration is required. No employee PIN was changed by the implementation agent.

## Checks

- `node node_modules/typescript/bin/tsc --noEmit`: POS TypeScript.
- `node tests/employee-pin.cjs`: actual server handler, POS service and OMS user-router code with isolated fixtures. Tests device/employee scope, credentials, permissions, shared updates, audit rollback, duplicate-save behavior, local cache recovery, and preserved Dealership credentials. Requires the sibling OMS source/dependencies; no database writes.
- `node tests/phase1-settings-access.cjs`: existing Super Admin visibility and actual local SQLite employee/permission isolation.
- OMS affected-file TypeScript check: zero affected-file diagnostics; 718 existing project diagnostics remain.
- Isolated browser fixture renders the actual Users/PIN editor at desktop/mobile widths, checks PIN confirmation, submits fixture credentials, and checks fields clear after success. This does not test an Android device.
- Read-only staging query verified the registration helper returns Chris Buenafe / cbbuenafe, excludes Binoy and credential fields, and respects branch filtering.

## Human verification

1. In staging OMS, register a device in Main Branch. The selector must display Chris Buenafe / cbbuenafe, matching Users & Roles. Verify assignments retain the same access ID.
2. Add another active Employee's POS access. OMS must not request a PIN. A direct OMS NCT credential-edit request must also be rejected. Check Dealership can still manage its credentials.
3. Install an APK containing this change on two assigned NCT devices. Sign in as an authorized operator, refresh Users, set a six-digit employee PIN and confirm the operator credentials. Refresh the other device; that employee must log in with the same new PIN.
4. Change an employee's own PIN in Your Profile. Check the previous PIN stops working after refresh. Confirm names and role grants remain managed by OMS.
5. Disconnect and try saving a PIN: no local-only change should be accepted. Reconnect and repeat. Keep the second device offline during a change; confirm its old cache remains until a successful refresh.
6. Try incorrect operator credentials, a user lacking management grants, an unassigned employee and a wrong device key. Confirm no credential change. Inspect `EMPLOYEE_PIN_CHANGED` audit entries without PIN, hash or device-secret contents.

Native two-device PIN/login acceptance remains unexecuted. A new APK is required for the new POS controls; this task does not build one.
