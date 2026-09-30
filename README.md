# Behtar Pakistan

**Release review:** [RC1 release record](docs/rc1-release-2026-09-29.md) · [operations and backup runbook](docs/rc1-operations-runbook.md) · [production deployment plan](docs/rc1-production-deployment-plan.md). RC1 is blocked from public launch pending a clean production environment, verified access controls and owner approval.

Behtar Pakistan is a civic issue reporting and operations platform, currently operating as Behtar Karachi in Karachi. Citizens submit and track cases; Behtar Pakistan staff review cases, coordinate approved volunteers and partner work, and record referrals to departments when an actual submission occurs.

## Stack and setup

Next.js 16, TypeScript, Tailwind CSS 4, Prisma 6.12, SQLite, Leaflet, React-Leaflet, and Node.js built-in `scrypt`. All dependencies are free and open source. No API keys or paid services are required.

```powershell
npm install
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database is `prisma/dev.db`. Migrations are additive and include legacy complaint status normalization; existing accounts and sessions are retained.

## First administrator

Only the first admin can be provisioned by the script. It refuses a second admin and does not print passwords. In PowerShell:

```powershell
$env:ADMIN_EMAIL = "your-admin@example.com"
$securePassword = Read-Host "Admin password (at least 12 characters)" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
$env:ADMIN_NAME = "Your Name"
npm run admin:provision
Remove-Item Env:\ADMIN_PASSWORD
```

On Windows, `scripts/interactive-provision-admin.ps1` can prompt for these values and clears its temporary environment variables afterward.

## Roles and routes

| Role | Access |
| --- | --- |
| Citizen | Register, submit owned complaints, track status, see owned case details and shared evidence, apply to volunteer, confirm or dispute a proposed resolution |
| Volunteer | Access only after admin approval; view assigned tasks, permitted case context, notes and task evidence; upload private field photos and submit task updates |
| City manager | Operate only cases and linked work in explicitly assigned active cities; standalone team, NGO, department and contact records require an explicit city assignment |
| Admin | Review applications, manage verified case tasks, directory and referrals, review all case activity, publish evidence, record case decisions and finalize tasks |

Key routes: `/dashboard`, `/report`, `/track`, `/volunteer/apply`, `/volunteer`, `/volunteer/tasks/[id]`, `/admin`, `/admin/volunteers`, `/admin/tasks`, `/admin/departments`, `/admin/referrals`, `/admin/cases/[id]`, and `/notifications`.

## Phase 4: map, reporting and help

Phase 4A citizen notifications and case targets are documented in [docs/phase4a-notifications-sla.md](docs/phase4a-notifications-sla.md). In-app case updates work without an external provider. SMS/WhatsApp remain disabled until an authorized provider adapter and scheduled worker are configured; SLA targets are displayed only when an approved city/category policy was captured for a complaint.

- `/map` shows only verified cases explicitly approved by an admin for publication. Admins approve publication in the case page and enter a safe public title and approximate area. The map API selects only those public fields, rounded marker coordinates, category, status and district. It never returns descriptions, owner data, exact coordinates, internal events or evidence. Cases without coordinates, including legacy complaints, remain off the map.
- Citizens can click or drag a pin on `/report`, use device location after permission, or search for a Karachi area or public landmark. Coordinates are optional and checked against Karachi bounds on the server. Precise points remain private. Searches are sent only after pressing Search; do not enter private home details. If the external lookup is disabled or unavailable, the verified local area catalog remains searchable without inventing coordinates.
- `/report` is a four-step form with a searchable, district-dependent Karachi area list, a clearly marked manual-area fallback, optional private landmark/directions, and up to five private 5 MB JPEG/PNG/WebP photos. Photos can be previewed and removed before submission. The server checks the image signature and stores them in the existing protected evidence system. A submission key prevents duplicate cases when a request is retried. The legacy server action remains for older clients.
- Nearby suggestions use an indexed latitude/longitude bounding box followed by distance and text/category ranking. Distances are computed from **approximate public positions**, so the suggestion API cannot reveal a precise case location. Users may follow a public report; this does not merge cases. Followers receive status-change notifications.
- The map refreshes every 45 seconds while the page is visible. The API supports ETags and 304 responses. Last successful refresh and connection errors are shown. Map markers use a plain React popup and a parallel accessible list.
- `/help` provides local, rules-based guidance in English, Urdu and Roman Urdu without an AI key. It explains workflows, categories, statuses, tracking, description drafting and human support. An authenticated citizen can ask about **their own** reference; the server checks ownership and limits the summary to citizen-visible events. Other users receive no private case details. The assistant cannot mutate cases.
- Admins edit and publish verified help content at `/admin/help`. Draft articles are never shown publicly or used by the assistant. Publish only checked contacts and referral guidance. Article saves are audited.
- Signed-in citizens can send an unresolved question to human support from the assistant. Requests appear at `/admin/support`; admin replies are visible only to the requester on `/help` and trigger an in-app notification. Citizens may have up to three open requests.
- An optional OpenAI-compatible endpoint can be configured with `AI_PROVIDER_URL`, `AI_PROVIDER_MODEL` and optionally `AI_PROVIDER_KEY`. `AI_DAILY_REQUEST_BUDGET` defaults to zero, so no external model is called by default. A persistent per-day request cap and `AI_REQUEST_TIMEOUT_MS` bound usage. Only general guidance questions are eligible; private complaint text never reaches the provider. Provider errors fall back to local guidance. AI text is marked as such and should be verified by the team.

The default tile URL and attribution are configurable with `NEXT_PUBLIC_MAP_TILE_URL` and `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION`. Set `GEOCODER_ENABLED=0` to disable external address lookup and `GEOCODER_USER_AGENT` to identify the application when it is enabled. The public OpenStreetMap tile and Nominatim servers are best effort and have usage limits; they are suitable for light local development, not guaranteed production capacity. Browser tile caching is left enabled, no tiles are prefetched, geocoding is explicitly requested, cached for 24 hours and limited to one external request per second. A larger deployment should configure a suitable tile/geocoding provider or self-host. See the [tile policy](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/).

## Optional donations and fundraising

- `/donate` supports manual transfers to independently configured Easypaisa, JazzCash, SadaPay and NayaPay accounts. **Every method starts disabled.** Admins enter and verify its actual account number, title and instructions at `/admin/donations/settings` before enabling it. The owner-provided number can be kept as an admin-only reminder in `.env` using `DONATION_CANDIDATE_NUMBER`; it is never assigned to a wallet or displayed publicly by default.
- Donors can support the general fund or a published community campaign. Admins create and approve campaigns at `/admin/donations/campaigns`. A campaign linked to a complaint requires a recorded verification event and an explicit project legitimacy note. A complaint success link selects that approved campaign if one exists; otherwise it opens general giving with an explanation. Donations do not influence complaint status or priority.
- Suggested or custom PKR amounts range from 100 to 1,000,000. Donors submit a transaction reference, optional contact details and optional JPEG/PNG/WebP receipt image. The 3 MB image is signature-checked and stored under ignored `private_uploads/donation_receipts/`. Only signed-in admins can retrieve it. Basic per-requester and global submission limits and a honeypot reduce spam.
- Every submission starts `PENDING`. At `/admin/donations`, an admin records an independent receiving-account check before marking it `VERIFIED` or `REJECTED`. A verified payment can later be marked `REFUNDED` after a recorded check. Verification and refund decisions create immutable review and audit records. Donor screenshots and references alone are never proof of payment.
- `/funds` is the public finance dashboard. `/transparency` redirects there so both links show identical numbers. It displays independently verified receipts, actual recorded refunds, paid expenses, general and restricted balances, monthly history, approved project summaries, safe spending updates and a downloadable aggregate CSV. Pending claims do not count. Negative balances are shown for reconciliation. No donor identity, payment reference, wallet credential or private receipt is exposed.
- `/admin/finance` separates expense proposals, approval, recorded payment and public summary publication. Private receipt images are limited to 3 MB and served only to admins. Financial corrections append an approved adjustment beside the original expense, with an admin audit event. Historical expense rows are preserved as paid records by the additive migration. The existing `/admin/donations` payment review and `/admin/donations/expenses` historical recording routes remain available. Refunds still require an independent account check and leave review history.

No payment gateway, paid service or API key is required. All four wallets remain disabled until the project owner confirms their real receiving details. Do not publish an account based only on the supplied candidate number. Karachi Fix does not claim registered charity status.

## Operations rules

- `/admin/team` gives admins a private team directory built from approved volunteer applications and admin accounts. It shows service areas, availability, workload, overdue tasks, assignment history and task activity. Admins can edit volunteer service profiles, assign or create verified-case tasks through the existing task service, add visit notes and upload protected field photos. Pausing a volunteer returns active tasks to the queue, changes the account back to citizen access and records audit events; restoring access requires an admin action.
- `/admin/ngos` tracks prospective organizations separately from verified partners. An admin must record an actual agreement before `ACTIVE` status. Projects can link verified complaints, approved campaigns, existing tasks and protected evidence without changing case priority. Milestones require recorded outcomes before a project can be marked completed. NGO in-kind or cash contributions have separate documentation and review; they never inflate Karachi Fix wallet balances.
- `/admin/contacts` is a private outreach directory with category/search filters, duplicate checks on normalized email and phone, assigned owners, due follow-ups, interaction history and links to complaints or NGO projects. Contact notes, personal numbers and donor details are admin-only. Recording an email or WhatsApp interaction does not send a message.
- `/admin/evidence` is an admin-only gallery over the existing evidence rows, with case/location/category/uploader/NGO/stage/type/date filters, a full-size viewer, before/after pairs, task and case links, and private expense receipt links. Field work accepts signature-checked JPEG/PNG/WebP photos (5 MB) and MP4/WebM videos (30 MB). Videos use authorized byte-range responses. Files retain random private storage keys and are never served from `public/`.
- `/admin` now shows database-backed complaint, verified finance, team, task, referral and NGO project totals with links to each operations workspace. Fund totals use independently verified receipts, actual refunds, paid expenses and approved corrections.
- `/admin/projects` reviews completed-work stories. A case needs a recorded verification event, citizen confirmation (or the existing authorized ownerless legacy closure), approved public case title and approximate area, approved public problem/work summaries, and real BEFORE and AFTER image files individually cleared for public use. Teams can approve safe content before resolution; qualifying stories then publish automatically. Missing checks keep the story unpublished with a reason. Reopening, disputes, removal of public case approval, photo approval revocation, and manual withdrawal remove public access and add audit records. Existing resolved cases were migrated as unpublished review candidates; the migration did not expose any historical photo or text.
- `/projects` presents published stories with real before/after cards; `/projects/completed/[id]` has a keyboard-accessible comparison slider, side-by-side fallback, approved summaries, a safe timeline and verified linked funding only when present. A linked public NGO project points to its story rather than creating a second project record. The media endpoint checks current story and photo approvals on every request.
- `/projects` lists only admin-approved work of verified active NGO partners. Admins approve a project summary, completed milestone outcomes and individual checked images at `/admin/ngos/[id]`. `/projects/[id]` links a complaint only if it was separately approved for public map display. Only approved campaign finance aggregates appear; donor records, internal descriptions, case notes and private photos remain hidden. Public project image requests recheck all approvals and partner status.
- Complaints move through `SUBMITTED`, `UNDER_REVIEW`, `VERIFIED`, `ASSIGNED`, `IN_PROGRESS`, `RESOLUTION_PROPOSED`, `RESOLVED`, `REOPENED`, `REJECTED`, and `BLOCKED`. Server-side transition rules reject invalid moves. Admins record reasons; citizens confirm, dispute or reopen their own cases.
- A task can be created only after a verification event. Volunteer assignees must have an approved application. Volunteers cannot complete tasks; an admin reviews and finalizes them. Task completion never resolves a complaint automatically.
- A referral starts as `DRAFT`. An admin must record an actual submission method and date before changing it to `SUBMITTED`. No government integration is implied. Department action also never resolves a complaint automatically.
- JPEG, PNG and WebP uploads are limited to 5 MB and stored under ignored `private_uploads/`, outside `public/`. `/api/evidence/[id]` checks the current session and ownership or assignment before serving a file. Volunteer uploads start as internal; admins can share selected photos with citizens.
- A proposed resolution requires an after photo shared with the citizen. Ownerless legacy cases can be resolved by an admin only after recorded verification and after evidence.
- Case events and admin audit entries are append-only in application code. Public tracking shows status and public events only; internal notes and private evidence are never disclosed by a reference lookup.
- Notifications are stored locally for task assignments and updates, complaint changes, resolution proposals, volunteer decisions and dispute review. There is no SMS or email service yet.

## Security and checks

Passwords are salted `scrypt` hashes. Sessions are stored server-side, expire after seven days, and use HTTP-only, SameSite=Lax cookies with Secure enabled in production. Login attempts are throttled per email. All mutations recheck role and record ownership on the server. The private upload directory and SQLite databases are ignored by Git.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs pure tests by default. For the full HTTP and database integration suite, use the isolated `prisma/auth-test.db`, apply migrations with `DATABASE_URL=file:./auth-test.db`, run a separate dev server on port 3100 with that environment variable, then set `AUTH_TEST_BASE_URL=http://127.0.0.1:3100` for the test command. The integration tests refuse to run against another database. The suite includes existing authentication and complaint workflows, map and assistant privacy, reporting, finance, team, NGO, CRM, evidence and public project permissions. Never point integration tests at `prisma/dev.db`.

