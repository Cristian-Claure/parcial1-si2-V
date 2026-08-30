$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path $envFile)) {
    throw "No se encontro el archivo .env en $repoRoot"
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()

    if ($line -and -not $line.StartsWith("#")) {
        $name, $value = $line -split "=", 2

        [Environment]::SetEnvironmentVariable(
            $name.Trim(),
            $value.Trim(),
            "Process"
        )
    }
}

$env:SPRING_DATASOURCE_URL =
    "jdbc:postgresql://127.0.0.1:$($env:VELORA_DB_PORT)/$($env:VELORA_DB_NAME)"

$env:SPRING_DATASOURCE_USERNAME = $env:VELORA_DB_USER
$env:SPRING_DATASOURCE_PASSWORD = $env:VELORA_DB_PASSWORD