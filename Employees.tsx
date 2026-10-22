import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { Employee, EmployeeIn, PayMethod, Payroll, PayrollEdit, PayrollIn } from "@/lib/types";
import { errMsg, fmtDate, METHOD_LABEL, rp, todayWIT } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, Field, NativeSelect, PageHeader, Panel } from "@/components/bits";
import { ConfirmDialog, ReasonDialog } from "@/components/OrderDialogs";
import { cn } from "@/lib/utils";

const EMPTY: EmployeeIn = { name: "", position: "", phone: "", status: "aktif", salary_scheme: "bulanan", base_salary: 0, allowance: 0, join_date: "" };
const PR_STYLE = { belum_dibayar: "bg-[#FEF3C7] text-[#92400E]", dibayar: "bg-[#DCFCE7] text-[#15803D]", dibatalkan: "bg-[#FFE4E6] text-[#BE123C]" };
const PR_LABEL = { belum_dibayar: "Belum dibayar", dibayar: "Dibayar", dibatalkan: "Dibatalkan" };
const int = (s: string) => Number(s.replace(/\D/g, "")) || 0;

export default function Employees() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<{ id?: string; form: EmployeeIn } | null>(null);
  const [pr, setPr] = useState<(PayrollIn & { id?: string }) | null>(null);
  const [delEmpOpen, setDelEmpOpen] = useState(false);
  const [payFor, setPayFor] = useState<Payroll | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("tunai");
  const [cancelFor, setCancelFor] = useState<Payroll | null>(null);
  const emps = useQuery({ queryKey: ["employees"], queryFn: () => apiGet<Employee[]>("/employees") });
  const payroll = useQuery({ queryKey: ["payroll"], queryFn: () => apiGet<Payroll[]>("/payroll") });
  const inv = () => { qc.invalidateQueries({ queryKey: ["employees"] }); qc.invalidateQueries({ queryKey: ["payroll"] }); qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const onErr = (e: unknown) => toast.error(errMsg(e));

  const saveEmp = useMutation({ mutationFn: () => (edit?.id ? apiPut(`/employees/${edit.id}`, edit.form) : apiPost("/employees", edit!.form)), onSuccess: () => { toast.success("Karyawan disimpan"); setEdit(null); inv(); }, onError: onErr });
  const delEmp = useMutation({ mutationFn: (id: string) => apiDelete<{ deactivated: boolean }>(`/employees/${id}`), onSuccess: (r) => { toast.success(r.deactivated ? "Karyawan dinonaktifkan (punya riwayat gaji)" : "Karyawan dihapus"); setEdit(null); inv(); }, onError: onErr });
  const savePr = useMutation({
    mutationFn: () => {
      const { id, employee_id, ...rest } = pr!;
      return id ? apiPut<Payroll>(`/payroll/${id}`, rest satisfies PayrollEdit) : apiPost<Payroll>("/payroll", { employee_id, ...rest });
    },
    onSuccess: () => { toast.success(pr?.id ? "Slip gaji diubah" : "Slip gaji dibuat"); setPr(null); inv(); }, onError: onErr,
  });
  const pay = useMutation({ mutationFn: () => apiPost<Payroll>(`/payroll/${payFor!.id}/pay`, { method: payMethod }), onSuccess: () => { toast.success("Gaji dibayar & dicatat sebagai pengeluaran"); setPayFor(null); inv(); }, onError: onErr });
  const cancel = useMutation({ mutationFn: (reason: string) => apiPost(`/payroll/${cancelFor!.id}/delete`, { reason }), onSuccess: () => { toast.success("Slip gaji dihapus"); setCancelFor(null); inv(); }, onError: onErr });

  const active = (emps.data ?? []).filter((e) => e.status === "aktif");
  const newSlip = () => {
    const e = active[0];
    setPr({ employee_id: e?.id ?? "", period: todayWIT().slice(0, 7), base_salary: e?.base_salary ?? 0, allowance: e?.allowance ?? 0, deduction: 0, note: "" });
  };
  const f = edit?.form;
  const set = (p: Partial<EmployeeIn>) => edit && setEdit({ ...edit, form: { ...edit.form, ...p } });

  return (
    <div>
      <PageHeader title="Karyawan & Gaji" subtitle="Karyawan tidak memiliki akun login. Gaji yang dibayar otomatis tercatat sebagai pengeluaran." />
      <Tabs defaultValue="karyawan">
        <TabsList className="mb-4"><TabsTrigger value="karyawan" data-testid="employees-tab">Karyawan</TabsTrigger><TabsTrigger value="gaji" data-testid="payroll-tab">Penggajian</TabsTrigger></TabsList>
        <TabsContent value="karyawan">
          <div className="mb-3 flex justify-end"><Button data-testid="add-employee-button" className="gap-2" onClick={() => setEdit({ form: { ...EMPTY, join_date: todayWIT() } })}><Plus className="size-4" /> Karyawan</Button></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(emps.data ?? []).length === 0 && <Panel className="sm:col-span-2"><Empty text="Belum ada karyawan" /></Panel>}
            {(emps.data ?? []).map((e) => (
              <Panel key={e.id} className={cn("p-4", e.status === "nonaktif" && "opacity-60")} data-testid={`employee-card-${e.id}`}>
                <div className="flex items-start justify-between">
                  <div><div className="font-semibold">{e.name}</div><div className="text-sm text-muted-foreground">{e.position} · {e.status}</div></div>
                  <Button variant="ghost" size="icon-sm" aria-label="Ubah" data-testid={`employee-edit-${e.id}`} onClick={() => setEdit({ id: e.id, form: { name: e.name, position: e.position, phone: e.phone, status: e.status, salary_scheme: e.salary_scheme, base_salary: e.base_salary, allowance: e.allowance, join_date: e.join_date } })}><Pencil className="size-3.5" /></Button>
                </div>
                <div className="mt-3 text-sm">Gaji {e.salary_scheme}: <span className="font-mono font-semibold">{rp(e.base_salary)}</span>{e.allowance > 0 && <> + tunjangan <span className="font-mono">{rp(e.allowance)}</span></>}</div>
                {e.phone && <div className="text-xs text-muted-foreground">{e.phone}</div>}
              </Panel>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="gaji">
          <div className="mb-3 flex justify-end"><Button data-testid="add-payroll-button" className="gap-2" disabled={active.length === 0} onClick={newSlip}><Plus className="size-4" /> Slip gaji</Button></div>
          <Panel>
            {(payroll.data ?? []).length === 0 ? <Empty text="Belum ada data gaji" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="payroll-table">
                  <thead className="bg-[#F7F9F8] text-left text-xs uppercase tracking-wider text-[#5B6C7D]"><tr><th className="px-4 py-2">Karyawan</th><th className="px-4 py-2">Periode</th><th className="px-4 py-2 text-right">Pokok</th><th className="px-4 py-2 text-right">Tunjangan</th><th className="px-4 py-2 text-right">Potongan</th><th className="px-4 py-2 text-right">Bersih</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
                  <tbody className="divide-y">
                    {payroll.data!.map((p) => (
                      <tr key={p.id} data-testid={`payroll-row-${p.id}`}>
                        <td className="px-4 py-2.5 font-medium">{p.employee_name}</td>
                        <td className="px-4 py-2.5">{p.period}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{rp(p.base_salary)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{rp(p.allowance)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{rp(p.deduction)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">{rp(p.net)}</td>
                        <td className="px-4 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", PR_STYLE[p.status])}>{PR_LABEL[p.status]}</span>{p.paid_at && <div className="text-xs text-muted-foreground">{fmtDate(p.paid_at, false)}</div>}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right">
                          {p.status === "belum_dibayar" && <Button size="sm" data-testid={`payroll-pay-${p.id}`} onClick={() => { setPayFor(p); setPayMethod("tunai"); }}>Bayar</Button>}
                          {p.status !== "dibatalkan" && <Button size="icon-sm" variant="ghost" aria-label="Ubah" data-testid={`payroll-edit-${p.id}`} onClick={() => setPr({ id: p.id, employee_id: p.employee_id, period: p.period, base_salary: p.base_salary, allowance: p.allowance, deduction: p.deduction, note: p.note })}><Pencil className="size-3.5" /></Button>}
                          <Button size="icon-sm" variant="ghost" aria-label="Hapus" className="text-destructive" data-testid={`payroll-delete-${p.id}`} onClick={() => setCancelFor(p)}><Trash2 className="size-3.5" /></Button>
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

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent data-testid="employee-dialog">
          <DialogHeader><DialogTitle>{edit?.id ? "Ubah karyawan" : "Karyawan baru"}</DialogTitle></DialogHeader>
          {f && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama *" className="col-span-2"><Input data-testid="employee-name-input" value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Jabatan *"><Input data-testid="employee-position-input" value={f.position} onChange={(e) => set({ position: e.target.value })} /></Field>
              <Field label="No. HP"><Input data-testid="employee-phone-input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
              <Field label="Status"><NativeSelect data-testid="employee-status-select" value={f.status} onChange={(e) => set({ status: e.target.value as EmployeeIn["status"] })}><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option></NativeSelect></Field>
              <Field label="Skema gaji"><NativeSelect data-testid="employee-scheme-select" value={f.salary_scheme} onChange={(e) => set({ salary_scheme: e.target.value as EmployeeIn["salary_scheme"] })}><option value="bulanan">Bulanan</option><option value="mingguan">Mingguan</option><option value="harian">Harian</option></NativeSelect></Field>
              <Field label="Gaji pokok (Rp)"><Input data-testid="employee-salary-input" inputMode="numeric" value={String(f.base_salary)} onChange={(e) => set({ base_salary: int(e.target.value) })} className="font-mono" /></Field>
              <Field label="Tunjangan tetap (Rp)"><Input data-testid="employee-allowance-input" inputMode="numeric" value={String(f.allowance)} onChange={(e) => set({ allowance: int(e.target.value) })} className="font-mono" /></Field>
              <Field label="Tanggal masuk" className="col-span-2"><Input type="date" data-testid="employee-join-input" value={f.join_date} onChange={(e) => set({ join_date: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter className="gap-2">
            {edit?.id && <Button variant="ghost" className="text-destructive" data-testid="employee-delete-button" onClick={() => setDelEmpOpen(true)}>Hapus</Button>}
            <Button data-testid="employee-save-button" disabled={!f?.name.trim() || !f?.position.trim() || saveEmp.isPending} onClick={() => saveEmp.mutate()}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pr} onOpenChange={(o) => !o && setPr(null)}>
        <DialogContent data-testid="payroll-dialog">
          <DialogHeader><DialogTitle>{pr?.id ? "Ubah slip gaji" : "Slip gaji baru"}</DialogTitle>{pr?.id && <DialogDescription>Jika slip sudah dibayar, pengeluaran gaji terkait ikut disesuaikan.</DialogDescription>}</DialogHeader>
          {pr && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Karyawan" className="col-span-2">
                <NativeSelect data-testid="payroll-employee-select" disabled={!!pr.id} value={pr.employee_id} onChange={(e) => { const emp = active.find((x) => x.id === e.target.value); setPr({ ...pr, employee_id: e.target.value, base_salary: emp?.base_salary ?? 0, allowance: emp?.allowance ?? 0 }); }}>
                  {(pr.id ? (emps.data ?? []).filter((e) => e.id === pr.employee_id) : active).map((e) => <option key={e.id} value={e.id}>{`${e.name} — ${e.position}`}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Periode" hint="mis. 2026-01 atau 2026-01 Minggu 2" className="col-span-2"><Input data-testid="payroll-period-input" value={pr.period} onChange={(e) => setPr({ ...pr, period: e.target.value })} /></Field>
              <Field label="Gaji pokok"><Input data-testid="payroll-base-input" inputMode="numeric" value={String(pr.base_salary)} onChange={(e) => setPr({ ...pr, base_salary: int(e.target.value) })} className="font-mono" /></Field>
              <Field label="Tunjangan"><Input data-testid="payroll-allowance-input" inputMode="numeric" value={String(pr.allowance)} onChange={(e) => setPr({ ...pr, allowance: int(e.target.value) })} className="font-mono" /></Field>
              <Field label="Potongan"><Input data-testid="payroll-deduction-input" inputMode="numeric" value={String(pr.deduction)} onChange={(e) => setPr({ ...pr, deduction: int(e.target.value) })} className="font-mono" /></Field>
              <Field label="Gaji bersih"><div className="flex h-10 items-center font-mono text-lg font-semibold" data-testid="payroll-net">{rp(pr.base_salary + pr.allowance - pr.deduction)}</div></Field>
              <Field label="Catatan" className="col-span-2"><Input data-testid="payroll-note-input" value={pr.note} onChange={(e) => setPr({ ...pr, note: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter><Button data-testid="payroll-save-button" disabled={!pr?.employee_id || (pr?.period.trim().length ?? 0) < 3 || savePr.isPending} onClick={() => savePr.mutate()}>Simpan slip</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent data-testid="payroll-pay-dialog">
          <DialogHeader><DialogTitle>Bayar gaji</DialogTitle><DialogDescription>{payFor?.employee_name} · {payFor?.period} · <b>{rp(payFor?.net ?? 0)}</b>. Akan dicatat sebagai pengeluaran gaji hari ini.</DialogDescription></DialogHeader>
          <Field label="Metode"><NativeSelect data-testid="payroll-pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PayMethod)}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
          <DialogFooter><Button data-testid="payroll-pay-confirm" disabled={pay.isPending} onClick={() => pay.mutate()}>Konfirmasi bayar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ReasonDialog testId="payroll-cancel-dialog" open={!!cancelFor} onOpenChange={(o) => !o && setCancelFor(null)} title="Hapus slip gaji"
        description={cancelFor?.status === "dibayar" ? "Slip dan pengeluaran gaji terkait akan dihapus. Salinannya disimpan di jejak audit." : "Slip akan dihapus. Salinannya disimpan di jejak audit."} confirmLabel="Hapus slip" pending={cancel.isPending} onConfirm={(r) => cancel.mutate(r)} />
      <ConfirmDialog testId="employee-delete-dialog" open={delEmpOpen} onOpenChange={setDelEmpOpen} title="Hapus karyawan ini?"
        description="Jika karyawan punya riwayat gaji, data hanya dinonaktifkan agar riwayat tetap ada." confirmLabel="Hapus" pending={delEmp.isPending}
        onConfirm={() => edit?.id && delEmp.mutate(edit.id, { onSettled: () => setDelEmpOpen(false) })} />
    </div>
  );
}