## Nationwide city boundaries

- `/city` is the city manager entry point. A manager sees only explicitly assigned active city workspaces. The server checks the city on private case reads and on case, task, referral and evidence mutations. Unallocated legacy cases and standalone records are not visible to city managers. Existing ADMIN accounts retain platform-wide access.
- A platform admin can review and assign city memberships and standalone volunteer, NGO, department and contact records at `/admin/city-scopes`. Creating a membership does not activate an unsupported reporting city. New manager accounts can be provisioned with `npm run manager:provision` after setting `CITY_MANAGER_EMAIL`, `CITY_MANAGER_NAME`, `CITY_MANAGER_CITY=karachi` and `CITY_MANAGER_PASSWORD` in the current terminal. The script refuses existing emails, validates the active city and never prints the password. Enter the password interactively in PowerShell with `Read-Host -AsSecureString`, convert it only for that process, and remove `Env:\CITY_MANAGER_PASSWORD` afterward. Do not save it in `.env` or source files.
- `/map` and `/projects` have active-city filters. Public APIs and evidence endpoints enforce the same boundary. Approved historical records with no city link remain visible in the nationwide view; a selected city includes only records explicitly linked to it. Coming Soon cities cannot be selected for public operational views.
- `/funds` and its CSV have nationwide and active-city views. Historic receipts and expenses retain a null city allocation. The nationwide page shows their unallocated general balance. Admins can record a one-way, audited allocation for an unallocated campaign, independently verified general receipt or paid general expense at `/admin/finance/allocations`. Campaign-linked records inherit the campaign allocation in calculations. Pending payments and proposed expenses remain excluded. Public financial views contain no donor identity or transaction reference.
- `/help` offers a city selector. Existing unscoped help articles remain legacy Karachi guidance. Admins can assign a city to new or edited approved articles at `/admin/help`. Coming Soon cities receive an availability message; the assistant never offers a reporting link or guesses local contacts for them. Complaint lookups still require authenticated ownership. The no-key local assistant remains the default.

