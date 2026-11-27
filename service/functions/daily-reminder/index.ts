/**
 * Supabase Edge Function: daily-reminder
 * Mengirim email reminder harian ke tiap member:
 *   - Target hari ini (activity yang rencananya berjalan hari ini)
 *   - Activity terlambat (lewat target, belum selesai)
 *   - Activity sedang dikerjakan
 *
 * Dipanggil oleh:
 *   - pg_cron (lihat database/002_reminder_cron.sql) dengan header x-cron-secret
 *   - Aplikasi (menu Reminder → "Kirim sekarang") dengan login admin
 *
 * Deploy (Supabase CLI):
 *   supabase functions deploy daily-reminder --no-verify-jwt
 *   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Project Manager <pm@domainanda.com>" CRON_SECRET=rahasia-acak
 *
 * Email dikirim memakai Resend (https://resend.com). Ganti fungsi sendEmail()
 * bila ingin memakai penyedia lain (SMTP gateway, SendGrid, Mailgun, dll).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) ?? '';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Tanggal hari ini di zona WIB (UTC+7), format YYYY-MM-DD. */
function todayWIB() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function isAdminCaller(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.rpc('pm_is_admin');
  return !error && data === true;
}

async function sendEmail({ to, cc, subject, html }: { to: string; cc?: string[]; subject: string; html: string }) {
  const key = env('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY belum diisi');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('MAIL_FROM') || 'Project Manager <onboarding@resend.dev>', to: [to], cc, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

type Row = Record<string, any>;

function buildEmail(member: Row, items: { today: Row[]; overdue: Row[]; progress: Row[] }, ctx: { projects: Map<string, Row>; clients: Map<string, Row>; date: string; appUrl: string }) {
  const label = (a: Row) => {
    const p = ctx.projects.get(a.project_id);
    const c = p ? ctx.clients.get(p.client_id) : null;
    return `${esc(a.title)}<br><span style="color:#6b7280;font-size:12px">${esc(p?.code || 'Internal')}${c ? ' · ' + esc(c.name) : ''}</span>`;
  };
  const table = (title: string, color: string, rows: Row[]) =>
    rows.length
      ? `<h3 style="margin:20px 0 8px;color:${color};font-size:15px">${title} (${rows.length})</h3>
         <table cellpadding="8" style="border-collapse:collapse;width:100%;font-size:13px">
           <tr style="background:#f3f4f6;text-align:left"><th>Activity</th><th>Target</th><th>Progress</th></tr>
           ${rows.map((a) => `<tr style="border-bottom:1px solid #e5e7eb"><td>${label(a)}</td><td>${esc(a.plan_start || '-')} s/d ${esc(a.plan_end || '-')}</td><td>${Number(a.progress) || 0}%</td></tr>`).join('')}
         </table>`
      : '';
  // jam per hari = estimasi jam activity ÷ jumlah hari kerja activity
  const workDays = (a: string, b: string) => {
    let n = 0;
    for (let d = new Date(a + 'T00:00:00Z'); d <= new Date(b + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) n++;
    return n || 1;
  };
  const hours = Math.round(items.today.reduce((s, a) => s + (Number(a.plan_hours) || 0) / workDays(a.plan_start, a.plan_end), 0) * 10) / 10;
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:auto;color:#1f2937">
      <h2 style="margin:0 0 4px">Halo ${esc(member.name)} 👋</h2>
      <p style="margin:0;color:#6b7280">Reminder aktivitas & target harian — ${esc(ctx.date)}</p>
      <p>Target hari ini: <b>${items.today.length} activity</b>${hours ? ` (± ${hours} jam dari kapasitas ${Number(member.daily_hours) || 8} jam)` : ''}, terlambat: <b style="color:#b91c1c">${items.overdue.length}</b>.</p>
      ${table('🎯 Target hari ini', '#1d4ed8', items.today)}
      ${table('⏰ Terlambat', '#b91c1c', items.overdue)}
      ${table('🔄 Sedang dikerjakan', '#b45309', items.progress)}
      ${ctx.appUrl ? `<p style="margin-top:24px"><a href="${esc(ctx.appUrl)}#/activity" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Update progress di aplikasi</a></p>` : ''}
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">Email otomatis dari Project Manager. Mohon update realisasi activity setiap hari.</p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const fromCron = env('CRON_SECRET') && req.headers.get('x-cron-secret') === env('CRON_SECRET');
  if (!fromCron && !(await isAdminCaller(req))) return json({ error: 'Tidak diizinkan (hanya admin / cron)' }, 401);

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const [members, activities, projects, clients, settings] = await Promise.all([
    db.from('pm_members').select('*').eq('active', true),
    db.from('pm_activities').select('*').neq('status', 'done'),
    db.from('pm_projects').select('id, code, title, client_id'),
    db.from('pm_clients').select('id, name'),
    db.from('pm_settings').select('key, value').eq('key', 'pm.reminder'),
  ]);
  const err = members.error || activities.error || projects.error || clients.error || settings.error;
  if (err) return json({ error: err.message }, 500);

  const config = settings.data?.[0]?.value || {};
  if (fromCron && config.enabled === false) return json({ ok: true, skipped: 'Reminder dimatikan di Setting' });

  const date = body.date || todayWIB();
  const onlyIds: string[] | null = Array.isArray(body.memberIds) && body.memberIds.length ? body.memberIds : null;
  const ctx = {
    date,
    appUrl: config.appUrl || '',
    projects: new Map((projects.data || []).map((p: Row) => [p.id, p])),
    clients: new Map((clients.data || []).map((c: Row) => [c.id, c])),
  };
  const cc = String(config.cc || '').split(',').map((s) => s.trim()).filter(Boolean);

  const results: Row[] = [];
  for (const m of members.data || []) {
    if (onlyIds ? !onlyIds.includes(m.id) : !m.reminder) continue;
    const mine = (activities.data || []).filter((a: Row) => a.member_id === m.id);
    const items = {
      today: mine.filter((a: Row) => a.plan_start && a.plan_end && a.plan_start <= date && a.plan_end >= date),
      overdue: mine.filter((a: Row) => a.plan_end && a.plan_end < date),
      progress: mine.filter((a: Row) => a.status === 'progress' && !(a.plan_start <= date && a.plan_end >= date) && !(a.plan_end < date)),
    };
    const subject = `[Reminder] Target ${date} — ${items.today.length} activity, ${items.overdue.length} terlambat`;
    let status = 'sent';
    let detail = '';
    if (!m.email) {
      status = 'skipped';
      detail = 'Email member kosong';
    } else if (!items.today.length && !items.overdue.length && !items.progress.length) {
      status = 'skipped';
      detail = 'Tidak ada activity';
    } else if (!body.dryRun) {
      try {
        await sendEmail({ to: m.email, cc, subject, html: buildEmail(m, items, ctx) });
      } catch (e) {
        status = 'failed';
        detail = (e as Error).message;
      }
    } else {
      status = 'skipped';
      detail = 'dry run';
    }
    results.push({ id: uid(), member_id: m.id, email: m.email, subject, status, detail, source: fromCron ? 'cron' : 'manual' });
  }

  if (results.length) await db.from('pm_reminder_logs').insert(results);
  return json({
    ok: true,
    date,
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    results,
  });
});
