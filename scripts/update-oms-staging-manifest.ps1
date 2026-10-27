$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$overlayRoot = Join-Path $workspace 'oms-staging'
$omsRoot = [IO.Path]::GetFullPath((Join-Path $workspace '../nctalavera-system'))
$manifestPath = Join-Path $overlayRoot 'manifest.json'
$previous = if (Test-Path -LiteralPath $manifestPath) { @(Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json) } else { @() }
$entries = @(Get-ChildItem -LiteralPath (Join-Path $overlayRoot 'src') -File -Recurse | ForEach-Object {
  # Match .gitattributes so checksums survive checkout on Windows or Linux.
  $sourceText = [IO.File]::ReadAllText($_.FullName).Replace("`r`n", "`n")
  [IO.File]::WriteAllText($_.FullName, $sourceText, (New-Object Text.UTF8Encoding($false)))
  $relative = $_.FullName.Substring($overlayRoot.Length + 1).Replace('\','/')
  $prior = $previous | Where-Object { $_.path -eq $relative } | Select-Object -First 1
  $original = Join-Path $omsRoot $relative
  $originalHash = if ($prior) { $prior.originalHash } elseif (Test-Path -LiteralPath $original) { (Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash } else { $null }
  [PSCustomObject]@{ path = $relative; originalHash = $originalHash;
    previousPatchHashes = @(@($prior.previousPatchHashes) + @($prior.patchHash) | Where-Object { $_ } | Select-Object -Unique);
    patchHash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
})
$entries | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
