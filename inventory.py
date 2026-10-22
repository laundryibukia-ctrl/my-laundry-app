from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from lib.auth import current_user
from lib.core import archive_deleted, audit, clean, line_total, local_today, new_id, now, parse_date, qty3, utc_range
from lib.db import db
from models.schemas import InventoryCreate, InventoryIn, InventoryItem, StockMoveEdit, StockMoveIn, StockMovement, VoidIn

router = APIRouter()


def item_out(d: dict) -> InventoryItem:
    d = clean(d)
    return InventoryItem(**d, low=d["qty"] <= d.get("min_qty", 0))


async def add_movement(item: dict, mtype: str, delta: float, unit_cost: int, note: str, expense_id: str | None = None) -> dict:
    mv = {
        "id": new_id(), "item_id": item["id"], "item_name": item["name"], "unit": item["unit"], "type": mtype,
        "qty": qty3(delta), "qty_after": qty3(item["qty"]), "unit_cost": unit_cost,
        "total_cost": line_total(abs(delta), unit_cost), "note": note, "expense_id": expense_id, "created_at": now(),
    }
    await db.stock_movements.insert_one(mv)
    return clean(mv)


@router.get("/inventory", response_model=list[InventoryItem])
async def list_inventory(user: dict = Depends(current_user)):
    docs = await db.inventory.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(500)
    return [item_out(d) for d in docs]


@router.post("/inventory", response_model=InventoryItem, status_code=201)
async def create_item(body: InventoryCreate, user: dict = Depends(current_user)):
    ts = now()
    data = body.model_dump()
    initial = qty3(data.pop("initial_qty"))
    doc = {**data, "id": new_id(), "qty": initial, "active": True, "created_at": ts, "updated_at": ts}
    await db.inventory.insert_one(doc)
    if initial > 0:
        await add_movement(doc, "saldo_awal", initial, body.buy_price, "Stok awal")
    await audit(user, "tambah", "inventory", doc["id"], body.name)
    return item_out(doc)


