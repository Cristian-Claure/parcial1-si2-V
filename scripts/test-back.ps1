$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

docker compose `
    --env-file (Join-Path $repoRoot ".env") `
    -f (Join-Path $repoRoot "docker-compose.yml") `
    up -d postgres

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo iniciar PostgreSQL."
}

Push-Location (Join-Path $repoRoot "back_velora")

try {
    .\mvnw.cmd clean test
}
finally {
    Pop-Location
}