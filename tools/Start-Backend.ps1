$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Push-Location $repo
try {
  & docker start lua-postgres qdrant
  if ($LASTEXITCODE) { throw 'Start Docker Desktop first. The lua-postgres and qdrant containers must exist.' }
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec lua-postgres pg_isready -q -U postgres -d laptop
    if ($LASTEXITCODE -eq 0) {
      try { Invoke-RestMethod -Uri 'http://127.0.0.1:6333/readyz' -TimeoutSec 2 | Out-Null; $ready = $true; break } catch {}
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'PostgreSQL or Qdrant did not become ready within 30 seconds.' }
  & node --experimental-strip-types tools/dev-server.mjs
  if ($LASTEXITCODE) { throw 'Backend failed; inspect the error above.' }
} finally { Pop-Location }
