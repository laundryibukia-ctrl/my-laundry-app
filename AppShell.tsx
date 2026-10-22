import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3, Boxes, LayoutDashboard, LogOut, Menu, Plus, Search, Settings as SettingsIcon, Shirt, Smartphone, Tags, Users, UserCog, Wallet, X,
} from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import { endSession } from "@/lib/session";
import type { OrderList, UserOut } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/bits";
import { InstallAppDialog } from "@/components/InstallApp";
import { fmtDate, rp } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { group: "Operasional", items: [
    { to: "/", label: "Beranda", icon: LayoutDashboard, id: "dashboard" },
    { to: "/pesanan", label: "Pesanan", icon: Shirt, id: "orders" },
    { to: "/pelanggan", label: "Pelanggan", icon: Users, id: "customers" },
  ] },
  { group: "Keuangan", items: [
    { to: "/keuangan", label: "Kas & Piutang", icon: Wallet, id: "finance" },
    { to: "/laporan", label: "Laporan", icon: BarChart3, id: "reports" },
  ] },
  { group: "Manajemen", items: [
    { to: "/persediaan", label: "Persediaan", icon: Boxes, id: "inventory" },
    { to: "/karyawan", label: "Karyawan & Gaji", icon: UserCog, id: "employees" },
    { to: "/layanan", label: "Layanan & Harga", icon: Tags, id: "services" },
    { to: "/pengaturan", label: "Pengaturan", icon: SettingsIcon, id: "settings" },
  ] },
];

const navCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
    isActive ? "bg-[#E6FCFF] text-brand-deep" : "text-[#475569] hover:bg-muted hover:text-ink",
  );

export function SearchNotaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data, isFetching } = useQuery({
    queryKey: ["orders", "search", q],
    queryFn: () => apiGet<OrderList>(`/orders?limit=8&q=${encodeURIComponent(q)}`),
    enabled: open && q.trim().length >= 2,
  });
  const go = (id: string) => { onOpenChange(false); setQ(""); navigate(`/pesanan/${id}`); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] translate-y-0 sm:max-w-lg" data-testid="search-nota-dialog">
        <DialogHeader><DialogTitle>Cari Nota</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus data-testid="search-nota-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="No. nota, nama, atau no. HP pelanggan" className="h-11 pl-9" />
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {q.trim().length < 2 && <p className="py-6 text-center text-sm text-muted-foreground">Ketik minimal 2 karakter</p>}
          {q.trim().length >= 2 && !isFetching && data?.items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground" data-testid="search-nota-empty">Nota tidak ditemukan</p>}
          {data?.items.map((o) => (
            <button key={o.id} data-testid={`search-result-${o.nota_no}`} onClick={() => go(o.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#E6FCFF]">
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold">{o.nota_no}</div>
                <div className="truncate text-xs text-muted-foreground">{o.customer_name} · {fmtDate(o.created_at, false)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={o.status} />
                <span className="text-xs font-mono">{rp(o.total)}</span>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<UserOut>("/auth/me"), retry: false, staleTime: 60_000 });

  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />;

  const user = me.data;
  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-white lg:flex">
        <Link to="/" className="flex items-center gap-3 px-5 py-5" data-testid="brand-link">
          <img src="/icon-192.png" alt="" className="size-10 rounded-xl" />
          <div>
            <div className="text-[15px] font-bold leading-tight">Laundry Lia</div>
            <div className="text-xs text-muted-foreground">Masohi · WIT</div>
          </div>
        </Link>
        <div className="space-y-2 px-4">
          <Link to="/pesanan/baru" data-testid="sidebar-new-order-button" className={cn(buttonVariants(), "h-11 w-full justify-center gap-2 font-semibold active:scale-[0.98]")}>
            <Plus className="size-4" /> Pesanan Baru
          </Link>
          <Button variant="outline" data-testid="sidebar-search-nota-button" className="h-10 w-full justify-start gap-2 text-muted-foreground" onClick={() => setSearchOpen(true)}>
            <Search className="size-4" /> Cari nota…
          </Button>
        </div>
        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">{g.group}</div>
              <div className="space-y-0.5">
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.to === "/"} className={navCls} data-testid={`nav-${it.id}`}>
                    <it.icon className="size-4.5" /> {it.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-4 pb-2">
          <Button variant="ghost" className="w-full justify-start gap-2 text-brand-deep" data-testid="sidebar-install-app-button" onClick={() => setInstallOpen(true)}>
            <Smartphone className="size-4" /> Pasang / Bagikan Aplikasi
          </Button>
        </div>
        <div className="flex items-center justify-between border-t border-sidebar-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" data-testid="sidebar-user-name">{user?.name ?? "…"}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Keluar" data-testid="logout-button" onClick={() => endSession()}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link to="/" className="flex items-center gap-2" data-testid="mobile-brand-link">
          <img src="/icon-192.png" alt="" className="size-8 rounded-lg" />
          <span className="font-bold">Laundry Lia</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Cari nota" data-testid="mobile-search-nota-button" className="size-10" onClick={() => setSearchOpen(true)}>
            <Search className="size-4" />
          </Button>
          <Link to="/pesanan/baru" data-testid="mobile-new-order-button" className={cn(buttonVariants(), "h-10 gap-1 px-3 font-semibold")}>
            <Plus className="size-4" /> Pesanan
          </Link>
        </div>
      </header>

      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-7xl animate-fade-up">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {[NAV[0].items[0], NAV[0].items[1], NAV[0].items[2], NAV[1].items[1]].map((it) => (
            <NavLink key={it.to} to={it.to} end={it.to === "/"} data-testid={`bottom-nav-${it.id}`}
              className={({ isActive }) => cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive ? "text-brand-deep" : "text-[#64748B]")}>
              <it.icon className="size-5" /> {it.label}
            </NavLink>
          ))}
          <button data-testid="bottom-nav-menu" onClick={() => setMenuOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[#64748B]">
            <Menu className="size-5" /> Menu
          </button>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl" showCloseButton={false} data-testid="mobile-menu-sheet">
          <SheetHeader className="flex-row items-center justify-between">
            <SheetTitle>Menu</SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)} aria-label="Tutup"><X className="size-4" /></Button>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-6">
            {NAV.flatMap((g) => g.items).map((it) => (
              <NavLink key={it.to} to={it.to} end={it.to === "/"} onClick={() => setMenuOpen(false)} data-testid={`menu-${it.id}`}
                className={({ isActive }) => cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium", isActive ? "border-brand bg-[#E6FCFF] text-brand-deep" : "border-border")}>
                <it.icon className="size-5" /> {it.label}
              </NavLink>
            ))}
            <button onClick={() => { setMenuOpen(false); setInstallOpen(true); }} data-testid="mobile-install-app-button" className="flex flex-col items-center gap-1.5 rounded-xl border border-brand bg-[#E6FCFF] p-3 text-xs font-semibold text-brand-deep">
              <Smartphone className="size-5" /> Pasang Aplikasi
            </button>
            <button onClick={() => endSession()} data-testid="mobile-logout-button" className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-destructive">
              <LogOut className="size-5" /> Keluar
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <SearchNotaDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <InstallAppDialog open={installOpen} onOpenChange={setInstallOpen} />
    </div>
  );
}
