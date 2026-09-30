# Isolated admin lifecycle browser test — 27 September 2026

Target: production-mode `http://127.0.0.1:3101`, `prisma/friend-test.db`, and `runtime/friend-test/uploads`. The owner provisioned one test-only administrator and separately confirmed sign-in to `/admin`. The automated browser then created a temporary test-admin session in the friend database, used real browser controls for case actions, and deleted that temporary session. It never read or changed the main database or uploads and never used the admin password.

Fictional case: `KFX-2A4BBC69A6B002FC`. Its visible text is labeled **QA TEST** and explicitly says no real damage or repair occurred. Public story ID: `cmukcpvwz002hbma8y5bc2gfu`.

| Step | Browser and database result |
| --- | --- |
| Citizen reporting | PASS. Signed-in seeded citizen completed the four-step form with district East, Gulshan-e-Iqbal, a clicked map pin and a private BEFORE photo. A new tracking reference was generated. |
| Admin review | PASS. Protected `/admin` loaded; Case Action Center verification recorded an immutable VERIFIED event and advanced the case. |
| Team task | PASS. One task assigned to the test admin, then advanced via `/admin/tasks` through IN_PROGRESS, SUBMITTED_FOR_REVIEW and COMPLETED. Task completion left the complaint open until a separate case action. |
| Field progress | PASS. Admin recorded citizen-visible case progress and uploaded a private PROGRESS photo. |
| Completion evidence | PASS. Admin uploaded an owner-visible AFTER photo. Evidence upload did not resolve the complaint. Anonymous direct access to private evidence remained denied. |
| Public content moderation | PASS. Admin approved the QA-labeled public title, approximate area and summaries, then explicitly approved each BEFORE and AFTER photo. The story remained DRAFT and public detail returned 404 before citizen confirmation. |
| Resolution | PASS. Admin proposed a resolution; citizen private tracking showed the review action and shared evidence. Citizen confirmation changed the case to RESOLVED. |
| Automatic publication | PASS. The approved story became PUBLISHED automatically after confirmation. An anonymous browser saw it in `/projects` and its detail page; approved public media loaded. The keyboard-operated before/after slider and side-by-side fallback worked. The direct private evidence endpoint remained denied. |
| Public map and privacy | PASS for API data. The published case has an approximate marker (24.91, 67.08), different from the precise stored point. Map tiles remained unavailable in this environment, with visible Retry feedback. |
| Ownership and audit | PASS. The citizen dashboard showed the case. Anonymous `/admin` access redirected to login. One STORY_PUBLISHED audit entry exists; rerunning the test did not create a second story or publication entry. |
| Action Center label | FIXED. The guided assignment field had rendered a literal JSX expression; it now displays “Assign to.” The rebuilt isolated browser page confirmed the label. |

Final friend database state: 3 users (one test admin, two citizens), 6 fictional complaints, 1 completed task, 1 published QA story. Main database state remained 3 users and 2 complaints; both databases passed SQLite integrity checks. No government referral, actual wallet transfer, outbound message or real-world work was recorded.

The repeatable browser script is `scripts/friend-admin-e2e.mjs`. Run it only after sourcing `scripts/friend-test-env.ps1`; it refuses any other database or upload path. It stores a non-secret case checkpoint and screenshots under ignored `runtime/friend-test/`. The script is idempotent for the completed QA case.

Remaining external blocker: `test.socialautomation.my.id` still routes incorrectly and is blocked with HTTP 421 by the main app. Cloudflare Access and routing to port 3101 must be corrected by the owner before remote testing. Tile/geocoder connectivity must also be retested through that protected route.
