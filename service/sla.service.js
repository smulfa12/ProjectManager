/**
 * SLA Service — SLA tiket PRL per client & per prioritas.
 *
 *  - Dua jenis SLA: solusi SEMENTARA (workaround) dan solusi PERMANEN.
 *  - Nilai SLA diatur per client (Monitoring Client → SLA PRL), satuan:
 *      "jam"            → jam kalender (24/7)
 *      "hari kerja"     → Senin–Jumat (jam lapor dipertahankan)
 *      "hari kalender"  → semua hari
 *  - Batas SLA dihitung dari Waktu Lapor. Timeline (activity) & reminder otomatis
 *    dibuat dari batas SLA ini.
 */
import * as store from './store.service.js';
import * as master from './master.service.js';

export const UNITS = ['jam', 'hari kerja', 'hari kalender'];
export const KINDS = [
  { key: 'temp', label: 'Solusi Sementara', short: 'Sementara' },
  { key: 'perm', label: 'Solusi Permanen', short: 'Permanen' },
];

/** SLA bawaan bila client belum diatur. */
export const DEFAULT_SLA = {
  Critical: { temp: { v: 4, u: 'jam' }, perm: { v: 3, u: 'hari kerja' } },
  High: { temp: { v: 8, u: 'jam' }, perm: { v: 5, u: 'hari kerja' } },
  Medium: { temp: { v: 1, u: 'hari kerja' }, perm: { v: 10, u: 'hari kerja' } },
  Low: { temp: { v: 3, u: 'hari kerja' }, perm: { v: 20, u: 'hari kerja' } },
};
const FALLBACK = { temp: { v: 1, u: 'hari kerja' }, perm: { v: 10, u: 'hari kerja' } };

export const applies = (p) => master.usesSla(p?.type);

/** Aturan SLA client untuk satu prioritas. */
export function rule(clientId, priority) {
  const client = store.get('clients', clientId);
  return client?.sla?.[priority] || DEFAULT_SLA[priority] || FALLBACK;
}

/** Tabel SLA lengkap satu client (semua prioritas), untuk form setting. */
export function table(clientId) {
  return Object.fromEntries(master.prlPriorities().map((pr) => [pr, rule(clientId, pr)]));
}

export const ruleLabel = (r) => (r && r.v ? `${r.v} ${r.u}` : '-');

/** Tambah durasi SLA ke waktu ISO. */
export function addDuration(iso, r) {
  if (!iso || !r || !Number(r.v)) return '';
  const d = new Date(iso);
  const v = Number(r.v);
  if (r.u === 'jam') d.setTime(d.getTime() + v * 3600 * 1000);
  else if (r.u === 'hari kalender') d.setDate(d.getDate() + v);
  else {
    // hari kerja: lewati Sabtu & Minggu
    let left = v;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) left--;
    }
  }
  return d.toISOString();
}

/** Waktu lapor: reportedAt, atau Date project jam 09:00 WIB. */
export const reportedAt = (p) => p.reportedAt || (p.date ? new Date(`${p.date}T09:00:00+07:00`).toISOString() : '');

/** Batas SLA {temp, perm} untuk project (kosong bila bukan PRL / tanpa prioritas). */
export function dues(p) {
  if (!applies(p) || !p.priority || !p.clientId) return { temp: '', perm: '' };
  const start = reportedAt(p);
  const r = rule(p.clientId, p.priority);
  return { temp: addDuration(start, r.temp), perm: addDuration(start, r.perm) };
}

/**
 * Status SLA satu jenis: met (tercapai), breached (terlambat selesai),
 * open (berjalan), overdue (lewat & belum selesai), none.
 */
export function state(due, doneAt, now = new Date()) {
  if (!due) return { key: 'none', label: '-', tone: 'gray' };
  const d = new Date(due);
  if (doneAt) return new Date(doneAt) <= d ? { key: 'met', label: 'Tercapai', tone: 'green' } : { key: 'breached', label: 'Terlambat', tone: 'red' };
  if (now > d) return { key: 'overdue', label: 'Lewat SLA', tone: 'red' };
  const hours = (d - now) / 3600000;
  return { key: 'open', label: hours < 24 ? `Sisa ${Math.max(1, Math.round(hours))} jam` : `Sisa ${Math.round(hours / 24)} hari`, tone: hours < 24 ? 'amber' : 'blue', hours };
}

/** Status SLA project (temp & perm). */
export function status(p) {
  return {
    temp: state(p.slaTempDue, p.tempDoneAt),
    perm: state(p.slaPermDue, p.permDoneAt),
  };
}

/** Durasi aktual (jam) dari lapor sampai selesai. */
export const actualHours = (p, doneAt) => (doneAt && reportedAt(p) ? Math.round(((new Date(doneAt) - new Date(reportedAt(p))) / 3600000) * 10) / 10 : '');

const isoDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Timeline otomatis: 2 activity per PRL (solusi sementara & permanen) dengan target = batas SLA,
 * di-assign ke PIC MLPT. Activity ini ikut Gantt, Kanban & email reminder.
 */
export async function syncActivities(p) {
  const ids = { temp: `sla-temp-${p.id}`, perm: `sla-perm-${p.id}` };
  if (!applies(p) || !p.slaTempDue) {
    for (const id of Object.values(ids)) if (store.get('activities', id)) await store.remove('activities', id);
    return;
  }
  const member = store.find('members', (m) => m.name && m.name.toLowerCase() === String(p.picMlpt || '').toLowerCase());
  const start = isoDate(reportedAt(p));
  for (const k of KINDS) {
    const id = ids[k.key];
    const due = k.key === 'temp' ? p.slaTempDue : p.slaPermDue;
    const done = k.key === 'temp' ? p.tempDoneAt : p.permDoneAt;
    const before = store.get('activities', id);
    const data = {
      projectId: p.id,
      memberId: member?.id || before?.memberId || '',
      title: `[SLA ${k.short}] ${p.jiraNo || p.code} ${p.title || ''}`.trim(),
      description: `SLA ${k.label} ${p.priority} — batas ${new Date(due).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`,
      planStart: start,
      planEnd: isoDate(due),
      planHours: 0,
      priority: ['Critical', 'High'].includes(p.priority) ? 'high' : p.priority === 'Low' ? 'low' : 'medium',
      status: done ? 'done' : before?.status && before.status !== 'done' ? before.status : 'todo',
      progress: done ? 100 : before?.status === 'done' ? 0 : before?.progress || 0,
      actualStart: before?.actualStart || (done ? start : ''),
      actualEnd: done ? isoDate(done) : '',
    };
    if (!before) await store.add('activities', { id, ...data });
    else if (Object.keys(data).some((f) => String(before[f] ?? '') !== String(data[f] ?? ''))) await store.update('activities', id, data);
  }
}
