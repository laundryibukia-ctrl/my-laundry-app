"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
# tz_aware: datetimes come back as aware UTC, so they serialise with an offset.
client = AsyncIOMotorClient(mongo_url, tz_aware=True)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)


def _id() -> IndexModel:
    return IndexModel([("id", ASCENDING)], name="id", unique=True)


# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [_id(), IndexModel([("email", ASCENDING)], name="email", unique=True)],
    "customers": [_id(), IndexModel([("phone", ASCENDING)], name="phone"), IndexModel([("name", ASCENDING)], name="name")],
    "services": [_id(), IndexModel([("active", ASCENDING), ("category", ASCENDING)], name="active_cat")],
    "orders": [
        _id(),
        IndexModel([("nota_no", ASCENDING)], name="nota_no", unique=True),
        IndexModel([("client_ref", ASCENDING)], name="client_ref", unique=True),
        IndexModel([("customer_id", ASCENDING), ("created_at", DESCENDING)], name="customer_created"),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
        IndexModel([("created_at", DESCENDING)], name="created"),
    ],
    "order_items": [_id(), IndexModel([("order_id", ASCENDING)], name="order_id")],
    "payments": [
        _id(),
        IndexModel([("client_ref", ASCENDING)], name="client_ref", unique=True),
        IndexModel([("order_id", ASCENDING)], name="order_id"),
        IndexModel([("created_at", DESCENDING)], name="created"),
    ],
    "inventory": [_id(), IndexModel([("active", ASCENDING), ("name", ASCENDING)], name="active_name")],
    "stock_movements": [_id(), IndexModel([("item_id", ASCENDING), ("created_at", DESCENDING)], name="item_created"), IndexModel([("created_at", DESCENDING)], name="created")],
    "employees": [_id()],
    "payroll": [
        _id(),
        IndexModel([("employee_id", ASCENDING), ("period", ASCENDING)], name="employee_period", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created"),
    ],
    "expenses": [_id(), IndexModel([("date", DESCENDING)], name="date"), IndexModel([("source", ASCENDING), ("source_id", ASCENDING)], name="source")],
    "settings": [_id()],
    "audit_logs": [_id(), IndexModel([("created_at", DESCENDING)], name="created")],
    "deleted_records": [_id(), IndexModel([("deleted_at", DESCENDING)], name="deleted")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
