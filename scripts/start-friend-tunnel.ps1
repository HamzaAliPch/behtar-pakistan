param([switch]$AccessReady)
$ErrorActionPreference = 'Stop'
if (-not $AccessReady) { throw 'First configure and verify the exact-hostname Cloudflare Access policy. Then rerun with -AccessReady.' }

$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflared)) { throw 'Official cloudflared installation was not found.' }
$service = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 3101 -State Listen -ErrorAction SilentlyContinue
if (-not $service) { throw 'Start the isolated friend-test app on 127.0.0.1:3101 first.' }

Write-Output 'This starts the Cloudflare connector only after you confirm Access protects test.socialautomation.my.id.'
$secure = Read-Host 'Paste the remotely managed tunnel token (hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:TUNNEL_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if ([string]::IsNullOrWhiteSpace($env:TUNNEL_TOKEN)) { throw 'A tunnel token is required.' }
  Write-Output 'Starting tunnel connector. Press Ctrl+C to stop. The token is not printed or saved.'
  & $cloudflared tunnel run
} finally {
  Remove-Item Env:\TUNNEL_TOKEN -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
