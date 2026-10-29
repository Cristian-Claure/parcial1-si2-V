<#
.SYNOPSIS
  Listener local de Stripe CLI (modo prueba) que reenvía los webhooks al backend local.

.DESCRIPTION
  1. Verifica STRIPE_SECRET_KEY del .env con una llamada de solo lectura (GET /v1/balance).
  2. Obtiene el secreto de firma del listener (stripe listen --print-secret) y lo guarda como
     STRIPE_WEBHOOK_SECRET en el .env (nunca se imprime).
  3. Arranca el contenedor velora-stripe-listener-local reenviando a
     http://host.docker.internal:<Puerto>/api/payments/stripe/webhook.
  4. Detiene velora-stripe-listener-azure-v2 si sigue corriendo.
  Después hay que reiniciar SOLO el backend para que lea el nuevo STRIPE_WEBHOOK_SECRET.
  La clave viaja al contenedor por un archivo temporal (--env-file), no por la línea de comandos.

.EXAMPLE
  .\scripts\stripe-listener.ps1            # backend en 18080
  .\scripts\stripe-listener.ps1 -Port 8080
#>
param([int]$Port = 18080, [string]$Name = "velora-stripe-listener-local")
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo ".env"
$line = Get-Content $envFile | Where-Object { $_ -match '^STRIPE_SECRET_KEY=' } | Select-Object -First 1
$key = if ($line) { ($line -split "=", 2)[1].Trim().Trim('"') } else { "" }
if (-not $key.StartsWith("sk_test_")) { throw "STRIPE_SECRET_KEY debe ser una clave de prueba (sk_test_...)." }

try {
  Invoke-RestMethod -Uri "https://api.stripe.com/v1/balance" -Headers @{ Authorization = "Bearer $key" } -Method Get | Out-Null
  Write-Host "Clave de Stripe verificada (solo lectura)."
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  throw "Stripe rechazó la clave (HTTP $code). Reemplace STRIPE_SECRET_KEY por una clave de prueba vigente."
}

$tmp = New-TemporaryFile
try {
  Set-Content -Path $tmp -Value "STRIPE_API_KEY=$key" -Encoding ascii
  $secret = (docker run --rm --env-file $tmp stripe/stripe-cli:latest listen --print-secret 2>$null | Select-Object -Last 1).Trim()
  if (-not $secret.StartsWith("whsec_")) { throw "Stripe CLI no devolvió un secreto de webhook." }

  $content = Get-Content $envFile
  if ($content -match '^STRIPE_WEBHOOK_SECRET=') {
    $content = $content -replace '^STRIPE_WEBHOOK_SECRET=.*$', "STRIPE_WEBHOOK_SECRET=$secret"
  } else {
    $content += "STRIPE_WEBHOOK_SECRET=$secret"
  }
  [IO.File]::WriteAllLines($envFile, [string[]]$content, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "STRIPE_WEBHOOK_SECRET actualizado en .env (no se muestra)."

  docker rm -f $Name 2>$null | Out-Null
  docker run -d --name $Name --env-file $tmp stripe/stripe-cli:latest listen --forward-to "http://host.docker.internal:$Port/api/payments/stripe/webhook" | Out-Null
  Write-Host "Listener '$Name' reenviando a 127.0.0.1:$Port."
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

if ((docker ps --filter "name=^velora-stripe-listener-azure-v2$" --format "{{.Names}}") -eq "velora-stripe-listener-azure-v2") {
  docker stop velora-stripe-listener-azure-v2 | Out-Null
  Write-Host "Detenido velora-stripe-listener-azure-v2."
}
Write-Host "Reinicie el backend para que lea el nuevo STRIPE_WEBHOOK_SECRET."
