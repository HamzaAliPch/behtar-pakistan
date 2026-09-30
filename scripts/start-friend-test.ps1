$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'friend-test-env.ps1')
if (-not (Test-Path -LiteralPath (Join-Path $friendProjectRoot 'prisma\friend-test.db'))) { throw 'Run setup-friend-test.ps1 first.' }
if (-not (Test-Path -LiteralPath (Join-Path $friendProjectRoot '.next-friend-test\BUILD_ID'))) { throw 'Run build-friend-test.ps1 first.' }
Write-Output 'Friend test app: http://127.0.0.1:3101 (loopback only). Press Ctrl+C to stop.'
npm run start -- --hostname 127.0.0.1 --port 3101
