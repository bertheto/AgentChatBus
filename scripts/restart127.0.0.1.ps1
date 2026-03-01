# restart127.0.0.1.ps1
# One-shot restart script for AgentChatBus (localhost only).
# Usage (from project root):  .\restart127.0.0.1.ps1
# Usage (custom port):        .\restart127.0.0.1.ps1 -Port 8080
#
# This script binds to 127.0.0.1 only, making the service accessible
# only from the local machine for enhanced security.

param(
    [string]$ListenHost = "127.0.0.1",  # Default: 127.0.0.1 binds to localhost only (safer)
    [int]$Port = 39765
)

Set-Location $PSScriptRoot

Write-Host "🛑 Stopping AgentChatBus (port $Port)..." -ForegroundColor Yellow

# Kill the entire process tree of any Python running src.main
# (uvicorn --reload spawns a reloader parent + child worker; taskkill /T kills both)
$pids = Get-Process python -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*src.main*" } |
    Select-Object -ExpandProperty Id

foreach ($p in $pids) {
    taskkill /PID $p /F /T 2>$null | Out-Null
}

# Also free the port in case a stray process is still holding it
Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess |
    ForEach-Object { taskkill /PID $_ /F /T 2>$null | Out-Null }

Start-Sleep -Milliseconds 800

Write-Host "🚀 Starting AgentChatBus on ${ListenHost}:${Port}..." -ForegroundColor Green
Write-Host "🔒 Binding to 127.0.0.1 (localhost only) - Service will not be accessible from other machines." -ForegroundColor Cyan
$env:AGENTCHATBUS_HOST = $ListenHost
$env:AGENTCHATBUS_PORT = $Port
.venv\Scripts\python -m src.main
