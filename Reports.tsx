import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileDown, FileSpreadsheet, Info, Upload } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet, apiPostFileForBlob } from "@/lib/api";
import type { ReportSummary } from "@/lib/types";
import { CATEGORY_LABEL, errMsg, fmtDay, METHOD_LABEL, num, rp, todayWIT } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Field, PageHeader, Panel } from "@/components/bits";
import { cn } from "@/lib/utils";

function Line({ l, v, bold, neg, testId }: { l: string; v: number; bold?: boolean; neg?: boolean; testId?: string }) {
  return (
    <div className={cn("flex justify-between gap-3 py-1.5 text-sm", bold && "border-t pt-2.5 font-semibold")}>
      <span>{l}</span><span data-testid={testId} className={cn("font-mono tabular", v < 0 && "text-[#BE123C]")}>{neg && v > 0 ? `-${rp(v)}` : rp(v)}</span>
    </div>
  );
}

function presets() {
  const t = todayWIT();
  const [y, m] = t.split("-").map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const lastDayPrev = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    { label: "Hari ini", from: t, to: t },
    { label: "Bulan ini", from: `${y}-${pad(m)}-01`, to: t },
    { label: "Bulan lalu", from: `${prevY}-${pad(prevM)}-01`, to: `${prevY}-${pad(prevM)}-${pad(lastDayPrev)}` },
    { label: "Tahun ini", from: `${y}-01-01`, to: t },
  ];
}

