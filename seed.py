"""Idempotent seed: owner account, settings, services & prices, stock, employees, sample customers/orders.
Run: cd /app/backend && python seed.py   (backend must be running for the sample-order part)"""

import asyncio
import os
import uuid
from datetime import timedelta

import httpx

from lib.auth import hash_pw
from lib.core import local_today, new_id, now
from lib.db import db, ensure_indexes
from routers.settings import DEFAULT_SETTINGS

OWNER_EMAIL = "owner@laundrylia.id"
OWNER_PASSWORD = "LiaMasohi2026!"
API = os.environ.get("BACKEND_URL", "http://localhost:8001") + "/api"

SERVICES = [
    ("Cuci + Setrika (Kiloan)", "kiloan", "kg", 8000, 2, 48, "Reguler 2 hari"),
    ("Cuci Saja (Kiloan)", "kiloan", "kg", 7000, 2, 36, "Cuci kering lipat"),
    ("Setrika Saja (Kiloan)", "kiloan", "kg", 5000, 2, 24, "Setrika & lipat"),
    ("Express 1 Hari - Cuci + Setrika", "express", "kg", 12000, 2, 24, "Selesai dalam 1 hari"),
    ("Express 6 Jam - Cuci + Setrika", "express", "kg", 15000, 2, 6, "Selesai dalam 6 jam"),
    ("Bed Cover Besar", "satuan", "pcs", 35000, 0, 72, ""),
    ("Bed Cover Kecil", "satuan", "pcs", 25000, 0, 72, ""),
    ("Selimut", "satuan", "pcs", 20000, 0, 48, ""),
    ("Sprei + Sarung Bantal", "satuan", "set", 15000, 0, 48, ""),
    ("Jas / Blazer", "satuan", "pcs", 25000, 0, 72, ""),
    ("Kebaya / Gaun", "satuan", "pcs", 30000, 0, 72, ""),
    ("Jaket Tebal", "satuan", "pcs", 20000, 0, 48, ""),
    ("Gorden", "satuan", "kg", 15000, 1, 72, "Per kg"),
    ("Karpet", "satuan", "m2", 20000, 1, 96, "Per meter persegi"),
    ("Sepatu", "satuan", "pasang", 25000, 0, 72, ""),
    ("Boneka Sedang", "satuan", "pcs", 20000, 0, 72, ""),
    ("Tas", "satuan", "pcs", 30000, 0, 72, ""),
    ("Seragam Sekolah / Kantor", "satuan", "pcs", 7000, 0, 48, ""),
]

INVENTORY = [
    ("Deterjen Cair Matic", "deterjen", "liter", 20, 5, 28000),
    ("Deterjen Bubuk", "deterjen", "kg", 15, 5, 22000),
    ("Pewangi Floral", "pewangi", "liter", 8, 3, 35000),
    ("Pewangi Sakura", "pewangi", "liter", 2, 3, 35000),
    ("Pelembut Pakaian", "pelembut", "liter", 6, 3, 25000),
    ("Plastik Packing 35x50", "perlengkapan", "pak", 10, 3, 18000),
    ("Hanger Plastik", "perlengkapan", "lusin", 4, 2, 15000),
]

CUSTOMERS = [
    ("Ibu Siti Latuconsina", "081247001122", "Jl. Pattimura, Masohi"),
    ("Bapak Yohanis Tuhumury", "082198334455", "Lesane, Masohi"),
    ("Nona Maria Wattimena", "085243556677", "Namaelo, Masohi"),
    ("Ibu Fatma Tuasikal", "081344778899", "Ampera, Masohi"),
    ("Bapak Andreas Soumokil", "082311990011", "Letwaru, Masohi"),
]


async def seed_base() -> None:
    await ensure_indexes()
    ts = now()
    if not await db.users.find_one({"email": OWNER_EMAIL}):
        await db.users.insert_one({"id": new_id(), "email": OWNER_EMAIL, "name": "Pemilik Laundry Lia", "role": "owner",
                                   "password_hash": hash_pw(OWNER_PASSWORD), "pw_version": 1, "created_at": ts, "updated_at": ts})
    await db.settings.update_one({"id": "main"}, {"$setOnInsert": {**DEFAULT_SETTINGS, "updated_at": ts}}, upsert=True)
    if not await db.services.count_documents({}):
        await db.services.insert_many([
            {"id": new_id(), "name": n, "category": c, "unit": u, "price": p, "min_qty": m, "est_hours": h, "description": d,
             "active": True, "created_at": ts, "updated_at": ts} for n, c, u, p, m, h, d in SERVICES])
    if not await db.inventory.count_documents({}):
        for n, c, u, q, mn, price in INVENTORY:
            iid = new_id()
            await db.inventory.insert_one({"id": iid, "name": n, "category": c, "unit": u, "qty": q, "min_qty": mn, "buy_price": price,
                                           "active": True, "created_at": ts, "updated_at": ts})
            await db.stock_movements.insert_one({"id": new_id(), "item_id": iid, "item_name": n, "unit": u, "type": "saldo_awal", "qty": q,
                                                 "qty_after": q, "unit_cost": price, "total_cost": q * price, "note": "Stok awal",
                                                 "expense_id": None, "created_at": ts})
    if not await db.employees.count_documents({}):
        await db.employees.insert_many([
            {"id": new_id(), "name": "Rina Pelupessy", "position": "Operator Cuci", "phone": "081355667788", "status": "aktif",
             "salary_scheme": "bulanan", "base_salary": 1800000, "allowance": 200000, "join_date": "2024-03-01", "created_at": ts, "updated_at": ts},
            {"id": new_id(), "name": "Dewi Matulessy", "position": "Setrika & Packing", "phone": "082199887766", "status": "aktif",
             "salary_scheme": "bulanan", "base_salary": 1600000, "allowance": 150000, "join_date": "2024-07-15", "created_at": ts, "updated_at": ts},
        ])
    if not await db.customers.count_documents({}):
        await db.customers.insert_many([{"id": new_id(), "name": n, "phone": p, "address": a, "notes": "", "created_at": ts, "updated_at": ts}
                                        for n, p, a in CUSTOMERS])


