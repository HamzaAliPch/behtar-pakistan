$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'rc1-auth-test-env.ps1')
if (-not (Test-Path -LiteralPath (Join-Path $rcProjectRoot '.next-auth-test\BUILD_ID') -PathType Leaf)) { throw 'Run the isolated production build first.' }
if (netstat -ano -p tcp | Select-String ':3100\s+.*LISTENING') { throw 'Port 3100 is occupied; preserving the existing process.' }
Write-Output 'Isolated auth-test production server: http://127.0.0.1:3100'
npm run start -- --hostname 127.0.0.1 --port 3100
