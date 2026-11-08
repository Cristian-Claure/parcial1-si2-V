# Despliega el backend (Nest) y, opcionalmente, el servicio ML a App Service.
# ZIP con Python zipfile (rutas "/"), build en Oryx con corepack + pnpm, plan B2 solo durante
# el build y luego B1. App Settings desde .env.azure.local sin imprimir valores.
#   .\scripts\azure\deploy-back.ps1            # settings + ZIP backend
#   .\scripts\azure\deploy-back.ps1 -Ml        # ademas el servicio ML
#   .\scripts\azure\deploy-back.ps1 -SettingsOnly   # solo App Settings + reinicio
param(
  [switch]$Ml,
  [switch]$SkipBackend,
  [switch]$SettingsOnly,
  [switch]$NoScale,
  [string]$PythonExe = "python"
)
. (Join-Path $PSScriptRoot "common.ps1")
$c = Connect-TramaAzure
$rg = $c.ResourceGroup
$e = Read-DotEnv $EnvFile
$backUrl = Get-BackendUrl $c
$webHost = Invoke-Az staticwebapp show -g $rg -n $c.StaticApp --query defaultHostname -o tsv
$webUrl = "https://$webHost"
$mlUrl = "https://$($c.MlApp).azurewebsites.net"
$mlDeployed = Test-AzExists { az webapp show -g $rg -n $c.MlApp -o none }

function Set-AppSettings([string]$App, [hashtable]$Settings) {
  $file = [IO.Path]::GetTempFileName()
  try {
    $list = foreach ($k in $Settings.Keys) { @{ name = $k; value = [string]$Settings[$k]; slotSetting = $false } }
    [IO.File]::WriteAllText($file, (ConvertTo-Json @($list) -Depth 3), (New-Object System.Text.UTF8Encoding($false)))
    Invoke-Az webapp config appsettings set -g $rg -n $App --settings "@$file" -o none | Out-Null
  } finally { Remove-Item $file -Force -ErrorAction SilentlyContinue }
}

