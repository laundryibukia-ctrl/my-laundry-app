import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { OrderList } from "@/lib/types";
import { fmtDate, rp, STATUS_LABEL } from "@/lib/format";
import { buttonVariants, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, NativeSelect, PageHeader, Panel, PayBadge, StatusBadge } from "@/components/bits";
import { cn } from "@/lib/utils";

const TABS = [["", "Semua"], ["aktif", "Aktif"], ["diterima", "Diterima"], ["diproses", "Diproses"], ["siap_diambil", "Siap Diambil"], ["selesai", "Selesai"], ["dibatalkan", "Batal"]] as const;
const PAGE = 30;

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pay, setPay] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const qs = new URLSearchParams({ q, status, payment_status: pay, date_from: from, date_to: to, limit: String(PAGE), skip: String(page * PAGE) });
  const { data, isError, isLoading } = useQuery({
    queryKey: ["orders", "list", qs.toString()],
    queryFn: () => apiGet<OrderList>(`/orders?${qs.toString()}`),
    placeholderData: keepPreviousData,
  });
  const rows = isError ? [] : data?.items ?? [];
  const total = isError ? 0 : data?.total ?? 0;

  return (
    <div>
      <PageHeader title="Pesanan" subtitle="Kelola nota, status pengerjaan, dan pembayaran"
        actions={<Link to="/pesanan/baru" data-testid="orders-new-order-button" className={cn(buttonVariants(), "h-10 gap-2 font-semibold")}><Plus className="size-4" /> Pesanan Baru</Link>} />

      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" data-testid="orders-status-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} data-testid={`orders-tab-${k || "semua"}`} onClick={() => { setPage(0); setParams(k ? { status: k } : {}); }}
            className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", status === k ? "border-brand bg-[#E6FCFF] text-brand-deep" : "border-border bg-white text-[#475569] hover:bg-muted")}>
            {label}
          </button>
        ))}
      </div>

      <Panel className="mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="orders-search-input" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari no. nota, nama, no. HP" className="h-10 pl-9" />
        </div>
        <NativeSelect data-testid="orders-payment-filter" value={pay} onChange={(e) => { setPay(e.target.value); setPage(0); }}>
          <option value="">Semua pembayaran</option>
          <option value="belum_lunas">Belum lunas</option>
          <option value="belum_bayar">Belum bayar</option>
          <option value="sebagian">Bayar sebagian</option>
          <option value="lunas">Lunas</option>
        </NativeSelect>
        <Input type="date" data-testid="orders-date-from" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="h-10" aria-label="Dari tanggal" />
        <Input type="date" data-testid="orders-date-to" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="h-10" aria-label="Sampai tanggal" />
      </Panel>

      <Panel>
        <div className="flex items-center justify-between border-b px-4 py-3 text-sm text-muted-foreground">
          <span data-testid="orders-count">{total} pesanan{status ? ` · ${STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? "Aktif"}` : ""}</span>
        </div>
        {isLoading ? <Empty text="Memuat…" /> : rows.length === 0 ? <Empty text={isError ? "Gagal memuat data" : "Tidak ada pesanan yang cocok"} testId="orders-empty" /> : (
          <>
            {/* desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm" data-testid="orders-table">
                <thead className="bg-[#F7F9F8] text-left text-xs uppercase tracking-wider text-[#5B6C7D]">
                  <tr><th className="px-4 py-2.5">Nota</th><th className="px-4 py-2.5">Pelanggan</th><th className="px-4 py-2.5">Masuk</th><th className="px-4 py-2.5">Estimasi</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">Sisa</th><th className="px-4 py-2.5">Status</th></tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((o) => (
                    <tr key={o.id} className="transition-colors hover:bg-[#F7F9F8]" data-testid={`order-row-${o.nota_no}`}>
                      <td className="px-4 py-3"><Link to={`/pesanan/${o.id}`} className="font-mono font-semibold text-brand-deep hover:underline" data-testid={`order-link-${o.nota_no}`}>{o.nota_no}</Link></td>
                      <td className="px-4 py-3"><div className="font-medium">{o.customer_name}</div><div className="text-xs text-muted-foreground">{o.customer_phone}</div></td>
                      <td className="px-4 py-3 text-xs">{fmtDate(o.created_at)}</td>
                      <td className="px-4 py-3 text-xs">{fmtDate(o.due_at)}</td>
                      <td className="px-4 py-3 text-right font-mono">{rp(o.total)}</td>
                      <td className="px-4 py-3 text-right"><div className="font-mono">{rp(o.balance)}</div><PayBadge status={o.payment_status} /></td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* mobile cards */}
            <ul className="divide-y md:hidden">
              {rows.map((o) => (
                <li key={o.id}>
                  <Link to={`/pesanan/${o.id}`} data-testid={`order-card-${o.nota_no}`} className="block px-4 py-3 active:bg-[#F7F9F8]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">{o.nota_no}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{o.customer_name}</span>
                      <span className="font-mono font-semibold">{rp(o.total)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{fmtDate(o.created_at)}</span>
                      <PayBadge status={o.payment_status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {total > PAGE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} data-testid="orders-prev-page">Sebelumnya</Button>
            <span>Hal. {page + 1} / {Math.ceil(total / PAGE)}</span>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} data-testid="orders-next-page">Berikutnya</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
