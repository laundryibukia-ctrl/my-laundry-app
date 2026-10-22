"""PDF rendering (reportlab) for notas and report summaries."""

import base64
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from lib.core import TZ

CYAN = colors.HexColor("#0E7490")
INK = colors.HexColor("#29333D")
STATUS = {"diterima": "Diterima", "diproses": "Diproses", "siap_diambil": "Siap Diambil", "selesai": "Selesai", "dibatalkan": "Dibatalkan"}
METHOD = {"tunai": "Tunai", "transfer": "Transfer", "qris": "QRIS", "ewallet": "E-Wallet"}


def rp(n: int) -> str:
    return ("-Rp " if n < 0 else "Rp ") + f"{abs(n):,}".replace(",", ".")


def qty(n: float) -> str:
    return (f"{n:.3f}".rstrip("0").rstrip(".")).replace(".", ",")


def wit(dt) -> str:
    return dt.astimezone(TZ).strftime("%d/%m/%Y %H:%M") + " WIT" if dt else "-"


def _styles():
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=ss["Title"], fontSize=15, textColor=INK, alignment=0, spaceAfter=2),
        "body": ParagraphStyle("b", parent=ss["Normal"], fontSize=8.5, textColor=INK, leading=11),
        "small": ParagraphStyle("s", parent=ss["Normal"], fontSize=7.5, textColor=colors.HexColor("#5B6C7D"), leading=10),
        "h": ParagraphStyle("h", parent=ss["Heading3"], fontSize=10, textColor=CYAN, spaceBefore=6, spaceAfter=3),
    }


def _logo(data_url: str):
    if not data_url or "," not in data_url:
        return None
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1])
        img = Image(io.BytesIO(raw))
        ratio = img.imageWidth / float(img.imageHeight or 1)
        img.drawHeight = 16 * mm
        img.drawWidth = 16 * mm * ratio
        return img
    except Exception:
        return None


def _grid(data, widths, bold_last=0):
    t = Table(data, colWidths=widths, hAlign="LEFT")
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D0F8FF")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8E7")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ]
    for i in range(bold_last):
        style.append(("FONTNAME", (0, -1 - i), (-1, -1 - i), "Helvetica-Bold"))
    t.setStyle(TableStyle(style))
    return t


def _header(story, st, settings, width):
    name = settings.get("business_name", "Laundry Lia Masohi")
    lines = "<br/>".join(x for x in [settings.get("address", ""), "Telp/WA: " + (settings.get("whatsapp") or settings.get("phone", ""))] if x)
    text = [Paragraph(name, st["title"]), Paragraph(lines, st["small"])]
    logo = _logo(settings.get("logo", ""))
    if logo:
        t = Table([[logo, text]], colWidths=[20 * mm, width - 20 * mm], hAlign="LEFT")
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(t)
    else:
        story.extend(text)
    story.append(Spacer(1, 4 * mm))


