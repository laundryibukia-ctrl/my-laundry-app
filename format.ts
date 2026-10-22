import { ApiError } from "@/lib/api";
import type { Order, OrderStatus, PayMethod, PaymentStatus, Settings } from "@/lib/types";

export const TZ = "Asia/Jayapura";

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const rp = (n: number) => idr.format(n).replace(/\u00a0/g, " ");
export const num = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);

export function fmtDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("id-ID", opts).format(d) + (withTime ? " WIT" : "");
}

export function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d));
}

/** WIT today as YYYY-MM-DD (display defaults only — server anchors all calculations). */
export function todayWIT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  diterima: "Diterima", diproses: "Diproses", siap_diambil: "Siap Diambil", selesai: "Selesai", dibatalkan: "Dibatalkan",
};
export const STATUS_STYLE: Record<OrderStatus, string> = {
  diterima: "bg-[#E0F2FE] text-[#0369A1]",
  diproses: "bg-[#FEF3C7] text-[#92400E]",
  siap_diambil: "bg-[#D0F8FF] text-[#0E7490]",
  selesai: "bg-[#DCFCE7] text-[#15803D]",
  dibatalkan: "bg-[#FFE4E6] text-[#BE123C]",
};
export const PAY_LABEL: Record<PaymentStatus, string> = { belum_bayar: "Belum Bayar", sebagian: "Bayar Sebagian", lunas: "Lunas" };
export const PAY_STYLE: Record<PaymentStatus, string> = {
  belum_bayar: "bg-[#FFE4E6] text-[#BE123C]", sebagian: "bg-[#FEF3C7] text-[#92400E]", lunas: "bg-[#DCFCE7] text-[#15803D]",
};
export const METHOD_LABEL: Record<PayMethod, string> = { tunai: "Tunai", transfer: "Transfer Bank", qris: "QRIS", ewallet: "E-Wallet" };
export const CATEGORY_LABEL: Record<string, string> = {
  operasional: "Operasional", listrik_air: "Listrik & Air", sewa: "Sewa", transportasi: "Transportasi",
  perawatan: "Perawatan Mesin", pembelian_stok: "Pembelian Stok", gaji: "Gaji Karyawan", lainnya: "Lainnya",
};
export const SERVICE_CAT_LABEL: Record<string, string> = { kiloan: "Kiloan", satuan: "Satuan", express: "Express" };
export const INV_CAT_LABEL: Record<string, string> = {
  deterjen: "Deterjen", pewangi: "Pewangi", pelembut: "Pelembut", perlengkapan: "Perlengkapan", lainnya: "Lainnya",
};

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const detail = (e.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length) {
      const d = detail[0] as { loc?: unknown[]; msg?: string };
      return `Data tidak valid (${String(d.loc?.slice(-1)[0] ?? "")}): ${d.msg ?? ""}`;
    }
    if (e.status === 401) return "Sesi berakhir, silakan login kembali";
    return `Terjadi kesalahan (${e.status})`;
  }
  return "Tidak dapat terhubung ke server";
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function waNumber(phone: string): string {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}

export type WaTemplate = "nota" | "siap" | "tagihan" | "selesai";
export const WA_TEMPLATE_LABEL: Record<WaTemplate, string> = {
  nota: "Konfirmasi nota baru", siap: "Cucian siap diambil", tagihan: "Pengingat sisa tagihan", selesai: "Terima kasih (selesai)",
};

export function waMessage(t: WaTemplate, o: Order, s?: Settings): string {
  const biz = s?.business_name || "Laundry Lia Masohi";
  const items = o.items.map((i) => `- ${i.service_name}: ${num(i.qty)} ${i.unit} = ${rp(i.subtotal)}`).join("\n");
  const head = `Halo Kak ${o.customer_name},`;
  switch (t) {
    case "nota":
      return `${head}\npesanan Anda di *${biz}* sudah kami terima.\n\nNo. Nota: *${o.nota_no}*\nTanggal: ${fmtDate(o.created_at)}\n${items}\n${o.discount ? `Diskon: -${rp(o.discount)}\n` : ""}Total: *${rp(o.total)}*\nDibayar: ${rp(o.paid)}\nSisa: *${rp(o.balance)}*\nEstimasi selesai: ${fmtDate(o.due_at)}\n\nTerima kasih 🙏`;
    case "siap":
      return `${head}\ncucian Anda dengan nota *${o.nota_no}* sudah *SIAP DIAMBIL* di ${biz}.\n${o.balance > 0 ? `Sisa pembayaran: *${rp(o.balance)}*\n` : "Status pembayaran: LUNAS\n"}${s?.address ? `Alamat: ${s.address}\n` : ""}\nTerima kasih 🙏`;
    case "tagihan":
      return `${head}\nkami mengingatkan nota *${o.nota_no}* (${fmtDate(o.created_at, false)}) masih memiliki sisa tagihan *${rp(o.balance)}* dari total ${rp(o.total)}.\n\nTerima kasih atas perhatiannya 🙏\n${biz}`;
    case "selesai":
      return `${head}\nterima kasih telah mengambil cucian nota *${o.nota_no}* di ${biz}. Semoga puas dengan layanan kami. Sampai jumpa kembali! 😊`;
  }
}
