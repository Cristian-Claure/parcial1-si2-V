# Sube los activos administrados (apps/back/storage/assets, solo lectura) al contenedor privado
# de Azure Blob y verifica que la cantidad coincida con la local.
#   .\scripts\azure\upload-assets.ps1 [-Source apps\back\storage\assets]
param([string]$Source)
. (Join-Path $PSScriptRoot "common.ps1")
$c = Connect-TramaAzure
if (-not $Source) { $Source = "apps/back/storage/assets" }
# Ruta relativa a la raiz: az.cmd falla con rutas que contienen espacios.
Push-Location $script:RepoRoot
$conn = (Read-DotEnv $EnvFile).AZURE_STORAGE_CONNECTION_STRING
if (-not $conn) { throw "Falta AZURE_STORAGE_CONNECTION_STRING (ejecuta provision.ps1)." }
$env:AZURE_STORAGE_CONNECTION_STRING = $conn

# Solo claves validas del backend (uuid.ext en la raiz); se ignoran subcarpetas y otros archivos.
$keyPattern = '^[0-9a-fA-F-]{36}\.(jpg|png|webp|pdf)$'
$local = @(Get-ChildItem -LiteralPath $Source -File | Where-Object { $_.Name -match $keyPattern })
Write-Host "Locales: $($local.Count) archivos"
foreach ($ext in "jpg", "png", "webp", "pdf") {
  if ($local | Where-Object { $_.Extension -eq ".$ext" }) {
    Invoke-Az storage blob upload-batch --destination $c.BlobContainer --source $Source --pattern "*.$ext" --overwrite true --max-connections 8 --only-show-errors -o none | Out-Null
  }
}
# (sin length(@): az.cmd rompe con parentesis)
$remote = @(Invoke-Az storage blob list --container-name $c.BlobContainer --num-results "*" --query "[].name" -o tsv --only-show-errors | Where-Object { $_ }).Count
Remove-Item Env:AZURE_STORAGE_CONNECTION_STRING; Pop-Location
Write-Host "En Azure Blob: $remote"
if ($remote -ne $local.Count) { throw "La cantidad no coincide (local $($local.Count) / blob $remote)." }
Write-Host "OK: cantidades coinciden."
