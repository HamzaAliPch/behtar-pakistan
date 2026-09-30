"""Create read-only RC backups of both SQLite databases and private upload trees."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import sqlite3
import zipfile

root = Path(__file__).resolve().parents[1]
backup_root = root / "prisma" / "backups"
backup_root.mkdir(parents=True, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
destination = backup_root / f"rc1-{stamp}"
destination.mkdir(mode=0o700)


def digest(file: Path) -> str:
    result = sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def inventory(folder: Path) -> list[tuple[str, int, int, str]]:
    files = sorted(file for file in folder.rglob("*") if file.is_file())
    if any(file.is_symlink() for file in files):
        raise RuntimeError(f"Upload tree contains a symlink: {folder}")
    return [(file.relative_to(folder).as_posix(), file.stat().st_size, file.stat().st_mtime_ns, digest(file)) for file in files]


manifest = {"createdAtUtc": stamp, "items": {}}
for label, database, uploads in [
    ("main", root / "prisma" / "dev.db", root / "private_uploads"),
    ("friend-test", root / "prisma" / "friend-test.db", root / "runtime" / "friend-test" / "uploads"),
]:
    if not database.is_file() or not uploads.is_dir():
        raise RuntimeError(f"Missing {label} database or uploads")
    target_db = destination / f"{label}.db"
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as source:
        with sqlite3.connect(target_db) as target:
            source.backup(target)
            if target.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                raise RuntimeError(f"{label} backup failed integrity check")
    before = inventory(uploads)
    archive = destination / f"{label}-uploads.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zipped:
        for relative, _, _, _ in before:
            zipped.write(uploads / relative, arcname=relative)
    with zipfile.ZipFile(archive) as zipped:
        if zipped.testzip() is not None:
            raise RuntimeError(f"{label} upload archive is corrupt")
    if inventory(uploads) != before:
        raise RuntimeError(f"{label} uploads changed during backup; retry at a quiet time")
    with sqlite3.connect(target_db.as_uri() + "?mode=ro", uri=True) as saved:
        complaint_count = saved.execute('SELECT COUNT(*) FROM "Complaint"').fetchone()[0]
        user_count = saved.execute('SELECT COUNT(*) FROM "User"').fetchone()[0]
    manifest["items"][label] = {
        "database": target_db.name,
        "databaseSha256": digest(target_db),
        "databaseBytes": target_db.stat().st_size,
        "uploadArchive": archive.name,
        "uploadArchiveSha256": digest(archive),
        "uploadFiles": len(before),
        "uploadBytes": sum(size for _, size, _, _ in before),
        "complaints": complaint_count,
        "users": user_count,
    }

(destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Verified local-only RC1 backup: {destination}")
for label, item in manifest["items"].items():
    print(f"{label}: integrity ok; {item['complaints']} complaints; {item['users']} users; {item['uploadFiles']} upload files")
