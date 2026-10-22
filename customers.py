from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user
from lib.core import archive_deleted, audit, clean, new_id, normalize_phone, now, regex
from lib.db import db
from models.schemas import Customer, CustomerDeleteIn, CustomerIn, DeleteResult

router = APIRouter()


async def stats_for(ids: list[str]) -> dict[str, dict]:
    pipeline = [
        {"$match": {"customer_id": {"$in": ids}, "status": {"$ne": "dibatalkan"}}},
        {"$group": {"_id": "$customer_id", "count": {"$sum": 1}, "total": {"$sum": "$total"},
                    "outstanding": {"$sum": {"$subtract": ["$total", "$paid"]}}}},
    ]
    return {r["_id"]: r async for r in db.orders.aggregate(pipeline)}


def with_stats(doc: dict, stats: dict) -> Customer:
    s = stats.get(doc["id"], {})
    return Customer(**clean(doc), order_count=s.get("count", 0), total_spent=s.get("total", 0), outstanding=s.get("outstanding", 0))


async def create_customer_doc(body: CustomerIn, user: dict) -> dict:
    phone = normalize_phone(body.phone)
    if phone:
        dup = await db.customers.find_one({"phone": phone}, {"_id": 0})
        if dup:
            raise HTTPException(409, f"Nomor HP sudah terdaftar atas nama {dup['name']}")
    ts = now()
    doc = {**body.model_dump(), "phone": phone, "name": body.name.strip(), "id": new_id(), "created_at": ts, "updated_at": ts}
    await db.customers.insert_one(doc)
    await audit(user, "tambah", "customers", doc["id"], doc["name"])
    return clean(doc)


@router.get("/customers", response_model=list[Customer])
async def list_customers(q: str = "", limit: int = 200, user: dict = Depends(current_user)):
    query = {}
    if q.strip():
        query = {"$or": [{"name": regex(q)}, {"phone": regex(normalize_phone(q) or q)}]}
    docs = await db.customers.find(query, {"_id": 0}).sort("name", 1).to_list(min(limit, 500))
    stats = await stats_for([d["id"] for d in docs])
    return [with_stats(d, stats) for d in docs]


@router.post("/customers", response_model=Customer, status_code=201)
async def create_customer(body: CustomerIn, user: dict = Depends(current_user)):
    return Customer(**await create_customer_doc(body, user))


@router.get("/customers/{id}", response_model=Customer)
async def get_customer(id: str, user: dict = Depends(current_user)):
    doc = await db.customers.find_one({"id": id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Pelanggan tidak ditemukan")
    return with_stats(doc, await stats_for([id]))


@router.put("/customers/{id}", response_model=Customer)
async def update_customer(id: str, body: CustomerIn, user: dict = Depends(current_user)):
    phone = normalize_phone(body.phone)
    if phone and await db.customers.find_one({"phone": phone, "id": {"$ne": id}}):
        raise HTTPException(409, "Nomor HP sudah dipakai pelanggan lain")
    data = {**body.model_dump(), "phone": phone, "updated_at": now()}
    doc = await db.customers.find_one_and_update({"id": id}, {"$set": data}, projection={"_id": 0}, return_document=True)
    if not doc:
        raise HTTPException(404, "Pelanggan tidak ditemukan")
    # keep open orders' contact in sync; closed notas keep their snapshot
    await db.orders.update_many(
        {"customer_id": id, "status": {"$in": ["diterima", "diproses", "siap_diambil"]}},
        {"$set": {"customer_name": body.name, "customer_phone": phone}},
    )
    await audit(user, "ubah", "customers", id, body.name)
    return with_stats(doc, await stats_for([id]))


async def purge_orders(order_ids: list[str], user: dict, reason: str) -> tuple[int, int]:
    """Hard-delete orders + items + payments, snapshotting everything into deleted_records first."""
    if not order_ids:
        return 0, 0
    orders = await db.orders.find({"id": {"$in": order_ids}}).to_list(None)
    items = await db.order_items.find({"order_id": {"$in": order_ids}}).to_list(None)
    pays = await db.payments.find({"order_id": {"$in": order_ids}}).to_list(None)
    await archive_deleted(user, "orders", orders, reason)
    await archive_deleted(user, "order_items", items, reason)
    await archive_deleted(user, "payments", pays, reason)
    await db.payments.delete_many({"order_id": {"$in": order_ids}})
    await db.order_items.delete_many({"order_id": {"$in": order_ids}})
    await db.orders.delete_many({"id": {"$in": order_ids}})
    return len(orders), len(pays)


@router.post("/customers/{id}/delete", response_model=DeleteResult)
async def delete_customer(id: str, body: CustomerDeleteIn, user: dict = Depends(current_user)):
    cust = await db.customers.find_one({"id": id})
    if not cust:
        raise HTTPException(404, "Pelanggan tidak ditemukan")
    n_orders = n_pays = 0
    if body.delete_orders:
        ids = [o["id"] async for o in db.orders.find({"customer_id": id}, {"id": 1})]
        n_orders, n_pays = await purge_orders(ids, user, body.reason)
    # without delete_orders, notas stay intact with their customer-name snapshot
    await archive_deleted(user, "customers", [cust], body.reason)
    await db.customers.delete_one({"id": id})
    await audit(user, "hapus", "customers", id, f"{cust['name']} (+{n_orders} pesanan, {n_pays} pembayaran): {body.reason}")
    return DeleteResult(ok=True, orders_deleted=n_orders, payments_deleted=n_pays)
