-- =============================================================
--  Project Manager — Migrasi 003: Cost/FreeMandays boleh "Waived" atau kosong
--  Jalankan SEKALI di Supabase: SQL Editor → New query → paste → Run. Aman dijalankan ulang.
-- =============================================================
alter table public.pm_projects drop constraint if exists pm_projects_cost_type_check;
alter table public.pm_projects alter column cost_type drop not null;
alter table public.pm_projects alter column cost_type drop default;
alter table public.pm_projects add constraint pm_projects_cost_type_check
  check (cost_type is null or cost_type in ('Cost', 'Free Mandays', 'Waived'));

notify pgrst, 'reload schema';
