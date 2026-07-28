[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,

  [Parameter()]
  [string]$DatabaseUrl = $env:DATABASE_URL,

  [Parameter(Mandatory = $true)]
  [string]$ConfirmDatabase
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL or -DatabaseUrl is required."
}
foreach ($command in @("pg_restore", "psql")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is not installed or not on PATH."
  }
}

$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$databaseUri = [Uri]$DatabaseUrl
$databaseName = $databaseUri.AbsolutePath.TrimStart("/")
if ([string]::IsNullOrWhiteSpace($databaseName) -or $ConfirmDatabase -cne $databaseName) {
  throw "Refusing restore: -ConfirmDatabase must exactly match '$databaseName'."
}

$hashFile = "$resolvedBackup.sha256"
if (Test-Path -LiteralPath $hashFile) {
  $expectedHash = ((Get-Content -LiteralPath $hashFile -Raw).Trim() -split "\s+")[0]
  $actualHash = (Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -cne $expectedHash.ToLowerInvariant()) {
    throw "Backup checksum verification failed."
  }
}

& pg_restore "--dbname=$DatabaseUrl" --clean --if-exists --no-owner --no-privileges $resolvedBackup
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE."
}

$verificationSql = @"
SELECT json_build_object(
  'projects', (SELECT count(*) FROM projects),
  'artifact_versions', (SELECT count(*) FROM artifact_versions),
  'evidence', (SELECT count(*) FROM evidence),
  'audit_events', (SELECT count(*) FROM audit_events)
);
"@
& psql "--dbname=$DatabaseUrl" --no-psqlrc --tuples-only --command $verificationSql
if ($LASTEXITCODE -ne 0) {
  throw "Restore completed, but verification query failed."
}
