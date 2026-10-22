import { useEffect, useState } from "react";
import { Copy, Download, MessageCircle, Share2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: InstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; });
}

export function InstallAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [canInstall, setCanInstall] = useState(false);
  useEffect(() => { if (open) setCanInstall(!!deferred); }, [open]);
  const standalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const text = `Aplikasi Laundry Lia Masohi: ${url}\nBuka tautan ini lalu pilih "Tambahkan ke Layar Utama" / "Instal aplikasi".`;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null; setCanInstall(false);
    if (choice.outcome === "accepted") toast.success("Aplikasi dipasang di HP ini");
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: "Laundry Lia Masohi", text, url }); } catch { /* dibatalkan */ } }
    else { await navigator.clipboard.writeText(url); toast.success("Tautan disalin"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="install-app-dialog" className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pasang & bagikan aplikasi</DialogTitle>
          <DialogDescription>Laundry Lia bisa dipasang seperti aplikasi biasa (ikon di layar utama, layar penuh) di Android dan iPhone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {standalone ? (
            <p className="rounded-lg bg-[#DCFCE7] p-3 text-[#15803D]" data-testid="install-app-installed">Aplikasi sudah terpasang di perangkat ini.</p>
          ) : canInstall ? (
            <Button data-testid="install-app-button" className="h-11 w-full gap-2" onClick={install}><Download className="size-4" /> Pasang di HP ini</Button>
          ) : null}
          <div className="rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-2 font-semibold"><Smartphone className="size-4" /> Android (Chrome)</div>
            <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground"><li>Buka tautan aplikasi di Chrome</li><li>Ketuk menu ⋮ → <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b></li></ol>
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-2 font-semibold"><Smartphone className="size-4" /> iPhone (Safari)</div>
            <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground"><li>Buka tautan aplikasi di Safari</li><li>Ketuk tombol Bagikan <Share2 className="inline size-3.5" /> → <b>Tambah ke Layar Utama</b></li></ol>
          </div>
          <div>
            <div className="mb-2 font-semibold">Kirim ke HP lain</div>
            <div className="mb-2 break-all rounded-lg bg-[#F7F9F8] px-3 py-2 font-mono text-xs" data-testid="install-app-url">{url}</div>
            <div className="grid grid-cols-3 gap-2">
              <a data-testid="install-share-whatsapp" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-2 text-xs font-semibold text-white hover:bg-[#1EBE5A]"><MessageCircle className="size-4" /> WhatsApp</a>
              <Button variant="outline" className="h-10 gap-1.5 text-xs" data-testid="install-share-native" onClick={share}><Share2 className="size-4" /> Bagikan</Button>
              <Button variant="outline" className="h-10 gap-1.5 text-xs" data-testid="install-copy-link" onClick={async () => { await navigator.clipboard.writeText(url); toast.success("Tautan disalin"); }}><Copy className="size-4" /> Salin</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Gunakan tautan versi yang sudah dipublikasikan (Deploy) agar alamatnya tetap. Di HP lain, masuk dengan akun pemilik yang sama.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
