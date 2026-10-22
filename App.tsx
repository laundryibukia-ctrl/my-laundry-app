import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import OrderNew from "@/pages/OrderNew";
import OrderDetail from "@/pages/OrderDetail";
import ReceiptPrint from "@/pages/ReceiptPrint";
import Customers from "@/pages/Customers";
import Services from "@/pages/Services";
import Inventory from "@/pages/Inventory";
import Employees from "@/pages/Employees";
import Finance from "@/pages/Finance";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/nota/:id" element={<ReceiptPrint />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pesanan" element={<Orders />} />
          <Route path="/pesanan/baru" element={<OrderNew />} />
          <Route path="/pesanan/:id" element={<OrderDetail />} />
          <Route path="/pelanggan" element={<Customers />} />
          <Route path="/layanan" element={<Services />} />
          <Route path="/persediaan" element={<Inventory />} />
          <Route path="/karyawan" element={<Employees />} />
          <Route path="/keuangan" element={<Finance />} />
          <Route path="/laporan" element={<Reports />} />
          <Route path="/pengaturan" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors />
    </>
  );
}
