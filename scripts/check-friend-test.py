"""Read-only separation check; never opens the live database for writing."""
from pathlib import Path
import sqlite3
import sys

root = Path(__file__).resolve().parents[1]
main = (root / "prisma" / "dev.db").resolve()
test = (root / "prisma" / "friend-test.db").resolve()
main_uploads = (root / "private_uploads").resolve()
test_uploads = (root / "runtime" / "friend-test" / "uploads").resolve()
if not test.exists() or test == main or not test_uploads.is_dir() or test_uploads == main_uploads or main_uploads in test_uploads.parents:
    raise SystemExit("Isolation check failed: database or upload paths overlap")
with sqlite3.connect(test.as_uri() + "?mode=ro", uri=True) as db:
    counts = {table: db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in ["User", "Complaint", "Session", "WalletAccount", "DonationIntent", "Evidence"]}
    roles = dict(db.execute("SELECT role, COUNT(*) FROM User GROUP BY role").fetchall())
    if any(role not in ("CITIZEN", "VOLUNTEER", "ADMIN") for role in roles) or roles.get("ADMIN", 0) > 1 or counts["WalletAccount"] or counts["DonationIntent"]:
        raise SystemExit("Isolation check failed: unexpected role, wallet or donation found")
    invalid_volunteers = db.execute("SELECT COUNT(*) FROM User u LEFT JOIN VolunteerApplication v ON v.userId = u.id WHERE u.role = 'VOLUNTEER' AND (v.id IS NULL OR v.status != 'APPROVED')").fetchone()[0]
    if invalid_volunteers:
        raise SystemExit("Isolation check failed: volunteer lacks approval")
    if "--initial" in sys.argv and (counts["User"] != 1 or counts["Complaint"] != 1 or counts["Evidence"]):
        raise SystemExit("Initial friend sample data has unexpected records")
print("Friend test paths are separate; at most one test admin, no wallets or donations are present.")
print("Counts: " + ", ".join(f"{key}={value}" for key, value in counts.items()))
