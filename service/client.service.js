/**
 * Client Service — master client, harga per mandays, free mandays,
 * dan perhitungan monitoring pemakaian per client.
 */
import * as store from './store.service.js';
import * as auth from './auth.service.js';
import * as master from './master.service.js';
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

function clean(input) {
  return {
    code: String(input.code || '').trim().toUpperCase(),
    name: String(input.name || '').trim(),
    freeMandays: Number(input.freeMandays) || 0,
    contractDate: input.contractDate || '',
    pmStart: input.pmStart || '',
    pmEnd: input.pmEnd || '',
    pmFrequency: input.pmFrequency || '',
    pricePerMandays: Number(input.pricePerMandays) || 0,
    pic: String(input.pic || '').trim(),
    notes: String(input.notes || '').trim(),
    active: input.active !== false,
  };
}

export async function save(id, input) {
  const data = clean(input);
  if (!data.code || !data.name) throw new Error('Client ID & Nama Client wajib diisi');
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
export function period(client) {
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

/** Ringkasan monitoring satu client. */
export function monitoring(client) {
  const range = period(client);
  const projects = store.filter('projects', (p) => p.clientId === client.id);
  const active = projects.filter((p) => p.status !== 'Cancel');
  const inPeriod = active.filter((p) => inRange(p.date || p.createdAt?.slice(0, 10), range));
  const sum = (rows, f) => rows.reduce((s, p) => s + (Number(p[f]) || 0), 0);
  const free = inPeriod.filter((p) => p.costType === 'Free Mandays');
  const billable = inPeriod.filter((p) => p.costType === 'Cost');
  const freeUsed = sum(free, 'mandays');
  const quota = Number(client.freeMandays) || 0;
  const t = today();
  return {
    range,
    totalProjects: projects.length,
    openProjects: projects.filter((p) => !master.isClosed(p.status)).length,
    overdue: projects.filter((p) => !master.isClosed(p.status) && p.target && p.target < t).length,
    bastPending: projects.filter((p) => p.status === 'Done' && !p.bastDate).length,
    freeQuota: quota,
    freeUsed,
    freeRemaining: quota - freeUsed,
    freePct: quota ? (freeUsed / quota) * 100 : freeUsed ? 100 : 0,
    freeProjects: free,
    billableMandays: sum(billable, 'mandays'),
    tcv: sum(inPeriod, 'priceTcv'),
    revenue: sum(inPeriod, 'revenue'),
    grossProfit: sum(inPeriod, 'grossProfit'),
    projectsInPeriod: inPeriod,
  };
}
