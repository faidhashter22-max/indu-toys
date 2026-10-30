-- =========================================================
-- Indu Toys — skema database Supabase
-- Jalankan sekali di: Supabase Dashboard → SQL Editor → New query → Run
-- Aman dijalankan ulang (idempotent).
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- PROFIL & PERAN STAF ----------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'pending' check (role in ('pending', 'kasir', 'admin')),
  created_at timestamptz not null default now()
);

-- ---------- PRODUK ----------
create table if not exists public.products (
  id          text primary key default 'P' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  name        text not null check (length(trim(name)) > 0),
  category    text not null default 'Lainnya',
  age         text not null default '3-5 tahun',
  price       integer not null default 0 check (price >= 0),
  stock       integer not null default 0 check (stock >= 0),
  image       text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists products_name_key on public.products (lower(name));

-- ---------- TRANSAKSI ----------
create table if not exists public.transactions (
  id            text primary key,
  created_at    timestamptz not null default now(),
  items         jsonb not null,
  total         integer not null check (total >= 0),
  method        text not null check (method in ('Tunai', 'Transfer Bank', 'QRIS')),
  paid          integer not null,
  change_amount integer not null default 0,
  cashier_id    uuid references auth.users (id) on delete set null,
  cashier_name  text
);
create index if not exists transactions_created_at_idx on public.transactions (created_at desc);
create index if not exists transactions_cashier_idx on public.transactions (cashier_id);

-- ---------- PENGATURAN TOKO (satu baris) ----------
create table if not exists public.settings (
  id         integer primary key default 1 check (id = 1),
  store_name text not null default 'Indu Toys',
  wa         text not null default '6281234567890',
  address    text default 'Jl. Ceria No. 1, Indonesia',
  bank       text default 'BCA 1234567890 a.n. Indu Toys',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- FUNGSI PERAN ----------
-- Di schema "private" agar tidak bisa dipanggil lewat REST API, tapi tetap dipakai oleh RLS.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.app_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.app_role() in ('kasir', 'admin'), false)
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.app_role() = 'admin', false)
$$;

-- Pengguna pertama otomatis menjadi admin; berikutnya 'pending' sampai diberi peran oleh admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, full_name, role)
  values (
    new.id, new.email, new.raw_user_meta_data ->> 'full_name',
    case when exists (select 1 from public.profiles where role = 'admin') then 'pending' else 'admin' end
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pengguna yang sudah ada sebelum skema ini dijalankan
insert into public.profiles (user_id, email, role)
select id, email,
       case when row_number() over (order by created_at) = 1
             and not exists (select 1 from public.profiles where role = 'admin')
            then 'admin' else 'pending' end
from auth.users
on conflict (user_id) do nothing;

-- ---------- TRANSAKSI KASIR (atomik: cek stok, kurangi stok, simpan nota) ----------
create or replace function public.process_sale(p_items jsonb, p_method text, p_paid integer)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_item  jsonb;
  v_prod  public.products%rowtype;
  v_qty   integer;
  v_total integer := 0;
  v_lines jsonb := '[]'::jsonb;
  v_now   timestamptz := now();
  v_name  text;
  v_tx    public.transactions%rowtype;
begin
  if not private.is_staff() then
    raise exception 'Akses ditolak: hanya kasir atau admin yang bisa memproses transaksi.' using errcode = '42501';
  end if;
  if p_method not in ('Tunai', 'Transfer Bank', 'QRIS') then
    raise exception 'Metode pembayaran tidak dikenal.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kasir kosong.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Jumlah barang tidak valid.';
    end if;
    select * into v_prod from public.products where id = v_item ->> 'id' for update;
    if not found then
      raise exception 'Produk % tidak ditemukan.', v_item ->> 'id';
    end if;
    if v_prod.stock < v_qty then
      raise exception 'Stok % tidak cukup (tersisa %, diminta %).', v_prod.name, v_prod.stock, v_qty;
    end if;
    update public.products set stock = stock - v_qty, updated_at = v_now where id = v_prod.id;
    v_total := v_total + v_prod.price * v_qty;
    v_lines := v_lines || jsonb_build_object('id', v_prod.id, 'name', v_prod.name, 'price', v_prod.price, 'qty', v_qty);
  end loop;

  if p_method = 'Tunai' and coalesce(p_paid, 0) < v_total then
    raise exception 'Uang diterima kurang Rp%.', v_total - coalesce(p_paid, 0);
  end if;

  select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where user_id = auth.uid();

  insert into public.transactions (id, created_at, items, total, method, paid, change_amount, cashier_id, cashier_name)
  values (
    'INV-' || to_char(v_now at time zone 'Asia/Makassar', 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 3)),
    v_now, v_lines, v_total, p_method,
    case when p_method = 'Tunai' then p_paid else v_total end,
    case when p_method = 'Tunai' then p_paid - v_total else 0 end,
    auth.uid(), v_name
  )
  returning * into v_tx;
  return v_tx;
end $$;

