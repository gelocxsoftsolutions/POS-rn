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

Assert-Contains "src/lib/db/schema.ts" 'SCHEMA_VERSION = 11' "versioned dealership migration"
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
Assert-Contains "src/lib/printing/print-receipt-paper.ts" 'settings\?\.paperWidthMm === 80' "configured receipt paper width reaches print output"
Assert-Contains "src/lib/services/sale.service.ts" 'templateSnapshot' "historical receipt template snapshot"
Assert-Contains "src/lib/backup/recovery.service.ts" 'databaseChecksum' "backup integrity metadata"
Assert-Contains "src/lib/backup/recovery.service.ts" 'assets' "branding assets included in backup"
Assert-Contains "src/lib/backup/end-of-day.service.ts" 'idempotencyKey' "idempotent EOD submission"
Assert-Contains "src/lib/repositories/sync-queue.repository.ts" 'dedupeKey' "durable retry deduplication"
Assert-Contains "src/app/(auth)/index.tsx" 'useBusinessConfigStore' "branding before authenticated POS navigation"
Assert-Contains "src/app/_layout.tsx" 'BusinessConfigurationService.load' "branding loaded during application initialization"
Assert-Contains "src/app/(auth)/index.tsx" 'Re-register this device\?' "re-registration requires an explicit confirmation"
Assert-Contains "src/lib/services/cashier.service.ts" 'secureSha256' "super-admin credentials use a full SHA-256 verifier"
Assert-NotContains "src/lib/services/device.service.ts" 'initialCashiers full' "device registration must not log cashier credentials"
Assert-NotContains "src/lib/db/seed.ts" 'sha256\("1234"\)' "fresh installs must not seed a well-known admin PIN"
Assert-Contains "src/lib/db/seed-sample-data.ts" 'EXPO_PUBLIC_SEED_SAMPLE_DATA === "1"' "sample data is explicit opt-in"
Assert-Contains "src/lib/services/oms-sync.service.ts" 'capabilities\(\)\.importNctCatalog' "Independent OMS connection cannot import NCT operational data"
Assert-Contains "src/components/ui/media-capture-modal.tsx" 'CameraView' "in-app camera capture"
Assert-Contains "src/lib/db/schema.ts" 'ProductActionAudit' "durable product evidence and audit history"
Assert-Contains "src/components/ui/media-capture-modal.tsx" 'recordAsync' "video proof capture"
Assert-Contains "src/components/ui/media-capture-modal.tsx" 'launchImageLibraryAsync' "proof photo and video upload"
Assert-NotContains "src/components/ui/media-capture-modal.tsx" 'MediaTypeOptions' "proof upload uses the current Expo media-type API"
Assert-NotContains "src/app/(auth)/register.tsx" 'MediaTypeOptions' "registration upload uses the current Expo media-type API"
Assert-Contains "src/components/ui/media-capture-modal.tsx" 'backgroundColor=\{theme\.navigation\}' "capture header applies the active palette through the Android status bar"
Assert-Contains "src/app/(pos)/receipt-designer.tsx" 'previewLogo' "receipt logo appears in live preview with fallback"
Assert-Contains "src/lib/stores/ui-store.ts" 'themePalettes' "light and dark dealership color palettes persist offline"
Assert-Contains "src/components/ui/theme-color-editor.tsx" 'COLOR_FIELDS' "theme editor exposes semantic color controls"
Assert-Contains "src/components/ui/theme-color-editor.tsx" 'Hex color' "theme editor supports manual color selection"
Assert-Contains "src/app/(auth)/index.tsx" 'usePosTheme' "login uses the configured dealership theme"
Assert-Contains "src/app/(auth)/register.tsx" 'usePosTheme' "device registration uses the configured dealership theme"
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
Assert-Contains "src/app/(pos)/settings.tsx" 'RecoveryService\.restoreBackup' "database import uses the verified recovery service"
Assert-Contains "src/app/(pos)/sales.tsx" 'usePosTheme' "sales controls consume the active semantic palette"
Assert-Contains "src/app/(pos)/receipts.tsx" 'usePosTheme' "receipt controls consume the active semantic palette"
Assert-Contains "src/app/(pos)/products.tsx" 'usePosTheme' "product and detail controls consume the active semantic palette"
Assert-Contains "src/app/(pos)/reports.tsx" 'usePosTheme' "report controls consume the active semantic palette"
Assert-Contains "src/app/(pos)/customers.tsx" 'usePosTheme' "customer controls consume the active semantic palette"
Assert-Contains "src/components/ui/usb-barcode-scanner-input.tsx" 'usePosTheme' "shared scanner state follows the active semantic palette"
Assert-Contains "src/app/(pos)/business-settings.tsx" 'usePosTheme' "business configuration controls follow the active semantic palette"
Assert-Contains "src/app/(pos)/receipt-designer.tsx" 'trackColor=\{\{ false: theme\.surfaceAlt, true: theme\.primary \}\}' "receipt designer switches follow the active semantic palette"
Assert-Contains "src/components/layout/session-indicator.tsx" 'usePosTheme' "header session identity follows the active semantic palette"
Assert-Contains "src/app/(pos)/products.tsx" 'borderBottomColor: theme\.border' "product detail dividers follow the active semantic palette"
Assert-Contains "src/app/(pos)/receipts.tsx" 'color: theme\.primary' "receipt totals follow the active semantic palette"
Assert-Contains "src/app/(pos)/settings.tsx" 'bg: posTheme\.surfaceAlt' "unknown audit event badges follow the active semantic palette"
Assert-Contains "src/app/(pos)/settings.tsx" 'backgroundColor: posTheme\.surfaceAlt' "settings status and empty states follow the active semantic palette"
Assert-Contains "src/app/(pos)/receipts.tsx" 'showOmsSyncStatus &&' "Independent receipts hide operational OMS sync badges and retry actions"
Assert-Contains "src/lib/permissions/catalog.ts" 'INVENTORY_CLERK' "permission catalog includes safe role presets"
Assert-Contains "src/lib/services/permission.service.ts" 'replaceRolePermissions' "role permission assignments persist locally"
Assert-Contains "src/app/(pos)/settings.tsx" 'Roles & Permissions' "settings includes role and permission management"
Assert-Contains "src/lib/services/authorization.service.ts" 'requirePermission' "direct operations share a deny-by-default permission guard"
Assert-Contains "src/app/(pos)/_layout.tsx" 'permissionsLoaded && hasAnyRequiredPermission' "navigation denies unassigned permissions after loading"
Assert-Contains "src/lib/db/schema.ts" 'UserPermission' "versioned per-user permission overrides persist locally"
Assert-Contains "src/lib/permissions/catalog.ts" 'CRUD Operations' "permissions are categorized by access type"
Assert-Contains "src/lib/services/permission.service.ts" 'getEffectivePermissions' "runtime access combines role defaults with user overrides"
Assert-Contains "src/app/(pos)/settings.tsx" 'Users in \{selectedPermissionRole' "role selection reveals assigned users"
Assert-Contains "src/app/(pos)/settings.tsx" 'USER OVERRIDE' "individual access clearly distinguishes user overrides"
Assert-Contains "src/app/(pos)/settings.tsx" 'LAST_SETTINGS_SECTION_KEY' "settings restore the last opened section"
Assert-Contains "src/app/(pos)/settings.tsx" 'selectedPermissionRoleIdRef' "role selection does not recreate the page-loading callback"
Assert-Contains "src/app/(pos)/settings.tsx" 'BarcodeScannerModal' "hardware diagnostics include a camera barcode test"
Assert-Contains "src/app/(pos)/settings.tsx" 'UsbBarcodeScannerInput' "hardware diagnostics include a USB barcode test"
Assert-Contains "src/lib/services/cashier.service.ts" 'SUPER_ADMIN_PROFILE_KEY' "My Account persists the Super Admin display profile"
Assert-Contains "src/app/(pos)/_layout.tsx" 'onAccountPress=\{\(\) => router\.push\("/\(pos\)/user"' "My Account consistently opens the profile page"
Assert-Contains "src/app/(pos)/receipts.tsx" 'openExactReceiptFromSearch' "receipt barcode bursts are separated from text search"
Assert-Contains "src/app/(pos)/reports.tsx" 'DateRangeCalendar' "reports use the themed date-range calendar"
Assert-Contains "src/app/(pos)/reports.tsx" 'showOmsSyncStatus \? "Sales & Sync Status" : "Sales Records"' "independent reports hide operational sync status"
Assert-Contains "src/app/(pos)/index.tsx" '\.\.\.\(isIndependent \? \[\] : \[' "independent dashboard hides transfer and waiting-to-sync attention items"

Assert-NotContains "src/app/(auth)/register.tsx" 'selectedMode|stockResolution|independent-setup' "registration only supports OMS activation"
Assert-Contains "src/lib/services/device.service.ts" 'requestedOperatingMode: "NCT_DEPENDENT"' "activation always requests OMS-dependent operation"
Assert-Contains "src/lib/stores/business-config-store.ts" 'merge: \(persisted, current\)' "legacy cached configuration is normalized during hydration"
Assert-Contains "src/lib/business/configuration.service.ts" 'permanently configured for NCT OMS-dependent' "mode changes cannot enable independent operation"
Assert-NotContains "src/app/(pos)/business-settings.tsx" 'INDEPENDENT|changeOperatingMode|setNextMode' "branding settings do not offer independent operation"
Assert-NotContains "src/app/(pos)/products.tsx" 'independent-catalog|VariationStockModal' "catalog management stays in OMS"
if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "OMS-dependent POS platform validation passed."