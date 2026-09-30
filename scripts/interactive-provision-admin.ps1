$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

try {
    $env:ADMIN_EMAIL = Read-Host 'Admin email'
    $env:ADMIN_NAME = Read-Host 'Admin name'
    $securePassword = Read-Host 'Admin password (12-128 characters)' -AsSecureString
    $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
    npm run admin:provision
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Provisioning did not complete. Read the message above and try again.' -ForegroundColor Yellow
    }
} finally {
    Remove-Item Env:\ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\ADMIN_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:\ADMIN_NAME -ErrorAction SilentlyContinue
    if ($securePassword) { $securePassword.Dispose() }
}
