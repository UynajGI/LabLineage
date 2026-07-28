[CmdletBinding()]
param(
  [Parameter()]
  [string]$DatabaseUrl = $env:DATABASE_URL,

  [Parameter()]
  [string]$OutputDirectory = ".\backups"
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL or -DatabaseUrl is required."
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "pg_dump is not installed or not on PATH."
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $resolvedOutput "lablineage-$timestamp.dump"

& pg_dump "--dbname=$DatabaseUrl" --format=custom --compress=9 "--file=$backupFile"
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE."
}

$hash = (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash.ToLowerInvariant()
$hashFile = "$backupFile.sha256"
"$hash  $([IO.Path]::GetFileName($backupFile))" | Set-Content -LiteralPath $hashFile -Encoding ascii

Write-Output ([pscustomobject]@{
  backup = $backupFile
  sha256 = $hash
  hashFile = $hashFile
})
