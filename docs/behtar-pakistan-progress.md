# Behtar Pakistan implementation checkpoint — 27 September 2026

## Delivered

- Central identity in `src/lib/brand.ts`; public shell, metadata, authentication, reporting, dashboards, funds, donations, help and appropriate admin copy use the new name. Historical stored text, KFX references, cookie names and private storage paths stay compatible.
- Shared ivory, teal and mint design tokens/surfaces, responsive navigation, accessible focus/skip controls and reduced-motion behavior. Homepage has a decorative vector city illustration, real database totals, approved before/after stories, finance, volunteer and partnership sections. Illustration is never evidence.
- Additive location migration `20260926170000_nationwide_location_catalog`: Country, AdministrativeRegion, City, LocationDistrict and Locality catalog; optional city/district/locality complaint links and a review flag.
- Four provinces, a capital territory and two administrative territories are represented with distinct kinds. Karachi alone is ACTIVE. Lahore, Islamabad, Peshawar, Quetta and Multan are COMING_SOON. No other city adapter accepts reports, even if its database status is changed accidentally.
- `/cities` shows real catalog coverage. `/report?city=karachi` uses the existing four-step form with database district/locality choices. New API submissions store normalized links. Legacy clients without a city default to Karachi. Invalid/inactive city submissions fail server-side; no new city was activated.
- `/admin/locations` allows audited locality additions, corrections and retirement with a source URL. It lists ambiguous legacy/manual reports. Boundary changes require new entries, preserving historical links and labels. Administrative region/district/city creation and city activation are not yet exposed in this editor.
- Existing exact district AND locality labels are backfilled only when they match the prior reviewed Karachi catalog. Unmatched records retain all original text and are flagged for review. No historical coordinates, financial allocations, roles, sessions or complaint identifiers are inferred or changed.
- Additive city scope migration `20260926190000_city_scopes` adds the CITY_MANAGER role, explicit CityMembership, and optional city links for standalone volunteers, NGOs, departments and CRM contacts. Existing ADMIN remains nationwide. The `/city` workspace checks membership and active city on private case reads; shared case/task/referral/evidence services check it again for mutations. Legacy cases without a city are reserved for platform admins. `/admin/city-scopes` records audited assignments. `scripts/provision-city-manager.ts` creates a new manager only from environment credentials, without changing an existing account.
- `/map` and `/projects` now filter approved public content by active city. The map API, public case detail, completed-story detail/media and NGO project detail/media enforce active-city publication checks. The nationwide view retains approved unallocated legacy work; a city view requires explicit linkage. Coming Soon cities have no public operational filter.
- Additive finance migration `20260926200000_finance_city_allocations` adds optional city allocations to campaigns, donation intents and expenses without backfilling historical money. `/funds` and CSV show nationwide or explicit city totals, with unallocated national general funds labelled. Campaign allocation applies to linked verified receipts and paid expenses. Admin-only `/admin/finance/allocations` records one-way allocations with DonationAudit and AuditLog entries; it does not alter donation or complaint status.
- Additive help migration `20260926210000_help_city_scope` adds an optional article city. Existing articles remain legacy Karachi guidance. Admin editors can select a city; only published city guidance is shown. The assistant uses a local Coming Soon response for inactive cities, avoids city-specific guesses for future active cities without matched guidance, and retains authenticated ownership checks for case references. No AI key is required.

## Verification and preservation

- Branding milestone: TypeScript, lint, production build, 15 existing tests and a new brand HTTP test passed. Desktop and mobile homepage and mobile menu checked in browser.
- Location milestone: focused catalog/reporting tests verify active-city enforcement, manual fallback, district consistency, admin-only edits, catalog changes and legacy KFX references.
- The previous 17-test suite passed before these milestones. The current 21-test HTTP and database suite passed with no skips. New tests cover cross-city private access, inactive public content, explicit financial allocations and assistant guidance isolation. A focused browser-level city manager test also passed: Karachi workspace/case 200, cross-city workspace/case and unallocated case 404. TypeScript, lint, Prisma schema validation and the production build passed with `/city`, `/admin/finance/allocations`, city-filtered public pages and the updated assistant included.
- All 22 migrations are applied to the live database and isolated test database. The city scope migration preserved every historical column and record in 36 existing tables; the finance/help migrations preserved them across 37 tables. AuditLog is excluded from hashes because authorized migration/assignment auditing appends new events; existing audit rows were not rewritten.
- Local HTTP checks on port 3000 returned 200 for `/`, `/cities`, `/map`, `/projects`, `/projects?city=karachi`, `/funds`, `/funds?city=karachi`, city CSV, `/help?city=karachi`, `/help?city=lahore` and the Karachi map API. `/api/map?city=lahore` returned 400 because Lahore is inactive. Private `/city` and `/admin/finance/allocations` redirected unauthenticated visitors. The Lahore assistant returned its local Coming Soon explanation. The development server was restarted on port 3000 against the preserved live database.
- Backups and hash manifests live in ignored `prisma/backups/`. `scripts/check-data-preservation.ts` reads records and writes only hashes, counts and column names.

## Current limits and activation rules

- Karachi remains the only ACTIVE reporting city and the only city with a reporting adapter. City managers cannot activate another city or publish case evidence. Creating a manager membership for a Coming Soon city does not grant case operations there.
- Historical cases or finance records with ambiguous city remain unallocated. Admins must review them individually. No old coordinates or donation allocations were inferred.
- Public map geocoding and the initial map viewport still target Karachi because no other city operates yet. Adding a new active city requires an operational adapter, verified geocoding/map configuration, reviewed district catalog, team and department coverage, and authorization regression checks.
- Legacy unscoped help articles are treated as Karachi guidance. Admins should review their factual content before reusing it for another city. City-specific answers for inactive cities are limited to the Coming Soon message.
- This is a local SQLite deployment; financial publication remains a record of verified internal transactions, not an external audit or registered-charity claim. No new fundraising method or city was activated.

## Geographic sources

- Administrative distinctions: https://www.pbs.gov.pk/gis/ and https://www.pakistan.gov.pk/provinces
- Karachi districts: https://commissionerkarachi.gos.pk/population and https://commissionerkarachi.gos.pk/area-map
- Existing Karachi locality catalog retains the prior reviewed names in `src/lib/karachi-areas.ts`, with supplementary sources https://sindhpolice.gov.pk/east/police-station, https://sindhpolice.gov.pk/south and https://industries.sindh.gov.pk/central. Names describe service-location choices; they do not claim every locality is an administrative town or tehsil.

No deployment or new fundraising activation was performed.
