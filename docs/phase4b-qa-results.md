# Phase 4A completion and Phase 4B QA — 29 September 2026 UTC

## Phase 4B final external retest follow-up

The final external audit's streetlight match involved a **resolved** approved public report. Showing it to citizens as historical context is expected; it is not eligible for an admin candidate link. No historical complaint was changed to fabricate a candidate. The submission detector now records a reason for zero candidates, and `/admin/duplicates` shows each of the latest 50 reports with its detector time, candidate count and current review state. New admin links require both reports to be active at decision time.

Isolated production browser QA created two fictional `[QA TEST]` active, approved public streetlight cases and submitted a third fictional report through the four-step wizard. Both matching suggestions and both `SUGGESTED` admin candidates appeared. The admin linked one, rejected the other, unlinked the first and rejected it; reload preserved the decisions and four internal activity events. Owner, SLA snapshot, complaint status, private evidence and publication gates remained independent. The browser also passed a negative category search, different-issue continuation, support privacy, resolved historical suggestion, pinned and pin-less story links, unrelated-user isolation and 48 viewport/route checks. No local browser errors were captured.

The full production-mode auth-test suite passed **36/36**. TypeScript, lint and isolated friend-test production build passed. Main and friend-test each report all 27 migrations applied, `PRAGMA integrity_check = ok`, and unchanged user, complaint, evidence and case-link counts against the backups made before this follow-up. No migration, reset or reseed was needed.

## Independent Phase 4B audit retest — 29 September 2026

- BUG-4B-001: The detector previously excluded every resolved public case and required an exact area string. It now offers resolved approved cases as historical context, matches a named locality in a moderated public area label, and creates candidate links only for sufficiently similar active public cases. The query uses approved public title, area and approximate coordinates only. Each report submission records a detector-run audit status, timestamp and candidate count for the admin review page.
- BUG-4B-002: A completed story links to its map case only when the complaint has an approved public marker. Otherwise its reference opens the limited public tracking page. No story publication gate was changed.
- Isolated production browser retest passed a positive same-pole suggestion and a negative different-category check; support toggling; "different issue" continuation with form fields intact; a separate photo report; admin link, unlink and reject; preserved owner, SLA, status, evidence and publication gates; anonymous and unrelated-user privacy; pinned and pin-less story links; and 48 route/viewport overflow checks at 390×844, 768×1024 and 1440×900. No browser page or local request errors were captured. The test script removes only fixtures it created. Screenshots are in `runtime/friend-test/phase4b-browser/`.
- Full auth-test integration suite: **36/36 passed** against a separate production-mode auth-test server after the test harness was made aware of production cookie names. TypeScript, lint and isolated friend-test production build passed. Both main and friend-test databases report 27 applied migrations, `PRAGMA integrity_check = ok`, and unchanged user, complaint and evidence counts versus backups taken before these fixes. No migration or database reset was required.

## Data safety

Before either additive migration, SQLite backup copies of `prisma/dev.db` and `prisma/friend-test.db` were saved under the ignored `prisma/backups/` directory with the `phase4b-20260929T010210Z` suffix. Both backups passed `PRAGMA integrity_check = ok`. Final integrity checks for both live databases also returned `ok`. Main database still has 3 users and 2 complaints; friend-test has 10 users and 11 complaints. No reset, reseed, or main upload write was performed. Browser QA created only fictional `[QA TEST]` fixtures in friend-test and removed its own fixtures and temporary private image afterward.

## Verification

- Additive migrations `20260928130000_notification_worker_state` and `20260928140000_case_links_support` applied to main, friend-test and auth-test. `prisma migrate status` reports all 27 migrations applied for main and friend-test.
- TypeScript and ESLint passed. The full auth-test suite passed **36/36**, including reminder clock injection, owner/volunteer authorization, password recovery, duplicate suggestions, separate case status/SLA, support idempotency, publication and private evidence.
- The isolated production build completed successfully. Main `127.0.0.1:3000` and friend-test `127.0.0.1:3101` homepage returned HTTP 200; friend-test `/report`, `/map`, `/projects`, `/funds`, `/forgot-password` also returned 200.
- The friend-test recurring worker completed multiple observed one-minute QA cycles. Its database health record shows 16 runs, zero worker failures. The one-shot disabled-provider run blocked 12 previously queued external attempts; no live external sends were made. This verifies a local runner, not a deployed production scheduler.
- Production-mode browser QA passed: mobile duplicate suggestion, affected-too support, separate photo report submission, admin link review, anonymous private-media denial, and **48 route/viewport horizontal-overflow checks** at 390×844, 768×1024 and 1440×900. No local browser JavaScript/request errors were captured. Screenshots are under the ignored `runtime/friend-test/phase4b-browser/` directory.
- A separate production-mode browser regression passed pin-less and pinned publication, summary approval persistence/reapproval, volunteer-owner confirmation, map visibility and no browser errors. Screenshots are under `runtime/friend-test/phase4a-audit-browser/`.

## Remaining integration and deployment limits

- SMS and WhatsApp adapters remain disabled; only a no-network QA mock exists. An owner-approved provider with credentials, idempotent send behavior, consent/template review and signed callback integration is required before live delivery.
- Password recovery remains disabled until an owner-approved HTTPS transactional-email relay is configured and delivery-tested. The app never displays reset tokens publicly.
- The recurring worker is implemented and locally observed but not installed as a supervised Windows or production service. Operators must configure the schedule described in `docs/phase4a-notifications-sla.md`, then monitor `/admin/sla`.
- The external `https://test.socialautomation.my.id` route could not be reached from this execution environment (no HTTP response), so Cloudflare Access protection and invited-tester readiness remain **unverified**. No tunnel or Access setting was changed.
- Matching is a conservative public-title/location suggestion for the Karachi MVP, not proof two reports describe the same asset. Admin review is required, and linked cases retain independent owners, SLAs and resolution gates. Before nationwide scale, add pagination and a dedicated text/geospatial index.
