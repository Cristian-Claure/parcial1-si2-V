# Utilidades comunes de los scripts de Azure (TRAMA demo). Sin secretos: todo se lee de
# .env.azure.local (ignorado por Git) y nunca se imprime.
$ErrorActionPreference = "Stop"

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $EnvFile) { $EnvFile = Join-Path $script:RepoRoot ".env.azure.local" }

function Read-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
      $v = $Matches[2].Trim()
      if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
        $v = $v.Substring(1, $v.Length - 2).Replace('\"', '"')
      }
      $map[$Matches[1]] = $v
    }
  }
  return $map
}

function Set-DotEnvValue([string]$Path, [string]$Name, [string]$Value) {
  $lines = New-Object System.Collections.Generic.List[string]
  if (Test-Path -LiteralPath $Path) { $lines.AddRange([string[]][IO.File]::ReadAllLines($Path)) }
  $rendered = if ($Value -match '[\s#"'']') { '"' + $Value.Replace('"', '\"') + '"' } else { $Value }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$([regex]::Escape($Name))\s*=") { $lines[$i] = "$Name=$rendered"; $found = $true }
  }
  if (-not $found) { $lines.Add("$Name=$rendered") }
  [IO.File]::WriteAllText($Path, (($lines -join "`n").TrimEnd() + "`n"), (New-Object System.Text.UTF8Encoding($false)))
}

function Get-TramaConfig {
  $e = Read-DotEnv $EnvFile
  $suffix = if ($env:TRAMA_SUFFIX) { $env:TRAMA_SUFFIX } elseif ($e.AZ_SUBSCRIPTION_ID) { $e.AZ_SUBSCRIPTION_ID.Substring(0, 6).ToLower() } else { "demo" }
  [pscustomobject]@{
    Env           = $e
    Subscription  = $e.AZ_SUBSCRIPTION_ID
    ResourceGroup = if ($env:TRAMA_RG) { $env:TRAMA_RG } else { "rg-trama-demo" }
    Location      = if ($env:TRAMA_LOCATION) { $env:TRAMA_LOCATION } else { "westus2" }  # centralus/eastus/eastus2 sin cuota B1 en esta suscripcion
    Plan          = "plan-trama-demo"
    BackApp       = "trama-back-$suffix"
    MlApp         = "trama-ml-$suffix"
    StaticApp     = "trama-web-$suffix"
    PgServer      = "trama-pg-$suffix"
    PgDatabase    = "velora_db"
    Storage       = "tramast$suffix"
    BlobContainer = "velora-assets"
  }
}

function Hide-Secrets([string]$Text) {
  $Text -replace '(?i)(AccountKey|password|secret|token|sig)=([^;&\s"]+)', '$1=***' -replace '://([^:/\s]+):[^@\s]+@', '://$1:***@'
}

function Invoke-Az {
  # Ejecuta az; si falla, muestra el error (con secretos enmascarados) sin volcar los argumentos.
  $errFile = [IO.Path]::GetTempFileName()
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try { $out = & az @args 2>$errFile; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
  $err = Get-Content $errFile -Raw -ErrorAction SilentlyContinue; Remove-Item $errFile -Force -ErrorAction SilentlyContinue
  if ($code -ne 0) { throw "az $($args[0]) $($args[1]) fallo (codigo $code): $(Hide-Secrets "$err")" }
  return $out
}

function Test-AzExists([scriptblock]$Probe) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try { $null = & $Probe 2>$null; return ($LASTEXITCODE -eq 0) } finally { $ErrorActionPreference = $prev }
}

function Connect-TramaAzure {
  $c = Get-TramaConfig
  foreach ($k in "AZ_SUBSCRIPTION_ID", "AZ_TENANT_ID", "AZ_SP_APP_ID", "AZ_SP_PASSWORD") {
    if (-not $c.Env[$k]) { throw "Falta $k en .env.azure.local." }
  }
  $current = az account show --query "{s:id,u:user.name}" -o json 2>$null | ConvertFrom-Json
  if ($current -and $current.s -eq $c.Subscription -and $current.u -eq $c.Env.AZ_SP_APP_ID) { return $c }
  & az login --service-principal "--username=$($c.Env.AZ_SP_APP_ID)" "--password=$($c.Env.AZ_SP_PASSWORD)" "--tenant=$($c.Env.AZ_TENANT_ID)" --output none 2>&1 |
    ForEach-Object { "$_" -replace '(?i)(secret|password|client)[^\s]*\s*[:=]\s*\S+', '$1=***' } | Write-Host
  if ($LASTEXITCODE -ne 0) { throw "az login --service-principal falló." }
  Invoke-Az account set --subscription $c.Subscription | Out-Null
  return $c
}

function Get-BackendUrl($c) { "https://$($c.BackApp).azurewebsites.net" }
