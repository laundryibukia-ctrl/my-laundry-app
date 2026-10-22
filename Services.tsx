import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { Service, ServiceIn } from "@/lib/types";
import { errMsg, num, rp, SERVICE_CAT_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DecimalInput, Empty, Field, NativeSelect, PageHeader, Panel } from "@/components/bits";
import { ConfirmDialog } from "@/components/OrderDialogs";

const EMPTY: ServiceIn = { name: "", category: "kiloan", unit: "kg", price: 0, min_qty: 0, est_hours: 48, description: "", active: true };

function estLabel(h: number) {
  return h % 24 === 0 ? `${h / 24} hari` : `${h} jam`;
}

export default function Services() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<{ id?: string; form: ServiceIn } | null>(null);
  const [delSvc, setDelSvc] = useState<Service | null>(null);
  const { data, isError } = useQuery({ queryKey: ["services", "all"], queryFn: () => apiGet<Service[]>("/services") });
  const rows = isError ? [] : data ?? [];
  const inv = () => qc.invalidateQueries({ queryKey: ["services"] });
  const save = useMutation({
    mutationFn: () => (edit?.id ? apiPut<Service>(`/services/${edit.id}`, edit.form) : apiPost<Service>("/services", edit!.form)),
    onSuccess: () => { toast.success("Layanan disimpan. Nota lama tidak berubah."); setEdit(null); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => apiDelete<{ deactivated: boolean }>(`/services/${id}`),
    onSuccess: (r) => { toast.success(r.deactivated ? "Layanan sudah dipakai di nota — dinonaktifkan" : "Layanan dihapus"); inv(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const f = edit?.form;
  const set = (p: Partial<ServiceIn>) => edit && setEdit({ ...edit, form: { ...edit.form, ...p } });

  return (
    <div>
      <PageHeader title="Layanan & Harga" subtitle="Harga di sini dipakai untuk pesanan baru. Nota lama menyimpan harga saat transaksi."
        actions={<Button data-testid="add-service-button" className="h-10 gap-2" onClick={() => setEdit({ form: EMPTY })}><Plus className="size-4" /> Layanan</Button>} />
      {(["kiloan", "express", "satuan"] as const).map((cat) => {
        const list = rows.filter((s) => s.category === cat);
        return (
          <Panel key={cat} className="mb-4" data-testid={`services-group-${cat}`}>
            <div className="border-b px-4 py-3 font-bold">{SERVICE_CAT_LABEL[cat]}</div>
            {list.length === 0 ? <Empty text="Belum ada layanan" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#F7F9F8] text-left text-xs uppercase tracking-wider text-[#5B6C7D]"><tr><th className="px-4 py-2">Layanan</th><th className="px-4 py-2 text-right">Harga</th><th className="px-4 py-2 text-right">Minimum</th><th className="px-4 py-2 text-right">Estimasi</th><th className="px-4 py-2" /></tr></thead>
                  <tbody className="divide-y">
                    {list.map((s) => (
                      <tr key={s.id} className={s.active ? "" : "opacity-50"} data-testid={`service-row-${s.id}`}>
                        <td className="px-4 py-3"><div className="font-medium">{s.name}{!s.active && " (nonaktif)"}</div>{s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}</td>
                        <td className="px-4 py-3 text-right font-mono" data-testid={`service-price-${s.id}`}>{rp(s.price)}/{s.unit}</td>
                        <td className="px-4 py-3 text-right font-mono">{s.min_qty ? `${num(s.min_qty)} ${s.unit}` : "-"}</td>
                        <td className="px-4 py-3 text-right">{estLabel(s.est_hours)}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-right">
                          <Button variant="ghost" size="icon-sm" aria-label="Ubah" data-testid={`service-edit-${s.id}`} onClick={() => setEdit({ id: s.id, form: { name: s.name, category: s.category, unit: s.unit, price: s.price, min_qty: s.min_qty, est_hours: s.est_hours, description: s.description, active: s.active } })}><Pencil className="size-3.5" /></Button>
                          <Button variant="ghost" size="icon-sm" aria-label="Hapus" data-testid={`service-delete-${s.id}`} onClick={() => setDelSvc(s)}><Trash2 className="size-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        );
      })}

      <ConfirmDialog testId="service-delete-dialog" open={!!delSvc} onOpenChange={(o) => !o && setDelSvc(null)} title={`Hapus layanan ${delSvc?.name ?? ""}?`}
        description="Jika layanan sudah dipakai di nota, layanan hanya dinonaktifkan agar nota lama tetap utuh." confirmLabel="Hapus" pending={del.isPending}
        onConfirm={() => delSvc && del.mutate(delSvc.id, { onSettled: () => setDelSvc(null) })} />

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent data-testid="service-dialog">
          <DialogHeader><DialogTitle>{edit?.id ? "Ubah layanan" : "Layanan baru"}</DialogTitle></DialogHeader>
          {f && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama layanan *" className="col-span-2"><Input data-testid="service-name-input" value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Kategori"><NativeSelect data-testid="service-category-select" value={f.category} onChange={(e) => set({ category: e.target.value as ServiceIn["category"] })}>{Object.entries(SERVICE_CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
              <Field label="Satuan"><Input data-testid="service-unit-input" value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="kg / pcs / pasang" /></Field>
              <Field label="Harga per satuan (Rp)"><Input data-testid="service-price-input" inputMode="numeric" value={String(f.price)} onChange={(e) => set({ price: Number(e.target.value.replace(/\D/g, "")) })} className="font-mono" /></Field>
              <Field label="Minimum pesanan" hint="Boleh pakai koma/titik, mis. 1,5"><DecimalInput data-testid="service-min-input" value={f.min_qty} onValueChange={(n) => set({ min_qty: n })} className="font-mono" /></Field>
              <Field label="Estimasi (jam)" hint={estLabel(f.est_hours || 1)}><Input data-testid="service-hours-input" inputMode="numeric" value={String(f.est_hours)} onChange={(e) => set({ est_hours: Number(e.target.value.replace(/\D/g, "")) || 1 })} className="font-mono" /></Field>
              <Field label="Keterangan"><Input data-testid="service-desc-input" value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
              <label className="col-span-2 flex items-center gap-2 text-sm"><Checkbox data-testid="service-active-checkbox" checked={f.active} onCheckedChange={(v) => set({ active: !!v })} /> Aktif (muncul di form pesanan)</label>
            </div>
          )}
          <DialogFooter><Button data-testid="service-save-button" disabled={!f?.name.trim() || !f?.unit.trim() || save.isPending} onClick={() => save.mutate()}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
