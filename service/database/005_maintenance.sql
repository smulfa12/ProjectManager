-- =============================================================
--  Project Manager — Migrasi 005: kontrak maintenance per client
--   contract_date      (sudah ada) = mulai kontrak
--   contract_end       = akhir kontrak
--   maintenance_price  = harga maintenance per tahun (tahun berjalan)
--   maintenance_tcv    = nilai total kontrak maintenance (TCV); 0 = dihitung otomatis
--                        dari harga per tahun × panjang kontrak
--  Pendapatan maintenance diakui merata (amortisasi) sepanjang masa kontrak.
--
--  Jalankan SEKALI di Supabase: SQL Editor → New query → paste → Run. Aman dijalankan ulang.
-- =============================================================
alter table public.pm_clients add column if not exists contract_end date;
alter table public.pm_clients add column if not exists maintenance_price numeric not null default 0;
alter table public.pm_clients add column if not exists maintenance_tcv numeric not null default 0;

alter table public.pm_clients drop constraint if exists pm_clients_contract_check;
alter table public.pm_clients add constraint pm_clients_contract_check
  check (contract_end is null or contract_date is null or contract_end >= contract_date);

notify pgrst, 'reload schema';
