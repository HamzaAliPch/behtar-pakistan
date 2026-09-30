$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'friend-test-env.ps1')
if (-not (Test-Path -LiteralPath (Join-Path $friendProjectRoot 'prisma\friend-test.db'))) { throw 'Run setup-friend-test.ps1 first.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Friend test production build failed.' }
Write-Output 'Isolated production build is ready in .next-friend-test.'
