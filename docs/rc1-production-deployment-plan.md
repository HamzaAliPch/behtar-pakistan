# RC1 production deployment and rollback plan — approval required

No production database, DNS route, hosting subscription, provider account or live service was created by RC1 work.

## Architecture to approve

- A supported Node.js runtime for the pinned Next.js 16 application, with a supervised production-mode web process and HTTPS reverse proxy. The process must have a dedicated service identity and persistent working directory.
- A **new** persistent database. SQLite may be acceptable for a very small single-host launch only with measured concurrency, backup and worker access; multi-instance or higher-volume operation needs a reviewed PostgreSQL/PostGIS migration plan. Do not copy the local friend-test or auth-test database. Apply the existing 27 migrations to the clean target with `prisma migrate deploy` after a backup and review.
- A **new** durable private media directory or object store with application-only access, backup/restore support and no direct public URL. Do not copy synthetic QA uploads or point to `private_uploads/` or `runtime/friend-test/uploads/`.
- One supervised notification worker or scheduled job with database lease monitoring, plus web/DB/media/worker health checks and aggregate-only logs. Keep `NOTIFICATION_PROVIDER_MODE=disabled` and payment collection off at first launch.
- Automated encrypted database-and-media backups with retention, off-host copies and a periodic restore drill in a non-production environment. Back up before each schema migration.

## Configuration and approval gates

1. Establish an immutable, reviewed source revision. Build from `package-lock.json` with a clean `npm ci`, record Node/npm/Prisma versions and artifact hash, and rerun TypeScript, lint, tests and browser smoke checks.
2. Supply production-only `DATABASE_URL`, absolute `PRIVATE_UPLOAD_ROOT`, HTTPS public origin, allowed hosts/proxy rules, cookie settings, log destination and backup credentials through a secret manager or locked service environment. Do not inherit the repository's development `.env` (`dev.db`). The current server uses random database-backed sessions, so there is no shared session-signing secret to copy; future delivery/webhook/relay secrets must be unique to production.
3. Verify the production paths cannot resolve to `prisma/dev.db`, `prisma/friend-test.db`, `prisma/auth-test.db`, `private_uploads/` or `runtime/friend-test/uploads/`. A production environment is not configured today; this check must be repeated on the actual host before boot.
4. Initialize a **clean** production database only after owner approval; run `prisma migrate deploy`, confirm status and integrity, and create the first administrator through the approved secure provisioning procedure. Enter credentials directly into the production secret/terminal channel. Do not import friend-test users, QA complaints, sessions, donations or synthetic media.
5. Configure persistent HTTPS/domain routing only after access, host/origin validation and rollback checks are ready. Keep the temporary test hostname isolated behind a verified Cloudflare Access policy. No DNS or tunnel change is part of this plan.
6. Keep `PUBLIC_DONATIONS_ENABLED=0`, wallet methods disabled, `NOTIFICATION_PROVIDER_MODE=disabled`, `NOTIFICATION_WEBHOOK_ENABLED=0` and password recovery disabled until each integration has independent owner, legal, consent, operational and security approval. No real government referral occurs through software automatically.
7. Seed no fake civic statistics. Publish only verified, approved genuine cases and evidence through existing moderation gates. Before inviting the public, verify anonymous pages, owner/admin authorization, media denial, coordinate approximation, refund/accounting totals and search-engine indexing policy against the clean database.

The owner must approve hosting/database/media/supervision/backup costs and any third-party tile, geocoding, email, SMS, WhatsApp or payment agreements. No pricing or vendor has been selected. Map tiles and geocoding currently use best-effort public services and need capacity/policy review before scale.

## Rollback

If a new code release fails before schema changes, stop traffic, keep the previous artifact and environment, restart the previous supervised web/worker processes, and verify read-only health plus ownership/privacy smoke checks. If a migration changed schema or data, do not assume a down-migration is safe. Pause writes, preserve a fresh snapshot, choose an approved forward fix or coordinated database-plus-media restore using the RC1 runbook, and verify integrity/migration status before reopening traffic. Restore to the **same** environment only; never substitute a friend-test snapshot. Record the incident, decision and exact artifact/backup identifiers.
