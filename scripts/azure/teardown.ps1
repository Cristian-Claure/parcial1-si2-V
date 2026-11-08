# Borra TODA la demo (grupo de recursos completo). Pide escribir "CONFIRMO BORRAR".
#   .\scripts\azure\teardown.ps1 [-ResourceGroup rg-trama-demo]
param([string]$ResourceGroup)
. (Join-Path $PSScriptRoot "common.ps1")
$c = Connect-TramaAzure
$rg = if ($ResourceGroup) { $ResourceGroup } else { $c.ResourceGroup }

if (-not (Test-AzExists { az group show -n $rg -o none })) { Write-Host "El grupo $rg no existe. Nada que borrar."; return }
Write-Host "Recursos que se borraran en ${rg}:"
az resource list -g $rg --query "[].{nombre:name, tipo:type}" -o table
$answer = Read-Host "Escribe CONFIRMO BORRAR para eliminar el grupo $rg"
if ($answer -cne "CONFIRMO BORRAR") { Write-Host "Cancelado."; return }
Invoke-Az group delete -n $rg --yes -o none
Write-Host "Grupo $rg eliminado. Recuerda borrar el webhook de Stripe (modo prueba) y, si quieres, limpiar .env.azure.local."
