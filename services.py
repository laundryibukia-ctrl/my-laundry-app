from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user
from lib.core import audit, new_id, now
from lib.db import db
from models.schemas import Service, ServiceIn

router = APIRouter()


@router.get("/services", response_model=list[Service])
async def list_services(active_only: bool = False, user: dict = Depends(current_user)):
    query = {"active": True} if active_only else {}
    docs = await db.services.find(query, {"_id": 0}).sort([("category", 1), ("name", 1)]).to_list(500)
    return [Service(**d) for d in docs]


@router.post("/services", response_model=Service, status_code=201)
async def create_service(body: ServiceIn, user: dict = Depends(current_user)):
    ts = now()
    doc = {**body.model_dump(), "id": new_id(), "created_at": ts, "updated_at": ts}
    await db.services.insert_one(doc)
    await audit(user, "tambah", "services", doc["id"], f"{body.name} Rp{body.price}/{body.unit}")
    doc.pop("_id", None)
    return Service(**doc)


@router.put("/services/{id}", response_model=Service)
async def update_service(id: str, body: ServiceIn, user: dict = Depends(current_user)):
    old = await db.services.find_one({"id": id}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Layanan tidak ditemukan")
    await db.services.update_one({"id": id}, {"$set": {**body.model_dump(), "updated_at": now()}})
    await audit(user, "ubah", "services", id, f"{old['name']}: Rp{old['price']} -> Rp{body.price}/{body.unit}")
    return Service(**{**old, **body.model_dump(), "updated_at": now()})


@router.delete("/services/{id}")
async def delete_service(id: str, user: dict = Depends(current_user)):
    """Services used on any nota are only deactivated so old receipts stay intact."""
    if await db.order_items.find_one({"service_id": id}):
        await db.services.update_one({"id": id}, {"$set": {"active": False, "updated_at": now()}})
        await audit(user, "nonaktifkan", "services", id)
        return {"ok": True, "deactivated": True}
    res = await db.services.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "Layanan tidak ditemukan")
    await audit(user, "hapus", "services", id)
    return {"ok": True, "deactivated": False}
