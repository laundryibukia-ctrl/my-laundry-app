from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from lib.auth import current_user
from lib.core import archive_deleted, audit, clean, local_today, new_id, now
from lib.db import db
from models.schemas import Employee, EmployeeIn, PayIn, Payroll, PayrollEdit, PayrollIn, VoidIn

router = APIRouter()


@router.get("/employees", response_model=list[Employee])
async def list_employees(user: dict = Depends(current_user)):
    docs = await db.employees.find({}, {"_id": 0}).sort([("status", 1), ("name", 1)]).to_list(500)
    return [Employee(**d) for d in docs]


@router.post("/employees", response_model=Employee, status_code=201)
async def create_employee(body: EmployeeIn, user: dict = Depends(current_user)):
    ts = now()
    doc = {**body.model_dump(), "id": new_id(), "created_at": ts, "updated_at": ts}
    await db.employees.insert_one(doc)
    await audit(user, "tambah", "employees", doc["id"], body.name)
    return Employee(**clean(doc))


@router.put("/employees/{id}", response_model=Employee)
async def update_employee(id: str, body: EmployeeIn, user: dict = Depends(current_user)):
    doc = await db.employees.find_one_and_update(
        {"id": id}, {"$set": {**body.model_dump(), "updated_at": now()}}, projection={"_id": 0}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(404, "Karyawan tidak ditemukan")
    await audit(user, "ubah", "employees", id, body.name)
    return Employee(**doc)


@router.delete("/employees/{id}")
async def delete_employee(id: str, user: dict = Depends(current_user)):
    if await db.payroll.find_one({"employee_id": id}):
        await db.employees.update_one({"id": id}, {"$set": {"status": "nonaktif", "updated_at": now()}})
        await audit(user, "nonaktifkan", "employees", id)
        return {"ok": True, "deactivated": True}
    res = await db.employees.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "Karyawan tidak ditemukan")
    await audit(user, "hapus", "employees", id)
    return {"ok": True, "deactivated": False}


@router.get("/payroll", response_model=list[Payroll])
async def list_payroll(employee_id: str = "", user: dict = Depends(current_user)):
    query = {"employee_id": employee_id} if employee_id else {}
    docs = await db.payroll.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Payroll(**d) for d in docs]


@router.post("/payroll", response_model=Payroll, status_code=201)
async def create_payroll(body: PayrollIn, user: dict = Depends(current_user)):
    emp = await db.employees.find_one({"id": body.employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Karyawan tidak ditemukan")
    net = body.base_salary + body.allowance - body.deduction
    if net < 0:
        raise HTTPException(400, "Potongan melebihi gaji pokok + tunjangan")
    doc = {**body.model_dump(), "period": body.period.strip(), "id": new_id(), "employee_name": emp["name"], "net": net,
           "status": "belum_dibayar", "method": None, "paid_at": None, "expense_id": None, "created_at": now()}
    try:
        await db.payroll.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, f"Gaji {emp['name']} untuk periode {body.period} sudah dibuat")
    await audit(user, "buat", "payroll", doc["id"], f"{emp['name']} {body.period} Rp{net}")
    return Payroll(**clean(doc))


@router.post("/payroll/{id}/pay", response_model=Payroll)
async def pay_payroll(id: str, body: PayIn, user: dict = Depends(current_user)):
    expense_id = new_id()
    doc = await db.payroll.find_one_and_update(
        {"id": id, "status": "belum_dibayar"},
        {"$set": {"status": "dibayar", "method": body.method, "paid_at": now(), "expense_id": expense_id}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(400, "Gaji tidak ditemukan atau sudah diproses")
    if doc["net"] > 0:
        await db.expenses.insert_one({
            "id": expense_id, "date": local_today().isoformat(), "category": "gaji", "amount": doc["net"],
            "description": f"Gaji {doc['employee_name']} periode {doc['period']}", "method": body.method,
            "source": "gaji", "source_id": id, "voided": False, "void_reason": "", "created_at": now(),
        })
    await audit(user, "bayar_gaji", "payroll", id, f"{doc['employee_name']} Rp{doc['net']}")
    return Payroll(**doc)


@router.post("/payroll/{id}/cancel", response_model=Payroll)
async def cancel_payroll(id: str, body: VoidIn, user: dict = Depends(current_user)):
    doc = await db.payroll.find_one({"id": id}, {"_id": 0})
    if not doc or doc["status"] == "dibatalkan":
        raise HTTPException(400, "Gaji tidak ditemukan atau sudah dibatalkan")
    if doc.get("expense_id"):
        await db.expenses.update_one({"id": doc["expense_id"]}, {"$set": {"voided": True, "void_reason": f"Gaji dibatalkan: {body.reason}"}})
    # free the (employee, period) slot so a corrected slip can be issued; history stays in audit_logs
    await db.payroll.update_one({"id": id}, {"$set": {"status": "dibatalkan", "note": f"Dibatalkan: {body.reason}", "period": f"{doc['period']} (batal {id[:6]})"}})
    await audit(user, "batal_gaji", "payroll", id, f"{doc['employee_name']} {doc['period']}: {body.reason}")
    return Payroll(**{**doc, "status": "dibatalkan", "note": f"Dibatalkan: {body.reason}", "period": f"{doc['period']} (batal {id[:6]})"})


@router.put("/payroll/{id}", response_model=Payroll)
async def edit_payroll(id: str, body: PayrollEdit, user: dict = Depends(current_user)):
    doc = await db.payroll.find_one({"id": id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Slip gaji tidak ditemukan")
    if doc["status"] == "dibatalkan":
        raise HTTPException(400, "Slip yang dibatalkan tidak dapat diubah")
    net = body.base_salary + body.allowance - body.deduction
    if net < 0:
        raise HTTPException(400, "Potongan melebihi gaji pokok + tunjangan")
    data = {**body.model_dump(), "period": body.period.strip(), "net": net}
    try:
        await db.payroll.update_one({"id": id}, {"$set": data})
    except DuplicateKeyError:
        raise HTTPException(409, f"Gaji {doc['employee_name']} untuk periode {body.period} sudah ada")
    if doc.get("expense_id"):
        await db.expenses.update_one({"id": doc["expense_id"]}, {"$set": {"amount": net, "description": f"Gaji {doc['employee_name']} periode {data['period']}"}})
    await audit(user, "ubah", "payroll", id, f"{doc['employee_name']} {doc['period']} Rp{doc['net']} -> {data['period']} Rp{net}")
    return Payroll(**{**doc, **data})


@router.post("/payroll/{id}/delete")
async def delete_payroll(id: str, body: VoidIn, user: dict = Depends(current_user)):
    doc = await db.payroll.find_one({"id": id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Slip gaji tidak ditemukan")
    await archive_deleted(user, "payroll", [doc], body.reason)
    await db.payroll.delete_one({"id": id})
    if doc.get("expense_id"):
        exp = await db.expenses.find_one({"id": doc["expense_id"]}, {"_id": 0})
        if exp:
            await archive_deleted(user, "expenses", [exp], body.reason)
            await db.expenses.delete_one({"id": doc["expense_id"]})
    await audit(user, "hapus", "payroll", id, f"{doc['employee_name']} {doc['period']} Rp{doc['net']}: {body.reason}")
    return {"ok": True}
