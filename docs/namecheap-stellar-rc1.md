# Behtar Pakistan RC1: Namecheap Stellar deployment preparation

**Status: preparation only. No production deployment, DNS, email or cron activation is authorized by this document.** The existing main and friend-test databases and uploads are never release inputs. Replace `CPANEL_USER` and release identifiers below with values verified inside the owner account. Do not put credentials in commands, Git, tickets or logs.

## Approved shape and blockers

- Target: `behtarpakistan.org`, cPanel **Setup Node.js App**, **Production**, Node **22.23.2**, application root `/home/CPANEL_USER/behtar-pakistan` (outside `public_html`). Enter `app.js` as the startup file. Passenger assigns `PORT`; do not hardcode it. HTTPS terminates at cPanel's web server. The application needs same-origin HTTPS forwarding, `Host` and `X-Forwarded-Proto` checks in a real host smoke test.
- Build on a separate **Linux x64 Node 22.23.2** runner. Windows output, including the `--local-smoke` artifact, is **not deployable** because Prisma's native query engine is platform-specific. Do not run `next build` on Stellar's 1 GB account.
- Production data belongs in `/home/CPANEL_USER/behtar-private/data/production.db` and `/home/CPANEL_USER/behtar-private/uploads`, outside the application and document roots. The app fails closed when `BEHTAR_PRODUCTION=1` and these explicit paths or disabled integration settings are absent. A real host preflight is still required. Keep backup copies outside `public_html`, preferably encrypted off-host.
- Leave public donations, SMS, WhatsApp, webhook delivery, password-reset delivery and search indexing disabled until separately tested and authorized. In-app notices work without a paid provider. Email verification is not implemented or enforced; registering currently creates a citizen account immediately. Password recovery already has a single-use 20-minute token, invalidates prior links on resend, and allows at most three requests per address and 100 total per hour. It uses an approved **HTTPS relay**, not SMTP. [Namecheap Private Email](https://www.namecheap.com/support/knowledgebase/article.aspx/1179/2175/general-private-email-configuration-for-mail-clients-and-mobile-devices/) SMTP (`mail.privateemail.com`, 465 implicit TLS or 587 STARTTLS) and [app passwords](https://www.namecheap.com/support/knowledgebase/article.aspx/10816/2178/how-to-use-app-passwords-for-private-email/) cannot be used with this code without a separately reviewed adapter and mailbox delivery test. Do not enter mailbox credentials into the current app configuration.
- A clean production SQLite database is required. Never upload `prisma/dev.db`, `prisma/friend-test.db`, `prisma/auth-test.db`, any local session, QA photo or screenshot. Migrate the **new** database only after a backup and an approved deployment window.
- Stellar's 1 GB memory, build artifact size, Passenger behavior, SQLite write concurrency, static assets, upload body limits and availability of `flock`, `timeout` and Prisma CLI must be verified on the actual account. If any fail, use a host with adequate resources; do not weaken the privacy checks.

## Reproducible Linux build (off-host)

The reviewed GitHub workflow at `.github/workflows/namecheap-cpanel-artifact.yml` runs this build on Ubuntu x64 with Node 22.23.2 after lockfile installation, Linux Prisma generation, TypeScript, lint, and the full isolated test suite. It runs `scripts/verify-cpanel-artifact.mjs` after packaging, requires `deployable: true`, rejects private data and Windows engines, and uploads `behtar-pakistan-rc1-linux-x64.zip` plus its `.sha256` file as the **behtar-pakistan-rc1-linux-x64** Actions artifact. A green run proves the Linux build, not compatibility with the actual Stellar account. Do not supply production secrets to this workflow.

After pushing a reviewed commit to `master`, open the repository's **Actions → Build Namecheap cPanel artifact → successful run → Artifacts → behtar-pakistan-rc1-linux-x64**. GitHub downloads an outer artifact archive; extract it to obtain the deployment ZIP and checksum. On Windows PowerShell, compare `(Get-FileHash .\behtar-pakistan-rc1-linux-x64.zip -Algorithm SHA256).Hash.ToLowerInvariant()` with `((Get-Content .\behtar-pakistan-rc1-linux-x64.zip.sha256 -Raw).Split(' ')[0]).ToLowerInvariant()`. On Linux, run `sha256sum -c behtar-pakistan-rc1-linux-x64.zip.sha256`. Inspect `release-manifest.json` inside the ZIP and confirm `sourceRevision` equals the pushed commit before any host transfer.

From a **clean committed** reviewed source revision on Linux x64 with Node 22.23.2 and npm from that installation:

```sh
node --version                         # v22.23.2
git status --short                     # must be empty
# CLI downloads require concrete platform names; schema.prisma retains "native" for Prisma Client.
export PRISMA_CLI_BINARY_TARGETS='debian-openssl-3.0.x,rhel-openssl-1.1.x,rhel-openssl-3.0.x'
npm ci
npm run typecheck
npm run lint
npm run build:cpanel
tar -C runtime/cpanel-build/artifact -czf behtar-pakistan-rc1-linux-x64.tar.gz .
sha256sum behtar-pakistan-rc1-linux-x64.tar.gz > behtar-pakistan-rc1-linux-x64.tar.gz.sha256
```

`build:cpanel` creates a **new disposable build-only SQLite file** under ignored `runtime/cpanel-build/`, applies the checked-in migrations to that file only, generates the Linux Prisma client, makes a Next.js standalone build, copies `public/` and `.next/static/`, and bundles the bounded worker, pinned Prisma migration CLI and one-time admin provisioning script. It refuses an existing scratch DB or artifact rather than replacing them. Move the whole ignored `runtime/cpanel-build/` aside before a deliberate clean rebuild; never run a cleanup command against a path that has not been resolved and checked. The build manifest records revision, Node and platform; the script rejects development databases, uploads, secrets and missing RHEL/OpenSSL 1.1/3.0 Prisma client or CLI engines. Review the tar member list before transfer. No source `.env` or data file belongs in the tarball.

The Windows `npm run build:cpanel -- --local-smoke` option may check packaging but marks the manifest **non-deployable**. It cannot validate the Linux engine or Stellar limits.

## cPanel staging and private configuration

1. In cPanel, confirm the account actually offers **Node 22.23.2**. Create separate private directories under `/home/CPANEL_USER/behtar-private/` for `data`, `uploads`, `logs`, `env` and `backups`, with owner-only access (`umask 077`, directories mode `700`). Keep the app root outside `public_html`. Do not create the public application yet.
2. Upload and verify the artifact checksum over an authenticated channel. Extract the archive into `/home/CPANEL_USER/behtar-pakistan`. Do not extract over a running release; prepare a versioned sibling directory and switch only during an approved window. The app root must contain `app.js`, `server.js`, `.next/`, `public/`, `node_modules/`, `prisma/`, `preflight-cpanel.cjs`, `cron-notifications.cjs` and `release-manifest.json`.
3. Store a private, owner-only shell environment file at `/home/CPANEL_USER/behtar-private/env/production.sh` (`chmod 600`). It must **export** at least the following, with the account's real private paths. Never copy `.env.example` directly: it defaults to the development database.

```sh
export NODE_ENV=production
export BEHTAR_PRODUCTION=1
export DATABASE_URL='file:/home/CPANEL_USER/behtar-private/data/production.db'
export PRIVATE_UPLOAD_ROOT='/home/CPANEL_USER/behtar-private/uploads'
export PUBLIC_SITE_URL='https://behtarpakistan.org'
export NOTIFICATION_PUBLIC_ORIGIN='https://behtarpakistan.org'
export PUBLIC_INDEXING_ENABLED=0
export PUBLIC_DONATIONS_ENABLED=0
export NOTIFICATION_PROVIDER_MODE=disabled
export NOTIFICATION_WEBHOOK_ENABLED=0
export NOTIFICATION_WORKER_ENABLED=0
```

4. Set those same production variables in **Setup Node.js App**; cPanel's app variables are not guaranteed to be present in cron, so the private file supplies cron's environment. Keep the two configurations synchronized. Set no `FRIEND_TEST_MODE` or `AUTH_TEST_MODE`. Keep password-reset relay variables unset until a verified HTTPS delivery relay exists.
5. Create a **new empty** production SQLite file with mode `600`; do not import a local database. Activate cPanel's Node 22 environment in Terminal, source the private environment, set `BEHTAR_ENV_FILE=/home/CPANEL_USER/behtar-private/env/production.sh`, and run `node preflight-cpanel.cjs` from the extracted artifact. This check is read-only and should pass before app startup; it does not confirm migrations, SSL or email.
6. The release artifact includes the pinned Prisma **6.12.0** CLI, generated client, schema, migrations and RHEL engine variants. `preflight-cpanel.cjs` identifies the actual host Prisma platform and refuses an absent engine. Avoid `prisma migrate dev`, `reset` and `db push`. Set the absolute `DATABASE_URL`, take a backup, review status, then apply only `migrate deploy`. These are the exact commands after activating cPanel's Node 22 environment and sourcing the private environment file; they remain **unverified on this account**. Stop if memory or native binaries fail:

```sh
cd /home/CPANEL_USER/behtar-pakistan
. /home/CPANEL_USER/behtar-private/env/production.sh
node migrate-production.cjs status
# Take and verify the matching production database-plus-upload backup now.
node migrate-production.cjs deploy
node migrate-production.cjs status
python3 - <<'PY'
import os, sqlite3
with sqlite3.connect(os.environ['DATABASE_URL'].removeprefix('file:')) as db:
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
print('SQLite integrity: PASS')
PY
```
7. Create the Node.js App with Production mode, application URL `https://behtarpakistan.org`, root `behtar-pakistan`, startup file `app.js`. Leave `PORT` and `HOSTNAME` to Passenger unless the host requires a documented override. Confirm it reaches the app via HTTPS, serves `/_next/static/*` and public assets, and that report/server actions accept legitimate same-origin POSTs. Test the secure `__Host-kfx_session` cookie and login/logout; never use HTTP to test credentials. If proxy headers or upload limits fail, stop before public traffic and fix the host configuration, not the application's privacy rules.
8. Provision the **first** admin only after the clean database has migrated. In a private interactive shell, source the production environment and run the following from the artifact directory. The password prompt does not echo; values are removed from the shell immediately after the one-time script. The script refuses a second admin and does not print the email or password. Never put admin credentials in cPanel app variables, the production environment file or the cron job.

```sh
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -p 'Admin name: ' ADMIN_NAME
read -r -s -p 'Admin password: ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD
node admin-provision.cjs
unset ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD
```

## Cron, disabled until tested

`cpanel-notifications-cron.sh` invokes `cron-notifications.cjs` **once**, with `flock -n` and a four-minute timeout. The worker processes at most 50 due rows and uses a database lease to prevent overlap. It writes aggregate-only output to a private log. Do not schedule `notifications:serve` in cron. Verify that `flock`, `timeout`, the cPanel Node 22 binary and private log permissions work on the host. After a dry run with `NOTIFICATION_WORKER_ENABLED=1` and `NOTIFICATION_PROVIDER_MODE=disabled`, the owner may enable a single cPanel entry no more often than every five minutes:

```cron
*/5 * * * * BEHTAR_ENV_FILE=/home/CPANEL_USER/behtar-private/env/production.sh BEHTAR_NODE_BIN=/path/to/cpanel/node22/bin/node BEHTAR_LOG_DIR=/home/CPANEL_USER/behtar-private/logs /bin/sh /home/CPANEL_USER/behtar-pakistan/cpanel-notifications-cron.sh
```

The exact Node binary path comes from the cPanel app's displayed environment activation command. Cron must never point to a local, friend-test or build-only database. A disabled external provider cannot report SMS/WhatsApp as delivered. Monitor `/admin/sla` and the private aggregate log. Rotate the log privately.

## Backup, restore and rollback

Before migrations or release changes: stop web writes and cron for the **production** environment, record the release manifest/checksum, and create a consistent SQLite copy with Python's online backup API. The operator must verify resolved source and destination paths first. The example below reads only the configured production DB and creates a new backup; it prints no rows:

```sh
umask 077
test -f "${DATABASE_URL#file:}"
BACKUP_DIR="/home/CPANEL_USER/behtar-private/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$BACKUP_DIR"
export BACKUP_DIR
python3 - <<'PY'
import os, sqlite3
source = os.environ['DATABASE_URL'].removeprefix('file:')
target = os.path.join(os.environ['BACKUP_DIR'], 'production.db')
with sqlite3.connect(source) as live, sqlite3.connect(target) as snapshot:
    live.backup(snapshot)
    assert snapshot.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
PY
tar -C "$PRIVATE_UPLOAD_ROOT" -czf "$BACKUP_DIR/uploads.tar.gz" .
sha256sum "$BACKUP_DIR/production.db" "$BACKUP_DIR/uploads.tar.gz" > "$BACKUP_DIR/SHA256SUMS"
chmod 600 "$BACKUP_DIR"/*
```

Keep encrypted off-host copies with retention and test restoration in a **separate** environment. A database backup and later upload archive are not one atomic snapshot; pausing writes is required for a recovery point. For restoration, keep app and cron stopped, verify checksums and backup identity, and restore the matching DB and upload archive **together** into **new** private paths; this example does not overwrite the failed state:

```sh
cd /home/CPANEL_USER/behtar-private/backups/SELECTED_VERIFIED_BACKUP
sha256sum -c SHA256SUMS
umask 077
RESTORE_DIR="/home/CPANEL_USER/behtar-private/restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$RESTORE_DIR" "$RESTORE_DIR/uploads"
cp -p production.db "$RESTORE_DIR/production.db"
tar -C "$RESTORE_DIR/uploads" -xzf uploads.tar.gz
chmod 600 "$RESTORE_DIR/production.db"
chmod 700 "$RESTORE_DIR/uploads"
python3 - "$RESTORE_DIR/production.db" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
print('Restored SQLite integrity: PASS')
PY
```

After review, point `DATABASE_URL` and `PRIVATE_UPLOAD_ROOT` to this restored pair in both private/cPanel environments, run `preflight-cpanel.cjs` and `migrate-production.cjs status`, then start the app. Never restore friend-test or development data as production.

For a code-only failure before migration, stop the new Passenger app, point the app root back to the prior immutable artifact and restart; keep the current production database and uploads. After a migration, a code rollback alone may be unsafe. Pause writes, choose a reviewed forward fix or restore the matched pre-migration DB and uploads with owner approval. Recheck login, private evidence denial, case ownership, reporting, tracking, public map/projects/funds, static assets and HTTPS before inviting users.

## Owner acceptance checks

- Confirm cPanel Node 22.23.2, Passenger `PORT`, TLS, forwarded host/protocol and secure cookie behavior.
- Prove the Linux artifact contains an engine matching `@prisma/get-platform` on Stellar, the web app and one-shot worker start, and the packaged Prisma CLI migration fits the 1 GB account.
- Test an empty fresh production DB and writable private uploads; verify reports, photo upload/access control, login, admin provisioning, map, projects, funds and public privacy with **fictional** smoke data that is clearly labeled and removed only under an approved cleanup plan.
- Confirm backup restore, resource use and error logs. Leave real payment collection, external messages, email verification, reset delivery and search indexing off until separately approved and tested.

**Launch remains blocked** until these host-side checks and owner approvals have evidence. Preparation is not launch approval.
