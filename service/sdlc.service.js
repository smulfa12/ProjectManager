/**
 * SDLC Service — tahapan (step) SDLC untuk CR dan PRL, berlaku umum (bukan per client).
 * Diatur di menu Setting SDLC; disimpan di pm_settings 'pm.sdlc'.
 *
 *  - Kategori tiket: PRL (tipe ber-SLA, default PRL) atau CR (tipe lainnya).
 *  - "Generate timeline" membuat 1 activity per step berurutan (durasi hari kerja) mulai dari
 *    Start project (PRL: waktu lapor), di-assign ke member project dengan tim yang sama
 *    (fallback PIC MLPT). Activity ber-id "sdlc-<project>-<n>" → tampil di Gantt, Kanban & reminder.
 */
import * as store from './store.service.js';
import * as master from './master.service.js';
import * as sla from './sla.service.js';
import { today, addDays, addWorkdays, nextWorkday, workDays } from './format.service.js';

export const CATEGORIES = [
  { key: 'CR', label: 'CR / Project', icon: '🛠️' },
  { key: 'PRL', label: 'PRL', icon: '🚨' },
];

export const DEFAULT = {
  CR: [
    { name: 'Requirement Gathering', days: 5, team: 'Business Analyst' },
    { name: 'Analisa & FSD', days: 5, team: 'Business Analyst' },
    { name: 'Approval CR', days: 5, team: 'Business Analyst' },
    { name: 'Development', days: 10, team: 'Developer' },
    { name: 'SIT', days: 5, team: 'QA' },
    { name: 'UAT', days: 5, team: 'QA' },
    { name: 'Deployment / Live', days: 2, team: 'Support' },
    { name: 'BAST', days: 3, team: 'Business Analyst' },
  ],
  PRL: [
    { name: 'Analisa Masalah', days: 1, team: 'Support' },
    { name: 'Solusi Sementara', days: 1, team: 'Developer' },
    { name: 'Perbaikan Program', days: 5, team: 'Developer' },
    { name: 'SIT', days: 2, team: 'QA' },
    { name: 'UAT', days: 2, team: 'QA' },
    { name: 'Deploy / Solusi Permanen', days: 1, team: 'Support' },
    { name: 'Closing', days: 1, team: 'Support' },
  ],
};

export const all = () => ({ ...DEFAULT, ...store.setting('pm.sdlc', {}) });
export const steps = (cat) => all()[cat] || [];
export const save = (cat, list) => master.save('pm.sdlc', { ...store.setting('pm.sdlc', {}), [cat]: list });

/** Kategori SDLC project: PRL (tipe ber-SLA) atau CR. */
export const category = (p) => (sla.applies(p) ? 'PRL' : 'CR');

const PREFIX = (pid) => `sdlc-${pid}-`;
export const isStepActivity = (a) => String(a?.id || '').startsWith('sdlc-');
/** Nama step dari activity SDLC (judul "[Step] ..."). */
export const stepName = (a) => (isStepActivity(a) ? (/^\[([^\]]+)\]/.exec(a.title) || [])[1] || '' : '');

/** Activity step SDLC milik project (urut sesuai step di setting, step lain di akhir). */
export function stepActivities(pid) {
  const p = store.get('projects', pid);
  const order = p ? steps(category(p)).map((s) => s.name.toLowerCase()) : [];
  const rank = (a) => {
    const i = order.indexOf(stepName(a).toLowerCase());
    return i < 0 ? 999 : i;
  };
  return store.filter('activities', (a) => a.id.startsWith(PREFIX(pid))).sort((a, b) => rank(a) - rank(b) || (a.planStart || '').localeCompare(b.planStart || ''));
}

/** Activity step berdasarkan nama step (bukan nomor urut — aman bila step diurutkan ulang). */
const findStep = (acts, name) => acts.find((a) => stepName(a).toLowerCase() === name.toLowerCase()) || null;

/** Tanggal mulai timeline: Start → (PRL) waktu lapor → Date → hari ini. */
function startOf(p) {
  const rep = category(p) === 'PRL' && p.reportedAt ? p.reportedAt.slice(0, 10) : '';
  return nextWorkday(p.startDate || rep || p.date || today());
}

/** Member untuk step: anggota project dengan tim sama, lalu PIC MLPT. */
function memberFor(p, step) {
  const ids = (p.members || []).map((x) => x.memberId);
  const byTeam = step.team && ids.map((id) => store.get('members', id)).find((m) => m && m.team === step.team);
  if (byTeam) return byTeam.id;
  const pic = store.find('members', (m) => m.name && m.name.toLowerCase() === String(p.picMlpt || '').toLowerCase());
  return pic?.id || '';
}

/** Rencana jadwal default (berurutan, hari kerja). */
export function plan(p) {
  let cursor = startOf(p);
  return steps(category(p)).map((s, i) => {
    const planStart = nextWorkday(cursor);
    const planEnd = addWorkdays(planStart, Number(s.days) || 1);
    cursor = addDays(planEnd, 1);
    return { index: i + 1, ...s, planStart, planEnd };
  });
}

