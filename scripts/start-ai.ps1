$ErrorActionPreference = "Stop"

[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$repoRoot =
    Split-Path -Parent $PSScriptRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

$aiRoot =
    Join-Path $repoRoot "ai_velora"

$venv =
    Join-Path $aiRoot ".venv"

$python =
    Join-Path $venv "Scripts\python.exe"

if (
    -not (
        Test-Path `
            -LiteralPath $python `
            -PathType Leaf
    )
) {
    Write-Host "Creando entorno virtual VÉLORA AI..."

    python -m venv $venv

    if ($LASTEXITCODE -ne 0) {
        throw "No fue posible crear ai_velora\.venv."
    }
}

Write-Host "Sincronizando dependencias VÉLORA AI..."

& $python `
    -m pip install `
    --disable-pip-version-check `
    -r (Join-Path $aiRoot "requirements.txt")

if ($LASTEXITCODE -ne 0) {
    throw "No fue posible instalar dependencias de VÉLORA AI."
}

Write-Host "Iniciando VÉLORA AI en http://127.0.0.1:8001..."

Set-Location -LiteralPath $aiRoot

& $python `
    -m uvicorn `
    app.main:app `
    --host 127.0.0.1 `
    --port 8001 `
    --reload