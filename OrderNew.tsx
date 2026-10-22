import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import type { Customer, OrderCreate, OrderDetail, PayMethod, Service } from "@/lib/types";
import { errMsg, METHOD_LABEL, num, rp, SERVICE_CAT_LABEL, uid } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, PageHeader, Panel, parseDecimal } from "@/components/bits";
import { cn } from "@/lib/utils";

interface Row { key: string; service_id: string; qty: string; note: string }
const newRow = (service_id = ""): Row => ({ key: uid(), service_id, qty: "", note: "" });
const toInt = (s: string) => (s ? parseInt(s, 10) || 0 : 0);

export default function OrderNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [clientRef] = useState(uid());
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [custQ, setCustQ] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [nc, setNc] = useState({ name: "", phone: "", address: "", notes: "" });
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [extraFee, setExtraFee] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [dp, setDp] = useState("");
  const [method, setMethod] = useState<PayMethod>("tunai");

  const services = useQuery({ queryKey: ["services", "active"], queryFn: () => apiGet<Service[]>("/services?active_only=true") });
  const customers = useQuery({
    queryKey: ["customers", custQ],
    queryFn: () => apiGet<Customer[]>(`/customers?limit=8&q=${encodeURIComponent(custQ)}`),
    enabled: mode === "existing" && !customer,
  });
  const svcMap = useMemo(() => new Map((services.data ?? []).map((s) => [s.id, s])), [services.data]);

  const lines = rows.map((r) => {
    const s = svcMap.get(r.service_id);
    const qty = parseDecimal(r.qty);
    const billed = s ? Math.max(qty, s.min_qty) : 0;
    return { ...r, s, qty, billed, sub: s && qty > 0 ? Math.round(billed * s.price) : 0 };
  });
  const subtotal = lines.reduce((a, l) => a + l.sub, 0);
  const total = Math.max(0, subtotal + toInt(extraFee) - toInt(discount));
  const dpN = toInt(dp);
  const validItems = lines.filter((l) => l.s && l.qty > 0);

  const problems: string[] = [];
  if (mode === "existing" && !customer) problems.push("Pilih pelanggan");
  if (mode === "new" && !nc.name.trim()) problems.push("Isi nama pelanggan");
  if (validItems.length === 0) problems.push("Tambahkan minimal 1 layanan dengan jumlah");
  if (toInt(discount) > subtotal + toInt(extraFee)) problems.push("Diskon melebihi tagihan");
  if (dpN > total) problems.push("Uang muka melebihi total");

  const mut = useMutation({
    mutationFn: () => {
      const body: OrderCreate = {
        client_ref: clientRef,
        customer_id: mode === "existing" ? customer?.id : null,
        new_customer: mode === "new" ? nc : null,
        items: validItems.map((l) => ({ service_id: l.service_id, qty: l.qty, note: l.note })),
        extra_fee: toInt(extraFee), extra_fee_note: extraNote, discount: toInt(discount), notes,
        due_at: dueAt ? new Date(dueAt + ":00+09:00").toISOString() : null,
        payment: dpN > 0 ? { amount: dpN, method } : null,
      };
      return apiPost<OrderDetail>("/orders", body);
    },
    onSuccess: (o) => {
      toast.success(`Nota ${o.nota_no} tersimpan`);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      navigate(`/pesanan/${o.id}?baru=1`, { replace: true });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const grouped = (["kiloan", "express", "satuan"] as const).map((c) => [c, (services.data ?? []).filter((s) => s.category === c)] as const);

  return (
    <div>
      <PageHeader title="Pesanan Baru" subtitle="Nomor nota dibuat otomatis saat disimpan" />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Panel className="p-5" data-testid="order-customer-section">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-bold">1. Pelanggan</h2>
              <div className="flex rounded-lg border p-0.5 text-sm">
                <button data-testid="customer-mode-existing" onClick={() => setMode("existing")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors", mode === "existing" && "bg-[#E6FCFF] font-semibold text-brand-deep")}><Users className="size-3.5" /> Terdaftar</button>
                <button data-testid="customer-mode-new" onClick={() => setMode("new")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors", mode === "new" && "bg-[#E6FCFF] font-semibold text-brand-deep")}><UserPlus className="size-3.5" /> Baru</button>
              </div>
            </div>
            {mode === "existing" ? (
              customer ? (
                <div className="flex items-center justify-between rounded-lg border border-brand bg-[#E6FCFF] px-4 py-3" data-testid="selected-customer">
                  <div><div className="font-semibold">{customer.name}</div><div className="text-sm text-muted-foreground">{customer.phone || "Tanpa no. HP"} {customer.outstanding > 0 && <span className="text-[#BE123C]">· piutang {rp(customer.outstanding)}</span>}</div></div>
                  <Button variant="ghost" size="sm" onClick={() => setCustomer(null)} data-testid="change-customer-button">Ganti</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input data-testid="customer-search-input" placeholder="Cari nama atau no. HP" value={custQ} onChange={(e) => setCustQ(e.target.value)} className="h-11" />
                  <div className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                    {(customers.data ?? []).map((c) => (
                      <button key={c.id} data-testid={`customer-option-${c.id}`} onClick={() => setCustomer(c)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#E6FCFF]">
                        <span className="font-medium">{c.name}</span><span className="text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                    {customers.data?.length === 0 && <div className="p-3 text-sm text-muted-foreground">Tidak ditemukan. <button className="font-semibold text-brand-deep" onClick={() => { setMode("new"); setNc((n) => ({ ...n, name: custQ })); }}>Buat pelanggan baru</button></div>}
                  </div>
                </div>
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nama *"><Input data-testid="new-customer-name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className="h-11" /></Field>
                <Field label="No. HP / WhatsApp"><Input data-testid="new-customer-phone" inputMode="tel" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} className="h-11" placeholder="08xx" /></Field>
                <Field label="Alamat" className="sm:col-span-2"><Input data-testid="new-customer-address" value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} className="h-11" /></Field>
              </div>
            )}
          </Panel>

          <Panel className="p-5" data-testid="order-items-section">
            <h2 className="mb-4 font-bold">2. Layanan</h2>
            <div className="space-y-3">
              {lines.map((l, idx) => (
                <div key={l.key} className="rounded-lg border p-3" data-testid={`order-item-row-${idx}`}>
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                    <NativeSelect data-testid={`order-item-service-${idx}`} value={l.service_id} onChange={(e) => setRow(l.key, { service_id: e.target.value })} className="h-11">
                      <option value="">Pilih layanan…</option>
                      {grouped.map(([c, list]) => list.length > 0 && (
                        <optgroup key={c} label={SERVICE_CAT_LABEL[c]}>
                          {list.map((s) => <option key={s.id} value={s.id}>{`${s.name} — ${rp(s.price)}/${s.unit}`}</option>)}
                        </optgroup>
                      ))}
                    </NativeSelect>
                    <div className="relative">
                      <Input data-testid={`order-item-qty-${idx}`} inputMode="decimal" placeholder="mis. 3,5" value={l.qty} onChange={(e) => setRow(l.key, { qty: e.target.value.replace(/[^\d.,]/g, "") })} className="h-11 pr-12 font-mono" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{l.s?.unit ?? ""}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="size-11" aria-label="Hapus baris" data-testid={`order-item-remove-${idx}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((r) => r.key !== l.key))}><Trash2 className="size-4" /></Button>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Input data-testid={`order-item-note-${idx}`} placeholder="Catatan item (warna, noda, dll.)" value={l.note} onChange={(e) => setRow(l.key, { note: e.target.value })} className="h-9 text-sm sm:max-w-xs" />
                    <div className="text-right text-sm">
                      {l.s && l.qty > 0 && l.billed > l.qty && <span className="mr-2 text-xs text-[#B45309]">min. {num(l.s.min_qty)} {l.s.unit}</span>}
                      <span className="font-mono font-semibold" data-testid={`order-item-subtotal-${idx}`}>{rp(l.sub)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-3 gap-2" data-testid="order-add-item-button" onClick={() => setRows((rs) => [...rs, newRow()])}><Plus className="size-4" /> Tambah layanan</Button>
          </Panel>

          <Panel className="p-5" data-testid="order-extras-section">
            <h2 className="mb-4 font-bold">3. Biaya, diskon & catatan</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Biaya tambahan (Rp)"><Input data-testid="order-extra-fee" inputMode="numeric" value={extraFee} onChange={(e) => setExtraFee(e.target.value.replace(/\D/g, ""))} className="h-11 font-mono" /></Field>
              <Field label="Keterangan biaya"><Input data-testid="order-extra-fee-note" value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="mis. antar jemput" className="h-11" /></Field>
              <Field label="Diskon (Rp)"><Input data-testid="order-discount" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ""))} className="h-11 font-mono" /></Field>
              <Field label="Estimasi selesai (opsional)" hint="Kosongkan untuk dihitung otomatis dari layanan"><Input data-testid="order-due-at" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-11" /></Field>
              <Field label="Catatan pesanan" className="sm:col-span-2"><Textarea data-testid="order-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
            </div>
          </Panel>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Panel className="overflow-hidden" data-testid="order-summary">
            <div className="bg-[#D0F8FF] px-5 py-4"><h2 className="font-bold text-[#154E5B]">Ringkasan tagihan</h2></div>
            <div className="space-y-2 p-5 text-sm">
              {validItems.map((l) => (
                <div key={l.key} className="flex justify-between gap-2"><span className="truncate">{l.s!.name} × {num(l.billed)}</span><span className="font-mono">{rp(l.sub)}</span></div>
              ))}
              <div className="flex justify-between border-t pt-2"><span>Subtotal</span><span className="font-mono">{rp(subtotal)}</span></div>
              {toInt(extraFee) > 0 && <div className="flex justify-between"><span>Biaya tambahan</span><span className="font-mono">{rp(toInt(extraFee))}</span></div>}
              {toInt(discount) > 0 && <div className="flex justify-between text-[#047857]"><span>Diskon</span><span className="font-mono">-{rp(toInt(discount))}</span></div>}
              <div className="flex items-baseline justify-between border-t pt-3"><span className="font-semibold">Total</span><span className="font-mono text-2xl font-semibold" data-testid="order-total">{rp(total)}</span></div>
              <div className="mt-3 space-y-2 rounded-lg bg-[#F7F9F8] p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#5B6C7D]">Uang muka (opsional)</div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input data-testid="order-dp-amount" inputMode="numeric" placeholder="0" value={dp} onChange={(e) => setDp(e.target.value.replace(/\D/g, ""))} className="h-10 bg-white font-mono" />
                  <NativeSelect data-testid="order-dp-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className="h-10 w-32">
                    {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </NativeSelect>
                </div>
                <div className="flex gap-2">
                  <Button size="xs" variant="outline" data-testid="order-dp-full" onClick={() => setDp(String(total))}>Bayar lunas</Button>
                  <Button size="xs" variant="outline" data-testid="order-dp-clear" onClick={() => setDp("")}>Tanpa DP</Button>
                </div>
                <div className="flex justify-between pt-1"><span>Sisa tagihan</span><span className="font-mono font-semibold" data-testid="order-remaining">{rp(Math.max(0, total - dpN))}</span></div>
              </div>
              {problems.length > 0 && <ul className="space-y-0.5 pt-2 text-xs text-[#B45309]" data-testid="order-problems">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
              <Button data-testid="order-submit-button" disabled={problems.length > 0 || mut.isPending} onClick={() => mut.mutate()} className="mt-2 h-12 w-full text-base font-semibold active:scale-[0.98]">
                {mut.isPending ? "Menyimpan…" : "Simpan & Buat Nota"}
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
