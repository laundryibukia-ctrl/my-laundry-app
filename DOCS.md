# Laundry Lia Masohi — Panduan

Aplikasi manajemen laundry (PWA) untuk pemilik usaha: pesanan, pelanggan, layanan & harga, status pengerjaan, pembayaran/DP/piutang, struk (thermal 58mm, PDF A5/A4), WhatsApp, laporan keuangan, persediaan, karyawan & gaji, pengaturan, backup.

## Menjalankan
- Backend: `cd backend && uvicorn server:app --host 0.0.0.0 --port 8001 --reload`
- Frontend: `cd frontend && yarn dev` (port 3000, `/api` diproksikan ke backend)
- Data awal: `cd backend && python seed.py` (aman dijalankan berulang)
- Login awal: `owner@laundrylia.id` / `LiaMasohi2026!` — **segera ganti di Pengaturan > Akun & Keamanan**.

## Konfigurasi (`backend/.env`)
| Variabel | Fungsi |
|---|---|
| MONGO_URL, DB_NAME | Koneksi database MongoDB |
| JWT_SECRET | Kunci tanda tangan sesi login (wajib acak & rahasia) |
| APP_TZ | Zona waktu operasional, default `Asia/Jayapura` (WIT) |
| BACKUP_DIR | Folder backup otomatis harian |
| CORS_ORIGINS | Origin yang diizinkan |

Harga, minimum, estimasi waktu, dan tarif express diatur dari menu **Layanan & Harga** (tanpa ubah kode). Nota menyimpan snapshot harga, jadi perubahan tarif tidak mengubah nota lama.

## Backup & pemulihan
- Otomatis: 1 file JSON per hari di `BACKUP_DIR` (30 terakhir disimpan).
- Manual: Pengaturan > Backup > *Unduh backup sekarang* (simpan di tempat lain, mis. Google Drive).
- Pulihkan: Pengaturan > Backup > *Pulihkan dari file…*. Sistem membuat backup "sebelum-restore" terlebih dahulu. Akun login tidak ikut diganti.
- Backup database penuh (opsional, server): `mongodump --uri "$MONGO_URL" --db "$DB_NAME" --out /path/backup`.

## Integrasi
- **WhatsApp**: memakai tautan `wa.me` dengan pesan otomatis terisi dari data pesanan. Pemilik memeriksa pesan lalu menekan *Kirim* di aplikasi WhatsApp — aplikasi tidak mengklaim pesan terkirim. Untuk kirim otomatis perlu WhatsApp Business API (belum terpasang).
- **Cetak**: halaman `/nota/:id` → pilih *Thermal 58mm* lalu *Cetak* (atur printer Bluetooth/USB 58mm di dialog print browser). PDF dari backend (`/api/orders/:id/pdf?size=a5|a4`).
- **Ekspor laporan**: CSV (pemisah `;`, terbuka di Excel) dan PDF dari menu Laporan.
- **PWA**: buka di Chrome Android / Safari iPhone → *Tambahkan ke Layar Utama*.

## Dasar perhitungan
- **Pendapatan** = total nota (tidak termasuk batal) berdasarkan tanggal nota.
- **Arus kas** = pembayaran sah yang diterima (DP, cicilan, pelunasan masing-masing sekali) − pengeluaran sah.
- **Laba-rugi** = pendapatan − bahan terpakai (stok keluar × harga beli) − beban operasional − gaji. Pembelian stok hanya mengurangi kas (tidak dihitung dua kali).
- Pembayaran/pengeluaran yang salah **dibatalkan (void) dengan alasan**, tidak dihapus; semuanya tercatat di Jejak Audit.

---
Catatan teknis template (farm-ts): lihat TEMPLATE.md.
