"""Pydantic v2 models. Every one has a hand-written mirror in frontend/src/lib/types.ts.
Money is always whole rupiah (int); quantities (kg/pcs) may be fractional."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

OrderStatus = Literal["diterima", "diproses", "siap_diambil", "selesai", "dibatalkan"]
PayMethod = Literal["tunai", "transfer", "qris", "ewallet"]
PaymentStatus = Literal["belum_bayar", "sebagian", "lunas"]
ServiceCategory = Literal["kiloan", "satuan", "express"]
InventoryCategory = Literal["deterjen", "pewangi", "pelembut", "perlengkapan", "lainnya"]
ExpenseCategory = Literal["operasional", "listrik_air", "sewa", "transportasi", "perawatan", "pembelian_stok", "gaji", "lainnya"]

Money = Field(default=0, ge=0, le=1_000_000_000)


# ---------- auth ----------
class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- customers ----------
class CustomerIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(default="", max_length=20)
    address: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=500)


class Customer(CustomerIn):
    id: str
    created_at: datetime
    updated_at: datetime
    order_count: int = 0
    total_spent: int = 0
    outstanding: int = 0


# ---------- services ----------
class ServiceIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: ServiceCategory
    unit: str = Field(min_length=1, max_length=20)
    price: int = Money
    min_qty: float = Field(default=0, ge=0, le=1000)
    est_hours: int = Field(default=48, ge=1, le=720)
    description: str = Field(default="", max_length=300)
    active: bool = True


class Service(ServiceIn):
    id: str
    created_at: datetime
    updated_at: datetime


# ---------- orders & payments ----------
class OrderItemIn(BaseModel):
    service_id: str
    qty: float = Field(gt=0, le=1000)
    note: str = Field(default="", max_length=200)


class OrderItem(BaseModel):
    id: str
    order_id: str
    service_id: str
    service_name: str
    category: str
    unit: str
    unit_price: int
    qty: float
    billed_qty: float
    subtotal: int
    note: str = ""


class InitialPayment(BaseModel):
    amount: int = Field(gt=0, le=1_000_000_000)
    method: PayMethod


class OrderCreate(BaseModel):
    client_ref: str = Field(min_length=8, max_length=64)
    customer_id: Optional[str] = None
    new_customer: Optional[CustomerIn] = None
    items: list[OrderItemIn] = Field(min_length=1, max_length=50)
    extra_fee: int = Money
    extra_fee_note: str = Field(default="", max_length=100)
    discount: int = Money
    notes: str = Field(default="", max_length=500)
    due_at: Optional[datetime] = None
    payment: Optional[InitialPayment] = None


class OrderUpdate(BaseModel):
    notes: str = Field(default="", max_length=500)
    due_at: Optional[datetime] = None


class StatusEvent(BaseModel):
    status: OrderStatus
    at: datetime
    note: str = ""


class StatusIn(BaseModel):
    status: OrderStatus
    note: str = Field(default="", max_length=200)


class Order(BaseModel):
    id: str
    nota_no: str
    customer_id: str
    customer_name: str
    customer_phone: str
    subtotal: int
    extra_fee: int
    extra_fee_note: str = ""
    discount: int
    total: int
    paid: int
    balance: int
    payment_status: PaymentStatus
    status: OrderStatus
    status_history: list[StatusEvent] = []
    notes: str = ""
    due_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItem] = []


class OrderList(BaseModel):
    items: list[Order]
    total: int


class PaymentIn(BaseModel):
    amount: int = Field(gt=0, le=1_000_000_000)
    method: PayMethod
    note: str = Field(default="", max_length=200)
    client_ref: str = Field(min_length=8, max_length=64)


class Payment(BaseModel):
    id: str
    order_id: str
    nota_no: str
    customer_name: str = ""
    amount: int
    method: PayMethod
    kind: Literal["dp", "cicilan", "pelunasan"]
    note: str = ""
    voided: bool = False
    void_reason: str = ""
    voided_at: Optional[datetime] = None
    created_at: datetime


class OrderDetail(Order):
    payments: list[Payment] = []


class VoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=200)


class CustomerDeleteIn(BaseModel):
    reason: str = Field(min_length=3, max_length=200)
    delete_orders: bool = False


class DeleteResult(BaseModel):
    ok: bool
    orders_deleted: int = 0
    payments_deleted: int = 0


# ---------- inventory ----------
class InventoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: InventoryCategory
    unit: str = Field(min_length=1, max_length=20)
    min_qty: float = Field(default=0, ge=0, le=100000)
    buy_price: int = Money


class InventoryCreate(InventoryIn):
    initial_qty: float = Field(default=0, ge=0, le=100000)


class InventoryItem(InventoryIn):
    id: str
    qty: float
    low: bool
    active: bool = True
    created_at: datetime
    updated_at: datetime


class StockMoveIn(BaseModel):
    type: Literal["masuk", "keluar", "penyesuaian"]
    qty: float = Field(ge=0, le=100000)  # penyesuaian: the counted stock level
    unit_cost: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    record_expense: bool = True
    method: PayMethod = "tunai"
    note: str = Field(default="", max_length=200)


class StockMovement(BaseModel):
    id: str
    item_id: str
    item_name: str
    unit: str
    type: Literal["saldo_awal", "masuk", "keluar", "penyesuaian"]
    qty: float
    qty_after: float
    unit_cost: int
    total_cost: int
    note: str = ""
    expense_id: Optional[str] = None
    created_at: datetime


class StockMoveEdit(BaseModel):
    qty: float = Field(gt=0, le=100000)  # absolute amount moved; sign follows the movement type
    unit_cost: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    note: str = Field(default="", max_length=200)


class PayrollEdit(BaseModel):
    period: str = Field(min_length=3, max_length=40)
    base_salary: int = Money
    allowance: int = Money
    deduction: int = Money
    note: str = Field(default="", max_length=200)


# ---------- employees & payroll ----------
class EmployeeIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    position: str = Field(min_length=1, max_length=60)
    phone: str = Field(default="", max_length=20)
    status: Literal["aktif", "nonaktif"] = "aktif"
    salary_scheme: Literal["bulanan", "mingguan", "harian"] = "bulanan"
    base_salary: int = Money
    allowance: int = Money
    join_date: str = Field(default="", max_length=10)


class Employee(EmployeeIn):
    id: str
    created_at: datetime
    updated_at: datetime


class PayrollIn(BaseModel):
    employee_id: str
    period: str = Field(min_length=3, max_length=40)
    base_salary: int = Money
    allowance: int = Money
    deduction: int = Money
    note: str = Field(default="", max_length=200)


class PayIn(BaseModel):
    method: PayMethod = "tunai"


class Payroll(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    period: str
    base_salary: int
    allowance: int
    deduction: int
    net: int
    status: Literal["belum_dibayar", "dibayar", "dibatalkan"]
    method: Optional[PayMethod] = None
    paid_at: Optional[datetime] = None
    expense_id: Optional[str] = None
    note: str = ""
    created_at: datetime


# ---------- expenses ----------
class ExpenseIn(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: ExpenseCategory
    amount: int = Field(gt=0, le=1_000_000_000)
    description: str = Field(min_length=1, max_length=200)
    method: PayMethod = "tunai"


class Expense(ExpenseIn):
    id: str
    source: Literal["manual", "stok", "gaji"]
    source_id: Optional[str] = None
    voided: bool = False
    void_reason: str = ""
    created_at: datetime


# ---------- settings / audit ----------
class SettingsIn(BaseModel):
    business_name: str = Field(min_length=1, max_length=100)
    tagline: str = Field(default="", max_length=120)
    address: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=20)
    whatsapp: str = Field(default="", max_length=20)
    email: str = Field(default="", max_length=120)
    logo: str = Field(default="", max_length=400_000)
    receipt_footer: str = Field(default="", max_length=300)
    pickup_terms: str = Field(default="", max_length=300)


class Settings(SettingsIn):
    updated_at: Optional[datetime] = None


class AuditLog(BaseModel):
    id: str
    user_email: str
    action: str
    entity: str
    entity_id: str = ""
    detail: str = ""
    created_at: datetime


class BackupFile(BaseModel):
    name: str
    size: int
    created_at: datetime


class RestoreIn(BaseModel):
    data: dict


class RestoreResult(BaseModel):
    restored: dict[str, int]
    safety_backup: str


# ---------- dashboard / reports ----------
class LowStock(BaseModel):
    id: str
    name: str
    qty: float
    min_qty: float
    unit: str


class DailyPoint(BaseModel):
    date: str
    revenue: int
    cash_in: int
    cash_out: int


class Dashboard(BaseModel):
    today: str
    orders_today: int
    orders_today_value: int
    active_orders: int
    ready_orders: int
    payments_today: int
    receivables: int
    receivable_orders: int
    low_stock: list[LowStock]
    month_revenue: int
    month_cash_in: int
    month_cash_out: int
    month_profit: int
    last7: list[DailyPoint]
    recent_orders: list[Order]
    status_counts: dict[str, int]


class ReportSummary(BaseModel):
    date_from: str
    date_to: str
    order_count: int
    cancelled_count: int
    gross_sales: int
    discounts: int
    revenue: int
    cash_in: int
    cash_in_by_method: dict[str, int]
    cash_out: int
    cash_out_by_category: dict[str, int]
    net_cash: int
    material_cost: int
    operating_expenses: int
    payroll_expense: int
    net_profit: int
    receivables_now: int
    daily: list[DailyPoint]
