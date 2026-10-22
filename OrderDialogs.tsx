import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { errMsg, METHOD_LABEL, rp, uid, waLink, waMessage, WA_TEMPLATE_LABEL, type WaTemplate } from "@/lib/format";
import type { Order, Payment, PayMethod, Settings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/bits";

export function PaymentDialog({ order, open, onOpenChange }: { order: Order; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(order.balance));
  const [method, setMethod] = useState<PayMethod>("tunai");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState(uid());
  // Reset whenever the dialog opens, however it was opened (fresh client_ref = a new payment).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setAmount(String(order.balance)); setNote(""); setMethod("tunai"); setRef(uid()); }
  }
  const reset = (o: boolean) => onOpenChange(o);
  const mut = useMutation({
    mutationFn: () => apiPost<Payment>(`/orders/${order.id}/payments`, { amount: Number(amount), method, note, client_ref: ref }),
    onSuccess: (p) => {
      toast.success(`Pembayaran ${rp(p.amount)} tercatat (${p.kind.toUpperCase()})`);
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const n = Number(amount);
  const invalid = !Number.isInteger(n) || n <= 0 || n > order.balance;
  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent data-testid="payment-dialog">
        <DialogHeader>
          <DialogTitle>Terima Pembayaran</DialogTitle>
          <DialogDescription>Nota {order.nota_no} · Sisa tagihan <b>{rp(order.balance)}</b></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nominal (Rp)">
            <Input data-testid="payment-amount-input" inputMode="numeric" className="h-11 font-mono text-lg" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" data-testid="payment-fill-balance" onClick={() => setAmount(String(order.balance))}>Lunasi {rp(order.balance)}</Button>
            {order.balance > 20000 && <Button type="button" size="sm" variant="outline" data-testid="payment-fill-half" onClick={() => setAmount(String(Math.round(order.balance / 2)))}>50%</Button>}
          </div>
          <Field label="Metode">
            <NativeSelect data-testid="payment-method-select" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Catatan (opsional)">
            <Input data-testid="payment-note-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {n > order.balance && <p className="text-sm text-destructive">Nominal melebihi sisa tagihan</p>}
        </div>
        <DialogFooter>
          <Button data-testid="payment-submit-button" disabled={invalid || mut.isPending} onClick={() => mut.mutate()} className="h-11 w-full sm:w-auto">
            {mut.isPending ? "Menyimpan…" : `Simpan Pembayaran`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm, pending, testId, destructive = true,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel: string;
  onConfirm: () => void; pending?: boolean; testId: string; destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" data-testid={`${testId}-cancel`} onClick={() => onOpenChange(false)}>Batal</Button>
          <Button variant={destructive ? "destructive" : "default"} data-testid={`${testId}-confirm`} disabled={pending} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReasonDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm, pending, testId,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel: string;
  onConfirm: (reason: string) => void; pending?: boolean; testId: string;
}) {
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field label="Alasan (wajib, tersimpan di jejak audit)">
          <Textarea data-testid={`${testId}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        <DialogFooter>
          <Button variant="destructive" data-testid={`${testId}-confirm`} disabled={reason.trim().length < 3 || pending} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WhatsAppButton({ order, defaultTemplate = "nota", size = "default" }: { order: Order; defaultTemplate?: WaTemplate; size?: "default" | "sm" }) {
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState<WaTemplate>(defaultTemplate);
  const [text, setText] = useState("");
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<Settings>("/settings"), staleTime: 300_000 });
  const openDialog = () => { setTpl(defaultTemplate); setText(waMessage(defaultTemplate, order, settings.data)); setOpen(true); };
  const hasPhone = order.customer_phone.replace(/\D/g, "").length >= 8;
  return (
    <>
      <Button type="button" size={size} data-testid="whatsapp-button" onClick={openDialog} className="gap-2 bg-[#25D366] text-white hover:bg-[#1EBE5A]">
        <MessageCircle className="size-4" /> WhatsApp
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="whatsapp-dialog" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Kirim pesan WhatsApp</DialogTitle>
            <DialogDescription>
              Periksa pesan di bawah. Tombol akan membuka aplikasi WhatsApp — pesan baru terkirim setelah Anda menekan kirim di WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <Field label="Template">
            <NativeSelect data-testid="whatsapp-template-select" value={tpl} onChange={(e) => { const t = e.target.value as WaTemplate; setTpl(t); setText(waMessage(t, order, settings.data)); }}>
              {Object.entries(WA_TEMPLATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </Field>
          <Field label={`Kepada: ${order.customer_name} (${order.customer_phone || "tanpa nomor"})`}>
            <Textarea data-testid="whatsapp-message-textarea" rows={10} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" />
          </Field>
          {!hasPhone && <p className="text-sm text-destructive">Nomor HP pelanggan belum diisi.</p>}
          <DialogFooter>
            <a
              data-testid="whatsapp-open-link"
              href={hasPhone ? waLink(order.customer_phone, text) : undefined}
              target="_blank" rel="noreferrer"
              aria-disabled={!hasPhone}
              onClick={() => { if (hasPhone) { toast.info("WhatsApp dibuka. Tekan kirim di WhatsApp untuk mengirim pesan."); setOpen(false); } }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1EBE5A] aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              <MessageCircle className="size-4" /> Buka WhatsApp
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
