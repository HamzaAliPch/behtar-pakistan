$ErrorActionPreference = 'Stop'
$friendProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $friendProjectRoot

python scripts/backup-main-before-friend-test.py
if ($LASTEXITCODE -ne 0) { throw 'Main database backup failed; test setup stopped.' }

. (Join-Path $PSScriptRoot 'friend-test-env.ps1')
$friendDbPath = Join-Path $friendProjectRoot 'prisma\friend-test.db'
if (-not (Test-Path -LiteralPath $friendDbPath)) { New-Item -ItemType File -Path $friendDbPath | Out-Null }
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Friend test migrations failed.' }
$friendPreviousNodeOptions = $env:NODE_OPTIONS
$env:NODE_OPTIONS = (($friendPreviousNodeOptions + ' --require ' + (Join-Path $PSScriptRoot 'tsx-userinfo-windows.cjs')).Trim())
npx tsx scripts/seed-friend-test.ts
$env:NODE_OPTIONS = $friendPreviousNodeOptions
if ($LASTEXITCODE -ne 0) { throw 'Friend test sample data could not be created.' }

Write-Output 'Friend test database and private upload store are prepared. Build with scripts/build-friend-test.ps1.'
