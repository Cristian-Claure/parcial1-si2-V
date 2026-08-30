$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

Write-Host "Iniciando PostgreSQL de VELORA..." -ForegroundColor Cyan

docker compose `
    --env-file (Join-Path $repoRoot ".env") `
    -f (Join-Path $repoRoot "docker-compose.yml") `
    up -d postgres

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo iniciar PostgreSQL."
}

Write-Host "Esperando PostgreSQL..." -ForegroundColor Cyan

$healthy = $false

for ($i = 0; $i -lt 20; $i++) {
    $status = docker inspect `
        --format="{{.State.Health.Status}}" `
        velora-postgres 2>$null

    if ($status -eq "healthy") {
        $healthy = $true
        break
    }

    Start-Sleep -Seconds 2
}

if (-not $healthy) {
    throw "PostgreSQL no alcanzo estado healthy."
}

Write-Host "PostgreSQL listo." -ForegroundColor Green
Write-Host "Iniciando backend VELORA..." -ForegroundColor Cyan

Push-Location (Join-Path $repoRoot "back_velora")

try {
    .\mvnw.cmd spring-boot:run
}
finally {
    Pop-Location
}