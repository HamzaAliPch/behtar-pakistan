# Muse audit follow-up — 27 September 2026

The external test hostname was routed to the **main Next.js development server**, not the isolated production-like service. The development server reported blocked cross-origin HMR resources for `test.socialautomation.my.id`. The main app now rejects that exact host with HTTP 421. The owner must put Cloudflare Access in front of the hostname and route it to `http://127.0.0.1:3101` before an external retest. The local isolated service remains at that loopback URL and uses only `prisma/friend-test.db` and `runtime/friend-test/uploads`.

| Audit ID | Confirmed finding and change | Local retest | External retest |
| --- | --- | --- | --- |
| BP-CRIT-001 | Wrong external origin reached development mode; the isolated four-step wizard works. Client validation, Back, photos, submission and duplicate prevention were exercised without changing its backend. | PASS: fictional complaint generated a reference and appeared in tracking/dashboard; 390px and 768px Continue/Back passed. | BLOCKED: protected Cloudflare route must point to 3101. |
| BP-HIGH-001 | Isolated Leaflet and public API load; the wrong external origin explains the audit environment difference. Added map-load and tile-failure messages with Retry. | PARTIAL: controls, attribution, last update and an approved fictional QA marker load. Tile requests fail in this environment and show a visible retry message. | BLOCKED by routing. |
| BP-MED-001 | Search had weak busy/error feedback. Query is retained; search now reports loading, no results or geocoder failure. | PASS: “Saddar” stayed entered and geocoder failure showed a clear fallback message. | BLOCKED by routing. |
| BP-LOW-006 | Narrow city control could truncate its label. Widened filter panel and shortened the option label. | PASS: “All active cities” visible and selectable. | BLOCKED by routing. |
| BP-HIGH-002 | Local assistant works without a key; audit used the wrong origin. Verified FAQ and typed interactions. | PASS: English, Urdu and Roman Urdu replies; private lookup still requires ownership. | BLOCKED by routing. |
| BP-HIGH-003 | Support submission worked but history needed a reload. Refresh the server-rendered history after success. | PASS: fictional support question appeared in citizen history; unauthenticated API request returned 401. | BLOCKED by routing. |
| BP-MED-002 | A configured personal wallet was shown publicly. Added an explicit collection launch switch, off by default and forced off in friend mode; no account details were changed. | PASS: donate page states unavailable and hides receiving details; existing ledger retained. | BLOCKED by routing. |
| BP-LOW-004 | Copy feedback was not visible. Added accessible copied/error status to active wallet buttons. | PASS: component behavior reviewed; active-wallet browser test is blocked because friend mode has no wallet and collection is disabled. | BLOCKED by routing. |
| BP-LOW-001 | Citizen profile had no phone/city management. Added optional fields, protected profile editing and an additive profile migration. | PASS: test registration and profile city display; cross-citizen dashboard remained private. | BLOCKED by routing. |
| BP-LOW-002 | Failed login could leave password text in the control. Clear it on an error response. | PASS: browser showed an error and blank password field. | BLOCKED by routing. |
| BP-LOW-003 | GET `/logout` had no page. Added an explanation page; logout remains POST-only. | PASS: GET did not revoke session; POST redirected to login. | BLOCKED by routing. |
| BP-LOW-005 | Project city filter selection lacked clear styling. Added a filled active pill with `aria-current`. | PASS: selected Karachi link is visibly active and keyboard accessible. | BLOCKED by routing. |
| BP-LOW-007 | Metadata routes were absent. Added configurable robots and public-only sitemap, with test indexing disabled. | PASS: friend robots disallows all; sitemap contains no test hostname. | BLOCKED by routing. |
| BP-LOW-008 | Hero entered with a gray opacity shimmer. Removed first-load fade and used a stable warm surface. | PASS: initial local render inspected; no layout overflow at 390px/768px. | BLOCKED by routing. |

## Additional privacy and test findings

- Public tracking with another citizen's session leaked the event actor's name. Public events now omit actor identity; a focused test and browser retest passed. Title, description and private evidence remained hidden.
- The shared-browser observation was session retention, not a reproduced cross-user data leak. Different citizen sessions did not reveal one another's case details.
- The complete integration suite passed against `prisma/auth-test.db` after test fixtures were moved to the configured isolated upload root. The main database and uploads were not used for fixtures.
- The local screenshot and viewport audit writes only to ignored `runtime/friend-test/screenshots/`. It tests signed-in `/report`, `/map`, `/donate` and home at 390px and 768px; all eight routes returned HTTP 200 without horizontal overflow. It also tests Continue, Back and state preservation at both widths.

## Remaining launch blockers

1. Cloudflare Access must challenge non-allowlisted visitors before any app page; this was not observed at the current hostname.
2. The tunnel route must target the isolated production-like service on port 3101. The main application now rejects the test host instead of serving private main data.
3. The owner provisioned a test-only admin and signed in. The fictional browser lifecycle through completed-work publication passed; see `docs/friend-admin-lifecycle-2026-09-27.md`.
4. OpenStreetMap tiles and geocoding did not answer from this environment. The UI reports both failures and retains manual area selection and the report list. Verify the configured tile provider and geocoder from the protected external route before launch.
5. Collection of real donations remains disabled until the owner verifies an appropriate receiving account and intentionally enables the public switch. No real payments were made.
