# Restaura (re-ejecutable) la BD de la demo en Azure PostgreSQL: BORRA y recrea la base,
# pg_restore del dump, rol velora_ml de minimo privilegio y migraciones al dia.
# Usa la imagen postgres:17-alpine como cliente; la BD local solo se lee (pg_dump).
#   .\scripts\azure\restore-db.ps1 -DumpPath C:\ruta\trama.dump
#   .\scripts\azure\restore-db.ps1 -FromContainer velora-local-v25 -SourceDb velora_migrated_v25
param(
  [string]$DumpPath,
  [string]$FromContainer,
  [string]$SourceDb = "velora_migrated_v25",
  [string]$SourceUser = "velora",
  [string]$ClientImage = "postgres:17-alpine"
)
. (Join-Path $PSScriptRoot "common.ps1")
$ErrorActionPreference = "Continue"  # los nativos escriben avisos en stderr; se valida $LASTEXITCODE
$c = Get-TramaConfig
$e = $c.Env
if (-not $e.DATABASE_URL) { throw "Falta DATABASE_URL en .env.azure.local (ejecuta provision.ps1)." }

$workDir = Join-Path ([IO.Path]::GetTempPath()) "trama-restore"
New-Item -ItemType Directory -Force $workDir | Out-Null
if ($FromContainer) {
  # Dump nuevo (solo lectura) desde el contenedor local.
  & docker exec $FromContainer pg_dump -U $SourceUser -d $SourceDb -Fc --no-owner --no-privileges -f /tmp/trama_azure.dump
  if ($LASTEXITCODE -ne 0) { throw "pg_dump fallo." }
  & docker cp "${FromContainer}:/tmp/trama_azure.dump" (Join-Path $workDir "trama.dump"); & docker exec $FromContainer rm -f /tmp/trama_azure.dump
  $DumpPath = Join-Path $workDir "trama.dump"
}
if (-not $DumpPath -or -not (Test-Path $DumpPath)) { throw "Indica -DumpPath o -FromContainer." }
Copy-Item $DumpPath (Join-Path $workDir "trama.dump") -Force -ErrorAction SilentlyContinue

$u = [Uri]$e.DATABASE_URL
$adminUser = [Uri]::UnescapeDataString($u.UserInfo.Split(":")[0])
$env:PGPASSWORD = [Uri]::UnescapeDataString($u.UserInfo.Split(":", 2)[1])
$env:PGSSLMODE = "require"
$pgHost = $u.Host; $db = $u.AbsolutePath.TrimStart("/")

function Invoke-Psql([string]$Database, [string]$Sql) {
  $Sql | & docker run --rm -i -e PGPASSWORD -e PGSSLMODE $ClientImage psql -h $pgHost -U $adminUser -d $Database -v ON_ERROR_STOP=1 -q -X
  if ($LASTEXITCODE -ne 0) { throw "psql fallo en $Database." }
}

Write-Host "1/4 Recreando la base $db en $pgHost ..."
Invoke-Psql "postgres" "DROP DATABASE IF EXISTS `"$db`" WITH (FORCE);"
Invoke-Psql "postgres" "CREATE DATABASE `"$db`";"

Write-Host "2/4 pg_restore ..."
& docker run --rm -e PGPASSWORD -e PGSSLMODE -v "${workDir}:/work:ro" $ClientImage `
  sh -c "pg_restore -l /work/trama.dump | grep -v 'COMMENT - EXTENSION' > /tmp/list && pg_restore -h $pgHost -U $adminUser -d $db --no-owner --no-privileges --exit-on-error -L /tmp/list /work/trama.dump"
if ($LASTEXITCODE -ne 0) { throw "pg_restore fallo." }

Write-Host "3/4 Rol velora_ml (minimo privilegio, statement_timeout 45 min) ..."
$mlPw = $e.VELORA_ML_DB_PASSWORD.Replace("'", "''")
Invoke-Psql $db @"
DO `$`$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'velora_ml') THEN
    ALTER ROLE velora_ml WITH LOGIN PASSWORD '$mlPw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  ELSE
    CREATE ROLE velora_ml WITH LOGIN PASSWORD '$mlPw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END `$`$;
ALTER ROLE velora_ml SET statement_timeout = '45min';
GRANT CONNECT ON DATABASE "$db" TO velora_ml;
GRANT USAGE ON SCHEMA public TO velora_ml;
GRANT SELECT ON companies, stores, warehouses, orders, order_items, payments TO velora_ml;
GRANT SELECT (id, email, created_at) ON app_users TO velora_ml;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_runs, ml_forecasts, ml_customer_segments, ml_anomalies, ml_order_risk TO velora_ml;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO velora_ml;
"@

Write-Host "4/4 Migraciones al dia ..."
$prevDb = $env:DATABASE_URL
$env:DATABASE_URL = $e.DATABASE_URL
try {
  Push-Location $script:RepoRoot
  & pnpm --silent db:migrate:up
  if ($LASTEXITCODE -ne 0) { throw "migrate:up fallo." }
} finally { Pop-Location; $env:DATABASE_URL = $prevDb; Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }

Remove-Item (Join-Path $workDir "trama.dump") -Force -ErrorAction SilentlyContinue
Write-Host "Restauracion completa."
