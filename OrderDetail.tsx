import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, CheckCircle2, FileDown, Printer, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { OrderDetail as Detail, OrderStatus, Payment } from "@/lib/types";
import { errMsg, fmtDate, METHOD_LABEL, num, rp, STATUS_LABEL } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Empty, Panel, PayBadge, StatusBadge } from "@/components/bits";
import { PaymentDialog, ReasonDialog, WhatsAppButton } from "@/components/OrderDialogs";
import { cn } from "@/lib/utils";

const FLOW: OrderStatus[] = ["diterima", "diproses", "siap_diambil", "selesai"];
const NEXT_LABEL: Record<string, string> = { diproses: "Mulai Proses", siap_diambil: "Tandai Siap Diambil", selesai: "Serahkan ke Pelanggan" };

export default function OrderDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [voidPay, setVoidPay] = useState<Payment | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();
  const deleteMut = useMutation({
    mutationFn: (reason: string) => apiPost(`/orders/${id}/delete`, { reason }),
    onSuccess: () => {
      toast.success("Nota dihapus");
      ["orders", "dashboard", "customers", "customer", "report", "payments"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.removeQueries({ queryKey: ["order", id] });
      navigate("/pesanan", { replace: true });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const { data: o, isLoading, isError, error } = useQuery({ queryKey: ["order", id], queryFn: () => apiGet<Detail>(`/orders/${id}`) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const statusMut = useMutation({
    mutationFn: (v: { status: OrderStatus; note?: string }) => apiPatch<Detail>(`/orders/${id}/status`, { status: v.status, note: v.note ?? "" }),
    onSuccess: (d) => { toast.success(`Status: ${STATUS_LABEL[d.status]}`); setCancelOpen(false); setHandoverOpen(false); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const voidMut = useMutation({
    mutationFn: (v: { id: string; reason: string }) => apiPost<Payment>(`/payments/${v.id}/void`, { reason: v.reason }),
    onSuccess: () => { toast.success("Pembayaran dibatalkan (tercatat di audit)"); setVoidPay(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const notesMut = useMutation({
    mutationFn: (n: string) => apiPatch<Detail>(`/orders/${id}`, { notes: n, due_at: o?.due_at }),
    onSuccess: () => { toast.success("Catatan disimpan"); setNotes(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (isLoading) return <Empty text="Memuat nota…" />;
  if (isError || !o) return <Panel className="p-6"><p className="text-sm">{errMsg(error)}</p><Link to="/pesanan" className="mt-3 inline-block text-sm font-semibold text-brand-deep">Kembali ke daftar</Link></Panel>;

  const idx = FLOW.indexOf(o.status);
  const next = idx >= 0 && idx < 3 ? FLOW[idx + 1] : null;
  const open = o.status !== "selesai" && o.status !== "dibatalkan";
  const advance = () => { if (next === "selesai") setHandoverOpen(true); else if (next) statusMut.mutate({ status: next }); };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/pesanan" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink" data-testid="back-to-orders"><ArrowLeft className="size-4" /> Pesanan</Link>
          <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="order-nota-no">{o.nota_no}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} testId="order-detail-status" />
            <PayBadge status={o.payment_status} testId="order-detail-payment-status" />
            <span className="text-sm text-muted-foreground">Masuk {fmtDate(o.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/nota/${o.id}`} target="_blank" data-testid="print-receipt-button" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}><Printer className="size-4" /> Cetak Struk</Link>
          <a href={`/api/orders/${o.id}/pdf?size=a5`} target="_blank" rel="noreferrer" data-testid="pdf-receipt-button" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}><FileDown className="size-4" /> PDF</a>
          <WhatsAppButton order={o} defaultTemplate={o.status === "siap_diambil" ? "siap" : o.status === "selesai" ? "selesai" : o.balance > 0 && o.status !== "diterima" ? "tagihan" : "nota"} />
          <Button variant="ghost" className="gap-2 text-destructive" data-testid="delete-order-button" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" /> Hapus Nota</Button>
        </div>
      </div>

      {/* status stepper */}
      <Panel className="p-4 sm:p-5" data-testid="status-stepper">
        <div className="flex items-center gap-1 sm:gap-2">
          {FLOW.map((s, i) => {
            const done = o.status !== "dibatalkan" && idx >= i;
            return (
              <div key={s} className="flex flex-1 items-center gap-1 sm:gap-2">
                <div className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors", done ? "bg-brand text-brand-ink" : "bg-muted text-muted-foreground")}>{i + 1}</div>
                <span className={cn("hidden text-xs font-medium sm:block", done ? "text-ink" : "text-muted-foreground")}>{STATUS_LABEL[s]}</span>
                {i < 3 && <div className={cn("h-0.5 flex-1 rounded", idx > i && o.status !== "dibatalkan" ? "bg-brand" : "bg-muted")} />}
              </div>
            );
          })}
        </div>
        {open && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {next && <Button data-testid="advance-status-button" className="h-11 gap-2 font-semibold" disabled={statusMut.isPending} onClick={advance}><CheckCircle2 className="size-4" /> {NEXT_LABEL[next]}</Button>}
            {o.balance > 0 && <Button data-testid="open-payment-button" variant="outline" className="h-11 gap-2" onClick={() => setPayOpen(true)}><Wallet className="size-4" /> Terima Pembayaran</Button>}
            <Button data-testid="cancel-order-button" variant="ghost" className="h-11 gap-2 text-destructive sm:ml-auto" onClick={() => setCancelOpen(true)}><Ban className="size-4" /> Batalkan</Button>
          </div>
        )}
        {o.status === "selesai" && o.balance > 0 && (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-lg bg-[#FFE4E6] p-3 text-sm text-[#BE123C]">
            <span>Pakaian sudah diserahkan namun masih ada piutang {rp(o.balance)}.</span>
            <Button size="sm" data-testid="open-payment-button-after" onClick={() => setPayOpen(true)}>Terima</Button>
          </div>
        )}
        {o.status === "dibatalkan" && <p className="mt-3 text-sm text-[#BE123C]">Pesanan dibatalkan. Tidak dihitung sebagai pendapatan.</p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Panel>
            <div className="border-b px-5 py-3"><h2 className="font-bold">Rincian layanan</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="order-items-table">
                <thead className="bg-[#F7F9F8] text-left text-xs uppercase tracking-wider text-[#5B6C7D]"><tr><th className="px-5 py-2">Layanan</th><th className="px-3 py-2 text-right">Jumlah</th><th className="px-3 py-2 text-right">Harga</th><th className="px-5 py-2 text-right">Subtotal</th></tr></thead>
                <tbody className="divide-y">
                  {o.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-5 py-3"><div className="font-medium">{it.service_name}</div>{it.note && <div className="text-xs text-muted-foreground">{it.note}</div>}</td>
                      <td className="px-3 py-3 text-right font-mono">{num(it.qty)} {it.unit}{it.billed_qty !== it.qty && <div className="text-xs text-[#B45309]">dihitung {num(it.billed_qty)}</div>}</td>
                      <td className="px-3 py-3 text-right font-mono">{rp(it.unit_price)}</td>
                      <td className="px-5 py-3 text-right font-mono">{rp(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="font-bold">Pembayaran</h2>
              {o.balance > 0 && o.status !== "dibatalkan" && <Button size="sm" data-testid="add-payment-button" onClick={() => setPayOpen(true)}>+ Bayar</Button>}
            </div>
            {o.payments.length === 0 ? <Empty text="Belum ada pembayaran" testId="payments-empty" /> : (
              <ul className="divide-y" data-testid="payments-list">
                {o.payments.map((p) => (
                  <li key={p.id} className={cn("flex items-center justify-between gap-3 px-5 py-3", p.voided && "opacity-60")} data-testid={`payment-row-${p.id}`}>
                    <div>
                      <div className={cn("font-mono font-semibold", p.voided && "line-through")}>{rp(p.amount)}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(p.created_at)} · {METHOD_LABEL[p.method]} · {p.kind.toUpperCase()}{p.note && ` · ${p.note}`}</div>
                      {p.voided && <div className="text-xs text-[#BE123C]">Dibatalkan: {p.void_reason}</div>}
                    </div>
                    {!p.voided && <Button variant="ghost" size="sm" className="text-destructive" data-testid={`void-payment-${p.id}`} onClick={() => setVoidPay(p)}>Batalkan</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel className="p-5" data-testid="order-totals">
            <div className="mb-3 text-sm"><div className="font-semibold">{o.customer_name}</div><div className="text-muted-foreground">{o.customer_phone || "Tanpa no. HP"}</div>
              <Link to={`/pelanggan?id=${o.customer_id}`} className="text-xs font-semibold text-brand-deep hover:underline" data-testid="customer-history-link">Riwayat pelanggan</Link></div>
            <dl className="space-y-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-mono">{rp(o.subtotal)}</dd></div>
              {o.extra_fee > 0 && <div className="flex justify-between"><dt>Biaya {o.extra_fee_note}</dt><dd className="font-mono">{rp(o.extra_fee)}</dd></div>}
              {o.discount > 0 && <div className="flex justify-between text-[#047857]"><dt>Diskon</dt><dd className="font-mono">-{rp(o.discount)}</dd></div>}
              <div className="flex justify-between border-t pt-2 font-semibold"><dt>Total</dt><dd className="font-mono" data-testid="detail-total">{rp(o.total)}</dd></div>
              <div className="flex justify-between"><dt>Dibayar</dt><dd className="font-mono" data-testid="detail-paid">{rp(o.paid)}</dd></div>
              <div className="flex items-baseline justify-between"><dt className="font-semibold">Sisa tagihan</dt><dd className={cn("font-mono text-xl font-semibold", o.balance > 0 ? "text-[#BE123C]" : "text-[#047857]")} data-testid="detail-balance">{rp(o.balance)}</dd></div>
            </dl>
            <div className="mt-3 border-t pt-3 text-sm"><span className="text-muted-foreground">Estimasi selesai:</span> <b>{fmtDate(o.due_at)}</b></div>
            {o.picked_up_at && <div className="text-sm"><span className="text-muted-foreground">Diambil:</span> <b>{fmtDate(o.picked_up_at)}</b></div>}
          </Panel>

          <Panel className="p-5">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Catatan</h2>
              {notes === null && <Button variant="ghost" size="sm" data-testid="edit-notes-button" onClick={() => setNotes(o.notes)}>Ubah</Button>}</div>
            {notes === null ? <p className="whitespace-pre-wrap text-sm text-muted-foreground" data-testid="order-notes-text">{o.notes || "—"}</p> : (
              <div className="space-y-2">
                <Textarea data-testid="edit-notes-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                <div className="flex gap-2"><Button size="sm" data-testid="save-notes-button" onClick={() => notesMut.mutate(notes)}>Simpan</Button><Button size="sm" variant="ghost" onClick={() => setNotes(null)}>Batal</Button></div>
              </div>
            )}
          </Panel>

          <Panel className="p-5" data-testid="status-history">
            <h2 className="mb-3 font-bold">Riwayat status</h2>
            <ol className="space-y-3 border-l-2 border-[#D0F8FF] pl-4">
              {o.status_history.map((h, i) => (
                <li key={i} className="relative text-sm"><span className="absolute -left-[22px] top-1 size-2.5 rounded-full bg-brand" />
                  <div className="font-semibold">{STATUS_LABEL[h.status]}</div><div className="text-xs text-muted-foreground">{fmtDate(h.at)}{h.note && ` · ${h.note}`}</div></li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      <ReasonDialog testId="delete-order-dialog" open={deleteOpen} onOpenChange={setDeleteOpen} title={`Hapus nota ${o.nota_no}?`}
        description={`Nota beserta ${o.payments.length} pembayarannya dihapus permanen dari daftar & laporan. Salinannya disimpan di jejak audit.`}
        confirmLabel="Hapus nota" pending={deleteMut.isPending} onConfirm={(reason) => deleteMut.mutate(reason)} />
      <PaymentDialog order={o} open={payOpen} onOpenChange={setPayOpen} />
      <ReasonDialog testId="void-payment-dialog" open={!!voidPay} onOpenChange={(v) => !v && setVoidPay(null)} title="Batalkan pembayaran"
        description={voidPay ? `Pembayaran ${rp(voidPay.amount)} akan ditandai batal (tidak dihapus) dan sisa tagihan bertambah kembali.` : ""}
        confirmLabel="Batalkan pembayaran" pending={voidMut.isPending} onConfirm={(reason) => voidPay && voidMut.mutate({ id: voidPay.id, reason })} />
      <ReasonDialog testId="cancel-order-dialog" open={cancelOpen} onOpenChange={setCancelOpen} title="Batalkan pesanan"
        description={o.paid > 0 ? "Pesanan ini memiliki pembayaran. Batalkan pembayarannya terlebih dahulu." : "Pesanan akan berstatus Dibatalkan dan tidak dihitung sebagai pendapatan."}
        confirmLabel="Batalkan pesanan" pending={statusMut.isPending} onConfirm={(reason) => statusMut.mutate({ status: "dibatalkan", note: reason })} />
      <Dialog open={handoverOpen} onOpenChange={setHandoverOpen}>
        <DialogContent data-testid="handover-dialog">
          <DialogHeader>
            <DialogTitle>Serahkan pakaian ke pelanggan?</DialogTitle>
            <DialogDescription>
              {o.balance > 0 ? `Perhatian: masih ada sisa tagihan ${rp(o.balance)}. Jika diserahkan sekarang, sisa ini tetap tercatat sebagai piutang.` : "Pembayaran sudah lunas. Status akan menjadi Selesai."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            {o.balance > 0 && <Button variant="outline" data-testid="handover-pay-first" onClick={() => { setHandoverOpen(false); setPayOpen(true); }}>Terima pembayaran dulu</Button>}
            <Button data-testid="handover-confirm" disabled={statusMut.isPending} onClick={() => statusMut.mutate({ status: "selesai", note: o.balance > 0 ? `Diserahkan dengan piutang ${rp(o.balance)}` : "Diserahkan, lunas" })}>Ya, serahkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