Karachi is the only ACTIVE reporting city. Other catalog cities remain COMING_SOON until the platform has a verified operational adapter and support process. This release does not activate new cities. See [the implementation checkpoint](docs/behtar-pakistan-progress.md) for migration verification and current limits.

## Temporary friend testing

An isolated production-mode test setup is documented in [docs/friend-test.md](docs/friend-test.md). It uses a separate SQLite database, private upload directory, test-only citizen credentials, dedicated build and loopback service at `http://127.0.0.1:3101`. The existing app and data remain separate. The Cloudflare tunnel stays off until an exact-hostname Access policy allows only the trusted testers.

The [Muse browser audit follow-up](docs/muse-audit-2026-09-27.md) records local retests and the external routing blocker. Run `node scripts/browser-audit.mjs` while the isolated service is up to capture 390px and 768px layout checks and ignored screenshots. It reads only the isolated test citizen credentials, never prints them, and refuses a different target URL.

The owner-provisioned [test admin lifecycle](docs/friend-admin-lifecycle-2026-09-27.md) covers fictional browser review, task completion, field evidence, citizen confirmation and automatic completed-work publication. The guarded `scripts/friend-admin-e2e.mjs` runs only with `scripts/friend-test-env.ps1` and stores its QA checkpoint and screenshots in ignored friend-test runtime files.

