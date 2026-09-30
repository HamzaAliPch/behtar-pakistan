# RC1 backup, health and worker runbook

These steps are for the existing local environments. They do not authorize a production deployment or destructive restore.

## Backup and verify

From `C:\Karachifix\karachi-fix`, run `python scripts/backup-rc1.py`. It uses SQLite's online backup API, verifies each saved database, ZIPs `private_uploads/` and `runtime/friend-test/uploads/`, checks the archive CRC and verifies upload sizes, modification times and content hashes did not change during copying. It writes only under ignored `prisma/backups/rc1-<UTC timestamp>/`. Check `manifest.json` and retain an encrypted, access-controlled offline copy. Do not upload the backup to the public site, Git or the tunnel. A live database-plus-files snapshot is not globally atomic; quiesce uploads for a deployment-grade recovery point.

Before every migration: stop app writes and worker for the **target** environment, take a new database-plus-upload backup, verify integrity and hash, then run `prisma migrate status` with that target's explicit `DATABASE_URL`. Apply `prisma migrate deploy` only after a reviewed migration and owner-approved deployment window. Never use `prisma migrate reset` on existing data.

## Restore procedure (approval required; not executed in RC1)

1. Identify the correct environment and approved recovery point. Preserve a second snapshot of the current state before replacement.
2. Stop its web app and worker; confirm no process holds the SQLite file. Verify backup DB integrity, archive CRC/checksums and that the backup belongs to the same environment.
3. Restore the database **and its matching uploads** to temporary paths in the same filesystem. Do not mix main, friend-test, auth-test or future production media.
4. With the service stopped, atomically swap the approved files/directories. Handle any SQLite WAL/SHM files only as part of the reviewed recovery plan; never discard uncheckpointed writes while a process is active.
5. Run `PRAGMA integrity_check`, `prisma migrate status`, a private media ownership check and limited HTTP smoke tests before reopening traffic. Preserve old state until the result is accepted.

## Existing friend-test service and 502 recovery

`scripts/friend-test-env.ps1` fixes the database to `file:./friend-test.db` and private uploads to `runtime/friend-test/uploads`. `scripts/start-friend-test.ps1` runs the existing production build on **127.0.0.1:3101 only**. Do not run setup or seed scripts for routine restart. Check `netstat -ano -p tcp | findstr 3101` before starting; if already listening, inspect that process rather than launching another. Start in a supervised PowerShell window or an owner-reviewed Windows service/task configured with the exact project working directory and friend-test environment. A Codex terminal alone is not a durable process supervisor. The operator can stop the service with its supervisor or Ctrl+C in its dedicated window.

If Cloudflare shows 502: check local `http://127.0.0.1:3101/`, the loopback listener, the web process log, and `prisma/friend-test.db` read access. Restart **only** the isolated friend-test process with `scripts/start-friend-test.ps1` after checking the port and environment. Then recheck localhost before the tunnel. Do not aim the tunnel at port 3000, alter DNS or reveal a tunnel token in logs. Cloudflare Access and tunnel state require owner dashboard verification; an app HTTP 200 alone does not prove remote protection.

## Notification worker

The app does not run scheduled reminders from page requests. One-shot `npm run notifications:work` and recurring `npm run notifications:serve` use the current environment. For temporary friend-test operation, first dot-source `scripts/friend-test-env.ps1`, set `NOTIFICATION_PROVIDER_MODE=disabled`, verify `DATABASE_URL` and `PRIVATE_UPLOAD_ROOT`, and then run **one** worker process. The recurring interval defaults to five minutes (range 1–60). Stop with Ctrl+C or the process supervisor; restart under the same environment. No live SMS/WhatsApp/email delivery exists.

`NotificationWorkerState` holds a singleton 20-minute lease; overlapping invocations skip. A crashed worker's lease expires; outbox rows left PROCESSING longer than 15 minutes are retried. Each run examines at most 50 due items; retries and per-user sends are bounded. Resolution reminders default to 24 and 72 hours, cancel on confirmation/dispute/withdrawal and never change a complaint status. The disabled adapter marks external attempts blocked instead of falsely delivered. A no-network mock is restricted to friend/auth-test mode.

The auth-test suite verified one lease holder, stale-lease recovery, retry/cancellation and no automatic resolution. The friend-test database has one worker-state row with 16 recorded runs, zero failures and no active lease; this does **not** demonstrate a currently supervised worker. Main development has no worker-state row. Do not use a one-shot run against either existing database merely for a health check, because it changes queued notification state.

For production, choose one supervised recurring process or a one-shot scheduled job every five minutes, with explicit production-only environment and alerting. Monitor `/admin/sla` for last success, blocked counts and lease age. Alert if a run is stale beyond two intended intervals, if failure counts rise, or if due outbox rows grow. Use aggregate codes/counts in logs; never log recipients, message text, reset URLs, tokens or private case details. Set an owner-approved retention policy before collecting operational logs.

## Read-only health checks

- Web: local `GET /` and a public route, expecting HTTP 200; protected `/admin` should require login for an anonymous request. Check `X-Robots-Tag` on friend-test responses.
- Database: open the intended SQLite URL in read-only mode, run `PRAGMA integrity_check` and `prisma migrate status`. Confirm expected file path first.
- Uploads: check the intended private directory exists outside `public/`, is readable by the app and writable by the service account. Test authorized and unauthorized media retrieval with fictional fixtures in the isolated environment only.
- Worker: read `NotificationWorkerState` and due/blocked outbox counts without processing them. A last-success timestamp is historical evidence, not proof that a worker is currently running.
- External: independently check HTTPS and Cloudflare Access in a fresh, unauthenticated browser. Avoid logging cookies or tunnel credentials.
