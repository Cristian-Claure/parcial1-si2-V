$ErrorActionPreference = "Stop"

[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$repoRoot = Split-Path -Parent $PSScriptRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

$preferredJdk =
    "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"

$preferredJava =
    Join-Path $preferredJdk "bin\java.exe"

if (
    -not (
        Test-Path `
            -LiteralPath $preferredJava `
            -PathType Leaf
    )
) {
    throw (
        "VÉLORA backend requiere Java 21. " +
        "No se encontró el JDK esperado en: " +
        $preferredJdk
    )
}

$env:JAVA_HOME = $preferredJdk
$env:Path =
    (Join-Path $preferredJdk "bin") +
    ";" +
    $env:Path

Write-Host (
    "Java backend: " +
    $env:JAVA_HOME
) -ForegroundColor Green

Write-Host "Iniciando PostgreSQL de VÉLORA..." -ForegroundColor Cyan

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
    throw "PostgreSQL no alcanzó estado healthy."
}

Write-Host "PostgreSQL listo." -ForegroundColor Green
Write-Host "Iniciando backend VÉLORA..." -ForegroundColor Cyan

Push-Location (Join-Path $repoRoot "back_velora")

try {
    .\mvnw.cmd spring-boot:run
}
finally {
    Pop-Location
}
