import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";
import { FileDown, Printer } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { OrderDetail, Settings } from "@/lib/types";
import { fmtDate, METHOD_LABEL, num, rp, STATUS_LABEL } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Fmt = "thermal" | "a5";

export default function ReceiptPrint() {
  const { id = "" } = useParams();
  const [fmt, setFmt] = useState<Fmt>("thermal");
  const order = useQuery({ queryKey: ["order", id], queryFn: () => apiGet<OrderDetail>(`/orders/${id}`), retry: false });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<Settings>("/settings"), retry: false });
  if (order.error instanceof ApiError && order.error.status === 401) return <Navigate to="/login" replace />;
  const o = order.data;
  const s = settings.data;
  if (!o) return <div className="p-8 text-center text-sm text-muted-foreground">{order.isError ? "Nota tidak ditemukan" : "Memuat…"}</div>;
  const thermal = fmt === "thermal";
  const valid = o.payments.filter((p) => !p.voided);

  return (
    <div className="min-h-dvh bg-[#EEF2F1] py-6 print:bg-white print:py-0">
      <style>{thermal ? "@page { size: 58mm auto; margin: 0; }" : "@page { size: A5; margin: 10mm; }"}</style>
      <div className="no-print mx-auto mb-4 flex max-w-xl flex-wrap items-center justify-center gap-2 px-4">
        <div className="flex rounded-lg border bg-white p-0.5 text-sm">
          {(["thermal", "a5"] as Fmt[]).map((f) => (
            <button key={f} data-testid={`receipt-format-${f}`} onClick={() => setFmt(f)} className={cn("rounded-md px-3 py-1.5", fmt === f && "bg-[#E6FCFF] font-semibold text-brand-deep")}>
              {f === "thermal" ? "Thermal 58mm" : "A5"}
            </button>
          ))}
        </div>
        <Button data-testid="receipt-print-button" onClick={() => window.print()} className="gap-2"><Printer className="size-4" /> Cetak</Button>
        <a href={`/api/orders/${o.id}/pdf?size=a5`} target="_blank" rel="noreferrer" data-testid="receipt-pdf-a5" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}><FileDown className="size-4" /> PDF A5</a>
        <a href={`/api/orders/${o.id}/pdf?size=a4`} target="_blank" rel="noreferrer" data-testid="receipt-pdf-a4" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}><FileDown className="size-4" /> PDF A4</a>
      </div>

      <div
        data-testid="receipt-paper"
        className={cn(
          "mx-auto bg-[#FFFDF7] text-[#111827] shadow-lg print:shadow-none",
          thermal ? "w-[58mm] p-[3mm] font-mono text-[10px] leading-snug" : "w-full max-w-[148mm] p-8 text-sm",
        )}
      >
        <div className="text-center">
          {s?.logo && <img src={s.logo} alt="logo" className={cn("mx-auto mb-1 object-contain", thermal ? "h-10 grayscale" : "h-16")} />}
          <div className={cn("font-bold", thermal ? "text-[12px]" : "text-xl")} data-testid="receipt-business-name">{s?.business_name ?? "Laundry Lia Masohi"}</div>
          {s?.tagline && <div>{s.tagline}</div>}
          {s?.address && <div>{s.address}</div>}
          <div>Telp/WA: {s?.whatsapp || s?.phone}</div>
        </div>
        <div className="my-2 border-t border-dashed border-black/60" />
        <div className="space-y-0.5">
          <Row l="No. Nota" r={<b data-testid="receipt-nota-no">{o.nota_no}</b>} />
          <Row l="Tanggal" r={fmtDate(o.created_at)} />
          <Row l="Estimasi" r={fmtDate(o.due_at)} />
          <Row l="Pelanggan" r={o.customer_name} />
          {o.customer_phone && <Row l="No. HP" r={o.customer_phone} />}
          <Row l="Status" r={STATUS_LABEL[o.status]} />
        </div>
        <div className="my-2 border-t border-dashed border-black/60" />
        {o.items.map((it) => (
          <div key={it.id} className="mb-1">
            <div className="font-semibold">{it.service_name}</div>
            <Row l={`${num(it.billed_qty)} ${it.unit} x ${rp(it.unit_price)}`} r={rp(it.subtotal)} />
            {it.billed_qty !== it.qty && <div className="opacity-70">(aktual {num(it.qty)} {it.unit}, minimum berlaku)</div>}
            {it.note && <div className="opacity-70">* {it.note}</div>}
          </div>
        ))}
        <div className="my-2 border-t border-dashed border-black/60" />
        <Row l="Subtotal" r={rp(o.subtotal)} />
        {o.extra_fee > 0 && <Row l={`Biaya ${o.extra_fee_note}`.trim()} r={rp(o.extra_fee)} />}
        {o.discount > 0 && <Row l="Diskon" r={`-${rp(o.discount)}`} />}
        <div className={cn("font-bold", thermal ? "text-[12px]" : "text-base")}><Row l="TOTAL" r={<span data-testid="receipt-total">{rp(o.total)}</span>} /></div>
        {valid.map((p) => <Row key={p.id} l={`Bayar ${p.kind.toUpperCase()} (${METHOD_LABEL[p.method]})`} r={rp(p.amount)} />)}
        <div className="font-bold"><Row l="SISA TAGIHAN" r={<span data-testid="receipt-balance">{rp(o.balance)}</span>} /></div>
        <div className="my-2 text-center">
          <span className={cn("inline-block border-2 px-2 py-0.5 font-bold tracking-widest", o.balance <= 0 ? "border-black" : "border-dashed border-black")} data-testid="receipt-paid-stamp">
            {o.balance <= 0 ? "LUNAS" : "BELUM LUNAS"}
          </span>
        </div>
        {o.notes && <><div className="my-2 border-t border-dashed border-black/60" /><div>Catatan: {o.notes}</div></>}
        <div className="my-2 border-t border-dashed border-black/60" />
        {s?.pickup_terms && <p className="text-center opacity-80">{s.pickup_terms}</p>}
        {s?.receipt_footer && <p className="mt-1 text-center font-semibold">{s.receipt_footer}</p>}
      </div>
    </div>
  );
}

function Row({ l, r }: { l: string; r: React.ReactNode }) {
  return <div className="flex justify-between gap-2"><span>{l}</span><span className="whitespace-nowrap text-right">{r}</span></div>;
}