Public donation collection is off by default (`PUBLIC_DONATIONS_ENABLED=0`); in friend mode it is always off, even if this flag is set. Enable collection only after reviewing the receiving wallet details and legal status. Temporary test indexing is disabled; `PUBLIC_INDEXING_ENABLED=1` and a verified HTTPS `PUBLIC_SITE_URL` are required for a public sitemap on a separate future production launch.
# Phase 4A audit fixes

Completed-work stories now use a separate approval for the public title and approximate area. A verified, citizen-confirmed case with approved BEFORE and AFTER photos and summaries can publish without coordinates. Public map markers still require a separately approved approximate point. Historical map-approved stories retain approval through an additive migration.

Resolution reminders use the existing durable in-app outbox. The owner can see whether each reminder is scheduled, delivered to the in-app inbox, or cancelled on the private tracking page. The worker needs a scheduler to run `npm run notifications:work`; it never resolves a case for lack of a reply. External SMS and WhatsApp delivery remains disabled unless an approved provider is separately configured and authorized for live testing.

Citizen password recovery is disabled until an approved HTTPS email relay is configured using `PASSWORD_RESET_DELIVERY_URL`, `PASSWORD_RESET_DELIVERY_SECRET`, and `PASSWORD_RESET_PUBLIC_ORIGIN`. The relay must authenticate the request and securely deliver the message to the supplied address. The application sends only a short-lived, single-use reset link; it never displays or logs the token. Friend and auth-test environments always keep real delivery disabled. Recovery does not apply to admin accounts. Until configured, citizens can use the human support link; support cannot impersonate a user or retrieve a password.

The recurring reminder runner, database lease, admin worker-health view and deployment options are documented in [Phase 4A operations](docs/phase4a-notifications-sla.md). Related-case review and private community support are documented in [Phase 4B](docs/phase4b-related-cases.md). External messaging remains disabled; a running worker only processes in-app reminders and records blocked external attempts until a separately approved provider is implemented.
