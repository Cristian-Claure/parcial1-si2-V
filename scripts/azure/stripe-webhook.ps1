# Crea (o recrea) el webhook de Stripe en MODO PRUEBA hacia el backend de Azure, guarda el
# secreto en STRIPE_WEBHOOK_SECRET de .env.azure.local (sin imprimirlo), lo aplica en la Web App,
# reinicia y envia un evento de prueba firmado para comprobar que responde 2xx.
#   .\scripts\azure\stripe-webhook.ps1
. (Join-Path $PSScriptRoot "common.ps1")
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$c = Get-TramaConfig
$key = $c.Env.STRIPE_SECRET_KEY
if (-not $key) { throw "Falta STRIPE_SECRET_KEY en .env.azure.local." }
if (-not $key.StartsWith("sk_test_")) { throw "La clave de Stripe no es de modo prueba; no se crea el webhook." }
$url = "$(Get-BackendUrl $c)/api/payments/stripe/webhook"
# Eventos que maneja apps/back/src/payments/stripe-webhook.service.ts
$events = "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"
$auth = @{ Authorization = "Bearer $key" }
$api = "https://api.stripe.com/v1/webhook_endpoints"

try { $existing = Invoke-RestMethod -Uri "$api`?limit=100" -Headers $auth }
catch { throw "Stripe rechazo la clave (HTTP $([int]$_.Exception.Response.StatusCode))." }
foreach ($w in @($existing.data | Where-Object { $_.url -eq $url })) {
  Invoke-RestMethod -Method Delete -Uri "$api/$($w.id)" -Headers $auth | Out-Null
  Write-Host "Webhook anterior eliminado ($($w.id))."
}
$body = "url=$([Uri]::EscapeDataString($url))&description=$([Uri]::EscapeDataString('TRAMA demo Azure'))"
foreach ($ev in $events) { $body += "&enabled_events[]=$ev" }
$created = Invoke-RestMethod -Method Post -Uri $api -Headers $auth -ContentType "application/x-www-form-urlencoded" -Body $body
Set-DotEnvValue $EnvFile "STRIPE_WEBHOOK_SECRET" $created.secret
Write-Host "Webhook creado: $($created.id) -> $url ($($events.Count) eventos, estado $($created.status))."

# Aplicar en la Web App y reiniciar
$null = Connect-TramaAzure
& (Join-Path $PSScriptRoot "deploy-back.ps1") -SettingsOnly | Out-Null
Write-Host "STRIPE_WEBHOOK_SECRET aplicado; backend reiniciado."

# Esperar a que vuelva /api/health
$ok = $false
for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
  try { $h = Invoke-WebRequest -UseBasicParsing -Uri "$(Get-BackendUrl $c)/api/health" -TimeoutSec 20; $ok = $h.StatusCode -eq 200 -and $h.Content -match "UP" } catch { Start-Sleep -Seconds 10 }
}
Write-Host "api/health tras reinicio: $(if ($ok) { 'UP' } else { 'NO RESPONDE' })"

# Evento de prueba firmado con el secreto (mismo esquema que Stripe: t=<ts>,v1=HMAC-SHA256)
$secret = (Read-DotEnv $EnvFile).STRIPE_WEBHOOK_SECRET
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$payload = '{"id":"evt_trama_test","object":"event","type":"trama.test","data":{"object":{"object":"test"}}}'
$hmac = New-Object System.Security.Cryptography.HMACSHA256 (, [Text.Encoding]::UTF8.GetBytes($secret))
$sig = -join ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$ts.$payload")) | ForEach-Object { $_.ToString("x2") })
try {
  $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $url -ContentType "application/json" -Body $payload -Headers @{ "Stripe-Signature" = "t=$ts,v1=$sig" }
  Write-Host "Evento de prueba firmado: HTTP $($r.StatusCode)"
} catch { Write-Host "Evento de prueba firmado: HTTP $([int]$_.Exception.Response.StatusCode)"; exit 1 }
