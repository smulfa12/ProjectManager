-- =============================================================
--  Project Manager — Update Price TCV, Revenue & Gross Profit otomatis
--
--    Price TCV    = Mandays × Price per Mandays client      (hanya Cost/FreeMandays = "Cost")
--    Revenue      = Price TCV
--    Gross Profit = Revenue − Mandays × biaya internal per mandays
--                   (Setting → Master Data, default Rp 1.500.000)
--    Free Mandays / Waived → Price TCV, Revenue & Gross Profit = 0 (tidak ditagihkan)
--
--  Isi dulu "Price per Mandays" tiap client (Monitoring Client → Setting Price per Client),
--  lalu jalankan di Supabase: SQL Editor → New query → paste → Run.
--  Aman dijalankan ulang kapan saja (misalnya setelah harga client berubah).
--
--  Project dengan Cost/FreeMandays KOSONG tidak diubah. Untuk ikut menghitungnya sebagai
--  "Cost", ganti  p.cost_type = 'Cost'  menjadi  coalesce(p.cost_type, 'Cost') = 'Cost'
--  pada bagian 1.
-- =============================================================

begin;

-- 0) Cek dulu (opsional): jalankan SELECT ini sendiri untuk melihat hasil sebelum update
-- select p.code, c.code as client, p.cost_type, p.mandays, c.price_per_mandays,
--        p.price_tcv as tcv_lama, p.mandays * c.price_per_mandays as tcv_baru
-- from public.pm_projects p join public.pm_clients c on c.id = p.client_id
-- where p.cost_type = 'Cost' order by p.code;

-- 1) Project berbayar (Cost): TCV = mandays × harga client
with cfg as (
  select coalesce((select (value ->> 'costPerMandays')::numeric from public.pm_settings where key = 'pm.finance'), 1500000) as cost_md
)
update public.pm_projects p
set price_tcv    = p.mandays * c.price_per_mandays,
    revenue      = p.mandays * c.price_per_mandays,
    gross_profit = p.mandays * c.price_per_mandays - p.mandays * cfg.cost_md,
    updated_at   = now()
from public.pm_clients c, cfg
where c.id = p.client_id
  and p.cost_type = 'Cost'
  and (p.price_tcv, p.revenue, p.gross_profit)
      is distinct from (p.mandays * c.price_per_mandays, p.mandays * c.price_per_mandays, p.mandays * c.price_per_mandays - p.mandays * cfg.cost_md);

-- 2) Free Mandays & Waived: tidak ditagihkan
update public.pm_projects
set price_tcv = 0, revenue = 0, gross_profit = 0, updated_at = now()
where cost_type in ('Free Mandays', 'Waived')
  and (price_tcv <> 0 or revenue <> 0 or gross_profit <> 0);

commit;

-- 3) Ringkasan per client setelah update
select c.code as client, c.price_per_mandays,
       count(*) filter (where p.cost_type = 'Cost')  as project_cost,
       sum(p.mandays) filter (where p.cost_type = 'Cost') as mandays_cost,
       sum(p.price_tcv) as total_tcv,
       sum(p.gross_profit) as total_gp
from public.pm_projects p join public.pm_clients c on c.id = p.client_id
group by c.code, c.price_per_mandays
order by c.code;
