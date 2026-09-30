$ErrorActionPreference = 'Stop'
$rcProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$rcDb = Join-Path $rcProjectRoot 'prisma\auth-test.db'
$rcUploads = Join-Path $rcProjectRoot 'runtime\auth-test\uploads'
if (-not (Test-Path -LiteralPath $rcDb -PathType Leaf)) { throw 'Isolated auth-test database is missing.' }
if (-not (Test-Path -LiteralPath $rcUploads -PathType Container)) { throw 'Isolated auth-test uploads are missing.' }
Set-Location -LiteralPath $rcProjectRoot
$env:AUTH_TEST_MODE = '1'
$env:FRIEND_TEST_MODE = '0'
$env:DATABASE_URL = 'file:./auth-test.db'
$env:PRIVATE_UPLOAD_ROOT = $rcUploads
$env:PUBLIC_DONATIONS_ENABLED = '1'
$env:NODE_OPTIONS = '--require ' + (Join-Path $PSScriptRoot 'tsx-userinfo-windows.cjs')
