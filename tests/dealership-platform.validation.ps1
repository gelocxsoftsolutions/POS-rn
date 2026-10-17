$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-Contains([string]$relativePath, [string]$pattern, [string]$description) {
  $path = Join-Path $root $relativePath
  if (-not (Test-Path -LiteralPath $path)) {
    $failures.Add("Missing $relativePath ($description)")
    return
  }
  $content = Get-Content -LiteralPath $path -Raw
  if ($content -notmatch $pattern) { $failures.Add("${relativePath}: $description") }
}

function Assert-NotContains([string]$relativePath, [string]$pattern, [string]$description) {
  $path = Join-Path $root $relativePath
  if (-not (Test-Path -LiteralPath $path)) {
    $failures.Add("Missing $relativePath ($description)")
    return
  }
  $content = Get-Content -LiteralPath $path -Raw
  if ($content -match $pattern) { $failures.Add("${relativePath}: $description") }
}

Assert-Contains "src/lib/db/schema.ts" 'SCHEMA_VERSION = 9' "versioned dealership migration"
Assert-Contains "src/lib/db/schema.ts" 'OperatingModeAudit' "audited operating-mode changes"
Assert-Contains "src/lib/db/schema.ts" 'ProductOmsMapping' "explicit independent-to-NCT variation mapping"
Assert-Contains "src/lib/business/capabilities.ts" 'receiveNctTransfers: false' "Independent mode transfer denial"
Assert-Contains "src/lib/services/transfer.service.ts" 'requireNctTransfers\(\);' "service-layer transfer guard"
Assert-Contains "src/app/(pos)/_layout.tsx" 'item.name !== "transfers" \|\| capabilities.receiveNctTransfers' "capability-gated transfer navigation"
Assert-Contains "src/lib/services/sale.service.ts" 'originMode' "sale origin mode persistence"
Assert-Contains "src/lib/services/sale.service.ts" 'Background sync owns all OMS delivery' "checkout completes without waiting for OMS"
Assert-NotContains "src/lib/services/sale.service.ts" 'DELETE FROM Sale' "completed sales must never be deleted after an OMS error"
Assert-NotContains "src/lib/services/sync-queue.service.ts" 'DELETE FROM Sale' "sync conflicts must never delete completed sales"
Assert-Contains "src/lib/services/sync-worker.ts" 'originMode === "INDEPENDENT"' "old independent sales never replay to operational OMS sales"
Assert-Contains "src/lib/business/independent-catalog.service.ts" 'BarcodeNamespace' "device-scoped offline barcode sequence"
Assert-Contains "src/lib/business/independent-catalog.service.ts" 'type: "code128"' "Code 128 barcode record"
Assert-Contains "src/lib/printing/print-receipt-paper.ts" 'settings\?\.paperWidthMm === 80' "configured receipt paper width reaches print output"
Assert-Contains "src/lib/services/sale.service.ts" 'templateSnapshot' "historical receipt template snapshot"
Assert-Contains "src/lib/backup/recovery.service.ts" 'databaseChecksum' "backup integrity metadata"
Assert-Contains "src/lib/backup/recovery.service.ts" 'assets' "branding assets included in backup"
Assert-Contains "src/lib/backup/end-of-day.service.ts" 'idempotencyKey' "idempotent EOD submission"
Assert-Contains "src/lib/repositories/sync-queue.repository.ts" 'dedupeKey' "durable retry deduplication"
Assert-Contains "src/app/(auth)/index.tsx" 'useBusinessConfigStore' "branding before authenticated POS navigation"
Assert-Contains "src/app/_layout.tsx" 'BusinessConfigurationService.load' "branding loaded during application initialization"
Assert-Contains "src/app/(auth)/index.tsx" 'Re-register this device\?' "re-registration requires an explicit confirmation"
Assert-Contains "src/app/(auth)/register.tsx" 'How will this dealership operate\?' "registration includes operating-mode selection"
Assert-Contains "src/lib/services/device.service.ts" 'requestedOperatingMode' "authorized activation persists the selected operating mode"
Assert-Contains "src/lib/services/cashier.service.ts" 'secureSha256' "super-admin credentials use a full SHA-256 verifier"
Assert-NotContains "src/lib/services/device.service.ts" 'initialCashiers full' "device registration must not log cashier credentials"
Assert-Contains "src/app/(auth)/register.tsx" 'router.push\("/\(auth\)/independent-setup"\)' "Independent mode bypasses OMS device activation"
Assert-Contains "src/lib/business/independent-onboarding.service.ts" 'needsExistingInstallationAuthorization' "existing installations require authorization"
Assert-Contains "src/lib/business/independent-onboarding.service.ts" 'registrationState: "registered"' "local independent terminal completes registration locally"
Assert-Contains "src/lib/business/independent-onboarding.service.ts" 'Resolve pending synchronization' "mode change cannot bypass pending synchronization"
Assert-NotContains "src/lib/db/seed.ts" 'sha256\("1234"\)' "fresh installs must not seed a well-known admin PIN"
Assert-Contains "src/lib/db/seed-sample-data.ts" 'EXPO_PUBLIC_SEED_SAMPLE_DATA === "1"' "sample data is explicit opt-in"
Assert-Contains "src/lib/services/oms-sync.service.ts" 'capabilities\(\)\.importNctCatalog' "Independent OMS connection cannot import NCT operational data"
Assert-Contains "src/app/(pos)/products.tsx" 'Add Product to Inventory' "independent product action uses requested terminology"
Assert-Contains "src/app/(pos)/products.tsx" 'independent-catalog\?edit=' "product details reuse the catalog editor"
Assert-Contains "src/app/(pos)/independent-catalog.tsx" 'launchImageLibraryAsync' "product photo upload"
Assert-Contains "src/components/ui/media-capture-modal.tsx" 'CameraView' "in-app camera capture"
Assert-Contains "src/lib/db/schema.ts" 'ProductActionAudit' "durable product evidence and audit history"
Assert-Contains "src/lib/business/independent-catalog.service.ts" 'proofImageDataUri' "proof enforced by business logic"
Assert-Contains "src/lib/business/independent-catalog.service.ts" 'LOSS_\$\{input.category\}' "categorized inventory loss ledger movement"
Assert-Contains "src/lib/business/independent-catalog.service.ts" 'cashierId !== SUPER_ADMIN_ID' "permanent deletion restricted to system Super Admin"
Assert-Contains "src/lib/business/independent-catalog.service.ts" 'cannot be deleted\. Archive it instead' "historical references block permanent deletion"
Assert-Contains "src/lib/business/independent-catalog.service.ts" 'Stock removal must use Record Loss' "negative adjustment cannot bypass loss evidence"
Assert-NotContains "src/app/(pos)/independent-catalog.tsx" 'Minimum stock' "minimum stock removed from independent product form"
Assert-Contains "src/app/(pos)/independent-catalog.tsx" 'Stock must be zero' "variation removal requires zero stock"
Assert-NotContains "src/app/(pos)/independent-catalog.tsx" '>Stock movements<' "stock management removed from add-product screen"
Assert-Contains "src/app/(pos)/products.tsx" 'VariationStockModal' "stock and loss workflow lives on product details"
Assert-Contains "src/components/ui/variation-stock-modal.tsx" 'Expired / damaged / loss' "per-variation loss workflow"
Assert-Contains "src/components/ui/media-capture-modal.tsx" 'recordAsync' "video proof capture"
Assert-Contains "src/components/ui/media-capture-modal.tsx" 'launchImageLibraryAsync' "proof photo and video upload"
Assert-NotContains "src/components/ui/media-capture-modal.tsx" 'MediaTypeOptions' "proof upload uses the current Expo media-type API"
Assert-NotContains "src/app/(pos)/independent-catalog.tsx" 'MediaTypeOptions' "product upload uses the current Expo media-type API"
Assert-NotContains "src/app/(auth)/register.tsx" 'MediaTypeOptions' "registration upload uses the current Expo media-type API"
Assert-Contains "src/components/ui/media-capture-modal.tsx" 'StatusBar barStyle="light-content" backgroundColor="#0f172a"' "capture header extends through the Android status bar"
Assert-Contains "src/components/ui/product-audit-detail-modal.tsx" 'Recorded snapshots' "audit detail modal exposes complete before and after data"
Assert-Contains "src/app/(pos)/independent-catalog.tsx" 'ProductAuditDetailModal' "edit-product action history opens detailed audit records"
Assert-Contains "src/components/ui/variation-stock-modal.tsx" 'ProductAuditDetailModal' "variation history opens detailed audit records"
Assert-Contains "src/lib/business/independent-catalog.service.ts" 'INSERT INTO AuditLog' "product and loss actions reach central audit logs"
Assert-Contains "src/app/(pos)/receipt-designer.tsx" 'previewLogo' "receipt logo appears in live preview with fallback"
Assert-Contains "src/lib/stores/ui-store.ts" 'themePalettes' "light and dark dealership color palettes persist offline"
Assert-Contains "src/components/ui/theme-color-editor.tsx" 'COLOR_FIELDS' "theme editor exposes semantic color controls"
Assert-Contains "src/components/ui/theme-color-editor.tsx" 'Hex color' "theme editor supports manual color selection"
Assert-Contains "src/app/(auth)/index.tsx" 'usePosTheme' "login uses the configured dealership theme"
Assert-Contains "src/app/(auth)/register.tsx" 'usePosTheme' "device registration uses the configured dealership theme"
Assert-Contains "src/app/(auth)/independent-setup.tsx" 'usePosTheme' "independent onboarding uses the configured dealership theme"
Assert-Contains "src/app/(pos)/index.tsx" 'theme\.primary' "POS dashboard uses the configured dealership theme"
Assert-Contains "src/app/(pos)/_layout.tsx" 'theme\.navigation' "POS navigation uses the configured dealership theme"
Assert-Contains "src/app/(pos)/settings.tsx" 'SETTINGS_SECTIONS' "settings hub defines dedicated searchable pages"
Assert-Contains "src/app/(pos)/settings.tsx" 'item\.keywords' "settings search indexes keywords inside detail pages"
Assert-Contains "src/app/(pos)/settings.tsx" 'settingsSplit' "settings use independent left navigation and right content columns"
Assert-Contains "src/app/(pos)/settings.tsx" 'Animated\.spring' "settings detail panel animates when a section opens"
Assert-Contains "src/components/ui/theme-color-editor.tsx" 'THEME_PRESETS' "theme editor offers designated light and dark presets"
Assert-Contains "src/components/ui/theme-color-editor.tsx" 'name: "Coral"' "light palette includes ten preset choices"
Assert-Contains "src/components/ui/theme-color-editor.tsx" 'name: "High Contrast"' "dark palette includes ten preset choices"
Assert-Contains "src/components/ui/theme-color-editor.tsx" 'name: "Pastel Lilac"' "light palette includes coordinated pastel choices"
Assert-Contains "src/components/ui/theme-color-editor.tsx" 'name: "Dusky Blue"' "dark palette includes low-light pastel choices"
Assert-Contains "src/lib/stores/ui-store.ts" 'setThemePalette' "selected theme presets persist atomically"
Assert-Contains "src/lib/stores/ui-store.ts" 'exportUiPreferences' "persisted UI preferences can be included in recovery backups"
Assert-Contains "src/lib/stores/ui-store.ts" 'restoreUiPreferences' "persisted UI preferences can be restored safely"
Assert-Contains "src/lib/backup/recovery.service.ts" 'uiPreferences: exportUiPreferences' "new backups include theme and device UI preferences"
Assert-Contains "src/lib/backup/recovery.service.ts" 'backupChecksum' "backup preferences and branding assets are integrity checked"
Assert-Contains "src/lib/backup/recovery.service.ts" 'restoreUiPreferences' "fresh-install restore reapplies backed-up UI preferences"
Assert-Contains "src/app/(pos)/settings.tsx" 'RecoveryService\.createBackup' "database export uses the verified recovery format"
Assert-Contains "src/app/(pos)/settings.tsx" 'File\.pickFileAsync' "database import uses the native file picker"
Assert-Contains "src/app/(pos)/settings.tsx" 'RecoveryService\.restoreFreshInstallation' "database import preserves fresh-install restore safety"
Assert-Contains "src/app/(pos)/sales.tsx" 'usePosTheme' "sales controls consume the active semantic palette"
Assert-Contains "src/app/(pos)/receipts.tsx" 'usePosTheme' "receipt controls consume the active semantic palette"
Assert-Contains "src/app/(pos)/products.tsx" 'usePosTheme' "product and detail controls consume the active semantic palette"
Assert-Contains "src/app/(pos)/reports.tsx" 'usePosTheme' "report controls consume the active semantic palette"
Assert-Contains "src/app/(pos)/customers.tsx" 'usePosTheme' "customer controls consume the active semantic palette"
Assert-Contains "src/components/ui/usb-barcode-scanner-input.tsx" 'usePosTheme' "shared scanner state follows the active semantic palette"
Assert-Contains "src/components/layout/session-indicator.tsx" 'usePosTheme' "header session identity follows the active semantic palette"
Assert-Contains "src/app/(pos)/independent-catalog.tsx" 'backgroundColor: theme\.primary' "catalog editor actions follow the active semantic palette"
Assert-Contains "src/app/(pos)/products.tsx" 'borderBottomColor: theme\.border' "product detail dividers follow the active semantic palette"
Assert-Contains "src/app/(pos)/receipts.tsx" 'color: theme\.primary' "receipt totals follow the active semantic palette"
Assert-Contains "src/app/(pos)/settings.tsx" 'bg: posTheme\.surfaceAlt' "unknown audit event badges follow the active semantic palette"
Assert-Contains "src/app/(pos)/settings.tsx" 'backgroundColor: posTheme\.surfaceAlt' "settings status and empty states follow the active semantic palette"

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "Dealership platform validation passed (98 source contracts)."
