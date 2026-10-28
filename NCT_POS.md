# NCT POS

This application is an OMS-dependent NCT terminal. Activate it with an NCT OMS
device QR code. Catalog, inventory, and incoming transfers come from OMS;
completed sales are saved locally and synchronized through the NCT POS API.

Business branding, receipt design, reports, returns, permissions, and local
backup/restore remain available. Closing a shift creates a local recovery file
and queues NCT closure evidence. A separate daily snapshot is scheduled for
7 PM Philippine time, with catch-up when the app resumes. Backups use the NCT
OMS API, subject to the proposed schema and staging storage setup described in
`docs/phase1/README.md`; live upload/restore acceptance remains pending.

Independent onboarding, local catalog editing, dealership cloud pairing, and
dealership API routing are unavailable. Historical schema fields are retained
for compatibility. Legacy independent sales and cloud jobs are preserved but
are not sent as NCT operational records.

The shared OMS Dealership API is preserved for the separate POS-dealership app.
Removing its client from this repository does not remove that server support.

Run `node --test tests/nct-only.test.cjs` for NCT queue/isolation regressions and
`tests/dealership-platform.validation.ps1` for the existing platform contract
checks (its historical filename is retained).
