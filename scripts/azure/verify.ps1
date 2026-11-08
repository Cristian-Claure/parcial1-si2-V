# Verificacion HTTP de la demo publicada (sin imprimir secretos ni tokens).
# Cuentas de demostracion documentadas en docs/FASE4B_PLATAFORMA.md; las contrasenas se leen
# de .env.azure.local (VELORA_TRAMA_CUSTOMER_PASSWORD / VELORA_TRAMA_OWNER_PASSWORD).
#   .\scripts\azure\verify.ps1 [-BackendUrl https://...] [-WebUrl https://...]
param(
  [string]$BackendUrl,
  [string]$WebUrl,
  [string]$CustomerEmail = "cliente.demo@trama.seed.local",
  [string]$MaxOwnerEmail = "rodrigo.salvatierra@trama.seed.local",
  [string]$PlusOwnerEmail = "daniela.ferrufino@trama.seed.local",
  [int]$ExpectedStores = 9
)
. (Join-Path $PSScriptRoot "common.ps1")
$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$c = Get-TramaConfig; $e = $c.Env
if (-not $BackendUrl) { $BackendUrl = Get-BackendUrl $c }
if (-not $WebUrl) { $null = Connect-TramaAzure; $WebUrl = "https://" + (Invoke-Az staticwebapp show -g $c.ResourceGroup -n $c.StaticApp --query defaultHostname -o tsv) }
$customerPw = $e.VELORA_TRAMA_CUSTOMER_PASSWORD; $ownerPw = $e.VELORA_TRAMA_OWNER_PASSWORD

$results = New-Object System.Collections.Generic.List[object]
function Check([string]$Name, [bool]$Ok, [string]$Detail = "") {
  $results.Add([pscustomobject]@{ Ok = $Ok; Name = $Name; Detail = $Detail })
  Write-Host ("[{0}] {1} {2}" -f $(if ($Ok) { "OK" } else { "FALLA" }), $Name, $Detail)
}
function Http([string]$Method, [string]$Url, $Body = $null, [string]$Token = $null) {
  $h = @{}; if ($Token) { $h.Authorization = "Bearer $Token" }
  $p = @{ Method = $Method; Uri = $Url; Headers = $h; UseBasicParsing = $true; TimeoutSec = 60 }
  if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $Body -Depth 6)); $p.ContentType = "application/json" }
  try { $r = Invoke-WebRequest @p } catch { $r = $_.Exception.Response; if (-not $r) { return [pscustomobject]@{ Status = 0; Json = $null; Headers = @{}; Text = "$($_.Exception.Message)" } }
    return [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $null; Headers = $r.Headers; Text = "" } }
  $text = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
  $json = $null; try { $json = $text | ConvertFrom-Json } catch {}
  [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Headers = $r.Headers; Text = $text }
}
function Login([string]$Email, [string]$Pw) { (Http POST "$BackendUrl/api/auth/login" @{ email = $Email; password = $Pw }) }

# 1) Salud con BD
$h = Http GET "$BackendUrl/api/health"
Check "api/health" ($h.Status -eq 200 -and $h.Text -match 'UP') "HTTP $($h.Status)"
# 2) Directorio de tiendas
$d = Http GET "$BackendUrl/api/companies/directory"
$n = @($d.Json).Count
Check "directorio de tiendas" ($d.Status -eq 200 -and $n -eq $ExpectedStores) "$n tiendas"
# 3) Login de demostracion (cliente)
$cl = Login $CustomerEmail $customerPw
Check "login cliente demo" ($cl.Status -eq 200 -and $cl.Json.accessToken) "HTTP $($cl.Status)"
# 4) Login propietario MAX
$ow = Login $MaxOwnerEmail $ownerPw
$ownerToken = $ow.Json.accessToken
Check "login propietario (MAX)" ($ow.Status -eq 200 -and $ownerToken) "HTTP $($ow.Status)"
# 5-6) PWA por HTTPS
$m = Http GET "$WebUrl/manifest.webmanifest"
Check "manifest.webmanifest" ($m.Status -eq 200 -and $m.Text -match '"name"') "HTTP $($m.Status)"
$sw = Http GET "$WebUrl/sw.js"
Check "sw.js sin cache" ($sw.Status -eq 200 -and "$($sw.Headers['Cache-Control'])" -match 'no-cache') "Cache-Control: $($sw.Headers['Cache-Control'])"
# 7) Fallback SPA en ruta profunda
$spa = Http GET "$WebUrl/t/brote"
Check "fallback SPA (/t/brote)" ($spa.Status -eq 200 -and $spa.Text -match '<div id="root"') "HTTP $($spa.Status)"
# 8) Dashboard MAX
$companies = @((Http GET "$BackendUrl/api/admin/companies" -Token $ownerToken).Json)
$max = $companies | Where-Object { "$($_.planCode)$($_.plan)$($_.plan.code)$($_.subscription.planCode)" -match 'MAX' } | Select-Object -First 1
if (-not $max) { $max = $companies | Select-Object -First 1 }
$ov = Http GET "$BackendUrl/api/admin/reports/overview?companyId=$($max.id)" -Token $ownerToken
Check "dashboard MAX ($($max.slug))" ($ov.Status -eq 200) "HTTP $($ov.Status)"
# 9) Cargo QR del Banco demo con URLs publicas (se cancela al final)
$pl = Login $PlusOwnerEmail $ownerPw
$qr = Http POST "$BackendUrl/api/admin/plan/payments" @{ planCode = "MAX"; method = "QR" } -Token $pl.Json.accessToken
$payUrl = "$($qr.Json.qr.payUrl)"
$public = $null
if ($payUrl -match '/pagar/qr/(\d+)\?t=([^&]+)') { $public = Http GET "$BackendUrl/api/pay/qr/$($Matches[1])?t=$($Matches[2])" }
Check "cargo QR Banco demo" ($qr.Status -in 200, 201 -and $payUrl.StartsWith($WebUrl) -and $public.Status -eq 200) "HTTP $($qr.Status), payUrl en $WebUrl, publico HTTP $($public.Status)"
if ($qr.Json.payment.id) { $null = Http POST "$BackendUrl/api/admin/plan/payments/$($qr.Json.payment.id)/cancel" -Token $pl.Json.accessToken }
# 10) Sincronizacion offline
$sp = Http GET "$BackendUrl/api/sync/pull?companyId=$($max.id)" -Token $ownerToken
Check "api/sync/pull" ($sp.Status -eq 200) "HTTP $($sp.Status)"
# 11) Estado del ML visto por el backend
$ml = Http GET "$BackendUrl/api/admin/ml/overview?companyId=$($max.id)" -Token $ownerToken
$mlUp = $ml.Json.service.available -eq $true
Check "ML (overview)" ($ml.Status -eq 200) "HTTP $($ml.Status), servicio disponible: $mlUp"
# 12) Activo administrado desde Azure Blob (logo/imagen del directorio)
$img = (@($d.Json) | ForEach-Object { $_.logoUrl, $_.bannerUrl } | Where-Object { $_ -match '/api/' } | Select-Object -First 1)
if ($img -and $img -notmatch '^https?://') { $img = "$BackendUrl$img" }
$ia = if ($img) { Http GET $img } else { [pscustomobject]@{ Status = 0 } }
Check "activo desde Azure Blob" ($ia.Status -eq 200) "HTTP $($ia.Status)"

$fail = @($results | Where-Object { -not $_.Ok }).Count
Write-Host ("Resultado: {0}/{1} OK" -f ($results.Count - $fail), $results.Count)
if ($fail) { exit 1 }
