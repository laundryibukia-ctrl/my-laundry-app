import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PAY_LABEL, PAY_STYLE, STATUS_LABEL, STATUS_STYLE } from "@/lib/format";
import type { OrderStatus, PaymentStatus } from "@/lib/types";
import { Label } from "@/components/ui/label";

export function StatusBadge({ status, testId }: { status: OrderStatus; testId?: string }) {
  return (
    <span data-testid={testId ?? "order-status-badge"} className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PayBadge({ status, testId }: { status: PaymentStatus; testId?: string }) {
  return (
    <span data-testid={testId ?? "payment-status-badge"} className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", PAY_STYLE[status])}>
      {PAY_LABEL[status]}
    </span>
  );
}

export function parseDecimal(s: string): number {
  const t = s.replace(/,/g, ".");
  const i = t.indexOf(".");
  const clean = i < 0 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, "");
  return parseFloat(clean) || 0;
}

const showDecimal = (n: number) => (n ? String(n).replace(".", ",") : "");

/** Accepts both comma and dot as decimal separator (e.g. 1,5 or 1.5 kg) without fighting the cursor. */
export function DecimalInput({ value, onValueChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number; onValueChange: (n: number) => void }) {
  const [text, setText] = useState(showDecimal(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (parseDecimal(text) !== value) setText(showDecimal(value));
  }
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, "");
        const n = parseDecimal(t);
        setText(t); setLast(n); onValueChange(n);
      }}
    />
  );
}

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-3 focus:ring-brand/25 disabled:opacity-50",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-semibold text-[#5B6C7D]">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 data-testid="page-title" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className, ...rest }: { children: ReactNode; className?: string; "data-testid"?: string }) {
  return (
    <div {...rest} className={cn("rounded-xl border border-border bg-white shadow-[0_1px_3px_rgba(41,51,61,0.06),0_1px_2px_rgba(41,51,61,0.04)]", className)}>
      {children}
    </div>
  );
}

export function Empty({ text, testId }: { text: string; testId?: string }) {
  return <div data-testid={testId ?? "empty-state"} className="px-4 py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

export function Money({ value, className, testId }: { value: number; className?: string; testId?: string }) {
  return <span data-testid={testId} className={cn("font-mono tabular font-semibold tracking-tight", className)}>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value)}</span>;
}
