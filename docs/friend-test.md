# Temporary friend test environment

The existing app at `http://localhost:3000`, `prisma/dev.db` and `private_uploads/` remain separate. This setup uses `prisma/friend-test.db`, `runtime/friend-test/uploads/` and a production build in `.next-friend-test/`. All test data is fictional. The seeded test account has the CITIZEN role only; the owner later provisioned one separate test-only administrator through the procedure below. No administrator, payment wallet or real contact was copied from the main database.

## Local preparation

From `C:\Karachifix\karachi-fix` in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-friend-test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-friend-test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-friend-test.ps1
```

The setup script creates a read-only SQLite backup of the main database under the ignored local `prisma/backups/` directory, applies existing migrations to the separate test database and seeds fictional data once. Keep the backup on this computer; never upload it to the friend test site or Cloudflare. The generated test-only citizen credentials and fictional tracking reference are in the ignored `runtime/friend-test/credentials.txt`. Share the test account password privately with the trusted friend; do not paste it into chat, Git, the Cloudflare dashboard or screenshots. The file is not served by Next.js. Rotate or retire this account when the test ends.

The local production service listens **only** on `http://127.0.0.1:3101`. Press Ctrl+C in its terminal to stop it. The production session cookie is HTTP-only, Secure and SameSite=Lax. A real remote test must use HTTPS at `https://test.socialautomation.my.id`; local loopback is for checks. The test build and runtime both require `FRIEND_TEST_MODE=1` and refuse the main database or upload path. Donations and optional external AI calls are disabled in this mode. No outbound email or SMS integration is configured.

To verify the service after starting it:

```powershell
python scripts/check-friend-test.py
python scripts/smoke-friend-test.py
```

The smoke script signs in with the test account, creates a **fictional** report and private photo in the separate test storage, checks duplicate protection, tracking privacy, image ownership, admin denial, host rejection and cross-origin rejection. Repeated smoke runs create further clearly marked test reports. Do not run it against the main app.

## Optional test-only administrator

The owner can provision one test administrator without copying the main account. From a **new PowerShell window** in this project folder, run:

```powershell
. .\scripts\friend-test-env.ps1
Write-Host "Database target: $env:DATABASE_URL; test mode: $env:FRIEND_TEST_MODE"
$env:ADMIN_EMAIL = Read-Host 'Test admin email'
$env:ADMIN_NAME = Read-Host 'Test admin name'
$secret = Read-Host 'Test admin password' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  npm run admin:provision
} finally {
  Remove-Item Env:ADMIN_PASSWORD,Env:ADMIN_EMAIL,Env:ADMIN_NAME -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
python scripts/check-friend-test.py
```

The target must read `file:./friend-test.db` and test mode `1` before entering credentials. `assertFriendTestIsolation()` makes the provisioning script refuse the main database or uploads in test mode. The script refuses a second administrator. Enter credentials only in this terminal; do not send them in chat. Test sign-in at `http://127.0.0.1:3101/login` before attempting admin browser regression.

## Cloudflare setup: keep the tunnel off until Access is in place

`cloudflared` is already installed on this computer. No tunnel, DNS record or public hostname is created by these scripts. The owner must finish these Cloudflare dashboard steps:

1. In Cloudflare Zero Trust, create a **self-hosted Access application** for the **exact hostname** `test.socialautomation.my.id`. Use an Allow policy listing only the owner's and trusted friend's email addresses, with one-time PIN or another configured identity provider. Do not use an Everyone policy, wildcard hostname or bypass rule. Test the policy before exposing the origin.
2. Create a **remotely managed Cloudflare Tunnel** and install/run its connector using the secret token shown by Cloudflare. Keep the token out of chat, source files, command history and logs. Do not enable its public route until step 1 is complete. Cloudflare's dashboard can route the public hostname to `http://127.0.0.1:3101`; choose **Protect with Access** and the matching Access application where offered. In the route's Additional application settings, set **HTTP Host Header** to `test.socialautomation.my.id` so server-side hostname and origin checks see the test hostname. Confirm the route is limited to `test.socialautomation.my.id` and does not change `socialautomation.my.id`.
3. Visit `https://test.socialautomation.my.id` in a private browser window. Confirm the Access challenge appears **before** any app page. Then test login, report submission, photo access, tracking and logout. A non-allowlisted visitor should be stopped by Access.

After steps 1 and 2 are fully configured, start the local connector in a separate PowerShell window with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-friend-tunnel.ps1 -AccessReady`. The script prompts for the remotely managed tunnel token without echoing it and passes it through a process environment variable. Press Ctrl+C to stop the connector. Never run it before the Access policy and protected route are ready.

Cloudflare's remote tunnel route may create the subdomain DNS record automatically, so do not add the route before Access protection is ready. Consult the official [Cloudflare Tunnel guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/) and [Access application guide](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) while completing dashboard setup.

## Limits and teardown

The seeded test account is a regular citizen. The separate owner-provisioned test administrator permits isolated admin checks. The test environment has no real donations or evidence from main cases. The [fictional admin lifecycle results](friend-admin-lifecycle-2026-09-27.md) do not substitute for a final HTTPS and Access check after Cloudflare configuration. SQLite is suitable for this small, temporary test, not high-traffic production hosting. Stop the local server and tunnel connector when the test ends. Keep the backup private. Retire the test credentials and test database after the test, with explicit approval before deletion.
