$ErrorActionPreference = "Stop"

[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$repoRoot =
    Split-Path -Parent $PSScriptRoot

$frontRoot =
    Join-Path $repoRoot "front_velora"

if (
    -not (
        Test-Path `
            -LiteralPath (Join-Path $frontRoot "package.json") `
            -PathType Leaf
    )
) {
    throw "No se encontró front_velora."
}

Write-Host "Iniciando frontend VÉLORA en http://localhost:4200..." -ForegroundColor Cyan

Set-Location -LiteralPath $frontRoot

pnpm exec ng serve `
    --proxy-config proxy.conf.json `
    --host localhost `
    --port 4200