async def seed_orders() -> None:
    if await db.orders.count_documents({}):
        print("orders exist — skipping sample orders")
        return
    svc = {s["name"]: s["id"] for s in await db.services.find({}, {"_id": 0}).to_list(100)}
    custs = await db.customers.find({}, {"_id": 0}).sort("name", 1).to_list(10)
    plans = [  # (customer idx, items, discount, dp, final status, pay rest, days ago)
        (0, [("Cuci + Setrika (Kiloan)", 4.5)], 0, 36000, "selesai", True, 5),
        (1, [("Cuci Saja (Kiloan)", 6), ("Bed Cover Besar", 1)], 5000, 20000, "selesai", True, 3),
        (2, [("Express 6 Jam - Cuci + Setrika", 3)], 0, 0, "siap_diambil", False, 1),
        (3, [("Cuci + Setrika (Kiloan)", 5.2), ("Kebaya / Gaun", 2)], 0, 50000, "siap_diambil", False, 1),
        (4, [("Setrika Saja (Kiloan)", 3)], 0, 15000, "diproses", False, 0),
        (0, [("Express 1 Hari - Cuci + Setrika", 2.5), ("Sepatu", 1)], 0, 0, "diterima", False, 0),
    ]
    async with httpx.AsyncClient(base_url=API, timeout=30) as c:
        r = await c.post("/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        r.raise_for_status()
        for ci, items, disc, dp, final, pay_rest, days_ago in plans:
            body = {"client_ref": str(uuid.uuid4()), "customer_id": custs[ci]["id"], "discount": disc,
                    "items": [{"service_id": svc[n], "qty": q} for n, q in items], "notes": ""}
            if dp:
                body["payment"] = {"amount": dp, "method": "tunai"}
            order = (await c.post("/orders", json=body)).json()
            for st in ["diproses", "siap_diambil", "selesai"]:
                if ["diterima", "diproses", "siap_diambil", "selesai"].index(st) > ["diterima", "diproses", "siap_diambil", "selesai"].index(final):
                    break
                if st == "selesai" and pay_rest:
                    o = (await c.get(f"/orders/{order['id']}")).json()
                    if o["balance"] > 0:
                        await c.post(f"/orders/{order['id']}/payments", json={"amount": o["balance"], "method": "transfer", "client_ref": str(uuid.uuid4())})
                await c.patch(f"/orders/{order['id']}/status", json={"status": st})
            if days_ago:  # backdate for a realistic history
                shift = timedelta(days=days_ago)
                o = await db.orders.find_one({"id": order["id"]})
                hist = [{**h, "at": h["at"] - shift} for h in o["status_history"]]
                await db.orders.update_one({"id": order["id"]}, {"$set": {"created_at": o["created_at"] - shift, "due_at": o["due_at"] - shift,
                                                                          "status_history": hist, **({"picked_up_at": o["picked_up_at"] - shift} if o.get("picked_up_at") else {})}})
                async for p in db.payments.find({"order_id": order["id"]}):
                    await db.payments.update_one({"_id": p["_id"]}, {"$set": {"created_at": p["created_at"] - shift}})
        inv = await db.inventory.find_one({"name": "Deterjen Cair Matic"})
        await c.post(f"/inventory/{inv['id']}/movements", json={"type": "keluar", "qty": 2, "note": "Pemakaian harian"})
        await c.post("/expenses", json={"date": local_today().isoformat(), "category": "listrik_air", "amount": 350000,
                                        "description": "Token listrik", "method": "tunai"})
    print("sample orders seeded")


async def main() -> None:
    await seed_base()
    print(f"base seeded — owner {OWNER_EMAIL} / {OWNER_PASSWORD}")
    await seed_orders()


if __name__ == "__main__":
    asyncio.run(main())
