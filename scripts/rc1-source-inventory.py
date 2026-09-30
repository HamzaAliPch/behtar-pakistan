"""Hash release source files without copying credentials or private runtime data."""
from hashlib import sha256
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
paths = [root / name for name in ("src", "tests", "scripts", "prisma", "public")]
paths += [root / name for name in ("package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "eslint.config.mjs", "postcss.config.mjs", "README.md", ".gitignore", ".env.example")]
files = []
for item in paths:
    if item.is_file():
        files.append(item)
    elif item.is_dir():
        files.extend(file for file in item.rglob("*") if file.is_file())

allowed = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".ps1", ".py", ".prisma", ".sql", ".toml", ".json", ".css", ".md", ".svg"}
files = sorted(file for file in files if (file.suffix in allowed or file.name == ".env.example") and "backups" not in file.relative_to(root).parts)
if any(file.is_symlink() for file in files):
    raise RuntimeError("Source tree contains a symlink; review it before packaging")
entries = []
overall = sha256()
for file in files:
    relative = file.relative_to(root).as_posix()
    file_hash = sha256(file.read_bytes()).hexdigest()
    entries.append({"path": relative, "sha256": file_hash, "bytes": file.stat().st_size})
    overall.update(relative.encode("utf-8") + b"\0" + file_hash.encode("ascii") + b"\n")
output = root / "runtime" / "rc1" / "source-inventory.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({"fileCount": len(entries), "aggregateSha256": overall.hexdigest(), "files": entries}, indent=2) + "\n", encoding="utf-8")
print(f"RC1 source inventory: {len(entries)} files; aggregate SHA-256 {overall.hexdigest()}; {output}")
