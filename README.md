# Indu Toys 🧸

Aplikasi web toko mainan: Katalog pelanggan (order via WhatsApp), Kasir POS dengan struk PDF,
Kelola Stok (impor/ekspor CSV/Excel), dan Laporan Penjualan. Data disimpan di Supabase.

## Dua link

| Link | Untuk | Isi |
|------|-------|-----|
| `/` | Pembeli online (dibagikan ke pelanggan) | Katalog, keranjang, order via WhatsApp. Tanpa menu staf. |
| `/staff` (juga `/kasir`, `/admin`) | Kasir & admin | Login staf → Kasir/POS, Kelola Stok, Laporan. |

## Menjalankan lokal

Butuh Node.js (tanpa `npm install`):

```bash
node dev-server.js
```

Lalu buka **http://localhost:5500** (pembeli) dan **http://localhost:5500/staff** (staf).

## Setup Supabase

1. Buka proyek Supabase → **SQL Editor** → **New query**, tempel isi [`supabase/schema.sql`](supabase/schema.sql), lalu **Run**.
   Ini membuat tabel, aturan keamanan (RLS), fungsi transaksi, bucket gambar, dan 10 produk contoh.
2. **Authentication → Users → Add user → Create new user** (centang *Auto Confirm User*).
   Akun **pertama** otomatis menjadi **Admin**. Akun berikutnya berstatus *Menunggu* sampai admin
   memberi peran di aplikasi (Kelola Stok → Pengguna & Peran Staf).
3. Disarankan: **Authentication → Sign In / Providers → Email** → matikan *Allow new users to sign up*,
   supaya hanya admin yang bisa menambah akun staf.
4. Salin **Project URL** dan **Publishable key** (atau *anon* key) dari **Project Settings → API Keys**
   ke [`config.js`](config.js). Jangan pernah memakai kunci *secret* / *service_role* di sini.

## Hak akses

| Halaman            | Tanpa login | Kasir | Admin |
|--------------------|:-----------:|:-----:|:-----:|
| Katalog Mainan     | ✅ | ✅ | ✅ |
| Kasir / POS        | — | ✅ | ✅ |
| Kelola Stok        | — | — | ✅ |
| Laporan Penjualan  | — | — | ✅ |

## Deploy ke Vercel

Sudah ter-deploy di **https://indutoy-store.vercel.app** (pelanggan) dan **https://indutoy-store.vercel.app/staff** (staf).
Setiap push ke `main` otomatis di-deploy ulang. Untuk proyek baru: impor repo di Vercel → preset **Other**, tanpa build command → **Deploy**.
Link `/staff` diatur oleh `vercel.json`, jadi otomatis jalan setelah deploy.
