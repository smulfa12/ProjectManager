-- =============================================================
--  Project Manager — Skema database (Supabase / PostgreSQL)
--
--  Jalankan SEKALI di Supabase: SQL Editor → New query → paste → Run.
--  Aman dijalankan ulang (pakai "if not exists" / "or replace").
--  Project Supabase: ProjectManager_
--
--  Relasi:
--    pm_clients ──< pm_projects            (client_id)
--    pm_projects ──< pm_activities         (project_id)
--    pm_projects ──< pm_project_history    (project_id, ikut terhapus)
--    pm_members  ──< pm_activities         (member_id)
--    pm_members.client_ids[]               → client yang di-handle user
--
--  Hak akses (Row Level Security):
--    - Admin  : semua data + menu Setting.
--    - User   : hanya client yang di-handle (Setting → User & Client).
--    - Selama BELUM ada member ber-role admin, semua akun yang login
--      dianggap admin (supaya bisa setup awal). Segera daftarkan diri
--      Anda sebagai admin di menu Setting.
-- =============================================================

-- ---------- Tabel ----------

create table if not exists public.pm_members (
  id              text primary key,
  name            text not null,
  email           text,
  team            text,
  position        text,
  role            text not null default 'member' check (role in ('admin', 'pm', 'member')),
  client_ids      text[] not null default '{}',
  daily_hours     numeric not null default 8,
  reminder        boolean not null default true,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists pm_members_email_key on public.pm_members (lower(email)) where email is not null;

create table if not exists public.pm_clients (
  id                 text primary key,
  code               text not null,
  name               text not null,
  free_mandays       numeric not null default 0,
  contract_date      date,
  pm_start           date,
  pm_end             date,
  pm_frequency       text,
  price_per_mandays  numeric not null default 0,
  pic                text,
  notes              text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists pm_clients_code_key on public.pm_clients (code);

create table if not exists public.pm_projects (
  id            text primary key,
  code          text not null,                 -- Uniq ID Project (PRJ-2611-0001)
  system_id     text,                          -- Project ID Sistem
  title         text,
  type          text,                          -- Tipe tiket
  client_id     text references public.pm_clients(id) on delete restrict,
  jira_no       text,
  module        text,
  cr_no         text,                          -- No CR Client
  outstanding   text,                          -- Project Outstanding
  date          date,
  cost_type     text not null default 'Cost' check (cost_type in ('Cost', 'Free Mandays')),
  mandays       numeric not null default 0,
  price_tcv     numeric not null default 0,
  revenue       numeric not null default 0,
  gross_profit  numeric not null default 0,
  bast          text,
  bast_date     date,
  pic_bank      text,
  pic_mlpt      text,
  start_date    date,
  target        date,
  end_date      date,
  status        text,
  remark        text,
  notes         text,
  members       jsonb not null default '[]',   -- [{memberId, role, mandays}]
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists pm_projects_code_key on public.pm_projects (code);
create index if not exists pm_projects_client_idx on public.pm_projects (client_id);

create table if not exists public.pm_project_history (
  id          text primary key,
  project_id  text not null references public.pm_projects(id) on delete cascade,
  action      text not null,                   -- create | update | member | status
  changes     jsonb not null default '[]',     -- [{field, label, from, to}]
  note        text,
  by_email    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pm_history_project_idx on public.pm_project_history (project_id);

create table if not exists public.pm_activities (
  id            text primary key,
  project_id    text references public.pm_projects(id) on delete cascade,
  member_id     text references public.pm_members(id) on delete set null,
  title         text not null,
  description   text,
  plan_start    date,
  plan_end      date,
  actual_start  date,
  actual_end    date,
  plan_hours    numeric not null default 0,
  progress      numeric not null default 0 check (progress between 0 and 100),
  status        text not null default 'todo' check (status in ('todo', 'progress', 'review', 'done')),
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists pm_activities_member_idx on public.pm_activities (member_id);
create index if not exists pm_activities_project_idx on public.pm_activities (project_id);

create table if not exists public.pm_settings (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.pm_reminder_logs (
  id          text primary key,
  member_id   text references public.pm_members(id) on delete set null,
  email       text,
  subject     text,
  status      text,                            -- sent | failed | skipped
  detail      text,
  source      text,                            -- cron | manual
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Fungsi hak akses ----------

create or replace function public.pm_my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.pm_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.pm_members where lower(email) = public.pm_my_email() and role = 'admin' and active)
    or not exists (select 1 from public.pm_members where role = 'admin' and active)
  );
$$;

create or replace function public.pm_can_client(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.pm_is_admin() or exists (
    select 1 from public.pm_members
    where lower(email) = public.pm_my_email() and active and cid = any(client_ids)
  );
$$;

create or replace function public.pm_can_project(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.pm_is_admin() or exists (
    select 1 from public.pm_projects p where p.id = pid and public.pm_can_client(p.client_id)
  );
$$;

-- ---------- Row Level Security ----------

alter table public.pm_members         enable row level security;
alter table public.pm_clients         enable row level security;
alter table public.pm_projects        enable row level security;
alter table public.pm_project_history enable row level security;
alter table public.pm_activities      enable row level security;
alter table public.pm_settings        enable row level security;
alter table public.pm_reminder_logs   enable row level security;

drop policy if exists "baca" on public.pm_members;
drop policy if exists "admin tulis" on public.pm_members;
create policy "baca" on public.pm_members for select to authenticated using (true);
create policy "admin tulis" on public.pm_members for all to authenticated using (public.pm_is_admin()) with check (public.pm_is_admin());

drop policy if exists "baca" on public.pm_clients;
drop policy if exists "admin tulis" on public.pm_clients;
create policy "baca" on public.pm_clients for select to authenticated using (public.pm_can_client(id));
create policy "admin tulis" on public.pm_clients for all to authenticated using (public.pm_is_admin()) with check (public.pm_is_admin());

drop policy if exists "per client" on public.pm_projects;
create policy "per client" on public.pm_projects for all to authenticated
  using (public.pm_can_client(client_id)) with check (public.pm_can_client(client_id));

drop policy if exists "per project" on public.pm_project_history;
create policy "per project" on public.pm_project_history for all to authenticated
  using (public.pm_can_project(project_id)) with check (public.pm_can_project(project_id));

drop policy if exists "per project" on public.pm_activities;
create policy "per project" on public.pm_activities for all to authenticated
  using (project_id is null or public.pm_can_project(project_id))
  with check (project_id is null or public.pm_can_project(project_id));

drop policy if exists "baca" on public.pm_settings;
drop policy if exists "admin tulis" on public.pm_settings;
create policy "baca" on public.pm_settings for select to authenticated using (true);
create policy "admin tulis" on public.pm_settings for all to authenticated using (public.pm_is_admin()) with check (public.pm_is_admin());

drop policy if exists "baca" on public.pm_reminder_logs;
drop policy if exists "tulis" on public.pm_reminder_logs;
create policy "baca" on public.pm_reminder_logs for select to authenticated using (true);
create policy "tulis" on public.pm_reminder_logs for insert to authenticated with check (true);

grant select, insert, update, delete on
  public.pm_members, public.pm_clients, public.pm_projects, public.pm_project_history,
  public.pm_activities, public.pm_settings, public.pm_reminder_logs
  to authenticated;
revoke all on
  public.pm_members, public.pm_clients, public.pm_projects, public.pm_project_history,
  public.pm_activities, public.pm_settings, public.pm_reminder_logs
  from anon;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['pm_members','pm_clients','pm_projects','pm_project_history','pm_activities','pm_settings'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
