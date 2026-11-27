/**
 * Client Service — master client, harga per mandays, free mandays, waived,
 * dan perhitungan monitoring pemakaian per client.
 */
import * as store from './store.service.js';
import * as auth from './auth.service.js';
import * as master from './master.service.js';
import * as maintenance from './maintenance.service.js';
import { today, addDays, inRange } from './format.service.js';

/** Client yang boleh dilihat user ini, urut nama. */
export function list({ includeInactive = true } = {}) {
  const allowed = new Set(auth.allowedClientIds());
  return store
    .filter('clients', (c) => allowed.has(c.id) && (includeInactive || c.active !== false))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const get = (id) => store.get('clients', id);
export const nameOf = (id) => get(id)?.name || '-';

/** Daftar PIC Bank: buang baris kosong & nama ganda. */
function cleanPics(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .map((x) => ({ name: String(x.name || '').trim(), position: String(x.position || '').trim(), email: String(x.email || '').trim(), phone: String(x.phone || '').trim() }))
    .filter((x) => x.name && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase()));
}

/** PIC Bank client (daftar), termasuk PIC lama bila daftar masih kosong. */
export function pics(clientId) {
  const c = get(clientId);
  if (!c) return [];
  if (Array.isArray(c.picList) && c.picList.length) return c.picList;
  return c.pic ? [{ name: c.pic, position: '', email: '', phone: '' }] : [];
}

function clean(input) {
  return {
    code: String(input.code || '').trim().toUpperCase(),
    name: String(input.name || '').trim(),
    freeMandays: Number(input.freeMandays) || 0,
    contractDate: input.contractDate || '',
    contractEnd: input.contractEnd || '',
    maintenancePrice: Number(input.maintenancePrice) || 0,
    maintenanceTcv: Number(input.maintenanceTcv) || 0,
    pmStart: input.pmStart || '',
    pmEnd: input.pmEnd || '',
    pmFrequency: input.pmFrequency || '',
    pricePerMandays: Number(input.pricePerMandays) || 0,
    picList: cleanPics(input.picList),
    pic: cleanPics(input.picList)[0]?.name || String(input.pic || '').trim(),
    notes: String(input.notes || '').trim(),
    active: input.active !== false,
  };
}

export async function save(id, input) {
  const data = clean(input);
  if (!data.code || !data.name) throw new Error('Client ID & Nama Client wajib diisi');
  if (data.contractDate && data.contractEnd && data.contractEnd < data.contractDate) throw new Error('Akhir kontrak tidak boleh sebelum tanggal kontrak');
  const dup = store.find('clients', (c) => c.code === data.code && c.id !== id);
  if (dup) throw new Error(`Client ID ${data.code} sudah dipakai ${dup.name}`);
  return id ? store.update('clients', id, data) : store.add('clients', data);
}

export async function remove(id) {
  if (store.find('projects', (p) => p.clientId === id)) throw new Error('Client masih punya project. Nonaktifkan saja.');
  return store.remove('clients', id);
}

export const updatePricing = (id, patch) => store.update('clients', id, patch);

/** Periode free mandays: periode PM → 1 tahun dari tanggal kontrak → tahun berjalan. */
/**
 * Periode pemakaian mandays (free mandays, mandays berbayar, revenue):
 * jangka waktu kontrak (Tanggal Kontrak → Akhir Kontrak) → periode PM → tahun berjalan.
 */
export function period(client) {
  const k = maintenance.contract(client);
  if (k && !k.defaultEnd) return { from: k.start, to: k.end, source: 'Periode kontrak' };
  if (client.pmStart && client.pmEnd) return { from: client.pmStart, to: client.pmEnd, source: 'Periode PM' };
  if (client.contractDate) {
    const y = Number(client.contractDate.slice(0, 4));
    const anniversary = (yy) => `${yy}${client.contractDate.slice(4)}`;
    let from = anniversary(y);
    while (addDays(anniversary(Number(from.slice(0, 4)) + 1), -1) < today()) from = anniversary(Number(from.slice(0, 4)) + 1);
    return { from, to: addDays(anniversary(Number(from.slice(0, 4)) + 1), -1), source: 'Tahun kontrak' };
  }
  const y = today().slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31`, source: 'Tahun berjalan' };
}

/**
 * Ringkasan monitoring satu client.
 * Mandays langsung terpotong sejak tiket dicatat (tanggal tiket di dalam periode kontrak),
 * tanpa menunggu project selesai. Tiket berstatus Cancel/Canceled tidak dihitung.
 */
export function monitoring(client) {
  const range = period(client);
  const projects = store.filter('projects', (p) => p.clientId === client.id);
  const isCancel = (p) => /cancel/i.test(p.status || '');
  const active = projects.filter((p) => !isCancel(p));
  const inPeriod = active.filter((p) => inRange(p.date || p.createdAt?.slice(0, 10), range));
  const sum = (rows, f) => rows.reduce((s, p) => s + (Number(p[f]) || 0), 0);
  const free = inPeriod.filter((p) => p.costType === 'Free Mandays');
  const waived = inPeriod.filter((p) => p.costType === 'Waived');
  const billable = inPeriod.filter((p) => p.costType === 'Cost');
  const freeUsed = sum(free, 'mandays');
  const quota = Number(client.freeMandays) || 0;
  const t = today();
  return {
    range,
    totalProjects: projects.length,
    openProjects: projects.filter((p) => !master.isClosed(p.status)).length,
    overdue: projects.filter((p) => !master.isClosed(p.status) && p.target && p.target < t).length,
    // selesai (bukan cancel) tapi belum ada tanggal BAST / BAST belum signed
    bastPending: projects.filter((p) => master.isClosed(p.status) && !isCancel(p) && !p.bastDate && !/signed/i.test(p.bast || '')).length,
    freeQuota: quota,
    freeUsed,
    freeRemaining: quota - freeUsed,
    freePct: quota ? (freeUsed / quota) * 100 : freeUsed ? 100 : 0,
    freeProjects: free,
    waivedMandays: sum(waived, 'mandays'),
    waivedProjects: waived,
    billableMandays: sum(billable, 'mandays'),
    tcv: sum(inPeriod, 'priceTcv'),
    revenue: sum(inPeriod, 'revenue'),
    grossProfit: sum(inPeriod, 'grossProfit'),
    projectsInPeriod: inPeriod,
  };
}
