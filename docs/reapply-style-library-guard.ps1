# Re-apply the "read the library" guard to the third-party
# gpt-image-2-style-library skill.
#
# Why this exists: that skill's SKILL.md tells the agent to read
# `references/style-library.md` before choosing a template, but the instruction
# reads as background prose, so an agent can skip the read and still cite
# template names, IDs and example-case numbers from memory. The patch in
# style-library-skill-guard.patch turns that line into a gate.
#
# The skill lives outside this repository (it is installed under the user's
# home), so an upstream update or a reinstall silently drops the guard. Run this
# script to put it back.
#
#   pwsh -File docs/reapply-style-library-guard.ps1
#   pwsh -File docs/reapply-style-library-guard.ps1 -Target <path-to-SKILL.md>
#
# Exits 0 when the guard is present at the end (applied now or already there),
# 1 when it could not be applied.

[CmdletBinding()]
param(
  [string]$Target = (Join-Path $HOME '.agents\skills\gpt-image-2-style-library\SKILL.md'),
  [string]$Patch = (Join-Path $PSScriptRoot 'style-library-skill-guard.patch'),
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Target -PathType Leaf)) {
  Write-Host "FAIL  target not found: $Target"
  Write-Host "      Install the skill first, or pass -Target <path-to-SKILL.md>."
  exit 1
}

if (-not (Test-Path -LiteralPath $Patch -PathType Leaf)) {
  Write-Host "FAIL  patch not found: $Patch"
  exit 1
}

# The gate line is the marker: present means the guard is already in place.
$marker = 'Gate: you cannot cite what you have not read'
$current = Get-Content -LiteralPath $Target -Raw
if ($current.Contains($marker)) {
  Write-Host "OK    guard already present, nothing to do"
  Write-Host "      $Target"
  exit 0
}

# The backup belongs in the temp dir, NOT next to the skill: writing
# SKILL.md.bak-* into the user's skills folder turns one guard file into an
# ever-growing pile of them.
$targetDir = Split-Path -Parent (Resolve-Path -LiteralPath $Target).Path
$backup = Join-Path ([System.IO.Path]::GetTempPath()) ("stylelib-guard-" + [guid]::NewGuid().ToString('n') + ".bak")

Push-Location -LiteralPath $targetDir
try {
  # Dry run first, so a target whose content moved on fails before any write.
  & git apply --check -p1 $Patch 2>&1 | ForEach-Object { Write-Host "      $_" }
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL  the patch does not apply to this file."
    Write-Host "      Most likely the skill was reinstalled or updated upstream, so the"
    Write-Host "      context lines no longer match. Reinstall it, then re-run this script;"
    Write-Host "      if it still fails, port the three edits by hand from the patch."
    exit 1
  }

  Copy-Item -LiteralPath $Target -Destination $backup -Force

  & git apply -p1 $Patch 2>&1 | ForEach-Object { Write-Host "      $_" }
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL  git apply failed; restoring the backup"
    Copy-Item -LiteralPath $backup -Destination $Target -Force
    exit 1
  }
}
finally {
  Pop-Location
}

$after = Get-Content -LiteralPath $Target -Raw
if ($after.Contains($marker)) {
  Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
  Write-Host "OK    guard applied"
  Write-Host "      $Target"
  exit 0
}

Write-Host "FAIL  patch reported success but the marker is absent; restoring the backup"
Copy-Item -LiteralPath $backup -Destination $Target -Force
Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
exit 1