$back = @{
  NODE_ENV                               = "production"
  SCM_DO_BUILD_DURING_DEPLOYMENT         = "true"
  ENABLE_ORYX_BUILD                      = "true"
  SCM_COMMAND_IDLE_TIMEOUT               = "1800"
  WEBSITES_CONTAINER_START_TIME_LIMIT    = "600"
  CUSTOM_BUILD_COMMAND                   = "corepack enable && corepack prepare pnpm@11.24.0 --activate && pnpm install --frozen-lockfile --filter `"@velora/back...`" && pnpm build:azure:back"
  DATABASE_URL                           = $e.DATABASE_URL
  VELORA_JWT_SECRET                      = $e.VELORA_JWT_SECRET
  VELORA_CORS_ALLOWED_ORIGINS            = $webUrl
  VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS  = "true"
  VELORA_PUBLIC_BACKEND_URL              = $backUrl
  VELORA_PUBLIC_WEB_URL                  = $webUrl
  STRIPE_SECRET_KEY                      = $e.STRIPE_SECRET_KEY
  STRIPE_SUCCESS_URL                     = "$webUrl/pago/stripe/retorno"
  STRIPE_CANCEL_URL                      = "$webUrl/mis-pedidos"
  VELORA_ASSET_STORAGE_PROVIDER          = "AZURE_BLOB"
  AZURE_STORAGE_CONNECTION_STRING        = $e.AZURE_STORAGE_CONNECTION_STRING
  VELORA_AZURE_BLOB_CONTAINER            = $c.BlobContainer
  VELORA_QR_PROVIDER                     = "DEMO"
  VELORA_QR_SIGNING_SECRET               = $e.VELORA_QR_SIGNING_SECRET
  VELORA_TRYON_PROVIDER                  = "LOCAL"
  VELORA_ML_TOKEN                        = $e.VELORA_ML_TOKEN
  VELORA_ML_URL                          = $(if ($mlDeployed) { $mlUrl } else { "http://127.0.0.1:8090" })
}
if ($e.STRIPE_WEBHOOK_SECRET) { $back.STRIPE_WEBHOOK_SECRET = $e.STRIPE_WEBHOOK_SECRET }
foreach ($k in "BOOTSTRAP_ADMIN_ENABLED", "BOOTSTRAP_ADMIN_EMAIL", "BOOTSTRAP_ADMIN_PASSWORD", "BOOTSTRAP_ADMIN_FIRST_NAME", "BOOTSTRAP_ADMIN_LAST_NAME",
  "BOOTSTRAP_PLATFORM_ADMIN_ENABLED", "BOOTSTRAP_PLATFORM_ADMIN_EMAIL", "BOOTSTRAP_PLATFORM_ADMIN_PASSWORD") {
  if ($e[$k]) { $back[$k] = $e[$k] }
}
# Sin OpenAI ni Replicate en la nube: no se configuran sus claves.
# El limite de intentos de login queda en el valor por defecto del codigo (no se sube).
Set-AppSettings $c.BackApp $back
Write-Host "App Settings del backend aplicados ($($back.Count))."

if ($mlDeployed) {
  Set-AppSettings $c.MlApp @{
    SCM_DO_BUILD_DURING_DEPLOYMENT = "true"
    ENABLE_ORYX_BUILD              = "true"
    VELORA_ML_TOKEN                = $e.VELORA_ML_TOKEN
    VELORA_ML_DATABASE_URL         = $e.VELORA_ML_DATABASE_URL
    VELORA_ML_ARTIFACTS_DIR        = "/home/data/ml-artifacts"
    VELORA_ML_SEED_LABELS          = "/home/site/wwwroot/seed-labels.json"
  }
  Write-Host "App Settings del ML aplicados."
}

if ($SettingsOnly) {
  Invoke-Az webapp restart -g $rg -n $c.BackApp -o none
  Write-Host "Backend reiniciado."
  return
}

$out = Join-Path ([IO.Path]::GetTempPath()) "trama-deploy"
New-Item -ItemType Directory -Force $out | Out-Null
$zipper = Join-Path $PSScriptRoot "zipdir.py"

if (-not $NoScale) { Write-Host "Plan -> B2 durante el build"; Invoke-Az appservice plan update -g $rg -n $c.Plan --sku B2 -o none }
try {
  if (-not $SkipBackend) {
    $zip = Join-Path $out "back.zip"
    & $PythonExe $zipper $script:RepoRoot $zip --include package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json `
      packages apps/back apps/front/package.json apps/mobile/package.json --exclude-dir dist coverage apps/back/storage
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear back.zip" }
    Write-Host "Subiendo backend (build Oryx, puede tardar ~10 min) ..."
    Invoke-Az webapp deployment source config-zip -g $rg -n $c.BackApp --src $zip --timeout 1800 -o none | Out-Null
    Remove-Item $zip -Force
  }
  if ($Ml -and $mlDeployed) {
    $mlZip = Join-Path $out "ml.zip"
    $mlRoot = Join-Path $script:RepoRoot "apps\ml"
    $seed = Join-Path $script:RepoRoot "scripts\.seed-progress\seed-20251001-all.json"
    $extra = @(); if (Test-Path $seed) { $extra = @("--extra", "$seed=seed-labels.json") }
    & $PythonExe $zipper $mlRoot $mlZip --include velora_ml requirements.txt @extra
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear ml.zip" }
    Write-Host "Subiendo servicio ML (build Oryx) ..."
    Invoke-Az webapp deployment source config-zip -g $rg -n $c.MlApp --src $mlZip --timeout 1800 -o none | Out-Null
    Remove-Item $mlZip -Force
  }
} finally {
  if (-not $NoScale) { Write-Host "Plan -> B1"; Invoke-Az appservice plan update -g $rg -n $c.Plan --sku B1 -o none }
}
Write-Host "Despliegue terminado: $backUrl"
