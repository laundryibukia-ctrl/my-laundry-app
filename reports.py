import csv
import io
from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from lib.auth import current_user
from lib.core import TZ, local_date_str, local_today, period, utc_range
from lib.db import db
from lib.excel import report_xlsx, xlsx_to_pdf
from lib.pdf import CATEGORY, METHOD, STATUS, report_pdf
from models.schemas import DailyPoint, Dashboard, LowStock, ReportSummary
from routers.orders import order_out

router = APIRouter()


async def receivables_now() -> tuple[int, int]:
    pipe = [{"$match": {"status": {"$ne": "dibatalkan"}, "$expr": {"$lt": ["$paid", "$total"]}}},
            {"$group": {"_id": None, "sum": {"$sum": {"$subtract": ["$total", "$paid"]}}, "n": {"$sum": 1}}}]
    rows = await db.orders.aggregate(pipe).to_list(1)
    return (rows[0]["sum"], rows[0]["n"]) if rows else (0, 0)


async def summarize(d_from, d_to) -> ReportSummary:
    """Revenue = nota value (accrual) by order date; cash = payments received / expenses paid.
    Profit = revenue - stock USED - operating expenses - payroll. Stock PURCHASES are cash-only (no double count)."""
    if (d_to - d_from).days > 366:
        raise HTTPException(400, "Periode maksimal 1 tahun")
    start, end = utc_range(d_from, d_to)
    days = {(d_from + timedelta(days=i)).isoformat(): {"revenue": 0, "cash_in": 0, "cash_out": 0} for i in range((d_to - d_from).days + 1)}

    orders = await db.orders.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0, "status": 1, "subtotal": 1, "extra_fee": 1, "discount": 1, "total": 1, "created_at": 1}).to_list(100000)
    valid = [o for o in orders if o["status"] != "dibatalkan"]
    for o in valid:
        days[local_date_str(o["created_at"])]["revenue"] += o["total"]

    cash_in_by: dict[str, int] = {}
    async for p in db.payments.find({"created_at": {"$gte": start, "$lt": end}, "voided": False}, {"_id": 0, "amount": 1, "method": 1, "created_at": 1}):
        cash_in_by[p["method"]] = cash_in_by.get(p["method"], 0) + p["amount"]
        days[local_date_str(p["created_at"])]["cash_in"] += p["amount"]

    out_by: dict[str, int] = {}
    async for e in db.expenses.find({"date": {"$gte": d_from.isoformat(), "$lte": d_to.isoformat()}, "voided": False}, {"_id": 0}):
        out_by[e["category"]] = out_by.get(e["category"], 0) + e["amount"]
        if e["date"] in days:
            days[e["date"]]["cash_out"] += e["amount"]

    material = 0
    async for m in db.stock_movements.find({"created_at": {"$gte": start, "$lt": end}, "type": {"$in": ["keluar", "penyesuaian"]}, "qty": {"$lt": 0}}, {"_id": 0, "total_cost": 1}):
        material += m["total_cost"]

    revenue = sum(o["total"] for o in valid)
    cash_in, cash_out = sum(cash_in_by.values()), sum(out_by.values())
    payroll = out_by.get("gaji", 0)
    operating = cash_out - payroll - out_by.get("pembelian_stok", 0)
    rec, _ = await receivables_now()
    return ReportSummary(
        date_from=d_from.isoformat(), date_to=d_to.isoformat(), order_count=len(valid), cancelled_count=len(orders) - len(valid),
        gross_sales=sum(o["subtotal"] + o["extra_fee"] for o in valid), discounts=sum(o["discount"] for o in valid), revenue=revenue,
        cash_in=cash_in, cash_in_by_method=cash_in_by, cash_out=cash_out, cash_out_by_category=out_by, net_cash=cash_in - cash_out,
        material_cost=material, operating_expenses=operating, payroll_expense=payroll,
        net_profit=revenue - material - operating - payroll, receivables_now=rec,
        daily=[DailyPoint(date=k, **v) for k, v in days.items()],
    )


@router.get("/dashboard", response_model=Dashboard)
async def dashboard(user: dict = Depends(current_user)):
    today = local_today()
    t_start, t_end = utc_range(today, today)
    today_orders = await db.orders.find({"created_at": {"$gte": t_start, "$lt": t_end}, "status": {"$ne": "dibatalkan"}}, {"_id": 0, "total": 1}).to_list(10000)
    pay_rows = await db.payments.aggregate([
        {"$match": {"created_at": {"$gte": t_start, "$lt": t_end}, "voided": False}},
        {"$group": {"_id": None, "sum": {"$sum": "$amount"}}}]).to_list(1)
    counts = {r["_id"]: r["n"] async for r in db.orders.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}])}
    rec, rec_n = await receivables_now()
    low = await db.inventory.find({"active": True, "$expr": {"$lte": ["$qty", "$min_qty"]}}, {"_id": 0}).to_list(100)
    month = await summarize(today.replace(day=1), today)
    week = await summarize(today - timedelta(days=6), today)
    recent = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8)
    return Dashboard(
        today=today.isoformat(), orders_today=len(today_orders), orders_today_value=sum(o["total"] for o in today_orders),
        active_orders=counts.get("diterima", 0) + counts.get("diproses", 0), ready_orders=counts.get("siap_diambil", 0),
        payments_today=pay_rows[0]["sum"] if pay_rows else 0, receivables=rec, receivable_orders=rec_n,
        low_stock=[LowStock(**{k: d[k] for k in ("id", "name", "qty", "min_qty", "unit")}) for d in low],
        month_revenue=month.revenue, month_cash_in=month.cash_in, month_cash_out=month.cash_out, month_profit=month.net_profit,
        last7=week.daily, recent_orders=[order_out(d) for d in recent], status_counts=counts,
    )


