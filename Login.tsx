import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { errMsg } from "@/lib/format";
import type { UserOut } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/bits";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mut = useMutation({
    mutationFn: () => apiPost<UserOut>("/auth/login", { email, password }),
    onSuccess: () => { beginSession(); navigate("/", { replace: true }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#22C3EE] via-[#0EA5C9] to-[#0E7490] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 left-10 size-80 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="size-12 rounded-2xl ring-2 ring-white/40" />
          <div className="text-lg font-bold">Laundry Lia Masohi</div>
        </div>
        <div className="relative max-w-md">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"><Sparkles className="size-3.5" /> Bersih · Wangi · Rapi</div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Kelola pesanan, pembayaran, dan laporan laundry dalam satu tempat.</h1>
          <p className="mt-4 text-white/85">Nota otomatis, pengingat WhatsApp, stok bahan, gaji karyawan, dan arus kas — semua tercatat rapi.</p>
        </div>
        <div className="relative text-sm text-white/70">Masohi, Maluku Tengah · Waktu Indonesia Timur</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="login-form">
          <div className="flex items-center gap-3 lg:hidden">
            <img src="/icon-192.png" alt="" className="size-12 rounded-2xl" />
            <div className="text-lg font-bold">Laundry Lia Masohi</div>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Masuk Pemilik</h2>
            <p className="mt-1 text-sm text-muted-foreground">Hanya pemilik usaha yang dapat mengakses dashboard.</p>
          </div>
          <Field label="Email">
            <Input data-testid="login-email-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </Field>
          <Field label="Kata sandi">
            <Input data-testid="login-password-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </Field>
          {mut.error && <p data-testid="login-error" className="rounded-lg bg-[#FFE4E6] px-3 py-2 text-sm text-[#BE123C]">{errMsg(mut.error)}</p>}
          <Button data-testid="login-submit-button" type="submit" disabled={mut.isPending} className="h-11 w-full gap-2 font-semibold">
            <Lock className="size-4" /> {mut.isPending ? "Memeriksa…" : "Masuk"}
          </Button>
        </form>
      </div>
    </div>
  );
}
