<#
.SYNOPSIS
  Respaldo local completo para compartir o restaurar el proyecto en otra PC (sin secretos).

.DESCRIPTION
  Genera en -Destination:
    - velora_migrated_v25.dump  (pg_dump -Fc completo desde el contenedor Docker; se verifica con pg_restore --list)
    - storage-assets.zip        (apps/back/storage/assets, rutas con "/")
    - front-products.zip        (apps/front/src/assets/products, fotos de VÉLORA, rutas con "/")
    - .env.template             (SOLO los nombres de las variables del .env, sin valores)
    - LEEME.txt                 (pasos cortos; la guía completa está en docs/COMPARTIR_BD.md)
  La configuración de la BD se lee de .env (o de .env.example si no existe). Nunca imprime valores.
  ADVERTENCIA: el dump contiene correos y hashes de contraseñas. No se sube a GitHub.

.EXAMPLE
  .\scripts\backup-local.ps1
  .\scripts\backup-local.ps1 -Destination "$HOME\Documents\backups-velora\paquete-companero-2026-10-28"
#>
param(
  [string]$Destination = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) ("backups-velora\" + (Get-Date -Format "yyyy-MM-dd") + "-backup")),
  [string]$ContainerName = ""
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
if (-not $ContainerName) { $ContainerName = if ($config["VELORA_DB_CONTAINER"]) { $config["VELORA_DB_CONTAINER"] } else { "velora-local-v25" } }

Write-Host "Respaldo de '$database' (contenedor $ContainerName) en $Destination"
New-Item -ItemType Directory -Force $Destination | Out-Null

# 1) Dump completo dentro del contenedor (usa el usuario del propio contenedor) y verificación.
docker exec $ContainerName sh -c "pg_dump -U `"`$POSTGRES_USER`" -d $database -Fc -f /tmp/velora-backup.dump"
if ($LASTEXITCODE -ne 0) { throw "pg_dump falló (¿el contenedor $ContainerName está corriendo?)." }
docker cp "${ContainerName}:/tmp/velora-backup.dump" (Join-Path $Destination "$database.dump") | Out-Null
$entries = docker exec $ContainerName sh -c "pg_restore --list /tmp/velora-backup.dump | grep -c 'TABLE DATA'"
docker exec $ContainerName rm -f /tmp/velora-backup.dump | Out-Null
if ([int]$entries -lt 1) { throw "pg_restore --list no pudo leer el dump." }
Write-Host "  dump OK: $entries tablas con datos"

# 2) ZIPs con Python zipfile (rutas con "/" para que descompriman igual en Windows, Linux y macOS).
$python = @((Join-Path $repo "apps\ml\.venv\Scripts\python.exe"), "python", "py") | Where-Object { (Get-Command $_ -ErrorAction SilentlyContinue) } | Select-Object -First 1
if (-not $python) { throw "Se necesita Python 3 para crear los ZIP." }
$zipScript = Join-Path ([IO.Path]::GetTempPath()) "velora-zip-$PID.py"
@'
import os, sys, zipfile
source, target, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
count = 0
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for root, _dirs, files in os.walk(source):
        for name in files:
            full = os.path.join(root, name)
            archive.write(full, prefix + "/" + os.path.relpath(full, source).replace(os.sep, "/"))
            count += 1
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None and len(archive.namelist()) == count
print(count)
'@ | Set-Content -Encoding utf8 $zipScript
try {
  foreach ($item in @(@{ Source = "apps\back\storage\assets"; Zip = "storage-assets.zip"; Prefix = "assets" }, @{ Source = "apps\front\src\assets\products"; Zip = "front-products.zip"; Prefix = "products" })) {
    $source = Join-Path $repo $item.Source
    if (-not (Test-Path $source)) { Write-Warning "No existe $($item.Source): se omite $($item.Zip)."; continue }
    $onDisk = (Get-ChildItem $source -Recurse -File).Count
    $zipped = & $python -I $zipScript $source (Join-Path $Destination $item.Zip) $item.Prefix
    if ([int]$zipped -ne $onDisk) { throw "$($item.Zip): $zipped archivos en el ZIP y $onDisk en disco." }
    Write-Host "  $($item.Zip): $zipped archivos (igual que en disco)"
  }
} finally { Remove-Item $zipScript -ErrorAction SilentlyContinue }

# 3) Solo nombres de variables (sin valores) y LEEME corto.
$names = (Read-EnvFile $envFile).Keys | Sort-Object
($names | ForEach-Object { "$_=" }) | Set-Content -Encoding utf8 (Join-Path $Destination ".env.template")
@"
PAQUETE PARA RESTAURAR VÉLORA / TRAMA EN OTRA PC
================================================
ADVERTENCIA: $database.dump contiene correos y hashes de contraseñas.
No lo subas a GitHub ni lo compartas por canales públicos.

1. Clona el repositorio y crea .env desde .env.example (valores privados: ver docs/COMPARTIR_BD.md).
2. Copia esta carpeta y ejecuta desde la raíz del repo:
     .\scripts\restore-local.ps1 -Package "<ruta de esta carpeta>"
3. pnpm install ; pnpm build:packages ; pnpm db:migrate:up ; pnpm ml:db-role (opcional, ML)
4. Levanta back (pnpm dev:back) y front (pnpm dev:front). Si el 8080 está ocupado usa PORT=18080.
Guía completa: docs/COMPARTIR_BD.md
"@ | Set-Content -Encoding utf8 (Join-Path $Destination "LEEME.txt")

Get-ChildItem -Force $Destination | ForEach-Object { "  {0,-28} {1,8:N1} MB" -f $_.Name, ($_.Length / 1MB) }
Write-Host "Listo."
