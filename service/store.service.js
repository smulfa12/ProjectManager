/**
 * Store Service
 * Cache data di memori untuk semua menu (cepat dibaca, tanpa menunggu jaringan).
 *
 *  - Mode cloud  : data diambil dari Supabase saat login, setiap perubahan langsung
 *                  dikirim ke database, dan perubahan user lain masuk lewat realtime.
 *  - Mode lokal  : (supabase.config.js kosong) data disimpan di localStorage browser.
 *
 * Semua menu memakai API yang sama: all / get / add / update / remove / setting.
 */
import * as db from './database.service.js';

const LOCAL_KEY = 'pm.data';
const KEYS = Object.keys(db.TABLES);

const data = Object.fromEntries(KEYS.map((k) => [k, []]));
let settings = {};
const listeners = new Set();

export const mode = () => (db.isConfigured() ? 'cloud' : 'local');

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Dengarkan setiap perubahan data (lokal maupun dari user lain). */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (info) => listeners.forEach((fn) => fn(info));

/* ---------- Persistensi lokal ---------- */

function persistLocal() {
  if (mode() !== 'local') return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ data, settings }));
  } catch (err) {
    console.error('Gagal menyimpan data lokal', err);
  }
}

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (!saved) return false;
    KEYS.forEach((k) => (data[k] = saved.data?.[k] || []));
    settings = saved.settings || {};
    return true;
  } catch {
    return false;
  }
}

export const hasData = () => KEYS.some((k) => data[k].length);

/* ---------- Muat data ---------- */

/** Ambil semua data (dari Supabase atau localStorage). */
export async function loadAll() {
  if (mode() === 'local') {
    loadLocal();
    emit({ all: true });
    return;
  }
  const rows = await Promise.all(KEYS.map((k) => db.fetchTable(k)));
  KEYS.forEach((k, i) => (data[k] = rows[i]));
  settings = await db.fetchSettings();
  emit({ all: true });
}

export function clearMemory() {
  KEYS.forEach((k) => (data[k] = []));
  settings = {};
}

/* ---------- Baca ---------- */

export const all = (key) => data[key].slice();
export const get = (key, id) => data[key].find((r) => r.id === id) || null;
export const filter = (key, fn) => data[key].filter(fn);
export const find = (key, fn) => data[key].find(fn) || null;

export function setting(key, fallback) {
  return key in settings && settings[key] != null ? settings[key] : fallback;
}

/* ---------- Tulis ---------- */

function putLocal(key, row) {
  const i = data[key].findIndex((r) => r.id === row.id);
  if (i < 0) data[key].push(row);
  else data[key][i] = row;
}

/** Simpan ke database; bila gagal, kembalikan cache seperti semula lalu lempar error. */
async function commit(key, undo, remote) {
  persistLocal();
  emit({ key });
  if (mode() === 'local') return;
  try {
    await remote();
  } catch (err) {
    undo();
    persistLocal();
    emit({ key });
    throw friendlyError(err);
  }
}

export async function add(key, obj) {
  const now = new Date().toISOString();
  const row = { id: uid(), createdAt: now, updatedAt: now, ...obj };
  putLocal(key, row);
  await commit(key, () => (data[key] = data[key].filter((r) => r.id !== row.id)), () => db.upsertRow(key, row));
  return row;
}

export async function update(key, id, patch) {
  const before = get(key, id);
  if (!before) throw new Error('Data tidak ditemukan');
  const row = { ...before, ...patch, updatedAt: new Date().toISOString() };
  putLocal(key, row);
  await commit(key, () => putLocal(key, before), () => db.upsertRow(key, row));
  return row;
}

export async function remove(key, id) {
  const before = get(key, id);
  data[key] = data[key].filter((r) => r.id !== id);
  await commit(key, () => before && putLocal(key, before), () => db.deleteRow(key, id));
}

/** Simpan banyak baris sekaligus (dipakai import data contoh). */
export async function bulkAdd(key, rows) {
  rows.forEach((r) => putLocal(key, r));
  await commit(key, () => (data[key] = data[key].filter((r) => !rows.some((x) => x.id === r.id))), () => db.upsertRows(key, rows));
}

export async function saveSetting(key, value) {
  const before = settings[key];
  settings[key] = value;
  persistLocal();
  emit({ setting: key });
  if (mode() === 'local') return;
  try {
    await db.setSetting(key, value);
  } catch (err) {
    settings[key] = before;
    emit({ setting: key });
    throw friendlyError(err);
  }
}

/** Hapus semua data lokal (mode lokal saja). */
export function resetLocal() {
  clearMemory();
  localStorage.removeItem(LOCAL_KEY);
  emit({ all: true });
}

/* ---------- Realtime dari user lain ---------- */

export function applyRemote(evt) {
  if (evt.setting) {
    if (evt.value === undefined) delete settings[evt.setting];
    else settings[evt.setting] = evt.value;
    emit({ setting: evt.setting, remote: true });
    return;
  }
  const local = get(evt.key, evt.row.id);
  if (evt.deleted) {
    if (!local) return;
    data[evt.key] = data[evt.key].filter((r) => r.id !== evt.row.id);
  } else {
    if (local && local.updatedAt === evt.row.updatedAt) return; // perubahan sendiri
    putLocal(evt.key, evt.row);
  }
  emit({ key: evt.key, remote: true });
}

/* ---------- Pesan error ---------- */

function friendlyError(err) {
  const code = String(err?.code || '');
  if (code === '42501' || /row-level security/i.test(err?.message || '')) return new Error('Tidak punya akses untuk data ini (cek Setting → User & Client)');
  if (['PGRST204', 'PGRST205', '42703', '42P01'].includes(code)) return new Error('Database perlu diperbarui: jalankan file SQL terbaru di service/database/ (Supabase → SQL Editor)');
  if (code === '23505') return new Error('Data dengan kode yang sama sudah ada');
  if (code === '23503') return new Error('Data masih dipakai / terhubung dengan data lain');
  return err instanceof Error ? err : new Error(err?.message || String(err));
}