/** Durasi step (hari kerja): durasi rencana yang sudah ada (menghargai edit manual), atau dari setting. */
const durationOf = (a, s) => (a?.planStart && a?.planEnd ? workDays(a.planStart, a.planEnd) : 0) || Number(s.days) || 1;

/**
 * Buat / sinkron activity step SDLC.
 *  reset=false: step yang sudah ada tetap (tanggal & progress tidak diubah), hanya judul disesuaikan;
 *               step yang belum ada dibuat menyambung step sebelumnya.
 *  reset=true : HITUNG ULANG DARI REALISASI —
 *               step selesai  → jadwal berikutnya mulai sehari kerja setelah tanggal selesai aktual;
 *               step berjalan → rencana mulai = mulai aktual, durasi tetap;
 *               step belum dikerjakan → digeser menyambung step sebelumnya, durasi tetap.
 * Antrian: step pertama yang belum selesai = To Do, step setelahnya = Backlog.
 * Step yang sudah tidak ada di setting dihapus bila belum dikerjakan.
 */
export async function generate(p, { reset = false } = {}) {
  const list = steps(category(p));
  const existing = stepActivities(p.id);
  const res = { created: 0, updated: 0, removed: 0 };
  let nextNo = existing.reduce((m, a) => Math.max(m, Number(a.id.slice(PREFIX(p.id).length)) || 0), 0) + 1;
  let cursor = startOf(p);
  let queued = false; // sudah ada step yang menjadi To Do / berjalan?
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const before = findStep(existing, s.name);
    const dur = durationOf(before, s);
    const done = before?.status === 'done';
    const started = before && (before.actualStart || ['progress', 'review'].includes(before.status));
    let planStart;
    let planEnd;
    if (before && !reset) {
      planStart = before.planStart || nextWorkday(cursor);
      planEnd = before.planEnd || addWorkdays(planStart, dur);
    } else if (done) {
      planStart = before.planStart;
      planEnd = before.planEnd;
    } else if (started && before.actualStart) {
      planStart = before.actualStart;
      planEnd = addWorkdays(planStart, dur);
    } else {
      planStart = nextWorkday(cursor);
      planEnd = addWorkdays(planStart, dur);
    }
    // langkah berikutnya mulai sehari setelah step ini selesai (aktual bila sudah selesai)
    const endForNext = done && reset ? before.actualEnd || before.planEnd : planEnd;
    cursor = addDays(endForNext, 1);

    // status antrian
    let status = before?.status || 'backlog';
    if (!done) {
      if (started) queued = true;
      else if (!queued) {
        status = 'todo';
        queued = true;
      } else if (status === 'todo' && !Number(before?.progress)) status = 'backlog';
    }
    const data = {
      projectId: p.id,
      title: `[${s.name}] ${p.jiraNo || p.code} ${p.title || ''}`.trim(),
      description: `Step SDLC ${category(p)} ${i + 1}/${list.length}: ${s.name}${s.team ? ' · tim ' + s.team : ''}`,
      planStart,
      planEnd,
      planHours: workDays(planStart, planEnd) * 8,
      status,
    };
    if (!before) {
      await store.add('activities', { id: `${PREFIX(p.id)}${nextNo++}`, ...data, memberId: memberFor(p, s), progress: 0, priority: 'medium', actualStart: '', actualEnd: '' });
      res.created++;
    } else if (Object.keys(data).some((k) => String(before[k] ?? '') !== String(data[k] ?? ''))) {
      await store.update('activities', before.id, data);
      res.updated++;
    }
  }
  const names = list.map((s) => s.name.toLowerCase());
  for (const a of existing.filter((x) => !names.includes(stepName(x).toLowerCase()))) {
    if (['todo', 'backlog'].includes(a.status) && !Number(a.progress)) {
      await store.remove('activities', a.id);
      res.removed++;
    }
  }
  return res;
}

/** Setelah satu step selesai: step berikutnya yang masih Backlog naik ke To Do. */
export async function promoteNext(projectId) {
  if (!projectId) return;
  const next = stepActivities(projectId).find((a) => a.status !== 'done');
  if (next && next.status === 'backlog') await store.update('activities', next.id, { status: 'todo' });
}

/** Status step: step aktif = step pertama yang belum selesai. */
export function progress(p) {
  const acts = stepActivities(p.id);
  const list = steps(category(p));
  const current = list.map((s) => findStep(acts, s.name)).find((a) => a && a.status !== 'done');
  return list.map((s, i) => {
    const a = findStep(acts, s.name);
    return { index: i + 1, ...s, activity: a, done: a?.status === 'done', current: a && a === current, late: a && a.status !== 'done' && a.planEnd && a.planEnd < today() };
  });
}
