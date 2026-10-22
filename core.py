"""Shared helpers: WIT time, ids, rupiah rounding, nota numbers, audit log."""

import os
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pymongo import ReturnDocument

from lib.db import db

TZ = ZoneInfo(os.environ.get("APP_TZ", "Asia/Jayapura"))


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def local_today() -> date:
    return datetime.now(TZ).date()


def local_date_str(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ).strftime("%Y-%m-%d")


def parse_date(value: str | None, default: date) -> date:
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, f"Format tanggal tidak valid: {value}")


def utc_range(d_from: date, d_to: date) -> tuple[datetime, datetime]:
    """[start, end) in UTC covering whole WIT days d_from..d_to."""
    start = datetime.combine(d_from, time.min, TZ).astimezone(timezone.utc)
    end = datetime.combine(d_to + timedelta(days=1), time.min, TZ).astimezone(timezone.utc)
    return start, end


def period(date_from: str | None, date_to: str | None) -> tuple[date, date]:
    today = local_today()
    d_from = parse_date(date_from, today.replace(day=1))
    d_to = parse_date(date_to, today)
    if d_to < d_from:
        raise HTTPException(400, "Tanggal akhir tidak boleh sebelum tanggal awal")
    return d_from, d_to


def rupiah(amount: Decimal | float | int) -> int:
    """Round to whole rupiah, half-up, without float drift."""
    return int(Decimal(str(amount)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def qty3(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))


def line_total(qty: float, price: int) -> int:
    return rupiah(Decimal(str(qty)) * Decimal(price))


def normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("62"):
        digits = "0" + digits[2:]
    return digits


def regex(q: str) -> dict:
    return {"$regex": re.escape(q.strip()), "$options": "i"}


def clean(doc: dict | None) -> dict | None:
    if doc is not None:
        doc.pop("_id", None)
    return doc


async def next_nota() -> str:
    """LL-YYMMDD-NNN, daily counter in WIT; atomic $inc + unique index prevent duplicates."""
    day = datetime.now(TZ).strftime("%y%m%d")
    counter = await db.counters.find_one_and_update(
        {"_id": f"nota-{day}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return f"LL-{day}-{counter['seq']:03d}"


async def archive_deleted(user: dict | None, entity: str, docs: list[dict], reason: str) -> None:
    """Keep a full snapshot of hard-deleted records so deletions always leave a trail."""
    if not docs:
        return
    ts = now()
    await db.deleted_records.insert_many([
        {"id": new_id(), "entity": entity, "record_id": d.get("id", ""), "data": {k: v for k, v in d.items() if k != "_id"},
         "reason": reason, "user_email": (user or {}).get("email", "sistem"), "deleted_at": ts}
        for d in docs
    ])


async def audit(user: dict | None, action: str, entity: str, entity_id: str = "", detail: str = "") -> None:
    await db.audit_logs.insert_one(
        {
            "id": new_id(),
            "user_email": (user or {}).get("email", "sistem"),
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "detail": detail,
            "created_at": now(),
        }
    )