@router.put("/inventory/{id}", response_model=InventoryItem)
async def update_item(id: str, body: InventoryIn, user: dict = Depends(current_user)):
    doc = await db.inventory.find_one_and_update(
        {"id": id, "active": True}, {"$set": {**body.model_dump(), "updated_at": now()}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(404, "Barang tidak ditemukan")
    await audit(user, "ubah", "inventory", id, body.name)
    return item_out(doc)


@router.delete("/inventory/{id}")
async def archive_item(id: str, user: dict = Depends(current_user)):
    res = await db.inventory.update_one({"id": id}, {"$set": {"active": False, "updated_at": now()}})
    if not res.matched_count:
        raise HTTPException(404, "Barang tidak ditemukan")
    await audit(user, "arsipkan", "inventory", id)
    return {"ok": True}


@router.post("/inventory/{id}/movements", response_model=StockMovement, status_code=201)
async def move_stock(id: str, body: StockMoveIn, user: dict = Depends(current_user)):
    item = await db.inventory.find_one({"id": id, "active": True}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Barang tidak ditemukan")
    q = qty3(body.qty)
    if body.type != "penyesuaian" and q <= 0:
        raise HTTPException(400, "Jumlah harus lebih dari 0")
    expense_id = None
    if body.type == "masuk":
        cost = body.unit_cost if body.unit_cost is not None else item["buy_price"]
        item = await db.inventory.find_one_and_update(
            {"id": id}, {"$inc": {"qty": q}, "$set": {"buy_price": cost, "updated_at": now()}},
            projection={"_id": 0}, return_document=ReturnDocument.AFTER,
        )
        total = line_total(q, cost)
        if body.record_expense and total > 0:
            expense_id = new_id()
            await db.expenses.insert_one({
                "id": expense_id, "date": local_today().isoformat(), "category": "pembelian_stok", "amount": total,
                "description": f"Beli {item['name']} {q:g} {item['unit']}", "method": body.method,
                "source": "stok", "source_id": None, "voided": False, "void_reason": "", "created_at": now(),
            })
        mv = await add_movement(item, "masuk", q, cost, body.note or "Barang masuk", expense_id)
        if expense_id:
            await db.expenses.update_one({"id": expense_id}, {"$set": {"source_id": mv["id"]}})
    elif body.type == "keluar":
        item = await db.inventory.find_one_and_update(
            {"id": id, "qty": {"$gte": q}}, {"$inc": {"qty": -q}, "$set": {"updated_at": now()}},
            projection={"_id": 0}, return_document=ReturnDocument.AFTER,
        )
        if not item:
            raise HTTPException(400, "Stok tidak mencukupi")
        mv = await add_movement(item, "keluar", -q, item["buy_price"], body.note or "Pemakaian")
    else:
        delta = qty3(q - item["qty"])
        item = await db.inventory.find_one_and_update(
            {"id": id}, {"$set": {"qty": q, "updated_at": now()}}, projection={"_id": 0}, return_document=ReturnDocument.AFTER
        )
        mv = await add_movement(item, "penyesuaian", delta, item["buy_price"], body.note or "Stock opname")
    await audit(user, f"stok_{body.type}", "inventory", id, f"{item['name']} {mv['qty']:+g} -> {item['qty']:g}")
    return StockMovement(**mv)


@router.get("/stock-movements", response_model=list[StockMovement])
async def list_movements(item_id: str = "", date_from: str = "", date_to: str = "", user: dict = Depends(current_user)):
    query: dict = {}
    if item_id:
        query["item_id"] = item_id
    if date_from or date_to:
        today = local_today()
        start, end = utc_range(parse_date(date_from, today.replace(day=1)), parse_date(date_to, today))
        query["created_at"] = {"$gte": start, "$lt": end}
    docs = await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [StockMovement(**d) for d in docs]


async def _apply_delta(item_id: str, diff: float) -> dict:
    """Shift stock by diff atomically; refuses to push stock below zero."""
    cond: dict = {"id": item_id}
    if diff < 0:
        cond["qty"] = {"$gte": -diff}
    item = await db.inventory.find_one_and_update(
        cond, {"$inc": {"qty": qty3(diff)}, "$set": {"updated_at": now()}}, projection={"_id": 0}, return_document=ReturnDocument.AFTER
    )
    if not item:
        raise HTTPException(400, "Perubahan ini membuat stok menjadi minus")
    return item


@router.put("/stock-movements/{id}", response_model=StockMovement)
async def edit_movement(id: str, body: StockMoveEdit, user: dict = Depends(current_user)):
    mv = await db.stock_movements.find_one({"id": id}, {"_id": 0})
    if not mv:
        raise HTTPException(404, "Riwayat stok tidak ditemukan")
    sign = -1 if mv["qty"] < 0 else 1
    new_delta = qty3(sign * body.qty)
    item = await _apply_delta(mv["item_id"], new_delta - mv["qty"])
    cost = body.unit_cost if body.unit_cost is not None and mv["type"] in ("masuk", "saldo_awal") else mv["unit_cost"]
    total = line_total(abs(new_delta), cost)
    update = {"qty": new_delta, "qty_after": item["qty"], "unit_cost": cost, "total_cost": total, "note": body.note}
    await db.stock_movements.update_one({"id": id}, {"$set": update})
    if mv["type"] == "masuk":
        await db.inventory.update_one({"id": mv["item_id"]}, {"$set": {"buy_price": cost}})
    if mv.get("expense_id"):
        await db.expenses.update_one({"id": mv["expense_id"]}, {"$set": {"amount": total, "description": f"Beli {mv['item_name']} {abs(new_delta):g} {mv['unit']}"}})
    await audit(user, "ubah_stok", "stock_movements", id, f"{mv['item_name']} {mv['qty']:+g} -> {new_delta:+g}")
    return StockMovement(**{**mv, **update})


@router.post("/stock-movements/{id}/delete")
async def delete_movement(id: str, body: VoidIn, user: dict = Depends(current_user)):
    mv = await db.stock_movements.find_one({"id": id}, {"_id": 0})
    if not mv:
        raise HTTPException(404, "Riwayat stok tidak ditemukan")
    await _apply_delta(mv["item_id"], -mv["qty"])
    await archive_deleted(user, "stock_movements", [mv], body.reason)
    await db.stock_movements.delete_one({"id": id})
    if mv.get("expense_id"):
        exp = await db.expenses.find_one({"id": mv["expense_id"]}, {"_id": 0})
        if exp:
            await archive_deleted(user, "expenses", [exp], body.reason)
            await db.expenses.delete_one({"id": mv["expense_id"]})
    await audit(user, "hapus_stok", "stock_movements", id, f"{mv['item_name']} {mv['qty']:+g}: {body.reason}")
    return {"ok": True}
