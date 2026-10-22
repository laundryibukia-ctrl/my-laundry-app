from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from lib.auth import current_user
from lib.core import archive_deleted, audit, clean, new_id, now, period
from lib.db import db
from models.schemas import Expense, ExpenseIn, VoidIn

router = APIRouter()


@router.get("/expenses", response_model=list[Expense])
async def list_expenses(date_from: str = "", date_to: str = "", category: str = "", user: dict = Depends(current_user)):
    d_from, d_to = period(date_from, date_to)
    query: dict = {"date": {"$gte": d_from.isoformat(), "$lte": d_to.isoformat()}}
    if category:
        query["category"] = category
    docs = await db.expenses.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(2000)
    return [Expense(**d) for d in docs]


@router.post("/expenses", response_model=Expense, status_code=201)
async def create_expense(body: ExpenseIn, user: dict = Depends(current_user)):
    if body.category in ("pembelian_stok", "gaji"):
        raise HTTPException(400, "Pembelian stok dicatat dari menu Persediaan, gaji dari menu Karyawan")
    doc = {**body.model_dump(), "id": new_id(), "source": "manual", "source_id": None, "voided": False, "void_reason": "", "created_at": now()}
    await db.expenses.insert_one(doc)
    await audit(user, "tambah", "expenses", doc["id"], f"{body.description} Rp{body.amount}")
    return Expense(**clean(doc))


@router.post("/expenses/{id}/void", response_model=Expense)
async def void_expense(id: str, body: VoidIn, user: dict = Depends(current_user)):
    exp = await db.expenses.find_one({"id": id})
    if not exp:
        raise HTTPException(404, "Pengeluaran tidak ditemukan")
    if exp["source"] == "gaji":
        raise HTTPException(400, "Pengeluaran gaji dibatalkan melalui menu Karyawan > Gaji")
    doc = await db.expenses.find_one_and_update(
        {"id": id, "voided": False}, {"$set": {"voided": True, "void_reason": body.reason}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(400, "Pengeluaran sudah dibatalkan")
    await audit(user, "void", "expenses", id, f"{doc['description']} Rp{doc['amount']}: {body.reason}")
    return Expense(**doc)


@router.put("/expenses/{id}", response_model=Expense)
async def edit_expense(id: str, body: ExpenseIn, user: dict = Depends(current_user)):
    exp = await db.expenses.find_one({"id": id}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Pengeluaran tidak ditemukan")
    if exp["source"] == "gaji":
        raise HTTPException(400, "Pengeluaran gaji diubah melalui menu Karyawan > Penggajian")
    data = body.model_dump()
    if exp["source"] == "stok":
        data["category"] = "pembelian_stok"
    elif body.category in ("pembelian_stok", "gaji"):
        raise HTTPException(400, "Kategori ini dicatat otomatis dari menu Persediaan/Karyawan")
    await db.expenses.update_one({"id": id}, {"$set": data})
    await audit(user, "ubah", "expenses", id, f"{exp['description']} Rp{exp['amount']} -> {body.description} Rp{body.amount}")
    return Expense(**{**exp, **data})


@router.post("/expenses/{id}/delete")
async def delete_expense(id: str, body: VoidIn, user: dict = Depends(current_user)):
    exp = await db.expenses.find_one({"id": id}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Pengeluaran tidak ditemukan")
    if exp["source"] == "gaji":
        raise HTTPException(400, "Pengeluaran gaji dihapus melalui menu Karyawan > Penggajian")
    await archive_deleted(user, "expenses", [exp], body.reason)
    await db.expenses.delete_one({"id": id})
    if exp["source"] == "stok" and exp.get("source_id"):
        await db.stock_movements.update_one({"id": exp["source_id"]}, {"$set": {"expense_id": None}})
    await audit(user, "hapus", "expenses", id, f"{exp['description']} Rp{exp['amount']}: {body.reason}")
    return {"ok": True}
