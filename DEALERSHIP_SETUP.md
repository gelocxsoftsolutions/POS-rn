# Dealership POS

This worktree is `C:/Users/Administrator/Desktop/dev/POS-dealership`, branch `feat/dealership-cloud-backups`, based on `origin/staging` at `449827f`. No dealership branch was available locally or on the fetched remote. The original `../POS-rn` checkout's source is unchanged.

## Enroll a device

1. In OMS staging, open **Dealership** from the sidebar and select **Add Dealership**.
2. Choose **Independent** for a local catalog, or **OMS-dependent** for OMS catalog and transfers. The dealership mode is fixed to protect existing business history.
3. Select **Enroll Device**. Dependent devices must link to a registered OMS POS device with a device API key. Use a dedicated POS device registration for each dealership device.
4. In this app choose **Set Up Dealership**, scan the QR or enter the OMS server and one-time pairing code (valid for ten minutes), and create the owner account with a six-digit PIN. For an existing enrollment, sign in as the owner and open **Settings → Cloud Backup** to reconnect/rotate credentials.
5. Sign in. Automatic local/cloud backups are enabled at the existing configured interval (24 hours by default). Keep the app running and signed in for automatic backups and uploads. Use **Back Up to Cloud Now** for a manual upload.

Native device keys are stored in Expo SecureStore. Web preview uses the app's namespaced browser storage. Never commit a connection JSON or embed device keys in build configuration.

## Modes

- Independent: **Products → Add Product** creates a local SKU, selling price, optional barcode, and opening stock with audit/ledger records. OMS catalog import and transfers are disabled.
- OMS-dependent: catalog and transfer receipt use the linked OMS POS device. Local product creation is denied by the service as well as the screen.
- Both: sales remain in the local database and full cloud backup snapshots. The dealership application does not replay sales into OMS sales tables.

The bundle identifier, URL scheme, database filename, and storage namespace differ from the regular NCT POS so the two applications can coexist. This worktree deliberately does not reuse the original EAS project ID; configure a separate EAS project before producing a distributable build.

## Backups and recovery

Cloud uploads use `.nctposbackup` envelopes containing the SQLite database, branding assets, UI preferences, totals, schema version, and integrity checksums. The OMS verifies the envelope and database checksums and reads the stored object back before recording it as verified.

Maximum envelope size is **32 MiB**. Temporary upload failures remain queued and retry while online. Rejected credentials or invalid files stop automatic retries; reconnect as the administrator and choose **Retry Uploads**. Pending local backup files cannot be deleted from the backup list. Queue records contain file references rather than embedded snapshots, preventing recursive backup growth.

If the app stops during upload, processing queue entries return to pending on the next startup. The same backup content and idempotency key are retained across retries.

Download verified backups from **OMS → Dealership → device → Cloud Backups**. Use the existing **Settings → Database & Recovery** import flow to validate and restore the file. A connected installation accepts backups only for its matching dealership and cloud device identity. For a replacement installation, reconnect using the original device enrollment/key before restoring.

## Validation and development

```powershell
npm ci --ignore-scripts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/expo/bin/cli export --platform android --output-dir .dealership-export
```

The Android export verifies JS/Hermes compilation; it is not an APK/AAB or a test on a physical Android device. Do not publish this worktree as the regular NCT POS app.

Server and client integration tests live in `../nctalavera-system/tests/dealership-*.integration.*`; they exercise isolated SQLite fixtures, rollback-only staging records, and real SeaweedFS storage. Operational and storage details are in `../nctalavera-system/docs/DEALERSHIP_STAGING_2026-10-23.md`.
