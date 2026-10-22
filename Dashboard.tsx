import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BarChart3, Clock, PackageCheck, PackageOpen, Plus, Receipt, Search, ShoppingBag, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "@/lib/api";
import type { Dashboard as DashboardData } from "@/lib/types";
import { fmtDate, fmtDay, num, rp, STATUS_LABEL } from "@/lib/format";
import { buttonVariants, Button } from "@/components/ui/button";
import { Empty, Money, Panel, PayBadge, StatusBadge } from "@/components/bits";
import { SearchNotaDialog } from "@/components/AppShell";
import { cn } from "@/lib/utils";

function Stat({ label, value, sub, icon: Icon, tone, testId, to }: { label: string; value: string; sub?: string; icon: typeof Wallet; tone: string; testId: string; to: string }) {
  return (
    <Link to={to} data-testid={testId} className="group">
      <Panel className="h-full p-4 transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5B6C7D]">{label}</span>
          <span className={cn("grid size-9 place-items-center rounded-lg", tone)}><Icon className="size-4.5" /></span>
        </div>
        <div className="mt-3 font-mono text-2xl font-semibold tracking-tight tabular" data-testid={`${testId}-value`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </Panel>
    </Link>
  );
}

export default function Dashboard() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { data, isError } = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<DashboardData>("/dashboard"), refetchInterval: 60_000 });
  const d = isError ? undefined : data;
  const dash = (v: number | undefined, f: (n: number) => string = String) => (d && v !== undefined ? f(v) : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5B6C7D]">{d ? fmtDate(d.today + "T12:00:00+09:00", false) : "Hari ini"}</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl" data-testid="page-title">Ringkasan Operasional</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Link to="/pesanan/baru" data-testid="dashboard-new-order-button" className={cn(buttonVariants(), "h-11 gap-2 font-semibold active:scale-[0.98]")}><Plus className="size-4" /> Pesanan Baru</Link>
          <Button variant="outline" className="h-11 gap-2" data-testid="dashboard-search-nota-button" onClick={() => setSearchOpen(true)}><Search className="size-4" /> Cari Nota</Button>
          <Link to="/persediaan" data-testid="dashboard-check-stock-button" className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2")}><PackageOpen className="size-4" /> Cek Stok</Link>
          <Link to="/laporan" data-testid="dashboard-reports-button" className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2")}><BarChart3 className="size-4" /> Lihat Laporan</Link>
        </div>
      </div>

      {isError && <Panel className="p-4 text-sm text-[#B45309]" data-testid="dashboard-error">Data dashboard belum dapat dimuat. Periksa koneksi lalu muat ulang.</Panel>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat testId="stat-orders-today" label="Pesanan hari ini" value={dash(d?.orders_today)} sub={d ? `Nilai ${rp(d.orders_today_value)}` : undefined} icon={ShoppingBag} tone="bg-[#E0F2FE] text-[#0369A1]" to="/pesanan" />
        <Stat testId="stat-active-orders" label="Pesanan aktif" value={dash(d?.active_orders)} sub="Diterima + diproses" icon={Clock} tone="bg-[#FEF3C7] text-[#92400E]" to="/pesanan?status=aktif" />
        <Stat testId="stat-ready-orders" label="Siap diambil" value={dash(d?.ready_orders)} sub="Menunggu pelanggan" icon={PackageCheck} tone="bg-[#D0F8FF] text-[#0E7490]" to="/pesanan?status=siap_diambil" />
        <Stat testId="stat-payments-today" label="Diterima hari ini" value={dash(d?.payments_today, rp)} sub="Pembayaran sah" icon={Wallet} tone="bg-[#DCFCE7] text-[#15803D]" to="/keuangan" />
        <Stat testId="stat-receivables" label="Piutang" value={dash(d?.receivables, rp)} sub={d ? `${d.receivable_orders} nota belum lunas` : undefined} icon={Receipt} tone="bg-[#FFE4E6] text-[#BE123C]" to="/keuangan?tab=piutang" />
        <Stat testId="stat-low-stock" label="Stok menipis" value={dash(d?.low_stock.length)} sub="Di bawah batas minimum" icon={AlertTriangle} tone="bg-[#FFEDD5] text-[#C2410C]" to="/persediaan" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2" data-testid="dashboard-cashflow-chart">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">Arus kas 7 hari</h2>
              <p className="text-xs text-muted-foreground">Kas masuk dari pembayaran vs kas keluar</p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d?.last7 ?? []} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="cin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22C3EE" stopOpacity={0.35} /><stop offset="100%" stopColor="#22C3EE" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8E7" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => fmtDay(v)} tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tickFormatter={(v: number) => `${num(v / 1000)}rb`} tick={{ fontSize: 11 }} stroke="#94A3B8" width={48} />
                <Tooltip formatter={(value: number, name: string) => [rp(value), name === "cash_in" ? "Kas masuk" : "Kas keluar"]} labelFormatter={(l: string) => fmtDay(l)} />
                <Area type="monotone" dataKey="cash_in" stroke="#0E7490" strokeWidth={2} fill="url(#cin)" />
                <Area type="monotone" dataKey="cash_out" stroke="#BE123C" strokeWidth={1.5} fill="transparent" strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-5" data-testid="dashboard-month-summary">
          <h2 className="font-bold">Bulan ini</h2>
          <p className="text-xs text-muted-foreground">Dari transaksi nyata, zona WIT</p>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              ["Pendapatan (nilai nota)", d?.month_revenue, "month-revenue"],
              ["Kas masuk", d?.month_cash_in, "month-cash-in"],
              ["Kas keluar", d?.month_cash_out, "month-cash-out"],
            ].map(([l, v, id]) => (
              <div key={id as string} className="flex justify-between gap-2"><dt className="text-muted-foreground">{l}</dt><dd>{v === undefined ? "—" : <Money value={v as number} testId={id as string} />}</dd></div>
            ))}
            <div className="flex justify-between gap-2 border-t border-dashed pt-3"><dt className="font-semibold">Laba bersih</dt><dd>{d ? <Money value={d.month_profit} testId="month-profit" className={d.month_profit < 0 ? "text-destructive" : "text-[#047857]"} /> : "—"}</dd></div>
          </dl>
          <Link to="/laporan" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep hover:underline" data-testid="month-report-link">Laporan lengkap <ArrowRight className="size-3.5" /></Link>
          {d && d.low_stock.length > 0 && (
            <div className="mt-5 rounded-lg bg-[#FFF7ED] p-3" data-testid="low-stock-list">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#C2410C]">Stok menipis</div>
              {d.low_stock.map((s) => <div key={s.id} className="flex justify-between text-sm"><span>{s.name}</span><span className="font-mono">{num(s.qty)} {s.unit}</span></div>)}
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold">Pesanan terbaru</h2>
            <p className="text-xs text-muted-foreground">
              {d ? Object.entries(d.status_counts).filter(([k]) => k in STATUS_LABEL).map(([k, v]) => `${STATUS_LABEL[k as keyof typeof STATUS_LABEL]} ${v}`).join(" · ") : ""}
            </p>
          </div>
          <Link to="/pesanan" className="text-sm font-semibold text-brand-deep hover:underline" data-testid="recent-orders-all-link">Semua</Link>
        </div>
        {!d || d.recent_orders.length === 0 ? <Empty text={d ? "Belum ada pesanan" : "Memuat…"} /> : (
          <ul className="divide-y" data-testid="recent-orders-list">
            {d.recent_orders.map((o) => (
              <li key={o.id}>
                <Link to={`/pesanan/${o.id}`} data-testid={`recent-order-${o.nota_no}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-[#F7F9F8]">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-semibold">{o.nota_no}</div>
                    <div className="truncate text-sm text-muted-foreground">{o.customer_name} · {fmtDate(o.created_at)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="font-mono text-sm font-semibold">{rp(o.total)}</span>
                    <PayBadge status={o.payment_status} />
                    <StatusBadge status={o.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <SearchNotaDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
