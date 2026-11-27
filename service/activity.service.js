/**
 * Activity Service — activity member dengan timeline target (rencana)
 * dan timeline realtime (aktual), dipakai Gantt chart, Kanban, dashboard & reminder.
 */
import * as store from './store.service.js';
import * as auth from './auth.service.js';
import { today, workDays } from './format.service.js';

/** Activity yang boleh dilihat: project-nya boleh diakses, atau activity internal. */
export function list() {
  const allowed = new Set(auth.allowedClientIds());
  const me = auth.currentMember();
  return store
    .filter('activities', (a) => {
      // activity internal (tanpa project): hanya admin & pemiliknya
      if (!a.projectId) return auth.isAdmin() || (me && a.memberId === me.id);
      const p = store.get('projects', a.projectId);
      return p && allowed.has(p.clientId);
    })
    .sort((a, b) => (a.planStart || '9').localeCompare(b.planStart || '9'));
}

export const get = (id) => store.get('activities', id);
export const ofProject = (projectId) => list().filter((a) => a.projectId === projectId);

const isOverdueRaw = (a, t) => a.status !== 'done' && a.planEnd && a.planEnd < t;
export const isOverdue = (a) => isOverdueRaw(a, today());

/** Activity yang menjadi target pada tanggal tertentu (rencana berjalan & belum selesai). */
export const isTargetOn = (a, date) => a.status !== 'done' && a.planStart && a.planEnd && a.planStart <= date && a.planEnd >= date;

/** Terlambat/lebih cepat dari rencana (hari). Positif = terlambat. */
export function slip(a) {
  if (!a.planEnd) return 0;
  const end = a.actualEnd || (a.status === 'done' ? a.planEnd : today());
  if (!a.actualEnd && end <= a.planEnd) return 0;
  return workDays(a.planEnd, end) - 1;
}

function clean(input) {
  const progress = Math.max(0, Math.min(100, Number(input.progress) || 0));
  return {
    projectId: input.projectId || '',
    memberId: input.memberId || '',
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    planStart: input.planStart || '',
    planEnd: input.planEnd || '',
    actualStart: input.actualStart || '',
    actualEnd: input.actualEnd || '',
    planHours: Number(input.planHours) || 0,
    progress,
    status: ['todo', 'progress', 'review', 'done'].includes(input.status) ? input.status : 'todo',
    priority: ['low', 'medium', 'high'].includes(input.priority) ? input.priority : 'medium',
  };
}

/** Lengkapi tanggal aktual sesuai status (realtime). */
function autoActual(data, before = {}) {
  const t = today();
  if (data.status !== 'todo' && !data.actualStart) data.actualStart = before.actualStart || t;
  if (data.status === 'done') {
    data.progress = 100;
    if (!data.actualEnd) data.actualEnd = before.actualEnd || t;
  } else if (before.status === 'done' && data.actualEnd === before.actualEnd) {
    data.actualEnd = '';
  }
  return data;
}

export async function save(id, input) {
  const data = clean(input);
  if (!data.title) throw new Error('Judul activity wajib diisi');
  if (data.planStart && data.planEnd && data.planEnd < data.planStart) throw new Error('Target selesai tidak boleh sebelum tanggal mulai');
  if (data.actualStart && data.actualEnd && data.actualEnd < data.actualStart) throw new Error('Tanggal selesai aktual tidak boleh sebelum mulai aktual');
  const before = id ? get(id) : {};
  autoActual(data, before);
  return id ? store.update('activities', id, data) : store.add('activities', data);
}

/** Pindah kolom kanban. */
export async function move(id, status) {
  const a = get(id);
  if (!a || a.status === status) return a;
  const data = autoActual({ ...a, status, progress: status === 'done' ? 100 : status === 'todo' ? a.progress : Math.max(a.progress, 10) }, a);
  return store.update('activities', id, data);
}

export const remove = (id) => store.remove('activities', id);

/** Ringkasan beban per member untuk rentang tanggal. */
export function memberLoad(memberId, { from, to }) {
  const rows = list().filter((a) => a.memberId === memberId);
  const active = rows.filter((a) => a.status !== 'done' && a.planStart && a.planEnd && a.planStart <= to && a.planEnd >= from);
  const capacityDays = workDays(from, to);
  // jam rencana dibagi rata ke hari kerja activity; hitung porsi yang jatuh di rentang ini
  const plannedHours = active.reduce((s, a) => {
    const total = workDays(a.planStart, a.planEnd) || 1;
    const overlap = workDays(a.planStart > from ? a.planStart : from, a.planEnd < to ? a.planEnd : to);
    const hours = Number(a.planHours) || total * 8;
    return s + (hours * overlap) / total;
  }, 0);
  return {
    total: rows.length,
    active: active.length,
    open: rows.filter((a) => a.status !== 'done').length,
    done: rows.filter((a) => a.status === 'done').length,
    overdue: rows.filter((a) => isOverdue(a)).length,
    plannedHours,
    capacityDays,
  };
}
