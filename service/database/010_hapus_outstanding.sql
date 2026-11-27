-- =============================================================
--  Project Manager — Migrasi 010: field "Project Outstanding" tidak dipakai lagi
--  (cukup Nama Project). Isi Project Outstanding dipindahkan ke Nama Project bila
--  Nama Project masih kosong. Kolom lama tidak dihapus (aman untuk data lama).
--
--  Jalankan SEKALI di Supabase: SQL Editor → New query → paste → Run. Aman dijalankan ulang.
-- =============================================================
update public.pm_projects
set title = outstanding, updated_at = now()
where coalesce(trim(title), '') = '' and coalesce(trim(outstanding), '') <> '';

select count(*) as project_tanpa_nama from public.pm_projects where coalesce(trim(title), '') = '';
