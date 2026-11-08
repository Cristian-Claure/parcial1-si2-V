# Compila la web + PWA con la URL publica del backend y la publica en Static Web Apps (Free).
# staticwebapp.config.json (fallback SPA, sw.js sin cache) viaja dentro de dist desde public/.
#   .\scripts\azure\deploy-front.ps1 [-SkipBuild]
param([switch]$SkipBuild)
. (Join-Path $PSScriptRoot "common.ps1")
$ErrorActionPreference = "Continue"
$c = Connect-TramaAzure
$rg = $c.ResourceGroup
$dist = Join-Path $script:RepoRoot "apps\front\dist"

if (-not $SkipBuild) {
  $env:VITE_API_BASE_URL = Get-BackendUrl $c
  $env:VITE_STOREFRONT_COMPANY_ID = ""
  Push-Location $script:RepoRoot
  try { & pnpm --silent build:azure:front; if ($LASTEXITCODE -ne 0) { throw "build:azure:front fallo." } }
  finally { Pop-Location; Remove-Item Env:VITE_API_BASE_URL, Env:VITE_STOREFRONT_COMPANY_ID -ErrorAction SilentlyContinue }
}
foreach ($f in "index.html", "staticwebapp.config.json", "sw.js", "manifest.webmanifest") {
  if (-not (Test-Path (Join-Path $dist $f))) { throw "Falta $f en apps/front/dist." }
}

$env:SWA_CLI_DEPLOYMENT_TOKEN = Invoke-Az staticwebapp secrets list -g $rg -n $c.StaticApp --query properties.apiKey -o tsv
try {
  & npx --yes "@azure/static-web-apps-cli@2.0.2" deploy $dist --env production --no-use-keychain
  if ($LASTEXITCODE -ne 0) { throw "swa deploy fallo." }
} finally { Remove-Item Env:SWA_CLI_DEPLOYMENT_TOKEN -ErrorAction SilentlyContinue }
$webHost = Invoke-Az staticwebapp show -g $rg -n $c.StaticApp --query defaultHostname -o tsv
Write-Host "Web publicada: https://$webHost"
