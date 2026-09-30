"""Package the reviewed source inventory and RC1 documents, never runtime data."""
from hashlib import sha256
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
inventory_file = root / "runtime" / "rc1" / "source-inventory.json"
inventory = json.loads(inventory_file.read_text(encoding="utf-8"))
files: list[tuple[Path, str]] = []
for entry in inventory["files"]:
    relative = Path(entry["path"])
    if relative.is_absolute() or ".." in relative.parts:
        raise RuntimeError("Unsafe source inventory path")
    file = root / relative
    if sha256(file.read_bytes()).hexdigest() != entry["sha256"]:
        raise RuntimeError(f"Source changed after inventory: {relative}")
    files.append((file, relative.as_posix()))
for file in sorted((root / "docs").glob("rc1-*.md")):
    files.append((file, file.relative_to(root).as_posix()))
files.append((inventory_file, "source-inventory.json"))

archive = root / "runtime" / "rc1" / "source-rc1.zip"
temporary = archive.with_suffix(".tmp")
with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as zipped:
    for file, relative in files:
        zipped.write(file, relative)
with zipfile.ZipFile(temporary) as zipped:
    if zipped.testzip() is not None:
        raise RuntimeError("RC1 source archive CRC failed")
temporary.replace(archive)
archive_hash = sha256(archive.read_bytes()).hexdigest()
(archive.parent / "source-rc1.sha256").write_text(f"{archive_hash}  {archive.name}\n", encoding="ascii")
print(f"RC1 local source archive: {archive}; {len(files)} files; SHA-256 {archive_hash}")
