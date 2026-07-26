$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$wslRepo = (wsl.exe -e wslpath -a ($repoRoot -replace '\\', '/')).Trim()

wsl.exe -e bash "$wslRepo/scripts/start-wsl-db.sh"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to start Todo PostgreSQL in WSL."
}

for ($attempt = 1; $attempt -le 20; $attempt += 1) {
  wsl.exe -e bash -lc "docker exec todo-postgres pg_isready -U postgres -d todo >/dev/null 2>&1"
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Todo PostgreSQL is ready on 127.0.0.1:55432."
    Set-Location $repoRoot
    npm run dev
    exit $LASTEXITCODE
  }
  Start-Sleep -Seconds 1
}

throw "Todo PostgreSQL did not become ready in time."
