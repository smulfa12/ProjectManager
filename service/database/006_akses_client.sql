-- =============================================================
--  Project Manager — Migrasi 006: akses data sesuai client yang di-handle
--
--  Sebelumnya (001): client, project, history & activity sudah dibatasi per client.
--  Tambahan di file ini:
--   1. Activity internal (tanpa project) hanya terlihat oleh Admin & pemiliknya
--      (sebelumnya terlihat semua user).
--   2. Hapus project hanya untuk Admin (user lain tetap bisa tambah / edit
--      project di client yang mereka handle).
--   3. Log reminder email hanya terlihat oleh Admin & penerimanya.
--   4. User nonaktif tidak bisa melihat data client apa pun.
--
--  Jalankan SEKALI di Supabase: SQL Editor → New query → paste → Run. Aman dijalankan ulang.
-- =============================================================

-- id member milik user yang login (berdasarkan email akun)
create or replace function public.pm_my_member_id() returns text
language sql stable security definer set search_path = public as $$
  select id from public.pm_members where lower(email) = public.pm_my_email() and active limit 1;
$$;

-- 4) user nonaktif: tidak punya akses client (pm_can_client sudah memeriksa "active"; dipertegas)
create or replace function public.pm_can_client(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.pm_is_admin() or exists (
    select 1 from public.pm_members
    where lower(email) = public.pm_my_email() and active and cid is not null and cid = any(client_ids)
  );
$$;

-- 1) Activity
drop policy if exists "per project" on public.pm_activities;
drop policy if exists "per client" on public.pm_activities;
create policy "per client" on public.pm_activities for all to authenticated
  using (
    case when project_id is null then public.pm_is_admin() or member_id = public.pm_my_member_id()
         else public.pm_can_project(project_id) end
  )
  with check (
    case when project_id is null then public.pm_is_admin() or member_id = public.pm_my_member_id()
         else public.pm_can_project(project_id) end
  );

-- 2) Project: baca / tambah / ubah per client, hapus khusus admin
drop policy if exists "per client" on public.pm_projects;
drop policy if exists "baca per client" on public.pm_projects;
drop policy if exists "tambah per client" on public.pm_projects;
drop policy if exists "ubah per client" on public.pm_projects;
drop policy if exists "hapus admin" on public.pm_projects;
create policy "baca per client" on public.pm_projects for select to authenticated using (public.pm_can_client(client_id));
create policy "tambah per client" on public.pm_projects for insert to authenticated with check (public.pm_can_client(client_id));
create policy "ubah per client" on public.pm_projects for update to authenticated
  using (public.pm_can_client(client_id)) with check (public.pm_can_client(client_id));
create policy "hapus admin" on public.pm_projects for delete to authenticated using (public.pm_is_admin());

-- 3) Log reminder
drop policy if exists "baca" on public.pm_reminder_logs;
create policy "baca" on public.pm_reminder_logs for select to authenticated
  using (public.pm_is_admin() or member_id = public.pm_my_member_id());

notify pgrst, 'reload schema';
