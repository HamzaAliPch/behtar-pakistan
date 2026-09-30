"""Read-only, consistent local backup before an isolated friend test."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[1]
source = root / "prisma" / "dev.db"
if not source.is_file():
    raise SystemExit("Main database not found; no backup made")
backup_dir = root / "prisma" / "backups"
backup_dir.mkdir(parents=True, exist_ok=True)
name = "main-before-friend-test-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + ".db"
destination = backup_dir / name
with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as live:
    with sqlite3.connect(destination) as saved:
        live.backup(saved)
        result = saved.execute("PRAGMA integrity_check").fetchone()
        if result != ("ok",):
            raise SystemExit("Backup integrity check failed")
print(f"Local backup: {destination}")
print(f"SHA-256: {sha256(destination.read_bytes()).hexdigest()}")
