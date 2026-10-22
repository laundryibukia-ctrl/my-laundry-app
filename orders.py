from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from lib.auth import current_user
from lib.core import audit, clean, line_total, local_today, new_id, next_nota, normalize_phone, now, parse_date, qty3, regex, utc_range
from lib.db import db
from lib.pdf import order_pdf
from models.schemas import (
    DeleteResult, Order, OrderCreate, OrderDetail, OrderItem, OrderList, OrderUpdate, Payment, PaymentIn, StatusIn, VoidIn,
)
from routers.customers import create_customer_doc, purge_orders

router = APIRouter()

OPEN = ["diterima", "diproses", "siap_diambil"]
STATUS_LABEL = {"diterima": "Diterima", "diproses": "Diproses", "siap_diambil": "Siap Diambil", "selesai": "Selesai", "dibatalkan": "Dibatalkan"}


def order_out(doc: dict, items: list[dict] | None = None) -> Order:
    doc = clean(dict(doc))
    total, paid = doc["total"], doc.get("paid", 0)
    doc["paid"] = paid
    doc["balance"] = total - paid
    doc["payment_status"] = "lunas" if paid >= total else ("sebagian" if paid > 0 else "belum_bayar")
    doc.pop("client_ref", None)
    return Order(**doc, items=[OrderItem(**clean(i)) for i in (items or [])]) if items is not None else Order(**doc)


async def load_detail(order_id: str) -> OrderDetail:
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    items = await db.order_items.find({"order_id": order_id}, {"_id": 0}).to_list(100)
    pays = await db.payments.find({"order_id": order_id}, {"_id": 0, "client_ref": 0}).sort("created_at", 1).to_list(200)
    base = order_out(doc, items)
    return OrderDetail(**base.model_dump(), payments=[Payment(**p) for p in pays])


