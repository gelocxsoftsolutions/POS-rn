# NCT POS

Daily backups use one shared branch time in `Asia/Manila`. Administrators can edit
the time in OMS Branch Management > Database Backups or POS Settings > Database
& Recovery. POS changes require an OMS connection and backup permission. Devices
refresh the schedule while active and retain the last saved branch time offline.
The default remains 19:00 until a branch time is saved. Existing APKs need updating
to follow the shared schedule. Missed backups catch up on reopening; a terminated
app cannot guarantee execution at the cutoff.

Schedule edits use revisions: if someone changes the time elsewhere, refresh
before retrying. Moving a cutoff does not create a second automatic backup for
an already completed scheduled date; catch-up snapshots retain their original
daily key. Manual and end-of-day backups do not move the daily schedule.

This application is an OMS-dependent NCT terminal. Activate it with an NCT OMS
device QR code. Catalog, inventory, and incoming transfers come from OMS;
completed sales are saved locally and synchronized through the NCT POS API.

The staging app targets Expo SDK 58. Use Node 22.13 or newer on the Node 22 line,
or a supported Node 24/26 release, and Expo Go for SDK 58.

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
