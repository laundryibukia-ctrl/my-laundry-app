import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { Expense, ExpenseIn, OrderList, Payment, PayMethod } from "@/lib/types";
import { CATEGORY_LABEL, errMsg, fmtDate, METHOD_LABEL, rp, todayWIT } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, Field, NativeSelect, PageHeader, Panel, PayBadge, StatusBadge } from "@/components/bits";
import { ReasonDialog } from "@/components/OrderDialogs";
import { cn } from "@/lib/utils";

const MANUAL_CATS = ["operasional", "listrik_air", "sewa", "transportasi", "perawatan", "lainnya"] as const;

export default function Finance() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "pengeluaran";
  const [from, setFrom] = useState(todayWIT().slice(0, 8) + "01");
  const [to, setTo] = useState(todayWIT());
  const [form, setForm] = useState<(ExpenseIn & { id?: string; source?: Expense["source"] }) | null>(null);
  const [voidExp, setVoidExp] = useState<Expense | null>(null);
  const range = `date_from=${from}&date_to=${to}`;
  const expenses = useQuery({ queryKey: ["expenses", range], queryFn: () => apiGet<Expense[]>(`/expenses?${range}`) });
  const payments = useQuery({ queryKey: ["payments", range], queryFn: () => apiGet<Payment[]>(`/payments?${range}`) });
  const recv = useQuery({ queryKey: ["orders", "receivables"], queryFn: () => apiGet<OrderList>("/orders?payment_status=belum_lunas&limit=200") });
  const inv = () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const save = useMutation({
    mutationFn: () => {
      const { id, source: _s, ...body } = form!;
      return id ? apiPut<Expense>(`/expenses/${id}`, body) : apiPost<Expense>("/expenses", body);
    },
    onSuccess: () => { toast.success(form?.id ? "Pengeluaran diubah" : "Pengeluaran dicatat"); setForm(null); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const voidMut = useMutation({ mutationFn: (reason: string) => apiPost(`/expenses/${voidExp!.id}/delete`, { reason }), onSuccess: () => { toast.success("Pengeluaran dihapus (salinan tersimpan di jejak audit)"); setVoidExp(null); inv(); qc.invalidateQueries({ queryKey: ["stock-movements"] }); }, onError: (e) => toast.error(errMsg(e)) });

  const expTotal = (expenses.data ?? []).filter((e) => !e.voided).reduce((a, e) => a + e.amount, 0);
  const payTotal = (payments.data ?? []).filter((p) => !p.voided).reduce((a, p) => a + p.amount, 0);
  const recvTotal = (recv.data?.items ?? []).reduce((a, o) => a + o.balance, 0);

  return (
    <div>
      <PageHeader title="Kas & Piutang" subtitle="Uang yang benar-benar diterima dan dikeluarkan, terpisah dari nilai pesanan"
        actions={<Button data-testid="add-expense-button" className="h-10 gap-2" onClick={() => setForm({ date: todayWIT(), category: "operasional", amount: 0, description: "", method: "tunai" })}><Plus className="size-4" /> Pengeluaran</Button>} />
      <Panel className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <Field label="Dari"><Input type="date" data-testid="finance-date-from" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" /></Field>
        <Field label="Sampai"><Input type="date" data-testid="finance-date-to" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" /></Field>
        <div className="ml-auto grid grid-cols-3 gap-4 text-right text-sm">
          <div><div className="text-xs text-muted-foreground">Kas masuk</div><div className="font-mono font-semibold text-[#047857]" data-testid="finance-cash-in">{rp(payTotal)}</div></div>
          <div><div className="text-xs text-muted-foreground">Kas keluar</div><div className="font-mono font-semibold text-[#BE123C]" data-testid="finance-cash-out">{rp(expTotal)}</div></div>
          <div><div className="text-xs text-muted-foreground">Piutang (semua)</div><div className="font-mono font-semibold" data-testid="finance-receivables">{rp(recvTotal)}</div></div>
        </div>
      </Panel>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: String(v) })}>
        <TabsList className="mb-4"><TabsTrigger value="pengeluaran" data-testid="finance-tab-expenses">Pengeluaran</TabsTrigger><TabsTrigger value="masuk" data-testid="finance-tab-payments">Pembayaran masuk</TabsTrigger><TabsTrigger value="piutang" data-testid="finance-tab-receivables">Piutang</TabsTrigger></TabsList>
        <TabsContent value="pengeluaran">
          <Panel>
            {(expenses.data ?? []).length === 0 ? <Empty text="Tidak ada pengeluaran pada periode ini" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="expenses-table">
                  <thead className="bg-[#F7F9F8] text-left text-xs uppercase tracking-wider text-[#5B6C7D]"><tr><th className="px-4 py-2">Tanggal</th><th className="px-4 py-2">Kategori</th><th className="px-4 py-2">Keterangan</th><th className="px-4 py-2">Metode</th><th className="px-4 py-2 text-right">Nominal</th><th className="px-4 py-2" /></tr></thead>
                  <tbody className="divide-y">
                    {expenses.data!.map((e) => (
                      <tr key={e.id} className={cn(e.voided && "opacity-50")} data-testid={`expense-row-${e.id}`}>
                        <td className="whitespace-nowrap px-4 py-2.5">{e.date.split("-").reverse().join("/")}</td>
                        <td className="px-4 py-2.5">{CATEGORY_LABEL[e.category]}{e.source !== "manual" && <span className="ml-1 text-xs text-muted-foreground">(otomatis)</span>}</td>
                        <td className="px-4 py-2.5">{e.description}{e.voided && <div className="text-xs text-[#BE123C]">Batal: {e.void_reason}</div>}</td>
                        <td className="px-4 py-2.5">{METHOD_LABEL[e.method]}</td>
                        <td className={cn("px-4 py-2.5 text-right font-mono", e.voided && "line-through")}>{rp(e.amount)}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right">{e.source === "gaji" ? <span className="text-xs text-muted-foreground">via menu Gaji</span> : (<>
                          <Button size="icon-sm" variant="ghost" aria-label="Ubah" data-testid={`expense-edit-${e.id}`} onClick={() => setForm({ id: e.id, source: e.source, date: e.date, category: e.category, amount: e.amount, description: e.description, method: e.method })}><Pencil className="size-3.5" /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label="Hapus" className="text-destructive" data-testid={`expense-delete-${e.id}`} onClick={() => setVoidExp(e)}><Trash2 className="size-3.5" /></Button>
                        </>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="masuk">
          <Panel>
            {(payments.data ?? []).length === 0 ? <Empty text="Tidak ada pembayaran pada periode ini" /> : (
              <ul className="divide-y" data-testid="payments-in-list">
                {payments.data!.map((p) => (
                  <li key={p.id} className={cn("flex items-center justify-between gap-3 px-4 py-3", p.voided && "opacity-50")}>
                    <div><Link to={`/pesanan/${p.order_id}`} className="font-mono text-sm font-semibold text-brand-deep hover:underline">{p.nota_no}</Link>
                      <div className="text-xs text-muted-foreground">{p.customer_name} · {fmtDate(p.created_at)} · {METHOD_LABEL[p.method]} · {p.kind.toUpperCase()}{p.voided && ` · BATAL: ${p.void_reason}`}</div></div>
                    <span className={cn("font-mono font-semibold", p.voided && "line-through")}>{rp(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="piutang">
          <Panel>
            {(recv.data?.items ?? []).length === 0 ? <Empty text="Tidak ada piutang 🎉" /> : (
              <ul className="divide-y" data-testid="receivables-list">
                {recv.data!.items.map((o) => (
                  <li key={o.id}><Link to={`/pesanan/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#F7F9F8]" data-testid={`receivable-${o.nota_no}`}>
                    <div><div className="font-mono text-sm font-semibold">{o.nota_no}</div><div className="text-xs text-muted-foreground">{o.customer_name} · {fmtDate(o.created_at, false)}</div></div>
                    <div className="flex flex-col items-end gap-1"><span className="font-mono font-semibold text-[#BE123C]">{rp(o.balance)}</span><div className="flex gap-1"><PayBadge status={o.payment_status} /><StatusBadge status={o.status} /></div></div>
                  </Link></li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent data-testid="expense-dialog">
          <DialogHeader><DialogTitle>{form?.id ? "Ubah pengeluaran" : "Catat pengeluaran"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tanggal"><Input type="date" data-testid="expense-date-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="Kategori"><NativeSelect data-testid="expense-category-select" disabled={form.source === "stok"} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseIn["category"] })}>{(form.source === "stok" ? ["pembelian_stok"] : MANUAL_CATS).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</NativeSelect></Field>
              <Field label="Keterangan *" className="col-span-2"><Input data-testid="expense-desc-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Nominal (Rp) *"><Input data-testid="expense-amount-input" inputMode="numeric" value={form.amount ? String(form.amount) : ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value.replace(/\D/g, "")) })} className="font-mono" /></Field>
              <Field label="Metode"><NativeSelect data-testid="expense-method-select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PayMethod })}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
              <p className="col-span-2 text-xs text-muted-foreground">Pembelian stok dicatat dari menu Persediaan, gaji dari menu Karyawan — agar tidak tercatat ganda.</p>
            </div>
          )}
          <DialogFooter><Button data-testid="expense-save-button" disabled={!form?.description.trim() || !form?.amount || save.isPending} onClick={() => save.mutate()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ReasonDialog testId="void-expense-dialog" open={!!voidExp} onOpenChange={(o) => !o && setVoidExp(null)} title="Hapus pengeluaran"
        description={voidExp ? `${voidExp.description} ${rp(voidExp.amount)} akan dihapus. Salinannya disimpan di jejak audit.` : ""} confirmLabel="Hapus" pending={voidMut.isPending} onConfirm={(r) => voidMut.mutate(r)} />
    </div>
  );
}
