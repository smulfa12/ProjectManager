-- =============================================================
--  Project Manager — Migrasi 008: daftar PIC Bank per client
--   pm_clients.pic_list = [{ "name": "...", "position": "...", "email": "...", "phone": "..." }]
--   (kolom lama pm_clients.pic tetap diisi PIC pertama)
--
--  Jalankan SEKALI di Supabase: SQL Editor → New query → paste → Run. Aman dijalankan ulang.
-- =============================================================
alter table public.pm_clients add column if not exists pic_list jsonb not null default '[]';

-- pindahkan PIC lama (satu nama) ke daftar
update public.pm_clients
set pic_list = jsonb_build_array(jsonb_build_object('name', pic, 'position', '', 'email', '', 'phone', ''))
where coalesce(pic, '') <> '' and pic_list = '[]'::jsonb;

notify pgrst, 'reload schema';
