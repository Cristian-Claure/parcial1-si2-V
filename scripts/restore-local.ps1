<#
.SYNOPSIS
  Restaura el proyecto en esta PC desde un paquete generado con backup-local.ps1 (sin secretos).

.DESCRIPTION
  1. Lee la configuración de la BD de .env (o de .env.example).
  2. Crea el contenedor Postgres (postgres:17-alpine) con el mismo nombre, puerto y base si no existe.
  3. Restaura el dump con pg_restore (--clean --if-exists --no-owner --no-acl).
  4. Descomprime storage-assets.zip en apps/back/storage/assets y front-products.zip en
     apps/front/src/assets/products (salvo -SkipAssets).
  Después: pnpm install, pnpm build:packages, pnpm db:migrate:up y, para ML, pnpm ml:db-role.

.EXAMPLE
  .\scripts\restore-local.ps1 -Package "D:\paquete-companero-2026-10-28"
#>
param(
  [Parameter(Mandatory = $true)][string]$Package,
  [string]$ContainerName = "",
  [int]$Port = 0,
  [switch]$SkipAssets
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

function Read-EnvFile([string]$path) {
  $values = @{}
  foreach ($line in Get-Content $path) {
    $trimmed = $line.Trim()
    if ($trimmed -and -not $trimmed.StartsWith("#") -and $trimmed.Contains("=")) {
      $name, $value = $trimmed -split "=", 2
      $values[$name.Trim()] = $value.Trim().Trim('"')
    }
  }
  return $values
}

$envFile = if (Test-Path (Join-Path $repo ".env")) { Join-Path $repo ".env" } else { Join-Path $repo ".env.example" }
$config = Read-EnvFile $envFile
$database = if ($config["VELORA_DB_NAME"]) { $config["VELORA_DB_NAME"] } else { "velora_migrated_v25" }
$user = if ($config["VELORA_DB_USER"]) { $config["VELORA_DB_USER"] } else { "velora" }
$password = $config["VELORA_DB_PASSWORD"]
if (-not $Port) { $Port = if ($config["VELORA_DB_PORT"]) { [int]$config["VELORA_DB_PORT"] } else { 55433 } }
if (-not $ContainerName) { $ContainerName = if ($config["VELORA_DB_CONTAINER"]) { $config["VELORA_DB_CONTAINER"] } else { "velora-local-v25" } }
if (-not $password) { throw "Falta VELORA_DB_PASSWORD en .env (créalo desde .env.example y define una contraseña local)." }

$dump = Get-ChildItem $Package -Filter "*.dump" | Select-Object -First 1
if (-not $dump) { throw "No hay un archivo .dump en $Package." }
docker info *> $null; if ($LASTEXITCODE -ne 0) { throw "Docker no responde: inicia Docker Desktop." }

# 1) Contenedor Postgres con el mismo nombre, puerto y base.
$exists = docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}"
if (-not $exists) {
  Write-Host "Creando el contenedor $ContainerName en el puerto $Port…"
  docker run -d --name $ContainerName -e "POSTGRES_USER=$user" -e "POSTGRES_PASSWORD=$password" -e "POSTGRES_DB=$database" -p "${Port}:5432" postgres:17-alpine | Out-Null
} else {
  docker start $ContainerName | Out-Null
}
for ($i = 0; $i -lt 60; $i++) { docker exec $ContainerName pg_isready -q *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 1 }
if ($LASTEXITCODE -ne 0) { throw "Postgres no quedó listo en $ContainerName." }
docker exec $ContainerName sh -c "psql -U `"`$POSTGRES_USER`" -d postgres -tAc `"select 1 from pg_database where datname='$database'`" | grep -q 1 || createdb -U `"`$POSTGRES_USER`" $database"

# 2) Restauración (sin dueños ni permisos: el rol de ML se recrea con pnpm ml:db-role).
docker cp $dump.FullName "${ContainerName}:/tmp/velora-restore.dump" | Out-Null
docker exec $ContainerName sh -c "pg_restore -U `"`$POSTGRES_USER`" -d $database --clean --if-exists --no-owner --no-acl /tmp/velora-restore.dump"
$code = $LASTEXITCODE
docker exec $ContainerName rm -f /tmp/velora-restore.dump | Out-Null
$orders = docker exec $ContainerName sh -c "psql -U `"`$POSTGRES_USER`" -d $database -tAc 'select count(*) from orders'"
if (-not $orders) { throw "La restauración falló (pg_restore terminó con código $code)." }
Write-Host "  BD restaurada: $($orders.Trim()) pedidos (pg_restore código $code; avisos de --clean en una base vacía son normales)."

# 3) Assets: logos/banners e imágenes de producto; fotos de VÉLORA.
if (-not $SkipAssets) {
  foreach ($item in @(@{ Zip = "storage-assets.zip"; Target = "apps\back\storage" }, @{ Zip = "front-products.zip"; Target = "apps\front\src\assets" })) {
    $zip = Join-Path $Package $item.Zip
    if (-not (Test-Path $zip)) { Write-Warning "No está $($item.Zip): se omite."; continue }
    $target = Join-Path $repo $item.Target
    New-Item -ItemType Directory -Force $target | Out-Null
    Expand-Archive -Path $zip -DestinationPath $target -Force
    Write-Host "  $($item.Zip) → $($item.Target)"
  }
}
Write-Host "Listo. Sigue con: pnpm install ; pnpm build:packages ; pnpm db:migrate:up  (y pnpm ml:db-role para ML)."
