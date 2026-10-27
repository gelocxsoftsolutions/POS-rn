param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $workspace 'oms-staging'
$targetRoot = [IO.Path]::GetFullPath((Join-Path $workspace '../nctalavera-system'))
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'manifest.json') -Raw | ConvertFrom-Json
$backupRoot = Join-Path $workspace ('docs/phase1/oms-source-backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

# Source changes only. This script never runs Docker, SQL, builds or migrations.
foreach ($entry in $manifest) {
  if (-not $entry.path.StartsWith('src/')) { throw 'Only application source is allowed.' }
  $target = [IO.Path]::GetFullPath((Join-Path $targetRoot $entry.path))
  if (-not $target.StartsWith($targetRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Target escapes OMS source.' }
  $patch = Join-Path $sourceRoot $entry.path
  if ((Get-FileHash -LiteralPath $patch -Algorithm SHA256).Hash -ne $entry.patchHash) { throw "Patch changed: $($entry.path)" }
  $currentHash = if (Test-Path -LiteralPath $target) { (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash } else { $null }
  if ($currentHash -ne $entry.originalHash -and $currentHash -ne $entry.patchHash) { throw "OMS source changed independently: $($entry.path). Review before applying." }
}
foreach ($entry in $manifest) {
  $target = Join-Path $targetRoot $entry.path
  if (Test-Path -LiteralPath $target) {
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $entry.patchHash) { continue }
  }
  Write-Output "$($entry.path) -> OMS source (not deployed)"
  if ($Apply) {
    if (Test-Path -LiteralPath $target) {
      $backup = Join-Path $backupRoot $entry.path
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
      Copy-Item -LiteralPath $target -Destination $backup
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot $entry.path) -Destination $target
  }
}
if (-not $Apply) { Write-Output 'Preview only. No OMS files changed.' }