async def record_payment(order_id: str, amount: int, method: str, note: str, client_ref: str, user: dict) -> Payment:
    dup = await db.payments.find_one({"client_ref": client_ref}, {"_id": 0, "client_ref": 0})
    if dup:
        return Payment(**dup)  # idempotent: a double-submit never pays twice
    # atomic guard: paid + amount must stay <= total, and the order must not be cancelled
    order = await db.orders.find_one_and_update(
        {"id": order_id, "status": {"$ne": "dibatalkan"}, "$expr": {"$lte": [{"$add": ["$paid", amount]}, "$total"]}},
        {"$inc": {"paid": amount}, "$set": {"updated_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not order:
        exists = await db.orders.find_one({"id": order_id})
        if not exists:
            raise HTTPException(404, "Pesanan tidak ditemukan")
        if exists["status"] == "dibatalkan":
            raise HTTPException(400, "Pesanan sudah dibatalkan")
        raise HTTPException(400, f"Nominal melebihi sisa tagihan (sisa Rp{exists['total'] - exists['paid']:,})".replace(",", "."))
    kind = "pelunasan" if order["paid"] >= order["total"] else ("dp" if order["paid"] == amount else "cicilan")
    doc = {
        "id": new_id(), "order_id": order_id, "nota_no": order["nota_no"], "customer_name": order["customer_name"],
        "amount": amount, "method": method, "kind": kind, "note": note, "client_ref": client_ref,
        "voided": False, "void_reason": "", "voided_at": None, "created_at": now(),
    }
    try:
        await db.payments.insert_one(doc)
    except DuplicateKeyError:
        await db.orders.update_one({"id": order_id}, {"$inc": {"paid": -amount}})
        dup = await db.payments.find_one({"client_ref": client_ref}, {"_id": 0, "client_ref": 0})
        return Payment(**dup)
    await audit(user, "bayar", "payments", doc["id"], f"{order['nota_no']} Rp{amount} {method} ({kind})")
    doc.pop("client_ref")
    clean(doc)
    return Payment(**doc)


@router.get("/orders", response_model=OrderList)
async def list_orders(
    q: str = "", status: str = "", payment_status: str = "", customer_id: str = "",
    date_from: str = "", date_to: str = "", limit: int = Query(50, le=500), skip: int = 0,
    user: dict = Depends(current_user),
):
    query: dict = {}
    if q.strip():
        phone = normalize_phone(q)
        ors = [{"nota_no": regex(q)}, {"customer_name": regex(q)}]
        if phone:
            ors.append({"customer_phone": regex(phone)})
        query["$or"] = ors
    if status == "aktif":
        query["status"] = {"$in": ["diterima", "diproses"]}
    elif status:
        query["status"] = status
    if payment_status:
        exprs = {
            "belum_bayar": {"$and": [{"$eq": ["$paid", 0]}, {"$gt": ["$total", 0]}]},
            "sebagian": {"$and": [{"$gt": ["$paid", 0]}, {"$lt": ["$paid", "$total"]}]},
            "lunas": {"$gte": ["$paid", "$total"]},
            "belum_lunas": {"$lt": ["$paid", "$total"]},
        }
        if payment_status not in exprs:
            raise HTTPException(400, "Filter pembayaran tidak valid")
        query["$expr"] = exprs[payment_status]
        if payment_status == "belum_lunas" and not status:
            query["status"] = {"$ne": "dibatalkan"}
    if customer_id:
        query["customer_id"] = customer_id
    if date_from or date_to:
        today = local_today()
        start, end = utc_range(parse_date(date_from, today - timedelta(days=3650)), parse_date(date_to, today))
        query["created_at"] = {"$gte": start, "$lt": end}
    total = await db.orders.count_documents(query)
    docs = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return OrderList(items=[order_out(d) for d in docs], total=total)


@router.post("/orders", response_model=OrderDetail, status_code=201)
async def create_order(body: OrderCreate, user: dict = Depends(current_user)):
    existing = await db.orders.find_one({"client_ref": body.client_ref})
    if existing:
        return await load_detail(existing["id"])

    if body.customer_id:
        cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
        if not cust:
            raise HTTPException(404, "Pelanggan tidak ditemukan")
    elif body.new_customer:
        phone = normalize_phone(body.new_customer.phone)
        cust = await db.customers.find_one({"phone": phone}, {"_id": 0}) if phone else None
        if not cust:
            cust = await create_customer_doc(body.new_customer, user)
    else:
        raise HTTPException(422, "Pilih pelanggan atau isi data pelanggan baru")

    ids = list({i.service_id for i in body.items})
    services = {s["id"]: s for s in await db.services.find({"id": {"$in": ids}}, {"_id": 0}).to_list(100)}
    order_id = new_id()
    items, subtotal, max_hours = [], 0, 0
    for it in body.items:
        svc = services.get(it.service_id)
        if not svc or not svc.get("active", True):
            raise HTTPException(400, "Layanan tidak ditemukan atau nonaktif")
        qty = qty3(it.qty)
        billed = max(qty, float(svc.get("min_qty") or 0))
        sub = line_total(billed, svc["price"])
        subtotal += sub
        max_hours = max(max_hours, svc.get("est_hours", 48))
        items.append({
            "id": new_id(), "order_id": order_id, "service_id": svc["id"], "service_name": svc["name"],
            "category": svc["category"], "unit": svc["unit"], "unit_price": svc["price"],
            "qty": qty, "billed_qty": billed, "subtotal": sub, "note": it.note,
        })
    gross = subtotal + body.extra_fee
    if body.discount > gross:
        raise HTTPException(400, "Diskon tidak boleh melebihi subtotal + biaya tambahan")
    total = gross - body.discount
    if body.payment and body.payment.amount > total:
        raise HTTPException(400, "Uang muka melebihi total tagihan")

    ts = now()
    order = {
        "id": order_id, "nota_no": await next_nota(), "client_ref": body.client_ref,
        "customer_id": cust["id"], "customer_name": cust["name"], "customer_phone": cust.get("phone", ""),
        "subtotal": subtotal, "extra_fee": body.extra_fee, "extra_fee_note": body.extra_fee_note,
        "discount": body.discount, "total": total, "paid": 0, "status": "diterima",
        "status_history": [{"status": "diterima", "at": ts, "note": "Pesanan diterima"}],
        "notes": body.notes, "due_at": body.due_at or ts + timedelta(hours=max_hours),
        "picked_up_at": None, "created_at": ts, "updated_at": ts,
    }
    try:
        await db.orders.insert_one(order)
    except DuplicateKeyError:
        existing = await db.orders.find_one({"client_ref": body.client_ref})
        if existing:
            return await load_detail(existing["id"])
        raise HTTPException(409, "Nomor nota bentrok, silakan coba lagi")
    await db.order_items.insert_many(items)
    await audit(user, "buat", "orders", order_id, f"{order['nota_no']} total Rp{total}")
    if body.payment:
        await record_payment(order_id, body.payment.amount, body.payment.method, "Uang muka", body.client_ref + "-dp", user)
    return await load_detail(order_id)


@router.get("/orders/{id}", response_model=OrderDetail)
async def get_order(id: str, user: dict = Depends(current_user)):
    return await load_detail(id)


@router.patch("/orders/{id}", response_model=OrderDetail)
async def update_order(id: str, body: OrderUpdate, user: dict = Depends(current_user)):
    data = {"notes": body.notes, "updated_at": now()}
    if body.due_at:
        data["due_at"] = body.due_at
    res = await db.orders.update_one({"id": id}, {"$set": data})
    if not res.matched_count:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    await audit(user, "ubah", "orders", id, "catatan/estimasi")
    return await load_detail(id)


@router.patch("/orders/{id}/status", response_model=OrderDetail)
async def update_status(id: str, body: StatusIn, user: dict = Depends(current_user)):
    order = await db.orders.find_one({"id": id})
    if not order:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    if order["status"] in ("selesai", "dibatalkan"):
        raise HTTPException(400, f"Pesanan sudah {STATUS_LABEL[order['status']]} dan tidak dapat diubah")
    if body.status == order["status"]:
        raise HTTPException(400, "Status sudah sama")
    if body.status == "dibatalkan" and order.get("paid", 0) > 0:
        raise HTTPException(400, "Pesanan memiliki pembayaran. Batalkan (void) pembayaran terlebih dahulu.")
    ts = now()
    update: dict = {"$set": {"status": body.status, "updated_at": ts},
                    "$push": {"status_history": {"status": body.status, "at": ts, "note": body.note}}}
    if body.status == "selesai":
        update["$set"]["picked_up_at"] = ts
    res = await db.orders.update_one({"id": id, "status": order["status"]}, update)
    if not res.modified_count:
        raise HTTPException(409, "Status berubah di tempat lain, muat ulang halaman")
    await audit(user, "status", "orders", id, f"{order['nota_no']}: {order['status']} -> {body.status}")
    return await load_detail(id)


@router.post("/orders/{id}/payments", response_model=Payment, status_code=201)
async def add_payment(id: str, body: PaymentIn, user: dict = Depends(current_user)):
    return await record_payment(id, body.amount, body.method, body.note, body.client_ref, user)


@router.get("/payments", response_model=list[Payment])
async def list_payments(date_from: str = "", date_to: str = "", user: dict = Depends(current_user)):
    today = local_today()
    start, end = utc_range(parse_date(date_from, today.replace(day=1)), parse_date(date_to, today))
    docs = await db.payments.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0, "client_ref": 0}).sort("created_at", -1).to_list(2000)
    return [Payment(**d) for d in docs]


@router.post("/payments/{id}/void", response_model=Payment)
async def void_payment(id: str, body: VoidIn, user: dict = Depends(current_user)):
    pay = await db.payments.find_one_and_update(
        {"id": id, "voided": False},
        {"$set": {"voided": True, "void_reason": body.reason, "voided_at": now()}},
        projection={"_id": 0, "client_ref": 0}, return_document=ReturnDocument.AFTER,
    )
    if not pay:
        raise HTTPException(404, "Pembayaran tidak ditemukan atau sudah dibatalkan")
    await db.orders.update_one({"id": pay["order_id"]}, {"$inc": {"paid": -pay["amount"]}, "$set": {"updated_at": now()}})
    await audit(user, "void_bayar", "payments", id, f"{pay['nota_no']} Rp{pay['amount']}: {body.reason}")
    return Payment(**pay)


@router.post("/orders/{id}/delete", response_model=DeleteResult)
async def delete_order(id: str, body: VoidIn, user: dict = Depends(current_user)):
    order = await db.orders.find_one({"id": id})
    if not order:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    n_orders, n_pays = await purge_orders([id], user, body.reason)
    await audit(user, "hapus", "orders", id, f"{order['nota_no']} Rp{order['total']} ({n_pays} pembayaran): {body.reason}")
    return DeleteResult(ok=True, orders_deleted=n_orders, payments_deleted=n_pays)


@router.get("/orders/{id}/pdf")
async def order_pdf_route(id: str, size: str = "a5", user: dict = Depends(current_user)):
    detail = await load_detail(id)
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}
    pdf = order_pdf(detail, settings, size)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="Nota-{detail.nota_no}.pdf"'})