@router.get("/reports/summary", response_model=ReportSummary)
async def report_summary(date_from: str = "", date_to: str = "", user: dict = Depends(current_user)):
    return await summarize(*period(date_from, date_to))


def _wit(dt) -> str:
    return dt.astimezone(TZ).strftime("%d/%m/%Y %H:%M") if dt else ""


@router.get("/reports/export")
async def export_csv(kind: str = "orders", date_from: str = "", date_to: str = "", user: dict = Depends(current_user)):
    d_from, d_to = period(date_from, date_to)
    start, end = utc_range(d_from, d_to)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    if kind == "orders":
        w.writerow(["No Nota", "Tanggal (WIT)", "Pelanggan", "No HP", "Status", "Subtotal", "Biaya Tambahan", "Diskon", "Total", "Dibayar", "Sisa"])
        async for o in db.orders.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).sort("created_at", 1):
            w.writerow([o["nota_no"], _wit(o["created_at"]), o["customer_name"], o["customer_phone"], STATUS[o["status"]],
                        o["subtotal"], o["extra_fee"], o["discount"], o["total"], o["paid"], o["total"] - o["paid"]])
    elif kind == "payments":
        w.writerow(["Tanggal (WIT)", "No Nota", "Pelanggan", "Metode", "Jenis", "Nominal", "Status", "Alasan Batal"])
        async for p in db.payments.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).sort("created_at", 1):
            w.writerow([_wit(p["created_at"]), p["nota_no"], p.get("customer_name", ""), METHOD[p["method"]], p["kind"], p["amount"],
                        "Batal" if p["voided"] else "Sah", p.get("void_reason", "")])
    elif kind == "expenses":
        w.writerow(["Tanggal", "Kategori", "Keterangan", "Metode", "Nominal", "Status", "Alasan Batal"])
        async for e in db.expenses.find({"date": {"$gte": d_from.isoformat(), "$lte": d_to.isoformat()}}, {"_id": 0}).sort("date", 1):
            w.writerow([e["date"], CATEGORY.get(e["category"], e["category"]), e["description"], METHOD.get(e["method"], e["method"]),
                        e["amount"], "Batal" if e["voided"] else "Sah", e.get("void_reason", "")])
    elif kind == "summary":
        r = await summarize(d_from, d_to)
        w.writerow(["Tanggal", "Pendapatan (nilai nota)", "Kas Masuk", "Kas Keluar"])
        for d in r.daily:
            w.writerow([d.date, d.revenue, d.cash_in, d.cash_out])
        w.writerow([])
        for label, val in [("Pendapatan bersih", r.revenue), ("Beban bahan", r.material_cost), ("Beban operasional", r.operating_expenses),
                           ("Beban gaji", r.payroll_expense), ("Laba bersih", r.net_profit), ("Kas masuk", r.cash_in),
                           ("Kas keluar", r.cash_out), ("Arus kas bersih", r.net_cash), ("Piutang saat ini", r.receivables_now)]:
            w.writerow([label, val])
    else:
        raise HTTPException(400, "Jenis ekspor tidak dikenal")
    name = f"laporan-{kind}-{d_from.isoformat()}_{d_to.isoformat()}.csv"
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/reports/pdf")
async def export_pdf(date_from: str = "", date_to: str = "", user: dict = Depends(current_user)):
    r = await summarize(*period(date_from, date_to))
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}
    return Response(report_pdf(r, settings), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="laporan-{r.date_from}_{r.date_to}.pdf"'})


@router.get("/reports/xlsx")
async def export_xlsx(date_from: str = "", date_to: str = "", user: dict = Depends(current_user)):
    d_from, d_to = period(date_from, date_to)
    start, end = utc_range(d_from, d_to)
    r = await summarize(d_from, d_to)
    orders = [[o["nota_no"], _wit(o["created_at"]), o["customer_name"], o["customer_phone"], STATUS[o["status"]], o["total"], o["paid"], o["total"] - o["paid"]]
              async for o in db.orders.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).sort("created_at", 1)]
    pays = [[_wit(p["created_at"]), p["nota_no"], p.get("customer_name", ""), METHOD[p["method"]], p["kind"], p["amount"], "Batal" if p["voided"] else "Sah"]
            async for p in db.payments.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).sort("created_at", 1)]
    exps = [[e["date"], CATEGORY.get(e["category"], e["category"]), e["description"], METHOD.get(e["method"], e["method"]), e["amount"], "Batal" if e["voided"] else "Sah"]
            async for e in db.expenses.find({"date": {"$gte": d_from.isoformat(), "$lte": d_to.isoformat()}}, {"_id": 0}).sort("date", 1)]
    data = report_xlsx(r, orders, pays, exps, {"method": METHOD, "category": CATEGORY})
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="laporan-{r.date_from}_{r.date_to}.xlsx"'})


@router.post("/reports/xlsx-to-pdf")
async def xlsx_pdf(file: UploadFile = File(...), user: dict = Depends(current_user)):
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(400, "Ukuran file maksimal 10 MB")
    try:
        pdf = xlsx_to_pdf(raw, (file.filename or "Laporan").rsplit(".", 1)[0])
    except Exception:
        raise HTTPException(400, "File bukan Excel (.xlsx) yang valid atau kosong")
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="laporan.pdf"'})
