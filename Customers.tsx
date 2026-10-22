import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { Customer, CustomerDeleteIn, CustomerIn, DeleteResult, OrderList } from "@/lib/types";
import { errMsg, fmtDate, rp } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Empty, Field, PageHeader, Panel, PayBadge, StatusBadge } from "@/components/bits";

const EMPTY: CustomerIn = { name: "", phone: "", address: "", notes: "" };

function CustomerHistory({ id }: { id: string }) {
  const c = useQuery({ queryKey: ["customer", id], queryFn: () => apiGet<Customer>(`/customers/${id}`) });
  const orders = useQuery({ queryKey: ["orders", "customer", id], queryFn: () => apiGet<OrderList>(`/orders?customer_id=${id}&limit=100`) });
  return (
    <div className="space-y-4 px-4 pb-6">
      {c.data && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-[#F7F9F8] p-2"><div className="text-xs text-muted-foreground">Pesanan</div><div className="font-mono font-semibold" data-testid="customer-order-count">{c.data.order_count}</div></div>
          <div className="rounded-lg bg-[#F7F9F8] p-2"><div className="text-xs text-muted-foreground">Total</div><div className="font-mono text-sm font-semibold">{rp(c.data.total_spent)}</div></div>
          <div className="rounded-lg bg-[#FFE4E6] p-2"><div className="text-xs text-[#BE123C]">Piutang</div><div className="font-mono text-sm font-semibold text-[#BE123C]" data-testid="customer-outstanding">{rp(c.data.outstanding)}</div></div>
        </div>
      )}
      {c.data && <div className="text-sm text-muted-foreground">{c.data.phone} {c.data.address && `· ${c.data.address}`}{c.data.notes && <div>{c.data.notes}</div>}</div>}
      <div className="divide-y rounded-lg border" data-testid="customer-orders-list">
        {orders.data?.items.length === 0 && <Empty text="Belum ada pesanan" />}
        {orders.data?.items.map((o) => (
          <Link key={o.id} to={`/pesanan/${o.id}`} className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-[#F7F9F8]">
            <div><div className="font-mono text-sm font-semibold">{o.nota_no}</div><div className="text-xs text-muted-foreground">{fmtDate(o.created_at)}</div></div>
            <div className="flex flex-col items-end gap-1"><span className="font-mono text-sm">{rp(o.total)}</span><div className="flex gap-1"><PayBadge status={o.payment_status} /><StatusBadge status={o.status} /></div></div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Customers() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const viewId = params.get("id");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id?: string; form: CustomerIn } | null>(null);
  const { data, isError } = useQuery({ queryKey: ["customers", "list", q], queryFn: () => apiGet<Customer[]>(`/customers?q=${encodeURIComponent(q)}`) });
  const rows = isError ? [] : data ?? [];
  const viewing = rows.find((c) => c.id === viewId);

  const save = useMutation({
    mutationFn: () => (edit?.id ? apiPut<Customer>(`/customers/${edit.id}`, edit.form) : apiPost<Customer>("/customers", edit!.form)),
    onSuccess: () => { toast.success("Pelanggan disimpan"); setEdit(null); qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["customer"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (v: { id: string } & CustomerDeleteIn) => apiPost<DeleteResult>(`/customers/${v.id}/delete`, { reason: v.reason, delete_orders: v.delete_orders }),
    onSuccess: (r) => {
      toast.success(r.orders_deleted ? `Pelanggan & ${r.orders_deleted} pesanan dihapus` : "Pelanggan dihapus");
      setDelFor(null);
      if (viewId) setParams({});
      ["customers", "customer", "orders", "dashboard", "report", "payments"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [delFor, setDelFor] = useState<Customer | null>(null);
  const [delReason, setDelReason] = useState("");
  const [delOrders, setDelOrders] = useState(false);
  const askDelete = (c: Customer) => { setDelFor(c); setDelReason(""); setDelOrders(false); };

  return (
    <div>
      <PageHeader title="Pelanggan" subtitle="Data kontak dan riwayat transaksi"
        actions={<Button data-testid="add-customer-button" className="h-10 gap-2" onClick={() => setEdit({ form: EMPTY })}><Plus className="size-4" /> Pelanggan</Button>} />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input data-testid="customers-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau no. HP" className="h-10 bg-white pl-9" />
      </div>
      <Panel>
        {rows.length === 0 ? <Empty text={isError ? "Gagal memuat" : "Belum ada pelanggan"} /> : (<>
          <ul className="divide-y md:hidden" data-testid="customers-cards">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-4 py-3" data-testid={`customer-card-${c.id}`}>
                <button className="min-w-0 flex-1 text-left" onClick={() => setParams({ id: c.id })} data-testid={`customer-card-view-${c.id}`}>
                  <div className="truncate font-semibold text-brand-deep">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.phone || "Tanpa no. HP"} · {c.order_count} pesanan{c.outstanding > 0 && <span className="text-[#BE123C]"> · piutang {rp(c.outstanding)}</span>}</div>
                </button>
                <Button variant="ghost" size="icon" aria-label="Ubah" data-testid={`customer-card-edit-${c.id}`} onClick={() => setEdit({ id: c.id, form: { name: c.name, phone: c.phone, address: c.address, notes: c.notes } })}><Pencil className="size-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Hapus" className="text-destructive" data-testid={`customer-card-delete-${c.id}`} onClick={() => askDelete(c)}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm" data-testid="customers-table">
              <thead className="bg-[#F7F9F8] text-left text-xs uppercase tracking-wider text-[#5B6C7D]"><tr><th className="px-4 py-2.5">Nama</th><th className="px-4 py-2.5">No. HP</th><th className="hidden px-4 py-2.5 md:table-cell">Alamat</th><th className="px-4 py-2.5 text-right">Pesanan</th><th className="px-4 py-2.5 text-right">Piutang</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F7F9F8]" data-testid={`customer-row-${c.id}`}>
                    <td className="px-4 py-3"><button className="font-semibold text-brand-deep hover:underline" data-testid={`customer-view-${c.id}`} onClick={() => setParams({ id: c.id })}>{c.name}</button></td>
                    <td className="px-4 py-3 font-mono text-xs">{c.phone || "-"}</td>
                    <td className="hidden max-w-xs truncate px-4 py-3 text-muted-foreground md:table-cell">{c.address || "-"}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.order_count}</td>
                    <td className={`px-4 py-3 text-right font-mono ${c.outstanding > 0 ? "text-[#BE123C]" : ""}`}>{rp(c.outstanding)}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right">
                      <Button variant="ghost" size="icon-sm" aria-label="Ubah" data-testid={`customer-edit-${c.id}`} onClick={() => setEdit({ id: c.id, form: { name: c.name, phone: c.phone, address: c.address, notes: c.notes } })}><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Hapus" data-testid={`customer-delete-${c.id}`} onClick={() => askDelete(c)}><Trash2 className="size-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </Panel>

      <Dialog open={!!delFor} onOpenChange={(o) => !o && setDelFor(null)}>
        <DialogContent data-testid="customer-delete-dialog">
          <DialogHeader><DialogTitle>Hapus pelanggan {delFor?.name}?</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="flex items-start gap-2 rounded-lg border p-3">
              <Checkbox data-testid="customer-delete-orders-checkbox" checked={delOrders} onCheckedChange={(v) => setDelOrders(!!v)} className="mt-0.5" />
              <span><b>Hapus juga semua riwayat transaksinya</b> ({delFor?.order_count ?? 0} pesanan aktif/selesai beserta pembayarannya). Angka laporan & piutang ikut berubah.</span>
            </label>
            {!delOrders && (delFor?.order_count ?? 0) > 0 && <p className="text-muted-foreground">Jika tidak dicentang, nota lama tetap tersimpan dengan nama pelanggan di nota.</p>}
            <Field label="Alasan (wajib, tersimpan di jejak audit)">
              <Textarea data-testid="customer-delete-reason" rows={2} value={delReason} onChange={(e) => setDelReason(e.target.value)} placeholder="mis. data ganda / salah input" />
            </Field>
            <p className="text-xs text-muted-foreground">Salinan data yang dihapus disimpan di jejak audit dan ikut dalam backup.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" data-testid="customer-delete-cancel" onClick={() => setDelFor(null)}>Batal</Button>
            <Button variant="destructive" data-testid="customer-delete-confirm" disabled={delReason.trim().length < 3 || del.isPending}
              onClick={() => delFor && del.mutate({ id: delFor.id, reason: delReason.trim(), delete_orders: delOrders })}>
              {del.isPending ? "Menghapus…" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent data-testid="customer-dialog">
          <DialogHeader><DialogTitle>{edit?.id ? "Ubah pelanggan" : "Pelanggan baru"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <Field label="Nama *"><Input data-testid="customer-name-input" value={edit.form.name} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, name: e.target.value } })} /></Field>
              <Field label="No. HP / WhatsApp"><Input data-testid="customer-phone-input" inputMode="tel" value={edit.form.phone} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, phone: e.target.value } })} /></Field>
              <Field label="Alamat"><Input data-testid="customer-address-input" value={edit.form.address} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, address: e.target.value } })} /></Field>
              <Field label="Catatan"><Textarea data-testid="customer-notes-input" value={edit.form.notes} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, notes: e.target.value } })} rows={2} /></Field>
            </div>
          )}
          <DialogFooter><Button data-testid="customer-save-button" disabled={!edit?.form.name.trim() || save.isPending} onClick={() => save.mutate()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!viewId} onOpenChange={(o) => !o && setParams({})}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="customer-history-sheet">
          <SheetHeader><SheetTitle>{viewing?.name ?? "Riwayat pelanggan"}</SheetTitle></SheetHeader>
          {viewId && <CustomerHistory id={viewId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
