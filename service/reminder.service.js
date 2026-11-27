/**
 * Reminder Service — menyusun reminder aktivitas & target harian per member
 * dan mengirimnya lewat email:
 *   - Otomatis tiap pagi: Supabase Edge Function "daily-reminder" + pg_cron
 *   - Manual dari menu Reminder: tombol "Kirim sekarang" (memanggil Edge Function yang sama)
 *   - Cadangan: buka draft email (mailto) di aplikasi email user
 */
import * as store from './store.service.js';
import * as db from './database.service.js';
import * as activities from './activity.service.js';
import * as members from './member.service.js';
import * as master from './master.service.js';
import { today, dateLabel, workDays } from './format.service.js';
import * as auth from './auth.service.js';

/** Isi reminder satu member pada tanggal tertentu. */
export function forMember(member, date = today()) {
  const mine = activities.list().filter((a) => a.memberId === member.id && a.status !== 'done');
  const todayList = mine.filter((a) => activities.isTargetOn(a, date));
  const overdue = mine.filter((a) => a.planEnd && a.planEnd < date);
  const progress = mine.filter((a) => a.status === 'progress' && !todayList.includes(a) && !overdue.includes(a));
  // jam per hari = estimasi jam activity ÷ jumlah hari kerja activity
  const hours = Math.round(todayList.reduce((s, a) => s + (Number(a.planHours) || 0) / (workDays(a.planStart, a.planEnd) || 1), 0) * 10) / 10;
  return { member, date, today: todayList, overdue, progress, hours, empty: !todayList.length && !overdue.length && !progress.length };
}

/** Preview untuk semua member aktif yang menerima reminder. */
export function preview(date = today()) {
  // admin: semua member · PM: member di client yang sama · member: dirinya sendiri
  const me = auth.currentMember();
  const scope = auth.isAdmin() || me?.role === 'pm' ? members.visible() : members.visible().filter((m) => m.id === me?.id);
  return scope
    .filter((m) => m.reminder !== false)
    .map((m) => forMember(m, date));
}

const projectLabel = (a) => {
  const p = store.get('projects', a.projectId);
  return p ? `${p.code}${p.title ? ' ' + p.title : ''}` : 'Internal';
};

/** Teks email polos (untuk mailto & salin). */
export function plainText(r) {
  const line = (a) => `- ${a.title} [${projectLabel(a)}] target ${dateLabel(a.planStart)} s/d ${dateLabel(a.planEnd)}, progress ${a.progress || 0}%`;
  const block = (title, list) => (list.length ? `\n${title} (${list.length}):\n${list.map(line).join('\n')}\n` : '');
  return `Halo ${r.member.name},

Berikut reminder aktivitas & target harian ${dateLabel(r.date)}:
${block('TARGET HARI INI', r.today)}${block('TERLAMBAT', r.overdue)}${block('SEDANG DIKERJAKAN', r.progress)}
Mohon update progress & realisasi activity di aplikasi Project Manager.

Terima kasih.`;
}

export const subject = (r) => `[Reminder] Target ${dateLabel(r.date)} — ${r.today.length} activity, ${r.overdue.length} terlambat`;

export function mailtoLink(r) {
  const cc = master.reminder().cc;
  const params = new URLSearchParams({ subject: subject(r), body: plainText(r) });
  if (cc) params.set('cc', cc);
  return `mailto:${encodeURIComponent(r.member.email || '')}?${params.toString().replace(/\+/g, '%20')}`;
}

/** Kirim via Edge Function. memberIds kosong = semua member yang aktif reminder-nya. */
export async function send({ memberIds = [], date = today(), dryRun = false } = {}) {
  if (store.mode() !== 'cloud') throw new Error('Kirim email butuh Supabase. Di mode lokal pakai tombol "Draft email".');
  const res = await db.invokeFunction('daily-reminder', { memberIds, date, dryRun, source: 'manual' });
  await store.loadAll().catch(() => {});
  return res;
}

export const logs = () => store.all('reminderLogs').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
