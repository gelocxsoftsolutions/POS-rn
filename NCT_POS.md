# NCT POS

This application is an OMS-dependent NCT terminal. Activate it with an NCT OMS
device QR code. Catalog, inventory, and incoming transfers come from OMS;
completed sales are saved locally and synchronized through the NCT POS API.

Business branding, receipt design, reports, returns, permissions, and local
backup/restore remain available. Closing a shift or saving an end-of-day backup
creates a local recovery file; it does not upload a database to dealership APIs.

Independent onboarding, local catalog editing, dealership cloud pairing, and
dealership API routing are unavailable. Historical schema fields are retained
for compatibility. Legacy independent sales and cloud jobs are preserved but
are not sent as NCT operational records.

Run `tests/dealership-platform.validation.ps1` for the platform contract checks.
