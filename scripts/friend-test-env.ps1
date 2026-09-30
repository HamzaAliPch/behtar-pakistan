$ErrorActionPreference = 'Stop'
$friendProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$friendRuntimeRoot = Join-Path $friendProjectRoot 'runtime\friend-test'
$friendUploadRoot = Join-Path $friendRuntimeRoot 'uploads'
New-Item -ItemType Directory -Force -Path $friendUploadRoot | Out-Null
Set-Location -LiteralPath $friendProjectRoot

$env:FRIEND_TEST_MODE = '1'
$env:DATABASE_URL = 'file:./friend-test.db'
$env:PRIVATE_UPLOAD_ROOT = $friendUploadRoot
$env:AI_PROVIDER_URL = ''
$env:AI_PROVIDER_MODEL = ''
$env:AI_PROVIDER_KEY = ''
$env:AI_DAILY_REQUEST_BUDGET = '0'
$env:DONATION_CANDIDATE_NUMBER = ''