-- ---------- PENYESUAIAN STOK CEPAT (admin) ----------
create or replace function public.adjust_stock(p_id text, p_delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_stock integer;
begin
  if not private.is_admin() then
    raise exception 'Akses ditolak: hanya admin.' using errcode = '42501';
  end if;
  update public.products set stock = greatest(0, stock + p_delta), updated_at = now()
  where id = p_id returning stock into v_stock;
  return v_stock;
end $$;

revoke execute on function public.process_sale(jsonb, text, integer) from public, anon;
revoke execute on function public.adjust_stock(text, integer) from public, anon;
grant execute on function public.process_sale(jsonb, text, integer) to authenticated;
grant execute on function public.adjust_stock(text, integer) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles     enable row level security;
alter table public.products     enable row level security;
alter table public.transactions enable row level security;
alter table public.settings     enable row level security;

-- Produk: semua orang boleh melihat katalog; hanya admin yang mengubah
drop policy if exists "Katalog publik" on public.products;
create policy "Katalog publik" on public.products for select to anon, authenticated using (true);
drop policy if exists "Admin tambah produk" on public.products;
create policy "Admin tambah produk" on public.products for insert to authenticated with check ((select private.is_admin()));
drop policy if exists "Admin ubah produk" on public.products;
create policy "Admin ubah produk" on public.products for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "Admin hapus produk" on public.products;
create policy "Admin hapus produk" on public.products for delete to authenticated using ((select private.is_admin()));

-- Transaksi: admin melihat semua, kasir melihat miliknya; dibuat hanya lewat process_sale()
drop policy if exists "Staf lihat transaksi" on public.transactions;
create policy "Staf lihat transaksi" on public.transactions for select to authenticated
  using ((select private.is_admin()) or cashier_id = (select auth.uid()));

-- Pengaturan: publik bisa membaca (nomor WA untuk katalog); admin yang mengubah
drop policy if exists "Pengaturan publik" on public.settings;
create policy "Pengaturan publik" on public.settings for select to anon, authenticated using (true);
drop policy if exists "Admin ubah pengaturan" on public.settings;
create policy "Admin ubah pengaturan" on public.settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Profil: lihat milik sendiri; admin melihat & mengubah peran semua staf
drop policy if exists "Lihat profil" on public.profiles;
create policy "Lihat profil" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
drop policy if exists "Admin ubah peran" on public.profiles;
create policy "Admin ubah peran" on public.profiles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------- REALTIME (stok langsung ter-update di semua perangkat) ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'products') then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;

-- ---------- STORAGE GAMBAR PRODUK ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Admin unggah gambar" on storage.objects;
create policy "Admin unggah gambar" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select private.is_admin()));
drop policy if exists "Admin ubah gambar" on storage.objects;
create policy "Admin ubah gambar" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()));
drop policy if exists "Admin hapus gambar" on storage.objects;
create policy "Admin hapus gambar" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()));

-- ---------- DATA AWAL PRODUK ----------
insert into public.products (id, name, category, age, price, stock, image, description) values
  ('P1001', 'Balok Susun Kayu Pelangi', 'Edukatif', '0-2 tahun', 89000, 24, 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=600&q=70', 'Balok kayu warna-warni untuk melatih motorik dan mengenal warna.'),
  ('P1002', 'Boneka Teddy Bear Lembut', 'Boneka', '0-2 tahun', 125000, 15, 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=600&q=70', 'Teddy bear super lembut, aman untuk bayi, bisa dicuci.'),
  ('P1003', 'Mobil Balap Remote Control', 'Kendaraan', '6-8 tahun', 249000, 4, 'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=600&q=70', 'Mobil RC lincah dengan baterai isi ulang, jangkauan 30 meter.'),
  ('P1004', 'Puzzle Peta Indonesia 100 pcs', 'Puzzle', '6-8 tahun', 65000, 30, 'https://images.unsplash.com/photo-1606503153255-59d8b8b82176?auto=format&fit=crop&w=600&q=70', 'Belajar provinsi dan pulau Indonesia sambil bermain.'),
  ('P1005', 'Set Bricks Kota Kreatif 500 pcs', 'Konstruksi', '9+ tahun', 359000, 8, 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=600&q=70', 'Bangun kota impian dengan 500 keping bricks kompatibel.'),
  ('P1006', 'Kereta Api Kayu & Rel', 'Kendaraan', '3-5 tahun', 175000, 3, 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=600&q=70', 'Set kereta kayu lengkap dengan 20 potong rel.'),
  ('P1007', 'Kubus Rubik 3x3 Speed', 'Edukatif', '9+ tahun', 45000, 40, 'https://images.unsplash.com/photo-1591991731833-b4807cf7ef94?auto=format&fit=crop&w=600&q=70', 'Rubik putaran halus untuk melatih logika dan kesabaran.'),
  ('P1008', 'Mainan Dapur-dapuran Mini', 'Peran', '3-5 tahun', 199000, 10, 'https://images.unsplash.com/photo-1608889175123-8ee362201f81?auto=format&fit=crop&w=600&q=70', 'Set dapur mini lengkap dengan alat masak dan sayuran mainan.'),
  ('P1009', 'Gelang Bunyi Bayi (Rattle)', 'Bayi', '0-2 tahun', 39000, 2, 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=70', 'Rattle warna cerah, BPA free, merangsang pendengaran bayi.'),
  ('P1010', 'Bola Sepak Anak Ukuran 3', 'Outdoor', '6-8 tahun', 79000, 18, 'https://images.unsplash.com/photo-1614632537197-38a17061c2bd?auto=format&fit=crop&w=600&q=70', 'Bola ringan dan empuk untuk latihan si kecil.')
on conflict (id) do nothing;
