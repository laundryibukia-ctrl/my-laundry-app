import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from bson import json_util
from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import current_user
from lib.core import TZ, audit, now
from lib.db import db
from models.schemas import AuditLog, BackupFile, RestoreIn, RestoreResult, Settings, SettingsIn

router = APIRouter()
logger = logging.getLogger(__name__)

BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/app/backend/backups"))
# users are deliberately excluded: restoring must never lock the owner out
BACKUP_COLLECTIONS = ["customers", "services", "orders", "order_items", "payments", "inventory", "stock_movements",
                      "employees", "payroll", "expenses", "settings", "audit_logs", "deleted_records", "counters"]
KEEP = 30

DEFAULT_SETTINGS = {
    "id": "main", "business_name": "Laundry Lia Masohi", "tagline": "Bersih, Wangi, Rapi",
    "address": "Jl. Abdullah Soulissa, Masohi, Maluku Tengah", "phone": "081234567890", "whatsapp": "081234567890",
    "email": "", "logo": "", "receipt_footer": "Terima kasih telah mempercayakan cucian Anda kepada kami.",
    "pickup_terms": "Cucian yang tidak diambil lebih dari 30 hari di luar tanggung jawab kami. Harap periksa kembali saat pengambilan.",
}


async def get_settings_doc() -> dict:
    doc = await db.settings.find_one({"id": "main"}, {"_id": 0})
    if not doc:
        doc = {**DEFAULT_SETTINGS, "updated_at": now()}
        await db.settings.update_one({"id": "main"}, {"$setOnInsert": doc}, upsert=True)
        doc = await db.settings.find_one({"id": "main"}, {"_id": 0})
    return doc


@router.get("/settings", response_model=Settings)
async def read_settings(user: dict = Depends(current_user)):
    return Settings(**await get_settings_doc())


@router.put("/settings", response_model=Settings)
async def save_settings(body: SettingsIn, user: dict = Depends(current_user)):
    if body.logo and not body.logo.startswith("data:image/"):
        raise HTTPException(400, "Logo harus berupa gambar")
    data = {**body.model_dump(), "updated_at": now()}
    await db.settings.update_one({"id": "main"}, {"$set": data}, upsert=True)
    await audit(user, "ubah", "settings", "main", "pengaturan usaha")
    return Settings(**data)


@router.get("/audit-logs", response_model=list[AuditLog])
async def audit_logs(limit: int = 200, entity: str = "", user: dict = Depends(current_user)):
    query = {"entity": entity} if entity else {}
    docs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 1000))
    return [AuditLog(**d) for d in docs]


# ---------- backup & restore ----------
async def dump_all() -> dict:
    data = {}
    for name in BACKUP_COLLECTIONS:
        data[name] = await db[name].find({}, {"_id": 0} if name != "counters" else None).to_list(None)
    return {"app": "laundry-lia-masohi", "version": 1, "created_at": now().isoformat(), "collections": data}


def to_json(payload: dict) -> str:
    return json_util.dumps(payload, json_options=json_util.RELAXED_JSON_OPTIONS)


async def write_backup(tag: str) -> str:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    name = f"backup-{datetime.now(TZ).strftime('%Y%m%d-%H%M%S')}-{tag}.json"
    (BACKUP_DIR / name).write_text(to_json(await dump_all()))
    files = sorted(BACKUP_DIR.glob("backup-*.json"))
    for old in files[:-KEEP]:
        old.unlink(missing_ok=True)
    return name


async def auto_backup_loop() -> None:
    """Periodic backup: one file per WIT day, checked hourly, last 30 files kept."""
    while True:
        try:
            today = datetime.now(TZ).strftime("%Y%m%d")
            if not list(BACKUP_DIR.glob(f"backup-{today}-*-otomatis.json")):
                await write_backup("otomatis")
        except Exception as exc:
            logger.error("auto backup failed: %s", exc)
        await asyncio.sleep(3600)


@router.get("/backup/download")
async def download_backup(user: dict = Depends(current_user)):
    await audit(user, "unduh_backup", "backup")
    name = f"laundry-lia-backup-{datetime.now(TZ).strftime('%Y%m%d-%H%M')}.json"
    return Response(to_json(await dump_all()), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/backup/files", response_model=list[BackupFile])
async def list_backups(user: dict = Depends(current_user)):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(BACKUP_DIR.glob("backup-*.json"), reverse=True)
    return [BackupFile(name=f.name, size=f.stat().st_size, created_at=datetime.fromtimestamp(f.stat().st_mtime, timezone.utc)) for f in files]


@router.post("/backup/run", response_model=BackupFile)
async def run_backup(user: dict = Depends(current_user)):
    name = await write_backup("manual")
    f = BACKUP_DIR / name
    await audit(user, "buat_backup", "backup", name)
    return BackupFile(name=name, size=f.stat().st_size, created_at=datetime.fromtimestamp(f.stat().st_mtime, timezone.utc))


@router.get("/backup/files/{name}")
async def get_backup_file(name: str, user: dict = Depends(current_user)):
    path = BACKUP_DIR / name
    if "/" in name or not name.startswith("backup-") or not path.is_file():
        raise HTTPException(404, "File backup tidak ditemukan")
    return Response(path.read_text(), media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/backup/restore", response_model=RestoreResult)
async def restore_backup(body: RestoreIn, user: dict = Depends(current_user)):
    payload = body.data
    cols = payload.get("collections")
    if payload.get("app") != "laundry-lia-masohi" or not isinstance(cols, dict):
        raise HTTPException(400, "File bukan backup Laundry Lia Masohi yang valid")
    unknown = set(cols) - set(BACKUP_COLLECTIONS)
    if unknown or not all(isinstance(v, list) for v in cols.values()):
        raise HTTPException(400, f"Struktur backup tidak dikenal: {', '.join(sorted(unknown)) or 'format koleksi'}")
    parsed = json_util.loads(json.dumps(cols))  # revives {"$date": ...} into datetimes
    safety = await write_backup("sebelum-restore")
    restored = {}
    for name in BACKUP_COLLECTIONS:
        if name not in parsed:
            continue
        await db[name].delete_many({})
        if parsed[name]:
            await db[name].insert_many(parsed[name])
        restored[name] = len(parsed[name])
    await audit(user, "restore", "backup", safety, json.dumps(restored))
    return RestoreResult(restored=restored, safety_backup=safety)
