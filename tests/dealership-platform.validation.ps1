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

Assert-Contains "src/lib/db/schema.ts" 'SCHEMA_VERSION = 8' "versioned dealership migration"
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

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "Dealership platform validation passed (26 source contracts)."
