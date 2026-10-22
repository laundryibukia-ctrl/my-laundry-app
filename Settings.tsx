import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, HardDriveDownload, ImageUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { AuditLog, BackupFile, RestoreResult, Settings as SettingsT, SettingsIn, UserOut } from "@/lib/types";
import { errMsg, fmtDate } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, Field, PageHeader, Panel } from "@/components/bits";
import { ConfirmDialog } from "@/components/OrderDialogs";
import { cn } from "@/lib/utils";

function BusinessForm({ initial }: { initial: SettingsT }) {
  const qc = useQueryClient();
  const [f, setF] = useState<SettingsIn>(initial);
  const save = useMutation({ mutationFn: () => apiPut<SettingsT>("/settings", f), onSuccess: () => { toast.success("Pengaturan usaha disimpan"); qc.invalidateQueries({ queryKey: ["settings"] }); }, onError: (e) => toast.error(errMsg(e)) });
  const onLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 250_000) { toast.error("Ukuran logo maksimal 250 KB"); return; }
    const reader = new FileReader();
    reader.onload = () => setF((x) => ({ ...x, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  const set = (p: Partial<SettingsIn>) => setF({ ...f, ...p });
  return (
    <Panel className="p-5" data-testid="business-settings-form">
      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="grid size-32 place-items-center overflow-hidden rounded-xl border bg-[#F7F9F8]">
            {f.logo ? <img src={f.logo} alt="logo" className="max-h-full max-w-full object-contain" data-testid="logo-preview" /> : <span className="text-xs text-muted-foreground">Belum ada logo</span>}
          </div>
          <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer gap-1")} data-testid="logo-upload-label">
            <ImageUp className="size-3.5" /> Unggah logo
            <input type="file" accept="image/*" className="hidden" data-testid="logo-upload-input" onChange={(e) => onLogo(e.target.files?.[0])} />
          </label>
          {f.logo && <Button size="xs" variant="ghost" onClick={() => set({ logo: "" })} data-testid="logo-remove-button">Hapus logo</Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama usaha *"><Input data-testid="settings-name-input" value={f.business_name} onChange={(e) => set({ business_name: e.target.value })} /></Field>
          <Field label="Slogan"><Input data-testid="settings-tagline-input" value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
          <Field label="Alamat" className="sm:col-span-2"><Input data-testid="settings-address-input" value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="Telepon"><Input data-testid="settings-phone-input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="WhatsApp usaha"><Input data-testid="settings-wa-input" value={f.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} /></Field>
          <Field label="Email usaha" className="sm:col-span-2"><Input data-testid="settings-email-input" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Ketentuan pengambilan (di struk)" className="sm:col-span-2"><Textarea data-testid="settings-terms-input" rows={2} value={f.pickup_terms} onChange={(e) => set({ pickup_terms: e.target.value })} /></Field>
          <Field label="Pesan penutup struk" className="sm:col-span-2"><Input data-testid="settings-footer-input" value={f.receipt_footer} onChange={(e) => set({ receipt_footer: e.target.value })} /></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Tarif layanan diatur di menu <b>Layanan & Harga</b>.</p>
          <div className="sm:col-span-2"><Button data-testid="settings-save-button" disabled={!f.business_name.trim() || save.isPending} onClick={() => save.mutate()}>Simpan pengaturan</Button></div>
        </div>
      </div>
    </Panel>
  );
}

function AccountForm() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<UserOut>("/auth/me") });
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const p = profile ?? (me.data ? { name: me.data.name, email: me.data.email } : { name: "", email: "" });
  const saveProfile = useMutation({ mutationFn: () => apiPut<UserOut>("/auth/profile", p), onSuccess: () => { toast.success("Profil disimpan"); setProfile(null); qc.invalidateQueries({ queryKey: ["me"] }); }, onError: (e) => toast.error(errMsg(e)) });
  const savePw = useMutation({ mutationFn: () => apiPost("/auth/change-password", { current_password: pw.current_password, new_password: pw.new_password }), onSuccess: () => { toast.success("Kata sandi diganti. Perangkat lain otomatis keluar."); setPw({ current_password: "", new_password: "", confirm: "" }); }, onError: (e) => toast.error(errMsg(e)) });
  const pwErr = pw.new_password && pw.new_password.length < 8 ? "Minimal 8 karakter" : pw.confirm && pw.confirm !== pw.new_password ? "Konfirmasi tidak sama" : "";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="space-y-3 p-5" data-testid="profile-form">
        <h2 className="font-bold">Profil pemilik</h2>
        <Field label="Nama"><Input data-testid="profile-name-input" value={p.name} onChange={(e) => setProfile({ ...p, name: e.target.value })} /></Field>
        <Field label="Email login"><Input data-testid="profile-email-input" type="email" value={p.email} onChange={(e) => setProfile({ ...p, email: e.target.value })} /></Field>
        <Button data-testid="profile-save-button" disabled={!profile || saveProfile.isPending} onClick={() => saveProfile.mutate()}>Simpan profil</Button>
      </Panel>
      <Panel className="space-y-3 p-5" data-testid="password-form">
        <h2 className="font-bold">Ganti kata sandi</h2>
        <Field label="Kata sandi saat ini"><Input data-testid="current-password-input" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
        <Field label="Kata sandi baru"><Input data-testid="new-password-input" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
        <Field label="Ulangi kata sandi baru"><Input data-testid="confirm-password-input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        {pwErr && <p className="text-sm text-destructive">{pwErr}</p>}
        <Button data-testid="password-save-button" disabled={!pw.current_password || !pw.new_password || !!pwErr || pw.confirm !== pw.new_password || savePw.isPending} onClick={() => savePw.mutate()}>Ganti kata sandi</Button>
        <p className="text-xs text-muted-foreground">Kata sandi disimpan dalam bentuk hash (bcrypt). Login dibatasi 5 percobaan gagal per 15 menit.</p>
      </Panel>
    </div>
  );
}