def order_pdf(order, settings: dict, size: str = "a5") -> bytes:
    page = A4 if size == "a4" else A5
    buf = io.BytesIO()
    margin = 12 * mm
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=margin,
                            title=f"Nota {order.nota_no}")
    width = page[0] - 2 * margin
    st = _styles()
    story: list = []
    _header(story, st, settings, width)
    paid_label = "LUNAS" if order.balance <= 0 else "BELUM LUNAS"
    meta = [
        [Paragraph(f"<b>No. Nota</b><br/>{order.nota_no}", st["body"]), Paragraph(f"<b>Pelanggan</b><br/>{order.customer_name}<br/>{order.customer_phone}", st["body"])],
        [Paragraph(f"<b>Tanggal</b><br/>{wit(order.created_at)}", st["body"]), Paragraph(f"<b>Estimasi selesai</b><br/>{wit(order.due_at)}", st["body"])],
        [Paragraph(f"<b>Status</b><br/>{STATUS[order.status]}", st["body"]), Paragraph(f"<b>Pembayaran</b><br/>{paid_label}", st["body"])],
    ]
    mt = Table(meta, colWidths=[width / 2] * 2, hAlign="LEFT")
    mt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story += [mt, Spacer(1, 3 * mm)]

    rows = [["Layanan", "Jumlah", "Harga", "Subtotal"]]
    for it in order.items:
        label = it.service_name + (f"\n({it.note})" if it.note else "")
        q = f"{qty(it.qty)} {it.unit}" + (f"\n(min {qty(it.billed_qty)})" if it.billed_qty != it.qty else "")
        rows.append([label, q, rp(it.unit_price), rp(it.subtotal)])
    story.append(_grid(rows, [width * 0.42, width * 0.18, width * 0.18, width * 0.22]))
    story.append(Spacer(1, 2 * mm))

    tot = [["", "Subtotal", rp(order.subtotal)]]
    if order.extra_fee:
        tot.append(["", f"Biaya tambahan {order.extra_fee_note}".strip(), rp(order.extra_fee)])
    if order.discount:
        tot.append(["", "Diskon", rp(-order.discount)])
    tot += [["", "TOTAL", rp(order.total)], ["", "Dibayar", rp(order.paid)], ["", "Sisa tagihan", rp(order.balance)]]
    t = Table(tot, colWidths=[width * 0.4, width * 0.35, width * 0.25], hAlign="LEFT")
    t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 8.5), ("ALIGN", (2, 0), (2, -1), "RIGHT"),
                           ("FONTNAME", (1, -3), (-1, -3), "Helvetica-Bold"), ("FONTNAME", (1, -1), (-1, -1), "Helvetica-Bold"),
                           ("TEXTCOLOR", (0, 0), (-1, -1), INK), ("LINEABOVE", (1, -3), (-1, -3), 0.5, INK)]))
    story.append(t)

    valid = [p for p in order.payments if not p.voided]
    if valid:
        story.append(Paragraph("Riwayat pembayaran", st["h"]))
        prow = [["Tanggal", "Metode", "Jenis", "Nominal"]] + [[wit(p.created_at), METHOD[p.method], p.kind.upper(), rp(p.amount)] for p in valid]
        story.append(_grid(prow, [width * 0.38, width * 0.2, width * 0.2, width * 0.22]))
    if order.notes:
        story += [Paragraph("Catatan", st["h"]), Paragraph(order.notes, st["body"])]
    story.append(Spacer(1, 5 * mm))
    for key in ("pickup_terms", "receipt_footer"):
        if settings.get(key):
            story.append(Paragraph(settings[key], st["small"]))
    doc.build(story)
    return buf.getvalue()


CATEGORY = {"operasional": "Operasional", "listrik_air": "Listrik & Air", "sewa": "Sewa", "transportasi": "Transportasi",
            "perawatan": "Perawatan Mesin", "pembelian_stok": "Pembelian Stok", "gaji": "Gaji Karyawan", "lainnya": "Lainnya"}


def report_pdf(r, settings: dict) -> bytes:
    buf = io.BytesIO()
    margin = 15 * mm
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=margin, title="Laporan Keuangan")
    width = A4[0] - 2 * margin
    st = _styles()
    story: list = []
    _header(story, st, settings, width)
    story.append(Paragraph(f"<b>Laporan Keuangan</b> periode {r.date_from} s/d {r.date_to}", st["body"]))
    w2 = [width * 0.65, width * 0.35]
    story += [Paragraph("Laporan Pendapatan (nilai pesanan)", st["h"]), _grid([
        ["Keterangan", "Nilai"], ["Jumlah pesanan (tidak termasuk batal)", str(r.order_count)],
        ["Penjualan kotor", rp(r.gross_sales)], ["Diskon", rp(-r.discounts)], ["Pendapatan bersih", rp(r.revenue)]], w2, 1)]
    cash = [["Keterangan", "Nilai"]] + [[f"Kas masuk - {METHOD.get(k, k)}", rp(v)] for k, v in r.cash_in_by_method.items()]
    cash += [["Total kas masuk", rp(r.cash_in)]] + [[f"Kas keluar - {CATEGORY.get(k, k)}", rp(v)] for k, v in r.cash_out_by_category.items()]
    cash += [["Total kas keluar", rp(r.cash_out)], ["Arus kas bersih", rp(r.net_cash)]]
    story += [Paragraph("Laporan Arus Kas (uang benar-benar diterima/dikeluarkan)", st["h"]), _grid(cash, w2, 1)]
    story += [Paragraph("Laba-Rugi Sederhana", st["h"]), _grid([
        ["Keterangan", "Nilai"], ["Pendapatan bersih", rp(r.revenue)], ["Beban bahan (pemakaian stok)", rp(-r.material_cost)],
        ["Beban operasional", rp(-r.operating_expenses)], ["Beban gaji", rp(-r.payroll_expense)], ["Laba bersih", rp(r.net_profit)]], w2, 1)]
    story += [Spacer(1, 3 * mm), Paragraph(
        f"Piutang belum tertagih saat ini: {rp(r.receivables_now)}. Laba-rugi memakai nilai pesanan (bukan kas) dan biaya pemakaian stok; "
        "pembelian stok hanya tercatat di arus kas agar tidak dihitung ganda.", st["small"])]
    doc.build(story)
    return buf.getvalue()
