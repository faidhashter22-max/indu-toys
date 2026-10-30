# Indu Toys 🧸

Aplikasi web toko mainan: Katalog pelanggan (order via WhatsApp), Kasir POS dengan struk PDF,
Kelola Stok (impor/ekspor CSV/Excel), dan Laporan Penjualan. Data disimpan di Supabase.

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

Impor repo ini di Vercel → Framework Preset **Other**, tanpa build command → **Deploy**.
Aplikasi berupa file statis (`index.html`, `styles.css`, `app.js`, `config.js`).

## Menjalankan lokal

Buka `index.html` langsung di browser, atau jalankan server statis apa pun, misalnya:

```bash
npx http-server -p 5500
```
