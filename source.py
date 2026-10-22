"""Owner-only download of the app's own source code (ZIP or one combined .txt). Secrets are never included."""

import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import current_user
from lib.core import audit

router = APIRouter()

ROOT = Path(__file__).resolve().parent.parent.parent  # /app
INCLUDE_DIRS = ["backend", "frontend", "memory"]
INCLUDE_FILES = ["DOCS.md", "README.md"]
SKIP_PARTS = {"node_modules", "__pycache__", "backups", ".venv", "dist", ".pytest_cache", "tests", ".emergent", ".git"}
SKIP_NAMES = {".env", "yarn.lock", "package-lock.json", "test_credentials.md"}
TEXT_EXT = {".py", ".ts", ".tsx", ".js", ".css", ".html", ".json", ".md", ".txt", ".ini", ".webmanifest", ".svg", ".toml", ".yml", ".yaml"}

ENV_EXAMPLE = """MONGO_URL="mongodb://localhost:27017"
DB_NAME="laundry_lia"
CORS_ORIGINS="https://alamat-aplikasi-anda"
JWT_SECRET="ganti-dengan-teks-acak-panjang"
APP_TZ="Asia/Jayapura"
BACKUP_DIR="/app/backend/backups"
"""


def _files() -> list[Path]:
    out: list[Path] = []
    for d in INCLUDE_DIRS:
        base = ROOT / d
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            rel = p.relative_to(ROOT)
            if p.is_file() and not (set(rel.parts) & SKIP_PARTS) and p.name not in SKIP_NAMES:
                out.append(p)
    out += [ROOT / f for f in INCLUDE_FILES if (ROOT / f).is_file()]
    return out


@router.get("/source/{fmt}")
async def download_source(fmt: str, user: dict = Depends(current_user)):
    files = _files()
    if not files:
        raise HTTPException(404, "Kode sumber tidak tersedia di server ini")
    await audit(user, "unduh_kode", "source", fmt)
    if fmt == "zip":
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for p in files:
                z.write(p, f"laundry-lia-masohi/{p.relative_to(ROOT)}")
            z.writestr("laundry-lia-masohi/backend/.env.example", ENV_EXAMPLE)
        return Response(buf.getvalue(), media_type="application/zip",
                        headers={"Content-Disposition": 'attachment; filename="laundry-lia-masohi-kode.zip"'})
    if fmt == "txt":
        parts = ["LAUNDRY LIA MASOHI - KODE SUMBER LENGKAP\nSetiap file diawali baris '===== FILE: path ====='.\n"
                 "Gambar/ikon (PNG) tidak termasuk di versi teks; gunakan versi ZIP untuk file lengkap.\n"]
        for p in files:
            if p.suffix.lower() not in TEXT_EXT:
                continue
            try:
                parts.append(f"\n===== FILE: {p.relative_to(ROOT)} =====\n{p.read_text(encoding='utf-8')}")
            except UnicodeDecodeError:
                continue
        parts.append(f"\n===== FILE: backend/.env.example =====\n{ENV_EXAMPLE}")
        return Response("".join(parts), media_type="text/plain; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="laundry-lia-masohi-kode.txt"'})
    raise HTTPException(400, "Format harus zip atau txt")