function BackupPanel() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const files = useQuery({ queryKey: ["backups"], queryFn: () => apiGet<BackupFile[]>("/backup/files") });
  const run = useMutation({ mutationFn: () => apiPost<BackupFile>("/backup/run"), onSuccess: (f) => { toast.success(`Backup dibuat: ${f.name}`); qc.invalidateQueries({ queryKey: ["backups"] }); }, onError: (e) => toast.error(errMsg(e)) });
  const restore = useMutation({
    mutationFn: (data: unknown) => apiPost<RestoreResult>("/backup/restore", { data }),
    onSuccess: (r) => { toast.success(`Data dipulihkan. Cadangan sebelum pemulihan: ${r.safety_backup}`); qc.invalidateQueries(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [pendingRestore, setPendingRestore] = useState<unknown>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPendingRestore(JSON.parse(await file.text()));
    } catch { toast.error("File backup tidak valid"); }
    if (fileRef.current) fileRef.current.value = "";
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <ConfirmDialog testId="restore-confirm-dialog" open={pendingRestore !== null} onOpenChange={(o) => !o && setPendingRestore(null)} title="Pulihkan data dari file ini?"
        description="Semua data saat ini akan diganti dengan isi file backup. Cadangan otomatis dibuat lebih dulu." confirmLabel="Pulihkan" pending={restore.isPending}
        onConfirm={() => { restore.mutate(pendingRestore); setPendingRestore(null); }} />
      <Panel className="space-y-3 p-5">
        <h2 className="font-bold">Cadangkan & pulihkan</h2>
        <p className="text-sm text-muted-foreground">Backup otomatis dibuat setiap hari di server (30 file terakhir disimpan). Unduh salinan secara berkala dan simpan di tempat aman (Google Drive / laptop).</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/backup/download" data-testid="backup-download-button" className={cn(buttonVariants(), "gap-2")}><Download className="size-4" /> Unduh backup sekarang</a>
          <Button variant="outline" className="gap-2" data-testid="backup-run-button" disabled={run.isPending} onClick={() => run.mutate()}><HardDriveDownload className="size-4" /> Simpan di server</Button>
        </div>
        <div className="border-t pt-3">
          <div className="mb-1 font-semibold">Kode sumber aplikasi</div>
          <p className="mb-2 text-xs text-muted-foreground">Seluruh kode aplikasi untuk disalin atau dipasang di server lain. File rahasia (.env) tidak disertakan; lihat contoh .env.example di dalamnya.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/source/zip" data-testid="source-zip-download" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}><Download className="size-4" /> Kode (ZIP)</a>
            <a href="/api/source/txt" data-testid="source-txt-download" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}><Download className="size-4" /> Kode (satu file .txt)</a>
          </div>
        </div>
        <div className="border-t pt-3">
          <Button variant="outline" className="gap-2" data-testid="restore-button" disabled={restore.isPending} onClick={() => fileRef.current?.click()}><Upload className="size-4" /> Pulihkan dari file…</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="restore-file-input" onChange={(e) => onFile(e.target.files?.[0])} />
          <p className="mt-2 text-xs text-muted-foreground">Akun login tidak ikut diganti saat pemulihan.</p>
        </div>
      </Panel>
      <Panel>
        <div className="border-b px-4 py-3 font-bold">Backup di server</div>
        {(files.data ?? []).length === 0 ? <Empty text="Belum ada file backup" /> : (
          <ul className="max-h-96 divide-y overflow-y-auto" data-testid="backup-files-list">
            {files.data!.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate font-mono text-xs">{f.name}</div><div className="text-xs text-muted-foreground">{fmtDate(f.created_at)} · {(f.size / 1024).toFixed(1)} KB</div></div>
                <a href={`/api/backup/files/${f.name}`} className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid={`backup-file-download-${f.name}`}>Unduh</a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function AuditPanel() {
  const logs = useQuery({ queryKey: ["audit"], queryFn: () => apiGet<AuditLog[]>("/audit-logs?limit=300") });
  return (
    <Panel>
      {(logs.data ?? []).length === 0 ? <Empty text="Belum ada catatan" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="audit-table">
            <thead className="bg-[#F7F9F8] text-left text-xs uppercase tracking-wider text-[#5B6C7D]"><tr><th className="px-4 py-2">Waktu</th><th className="px-4 py-2">Aksi</th><th className="px-4 py-2">Data</th><th className="px-4 py-2">Detail</th></tr></thead>
            <tbody className="divide-y">
              {logs.data!.map((l) => (
                <tr key={l.id}><td className="whitespace-nowrap px-4 py-2 text-xs">{fmtDate(l.created_at)}</td><td className="px-4 py-2 font-medium">{l.action}</td><td className="px-4 py-2">{l.entity}</td><td className="px-4 py-2 text-xs text-muted-foreground">{l.detail}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default function Settings() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<SettingsT>("/settings") });
  return (
    <div>
      <PageHeader title="Pengaturan" subtitle="Profil usaha, akun, pencadangan data, dan jejak audit" />
      <Tabs defaultValue="usaha">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="usaha" data-testid="settings-tab-business">Usaha</TabsTrigger>
          <TabsTrigger value="akun" data-testid="settings-tab-account">Akun & Keamanan</TabsTrigger>
          <TabsTrigger value="backup" data-testid="settings-tab-backup">Backup</TabsTrigger>
          <TabsTrigger value="audit" data-testid="settings-tab-audit">Jejak Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="usaha">{settings.data ? <BusinessForm key={settings.data.updated_at ?? "x"} initial={settings.data} /> : <Panel><Empty text={settings.isError ? "Gagal memuat" : "Memuat…"} /></Panel>}</TabsContent>
        <TabsContent value="akun"><AccountForm /></TabsContent>
        <TabsContent value="backup"><BackupPanel /></TabsContent>
        <TabsContent value="audit"><AuditPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