export default function Reports() {
  const ps = presets();
  const [from, setFrom] = useState(ps[1].from);
  const [to, setTo] = useState(ps[1].to);
  const range = `date_from=${from}&date_to=${to}`;
  const { data: r, isError } = useQuery({ queryKey: ["report", range], queryFn: () => apiGet<ReportSummary>(`/reports/summary?${range}`), enabled: !!from && !!to });
  const exp = (kind: string) => `/api/reports/export?kind=${kind}&${range}`;
  const xlsxRef = useRef<HTMLInputElement>(null);
  const toPdf = useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append("file", file); return apiPostFileForBlob("/reports/xlsx-to-pdf", fd); },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "laporan-dari-excel.pdf"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("PDF berhasil dibuat dan diunduh");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Laporan" subtitle="Semua angka dihitung dari transaksi tersimpan, zona waktu WIT"
        actions={<>
          <a href={`/api/reports/pdf?${range}`} target="_blank" rel="noreferrer" data-testid="report-export-pdf" className={cn(buttonVariants(), "h-10 gap-2")}><FileDown className="size-4" /> PDF</a>
          <a href={`/api/reports/xlsx?${range}`} data-testid="report-export-xlsx" className={cn(buttonVariants(), "h-10 gap-2 bg-[#107C41] text-white hover:bg-[#0B5E31]")}><FileSpreadsheet className="size-4" /> Excel</a>
          <a href={exp("summary")} data-testid="report-export-summary" className={cn(buttonVariants({ variant: "outline" }), "h-10 gap-2")}><Download className="size-4" /> Ringkasan CSV</a>
        </>} />

      <Panel className="flex flex-wrap items-end gap-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {ps.map((p) => (
            <button key={p.label} data-testid={`report-preset-${p.label.replace(/\s/g, "-").toLowerCase()}`} onClick={() => { setFrom(p.from); setTo(p.to); }}
              className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", from === p.from && to === p.to ? "border-brand bg-[#E6FCFF] font-semibold text-brand-deep" : "hover:bg-muted")}>{p.label}</button>
          ))}
        </div>
        <Field label="Dari"><Input type="date" data-testid="report-date-from" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" /></Field>
        <Field label="Sampai"><Input type="date" data-testid="report-date-to" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" /></Field>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <a href={exp("orders")} data-testid="report-export-orders" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}><Download className="size-3.5" /> Pesanan</a>
          <a href={exp("payments")} data-testid="report-export-payments" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}><Download className="size-3.5" /> Pembayaran</a>
          <a href={exp("expenses")} data-testid="report-export-expenses" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}><Download className="size-3.5" /> Pengeluaran</a>
        </div>
      </Panel>

      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid="excel-to-pdf-panel">
        <FileSpreadsheet className="size-8 shrink-0 text-[#107C41]" />
        <div className="flex-1 text-sm">
          <div className="font-semibold">Edit di Excel, lalu jadikan PDF</div>
          <p className="text-muted-foreground">1) Unduh <b>Excel</b> di atas · 2) Ubah di Excel / Google Sheets / WPS, lalu simpan sebagai .xlsx · 3) Unggah di sini untuk membuat PDF.</p>
        </div>
        <Button data-testid="excel-to-pdf-button" className="h-10 gap-2" disabled={toPdf.isPending} onClick={() => xlsxRef.current?.click()}>
          <Upload className="size-4" /> {toPdf.isPending ? "Membuat PDF…" : "Unggah Excel → PDF"}
        </Button>
        <input ref={xlsxRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" data-testid="excel-to-pdf-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) toPdf.mutate(f); e.target.value = ""; }} />
      </Panel>

      {isError || !r ? <Panel><Empty text={isError ? "Laporan gagal dimuat — periksa rentang tanggal" : "Memuat…"} /></Panel> : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="p-5" data-testid="report-revenue">
              <h2 className="font-bold">Pendapatan</h2>
              <p className="mb-3 text-xs text-muted-foreground">Nilai nota yang dibuat pada periode (dibayar atau belum). Nota batal tidak dihitung.</p>
              <Line l={`Pesanan (${r.order_count} nota)`} v={r.gross_sales} />
              <Line l="Diskon" v={r.discounts} neg />
              <Line l="Pendapatan bersih" v={r.revenue} bold testId="report-revenue-total" />
              {r.cancelled_count > 0 && <p className="mt-2 text-xs text-muted-foreground">{r.cancelled_count} nota dibatalkan</p>}
            </Panel>
            <Panel className="p-5" data-testid="report-cashflow">
              <h2 className="font-bold">Arus Kas</h2>
              <p className="mb-3 text-xs text-muted-foreground">Uang yang benar-benar diterima (DP, cicilan, pelunasan) dan dikeluarkan.</p>
              {Object.entries(r.cash_in_by_method).map(([k, v]) => <Line key={k} l={`Masuk · ${METHOD_LABEL[k as keyof typeof METHOD_LABEL] ?? k}`} v={v} />)}
              <Line l="Total kas masuk" v={r.cash_in} bold testId="report-cash-in" />
              {Object.entries(r.cash_out_by_category).map(([k, v]) => <Line key={k} l={`Keluar · ${CATEGORY_LABEL[k] ?? k}`} v={v} neg />)}
              <Line l="Total kas keluar" v={r.cash_out} neg bold testId="report-cash-out" />
              <Line l="Arus kas bersih" v={r.net_cash} bold testId="report-net-cash" />
            </Panel>
            <Panel className="p-5" data-testid="report-pnl">
              <h2 className="font-bold">Laba-Rugi Sederhana</h2>
              <p className="mb-3 text-xs text-muted-foreground">Pendapatan − pemakaian bahan − beban operasional − gaji.</p>
              <Line l="Pendapatan bersih" v={r.revenue} />
              <Line l="Beban bahan (stok terpakai)" v={r.material_cost} neg />
              <Line l="Beban operasional" v={r.operating_expenses} neg />
              <Line l="Beban gaji" v={r.payroll_expense} neg />
              <Line l="Laba bersih" v={r.net_profit} bold testId="report-net-profit" />
              <div className="mt-3 rounded-lg bg-[#FFE4E6] p-2.5 text-sm"><span className="text-[#BE123C]">Piutang saat ini: </span><b className="font-mono" data-testid="report-receivables">{rp(r.receivables_now)}</b></div>
            </Panel>
          </div>

          <Panel className="p-5">
            <h2 className="mb-4 font-bold">Harian: pendapatan vs kas</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8E7" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v: string) => fmtDay(v)} tick={{ fontSize: 11 }} stroke="#94A3B8" />
                  <YAxis tickFormatter={(v: number) => `${num(v / 1000)}rb`} tick={{ fontSize: 11 }} stroke="#94A3B8" width={50} />
                  <Tooltip formatter={(value: number, name: string) => [rp(value), name]} labelFormatter={(l: string) => fmtDay(l)} />
                  <Legend />
                  <Bar dataKey="revenue" name="Pendapatan" fill="#22C3EE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cash_in" name="Kas masuk" fill="#0E7490" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cash_out" name="Kas keluar" fill="#FDA4AF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="flex gap-3 p-5 text-sm text-[#475569]" data-testid="report-explanation">
            <Info className="mt-0.5 size-5 shrink-0 text-brand-deep" />
            <div className="space-y-1.5">
              <p><b>Laporan pendapatan ≠ laporan kas.</b> Pendapatan diakui saat nota dibuat sebesar total nota. Kas hanya mencatat uang yang diterima; uang muka dan pelunasan masing-masing tercatat sekali pada tanggal diterima, sehingga tidak terhitung ganda.</p>
              <p><b>Stok:</b> pembelian stok mengurangi kas, tetapi di laba-rugi yang dibebankan hanya nilai stok yang <i>terpakai</i> (keluar/opname berkurang × harga beli). Dengan begitu biaya persediaan tidak dihitung dua kali.</p>
              <p><b>Gaji</b> hanya tercatat saat slip ditandai dibayar. Transaksi yang dibatalkan (void) tetap tersimpan sebagai jejak, tetapi tidak dihitung.</p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
