import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { InventoryIn, InventoryItem, PayMethod, StockMoveEdit, StockMoveIn, StockMovement } from "@/lib/types";
import { errMsg, fmtDate, INV_CAT_LABEL, METHOD_LABEL, num, rp } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DecimalInput, Empty, Field, NativeSelect, PageHeader, Panel, parseDecimal } from "@/components/bits";
import { ConfirmDialog, ReasonDialog } from "@/components/OrderDialogs";
import { cn } from "@/lib/utils";

type ItemForm = InventoryIn & { initial_qty: number };
const EMPTY: ItemForm = { name: "", category: "deterjen", unit: "liter", min_qty: 0, buy_price: 0, initial_qty: 0 };
const MOVE_LABEL: Record<string, string> = { saldo_awal: "Stok awal", masuk: "Masuk", keluar: "Keluar", penyesuaian: "Penyesuaian" };
const dec = (s: string) => parseDecimal(s);

export default function Inventory() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<{ id?: string; form: ItemForm } | null>(null);
  const [move, setMove] = useState<{ item: InventoryItem; type: StockMoveIn["type"] } | null>(null);
  const [mq, setMq] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [recordExp, setRecordExp] = useState(true);
  const [method, setMethod] = useState<PayMethod>("tunai");
  const items = useQuery({ queryKey: ["inventory"], queryFn: () => apiGet<InventoryItem[]>("/inventory") });
  const moves = useQuery({ queryKey: ["stock-movements"], queryFn: () => apiGet<StockMovement[]>("/stock-movements") });
  const rows = items.isError ? [] : items.data ?? [];
  const inv = () => { qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["stock-movements"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const save = useMutation({
    mutationFn: () => {
      const { initial_qty, ...rest } = edit!.form;
      return edit?.id ? apiPut<InventoryItem>(`/inventory/${edit.id}`, rest) : apiPost<InventoryItem>("/inventory", { ...rest, initial_qty });
    },
    onSuccess: () => { toast.success("Barang disimpan"); setEdit(null); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const archive = useMutation({ mutationFn: (id: string) => apiDelete(`/inventory/${id}`), onSuccess: () => { toast.success("Barang diarsipkan"); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const moveMut = useMutation({
    mutationFn: () => apiPost<StockMovement>(`/inventory/${move!.item.id}/movements`, {
      type: move!.type, qty: dec(mq), unit_cost: move!.type === "masuk" && cost ? Number(cost) : null, record_expense: recordExp, method, note,
    } satisfies StockMoveIn),
    onSuccess: (m) => { toast.success(`Stok ${m.item_name}: ${num(m.qty_after)} ${m.unit}`); setMove(null); inv(); qc.invalidateQueries({ queryKey: ["expenses"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const openMove = (item: InventoryItem, type: StockMoveIn["type"]) => {
    setMove({ item, type }); setMq(type === "penyesuaian" ? String(item.qty) : ""); setCost(String(item.buy_price)); setNote(""); setRecordExp(true); setMethod("tunai");
  };
  const f = edit?.form;
  const set = (p: Partial<ItemForm>) => edit && setEdit({ ...edit, form: { ...edit.form, ...p } });
  const [archiveFor, setArchiveFor] = useState<InventoryItem | null>(null);
  const [editMv, setEditMv] = useState<{ mv: StockMovement; qty: number; cost: number; note: string } | null>(null);
  const [delMv, setDelMv] = useState<StockMovement | null>(null);
  const editMvMut = useMutation({
    mutationFn: () => apiPut<StockMovement>(`/stock-movements/${editMv!.mv.id}`, { qty: editMv!.qty, unit_cost: editMv!.cost, note: editMv!.note } satisfies StockMoveEdit),
    onSuccess: () => { toast.success("Riwayat stok diubah, stok disesuaikan"); setEditMv(null); inv(); qc.invalidateQueries({ queryKey: ["expenses"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const delMvMut = useMutation({
    mutationFn: (reason: string) => apiPost(`/stock-movements/${delMv!.id}/delete`, { reason }),
    onSuccess: () => { toast.success("Riwayat stok dihapus, stok dikembalikan"); setDelMv(null); inv(); qc.invalidateQueries({ queryKey: ["expenses"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div>
      <PageHeader title="Persediaan" subtitle="Deterjen, pewangi, pelembut, dan perlengkapan. Setiap perubahan stok tercatat."
        actions={<Button data-testid="add-inventory-button" className="h-10 gap-2" onClick={() => setEdit({ form: EMPTY })}><Plus className="size-4" /> Barang</Button>} />
      <Tabs defaultValue="stok">
        <TabsList className="mb-4"><TabsTrigger value="stok" data-testid="inventory-tab-stock">Stok</TabsTrigger><TabsTrigger value="riwayat" data-testid="inventory-tab-history">Riwayat keluar-masuk</TabsTrigger></TabsList>
        <TabsContent value="stok">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.length === 0 && <Panel className="sm:col-span-2"><Empty text={items.isError ? "Gagal memuat" : "Belum ada barang"} /></Panel>}
            {rows.map((it) => {
              const pct = it.min_qty > 0 ? Math.min(100, (it.qty / (it.min_qty * 3)) * 100) : 100;
              return (
                <Panel key={it.id} className={cn("p-4", it.low && "border-[#FDBA74]")} data-testid={`inventory-card-${it.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="font-semibold">{it.name}</div><div className="text-xs text-muted-foreground">{INV_CAT_LABEL[it.category]} · beli {rp(it.buy_price)}/{it.unit}</div></div>
                    <div className="flex">
                      <Button variant="ghost" size="icon-sm" aria-label="Ubah" data-testid={`inventory-edit-${it.id}`} onClick={() => setEdit({ id: it.id, form: { name: it.name, category: it.category, unit: it.unit, min_qty: it.min_qty, buy_price: it.buy_price, initial_qty: 0 } })}><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Arsipkan" data-testid={`inventory-archive-${it.id}`} onClick={() => setArchiveFor(it)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2"><span className="font-mono text-2xl font-semibold" data-testid={`inventory-qty-${it.id}`}>{num(it.qty)}</span><span className="text-sm text-muted-foreground">{it.unit}</span>
                    {it.low && <span className="ml-auto rounded-full bg-[#FFEDD5] px-2 py-0.5 text-xs font-semibold text-[#C2410C]" data-testid={`inventory-low-${it.id}`}>Menipis</span>}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-[width] duration-500", it.low ? "bg-[#F97316]" : "bg-brand")} style={{ width: `${pct}%` }} /></div>
                  <div className="mt-1 text-xs text-muted-foreground">Batas minimum {num(it.min_qty)} {it.unit}</div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <Button size="sm" variant="outline" className="gap-1" data-testid={`stock-in-${it.id}`} onClick={() => openMove(it, "masuk")}><ArrowDownToLine className="size-3.5" /> Masuk</Button>
                    <Button size="sm" variant="outline" className="gap-1" data-testid={`stock-out-${it.id}`} onClick={() => openMove(it, "keluar")}><ArrowUpFromLine className="size-3.5" /> Pakai</Button>
                    <Button size="sm" variant="outline" className="gap-1" data-testid={`stock-adjust-${it.id}`} onClick={() => openMove(it, "penyesuaian")}><ClipboardCheck className="size-3.5" /> Opname</Button>
                  </div>
                </Panel>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="riwayat">
          <Panel>
            {(moves.data ?? []).length === 0 ? <Empty text="Belum ada pergerakan stok" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="stock-movements-table">
                  <thead className="bg-[#F7F9F8] text-left text-xs uppercase tracking-wider text-[#5B6C7D]"><tr><th className="px-4 py-2">Waktu</th><th className="px-4 py-2">Barang</th><th className="px-4 py-2">Jenis</th><th className="px-4 py-2 text-right">Jumlah</th><th className="px-4 py-2 text-right">Sisa</th><th className="px-4 py-2 text-right">Nilai</th><th className="px-4 py-2">Catatan</th><th className="px-4 py-2" /></tr></thead>
                  <tbody className="divide-y">
                    {moves.data!.map((m) => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs">{fmtDate(m.created_at)}</td>
                        <td className="px-4 py-2.5">{m.item_name}</td>
                        <td className="px-4 py-2.5">{MOVE_LABEL[m.type]}</td>
                        <td className={cn("px-4 py-2.5 text-right font-mono", m.qty < 0 ? "text-[#BE123C]" : "text-[#047857]")}>{m.qty > 0 ? "+" : ""}{num(m.qty)} {m.unit}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{num(m.qty_after)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{rp(m.total_cost)}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.note}{m.expense_id && " · dicatat sebagai pengeluaran"}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right">
                          <Button variant="ghost" size="icon-sm" aria-label="Ubah riwayat" data-testid={`movement-edit-${m.id}`} onClick={() => setEditMv({ mv: m, qty: Math.abs(m.qty), cost: m.unit_cost, note: m.note })}><Pencil className="size-3.5" /></Button>
                          <Button variant="ghost" size="icon-sm" aria-label="Hapus riwayat" className="text-destructive" data-testid={`movement-delete-${m.id}`} onClick={() => setDelMv(m)}><Trash2 className="size-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <ConfirmDialog testId="inventory-archive-dialog" open={!!archiveFor} onOpenChange={(o) => !o && setArchiveFor(null)} title={`Arsipkan ${archiveFor?.name ?? ""}?`}
        description="Barang disembunyikan dari daftar stok. Riwayat keluar-masuk tetap tersimpan." confirmLabel="Arsipkan" pending={archive.isPending}
        onConfirm={() => archiveFor && archive.mutate(archiveFor.id, { onSettled: () => setArchiveFor(null) })} />
      <ReasonDialog testId="movement-delete-dialog" open={!!delMv} onOpenChange={(o) => !o && setDelMv(null)} title="Hapus riwayat stok"
        description={delMv ? `${delMv.item_name} ${num(delMv.qty)} ${delMv.unit} akan dihapus dan stok dikembalikan${delMv.expense_id ? "; pengeluaran pembelian terkait ikut dihapus" : ""}.` : ""}
        confirmLabel="Hapus" pending={delMvMut.isPending} onConfirm={(r) => delMvMut.mutate(r)} />
      <Dialog open={!!editMv} onOpenChange={(o) => !o && setEditMv(null)}>
        <DialogContent data-testid="movement-edit-dialog">
          <DialogHeader><DialogTitle>Ubah riwayat stok</DialogTitle>
            <DialogDescription>{editMv?.mv.item_name} · {editMv ? MOVE_LABEL[editMv.mv.type] : ""}. Stok barang otomatis disesuaikan dengan selisihnya.</DialogDescription></DialogHeader>
          {editMv && (
            <div className="space-y-3">
              <Field label={`Jumlah (${editMv.mv.unit})`} hint="Boleh pakai koma/titik"><DecimalInput data-testid="movement-edit-qty" value={editMv.qty} onValueChange={(n) => setEditMv({ ...editMv, qty: n })} className="h-11 font-mono" /></Field>
              {(editMv.mv.type === "masuk" || editMv.mv.type === "saldo_awal") && (
                <Field label="Harga beli per satuan (Rp)"><Input data-testid="movement-edit-cost" inputMode="numeric" value={String(editMv.cost)} onChange={(e) => setEditMv({ ...editMv, cost: Number(e.target.value.replace(/\D/g, "")) })} className="font-mono" /></Field>
              )}
              <Field label="Catatan"><Input data-testid="movement-edit-note" value={editMv.note} onChange={(e) => setEditMv({ ...editMv, note: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter><Button data-testid="movement-edit-save" disabled={!editMv || editMv.qty <= 0 || editMvMut.isPending} onClick={() => editMvMut.mutate()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent data-testid="inventory-dialog">
          <DialogHeader><DialogTitle>{edit?.id ? "Ubah barang" : "Barang baru"}</DialogTitle></DialogHeader>
          {f && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama barang *" className="col-span-2"><Input data-testid="inventory-name-input" value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Kategori"><NativeSelect data-testid="inventory-category-select" value={f.category} onChange={(e) => set({ category: e.target.value as InventoryIn["category"] })}>{Object.entries(INV_CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
              <Field label="Satuan"><Input data-testid="inventory-unit-input" value={f.unit} onChange={(e) => set({ unit: e.target.value })} /></Field>
              <Field label="Batas minimum"><DecimalInput data-testid="inventory-min-input" value={f.min_qty} onValueChange={(n) => set({ min_qty: n })} className="font-mono" /></Field>
              <Field label="Harga beli / satuan (Rp)"><Input data-testid="inventory-price-input" inputMode="numeric" value={String(f.buy_price)} onChange={(e) => set({ buy_price: Number(e.target.value.replace(/\D/g, "")) })} className="font-mono" /></Field>
              {!edit?.id && <Field label="Stok awal" hint="Saldo awal, tidak dicatat sebagai pengeluaran" className="col-span-2"><DecimalInput data-testid="inventory-initial-input" value={f.initial_qty} onValueChange={(n) => set({ initial_qty: n })} className="font-mono" /></Field>}
            </div>
          )}
          <DialogFooter><Button data-testid="inventory-save-button" disabled={!f?.name.trim() || !f?.unit.trim() || save.isPending} onClick={() => save.mutate()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!move} onOpenChange={(o) => !o && setMove(null)}>
        <DialogContent data-testid="stock-move-dialog">
          <DialogHeader>
            <DialogTitle>{move?.type === "masuk" ? "Barang masuk / pembelian" : move?.type === "keluar" ? "Pemakaian barang" : "Stock opname"}</DialogTitle>
            <DialogDescription>{move?.item.name} · stok sekarang {num(move?.item.qty ?? 0)} {move?.item.unit}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label={move?.type === "penyesuaian" ? `Jumlah fisik terhitung (${move?.item.unit})` : `Jumlah (${move?.item.unit})`}><Input data-testid="stock-move-qty" inputMode="decimal" value={mq} onChange={(e) => setMq(e.target.value.replace(/[^\d.,]/g, ""))} className="h-11 font-mono" /></Field>
            {move?.type === "masuk" && (
              <>
                <Field label="Harga beli per satuan (Rp)" hint={`Total ${rp(Math.round(dec(mq) * (Number(cost) || 0)))}`}><Input data-testid="stock-move-cost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ""))} className="font-mono" /></Field>
                <label className="flex items-center gap-2 text-sm"><Checkbox data-testid="stock-move-record-expense" checked={recordExp} onCheckedChange={(v) => setRecordExp(!!v)} /> Catat sebagai pengeluaran kas (pembelian stok)</label>
                {recordExp && <Field label="Dibayar dengan"><NativeSelect data-testid="stock-move-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>}
              </>
            )}
            <Field label="Catatan"><Input data-testid="stock-move-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <DialogFooter><Button data-testid="stock-move-submit" disabled={(move?.type !== "penyesuaian" && dec(mq) <= 0) || mq === "" || moveMut.isPending} onClick={() => moveMut.mutate()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
