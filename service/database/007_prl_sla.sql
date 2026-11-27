-- =============================================================
--  Project Manager — Migrasi 007: prioritas PRL & SLA per client
--
--  pm_clients.sla          : SLA per prioritas, mis.
--      {"Critical": {"temp": {"v": 4, "u": "jam"}, "perm": {"v": 3, "u": "hari kerja"}}, ...}
--      temp = solusi sementara (workaround), perm = solusi permanen
--  pm_projects (khusus PRL):
--      priority      prioritas tiket
--      reported_at   waktu tiket dilaporkan (awal hitung SLA)
--      sla_temp_due  batas SLA solusi sementara   (dihitung aplikasi dari SLA client)
--      sla_perm_due  batas SLA solusi permanen
--      temp_done_at  realisasi solusi sementara
--      perm_done_at  realisasi solusi permanen
--
--  Jalankan SEKALI di Supabase: SQL Editor → New query → paste → Run. Aman dijalankan ulang.
-- =============================================================
alter table public.pm_clients  add column if not exists sla jsonb not null default '{}';

alter table public.pm_projects add column if not exists priority     text;
alter table public.pm_projects add column if not exists reported_at  timestamptz;
alter table public.pm_projects add column if not exists sla_temp_due timestamptz;
alter table public.pm_projects add column if not exists sla_perm_due timestamptz;
alter table public.pm_projects add column if not exists temp_done_at timestamptz;
alter table public.pm_projects add column if not exists perm_done_at timestamptz;

create index if not exists pm_projects_sla_idx on public.pm_projects (sla_perm_due) where sla_perm_due is not null;

notify pgrst, 'reload schema';
