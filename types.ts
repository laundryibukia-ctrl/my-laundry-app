// Hand-written mirrors of backend/models/schemas.py — keep in sync when a model changes.
export type OrderStatus = "diterima" | "diproses" | "siap_diambil" | "selesai" | "dibatalkan";
export type PayMethod = "tunai" | "transfer" | "qris" | "ewallet";
export type PaymentStatus = "belum_bayar" | "sebagian" | "lunas";
export type ServiceCategory = "kiloan" | "satuan" | "express";
export type InventoryCategory = "deterjen" | "pewangi" | "pelembut" | "perlengkapan" | "lainnya";
export type ExpenseCategory =
  | "operasional" | "listrik_air" | "sewa" | "transportasi" | "perawatan" | "pembelian_stok" | "gaji" | "lainnya";

export interface UserOut { id: string; email: string; name: string; role: string }

export interface CustomerIn { name: string; phone: string; address: string; notes: string }
export interface Customer extends CustomerIn {
  id: string; created_at: string; updated_at: string;
  order_count: number; total_spent: number; outstanding: number;
}

export interface ServiceIn {
  name: string; category: ServiceCategory; unit: string; price: number;
  min_qty: number; est_hours: number; description: string; active: boolean;
}
export interface Service extends ServiceIn { id: string; created_at: string; updated_at: string }

export interface OrderItemIn { service_id: string; qty: number; note: string }
export interface OrderItem {
  id: string; order_id: string; service_id: string; service_name: string; category: string; unit: string;
  unit_price: number; qty: number; billed_qty: number; subtotal: number; note: string;
}
export interface OrderCreate {
  client_ref: string; customer_id?: string | null; new_customer?: CustomerIn | null;
  items: OrderItemIn[]; extra_fee: number; extra_fee_note: string; discount: number; notes: string;
  due_at?: string | null; payment?: { amount: number; method: PayMethod } | null;
}
export interface StatusEvent { status: OrderStatus; at: string; note: string }
export interface Order {
  id: string; nota_no: string; customer_id: string; customer_name: string; customer_phone: string;
  subtotal: number; extra_fee: number; extra_fee_note: string; discount: number; total: number;
  paid: number; balance: number; payment_status: PaymentStatus; status: OrderStatus;
  status_history: StatusEvent[]; notes: string; due_at: string | null; picked_up_at: string | null;
  created_at: string; updated_at: string; items: OrderItem[];
}
export interface OrderList { items: Order[]; total: number }
export interface Payment {
  id: string; order_id: string; nota_no: string; customer_name: string; amount: number; method: PayMethod;
  kind: "dp" | "cicilan" | "pelunasan"; note: string; voided: boolean; void_reason: string;
  voided_at: string | null; created_at: string;
}
export interface OrderDetail extends Order { payments: Payment[] }
export interface CustomerDeleteIn { reason: string; delete_orders: boolean }
export interface DeleteResult { ok: boolean; orders_deleted: number; payments_deleted: number }

export interface InventoryIn { name: string; category: InventoryCategory; unit: string; min_qty: number; buy_price: number }
export interface InventoryItem extends InventoryIn { id: string; qty: number; low: boolean; active: boolean; created_at: string; updated_at: string }
export interface StockMoveIn {
  type: "masuk" | "keluar" | "penyesuaian"; qty: number; unit_cost?: number | null;
  record_expense: boolean; method: PayMethod; note: string;
}
export interface StockMoveEdit { qty: number; unit_cost?: number | null; note: string }
export interface PayrollEdit { period: string; base_salary: number; allowance: number; deduction: number; note: string }
export interface StockMovement {
  id: string; item_id: string; item_name: string; unit: string;
  type: "saldo_awal" | "masuk" | "keluar" | "penyesuaian"; qty: number; qty_after: number;
  unit_cost: number; total_cost: number; note: string; expense_id: string | null; created_at: string;
}

export interface EmployeeIn {
  name: string; position: string; phone: string; status: "aktif" | "nonaktif";
  salary_scheme: "bulanan" | "mingguan" | "harian"; base_salary: number; allowance: number; join_date: string;
}
export interface Employee extends EmployeeIn { id: string; created_at: string; updated_at: string }
export interface PayrollIn { employee_id: string; period: string; base_salary: number; allowance: number; deduction: number; note: string }
export interface Payroll {
  id: string; employee_id: string; employee_name: string; period: string; base_salary: number; allowance: number;
  deduction: number; net: number; status: "belum_dibayar" | "dibayar" | "dibatalkan"; method: PayMethod | null;
  paid_at: string | null; expense_id: string | null; note: string; created_at: string;
}

export interface ExpenseIn { date: string; category: ExpenseCategory; amount: number; description: string; method: PayMethod }
export interface Expense extends ExpenseIn {
  id: string; source: "manual" | "stok" | "gaji"; source_id: string | null; voided: boolean; void_reason: string; created_at: string;
}

export interface SettingsIn {
  business_name: string; tagline: string; address: string; phone: string; whatsapp: string; email: string;
  logo: string; receipt_footer: string; pickup_terms: string;
}
export interface Settings extends SettingsIn { updated_at: string | null }
export interface AuditLog { id: string; user_email: string; action: string; entity: string; entity_id: string; detail: string; created_at: string }
export interface BackupFile { name: string; size: number; created_at: string }
export interface RestoreResult { restored: Record<string, number>; safety_backup: string }

export interface LowStock { id: string; name: string; qty: number; min_qty: number; unit: string }
export interface DailyPoint { date: string; revenue: number; cash_in: number; cash_out: number }
export interface Dashboard {
  today: string; orders_today: number; orders_today_value: number; active_orders: number; ready_orders: number;
  payments_today: number; receivables: number; receivable_orders: number; low_stock: LowStock[];
  month_revenue: number; month_cash_in: number; month_cash_out: number; month_profit: number;
  last7: DailyPoint[]; recent_orders: Order[]; status_counts: Record<string, number>;
}
export interface ReportSummary {
  date_from: string; date_to: string; order_count: number; cancelled_count: number; gross_sales: number;
  discounts: number; revenue: number; cash_in: number; cash_in_by_method: Record<string, number>;
  cash_out: number; cash_out_by_category: Record<string, number>; net_cash: number; material_cost: number;
  operating_expenses: number; payroll_expense: number; net_profit: number; receivables_now: number; daily: DailyPoint[];
}
