-- =============================================================
--  Project Manager — Jadwal reminder email harian (opsional)
--
--  Prasyarat:
--   1. Edge Function "daily-reminder" sudah di-deploy
--      (lihat service/functions/daily-reminder/index.ts & README).
--   2. Secret Edge Function sudah diisi: RESEND_API_KEY, MAIL_FROM, CRON_SECRET.
--   3. Database → Extensions: aktifkan "pg_cron" dan "pg_net".
--
--  Ganti 2 nilai di bawah sebelum Run:
--   <PROJECT_REF>  : bagian depan URL Supabase, cth. abcdefgh (dari https://abcdefgh.supabase.co)
--   <CRON_SECRET>  : sama persis dengan secret CRON_SECRET di Edge Function
--
--  Jadwal default: setiap hari kerja (Senin–Jumat) jam 07:30 WIB = 00:30 UTC.
-- =============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('pm-daily-reminder')
  where exists (select 1 from cron.job where jobname = 'pm-daily-reminder');

select cron.schedule(
  'pm-daily-reminder',
  '30 0 * * 1-5',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := jsonb_build_object('source', 'cron')
  );
  $$
);
