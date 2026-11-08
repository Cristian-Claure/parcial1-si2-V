# Aprovisiona la demo de TRAMA en Azure (idempotente). Lee y escribe secretos SOLO en
# .env.azure.local (ignorado por Git) sin imprimirlos.
#   .\scripts\azure\provision.ps1 [-Location centralus] [-SkipMl]
param(
  [string]$Location,
  [switch]$SkipMl
)
. (Join-Path $PSScriptRoot "common.ps1")
if ($Location) { $env:TRAMA_LOCATION = $Location }
$c = Connect-TramaAzure
$rg = $c.ResourceGroup; $loc = $c.Location
Write-Host "Región: $loc · Grupo: $rg"

# 1) Grupo
if (-not (Test-AzExists { az group show -n $rg -o none })) { Invoke-Az group create -n $rg -l $loc -o none }

# 2) Storage Standard LRS + contenedor privado de activos
if (-not (Test-AzExists { az storage account show -g $rg -n $c.Storage -o none })) {
  Invoke-Az storage account create -g $rg -n $c.Storage -l $loc --sku Standard_LRS --kind StorageV2 `
    --min-tls-version TLS1_2 --allow-blob-public-access false --https-only true -o none
}
$storageConn = Invoke-Az storage account show-connection-string -g $rg -n $c.Storage --query connectionString -o tsv
Invoke-Az storage container create --name $c.BlobContainer --connection-string $storageConn --public-access off -o none
Set-DotEnvValue $EnvFile "AZURE_STORAGE_CONNECTION_STRING" $storageConn
Write-Host "Storage listo ($($c.Storage)/$($c.BlobContainer), privado)."

# 3) PostgreSQL Flexible Server v17 B1ms 32 GB
$e = Read-DotEnv $EnvFile
$pgHost = "$($c.PgServer).postgres.database.azure.com"
if (-not (Test-AzExists { az postgres flexible-server show -g $rg -n $c.PgServer -o none })) {
  Invoke-Az postgres flexible-server create -g $rg -n $c.PgServer -l $loc --tier Burstable --sku-name Standard_B1ms `
    --storage-size 32 --version 17 --admin-user $e.AZURE_POSTGRES_ADMIN_USER --admin-password $e.AZURE_POSTGRES_ADMIN_PASSWORD `
    --public-access Disabled --backup-retention 7 --storage-auto-grow Disabled --yes -o none
}
# Acceso publico solo a traves de las reglas de firewall de abajo.
Invoke-Az postgres flexible-server update -g $rg -n $c.PgServer --public-access Enabled -o none
# Extensiones que usa el esquema (pgcrypto; plpgsql viene de serie).
Invoke-Az postgres flexible-server parameter set -g $rg -s $c.PgServer --name azure.extensions --value PGCRYPTO -o none
# Reglas: servicios de Azure (App Service) y la IP pública actual (restauración/migraciones).
Invoke-Az postgres flexible-server firewall-rule create -g $rg -s $c.PgServer --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none
$myIp = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json").ip
Invoke-Az postgres flexible-server firewall-rule create -g $rg -s $c.PgServer --name OperatorIp --start-ip-address $myIp --end-ip-address $myIp -o none
$enc = { param($s) [Uri]::EscapeDataString($s) }
Set-DotEnvValue $EnvFile "DATABASE_URL" ("postgresql://{0}:{1}@{2}:5432/{3}?sslmode=require" -f (& $enc $e.AZURE_POSTGRES_ADMIN_USER), (& $enc $e.AZURE_POSTGRES_ADMIN_PASSWORD), $pgHost, $c.PgDatabase)
Set-DotEnvValue $EnvFile "VELORA_ML_DATABASE_URL" ("postgresql://velora_ml:{0}@{1}:5432/{2}?sslmode=require" -f (& $enc $e.VELORA_ML_DB_PASSWORD), $pgHost, $c.PgDatabase)
Write-Host "PostgreSQL listo ($pgHost)."

# 4) App Service Plan Linux B1 + Web App Node 22 (backend)
if (-not (Test-AzExists { az appservice plan show -g $rg -n $c.Plan -o none })) {
  Invoke-Az appservice plan create -g $rg -n $c.Plan -l $loc --is-linux --sku B1 -o none
}
if (-not (Test-AzExists { az webapp show -g $rg -n $c.BackApp -o none })) {
  Invoke-Az webapp create -g $rg -p $c.Plan -n $c.BackApp --runtime "NODE:22-lts" -o none
}
Invoke-Az webapp config set -g $rg -n $c.BackApp --always-on true --http20-enabled true --min-tls-version 1.2 --ftps-state Disabled `
  --startup-file "cd apps/back && node dist/main.js" -o none
Invoke-Az webapp update -g $rg -n $c.BackApp --https-only true -o none
Write-Host "Backend: $(Get-BackendUrl $c)"

# 5) Web App Python (servicio ML) en el mismo plan
if (-not $SkipMl) {
  if (-not (Test-AzExists { az webapp show -g $rg -n $c.MlApp -o none })) {
    Invoke-Az webapp create -g $rg -p $c.Plan -n $c.MlApp --runtime "PYTHON:3.12" -o none
  }
  Invoke-Az webapp config set -g $rg -n $c.MlApp --always-on true --min-tls-version 1.2 --ftps-state Disabled `
    --startup-file "python -m uvicorn velora_ml.api:app --host 0.0.0.0 --port 8000 --workers 1" -o none
  Invoke-Az webapp update -g $rg -n $c.MlApp --https-only true -o none
  Write-Host "ML: https://$($c.MlApp).azurewebsites.net"
}

# 6) Static Web App Free (web + PWA). Free solo existe en algunas regiones.
if (-not (Test-AzExists { az staticwebapp show -g $rg -n $c.StaticApp -o none })) {
  $swaLoc = if (@("centralus", "eastus2", "westus2", "westeurope", "eastasia") -contains $loc) { $loc } else { "eastus2" }
  Invoke-Az staticwebapp create -g $rg -n $c.StaticApp -l $swaLoc --sku Free -o none
}
$webHost = Invoke-Az staticwebapp show -g $rg -n $c.StaticApp --query defaultHostname -o tsv
Write-Host "Web: https://$webHost"
Write-Host "Aprovisionamiento completo."
