-- =============================================================
--  Project Manager — Migrasi 009: status activity "backlog"
--  Activity yang belum gilirannya dikerjakan masuk antrian Backlog (bukan langsung To Do).
--  Backlog tidak masuk Perlu Follow Up maupun email reminder.
--
--  Jalankan SEKALI di Supabase: SQL Editor → New query → paste → Run. Aman dijalankan ulang.
-- =============================================================
alter table public.pm_activities drop constraint if exists pm_activities_status_check;
alter table public.pm_activities add constraint pm_activities_status_check
  check (status in ('backlog', 'todo', 'progress', 'review', 'done'));
alter table public.pm_activities alter column status set default 'backlog';

notify pgrst, 'reload schema';
