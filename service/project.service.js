/**
 * Project Service — data project, perhitungan biaya (TCV, revenue, gross profit),
 * Uniq ID otomatis, member assignment, dan history update.
 */
import * as store from './store.service.js';
import * as auth from './auth.service.js';
import * as master from './master.service.js';
import * as clients from './client.service.js';
import { today } from './format.service.js';

/** Label tiap field (dipakai form, tabel, export, & history). */
export const FIELDS = {
  code: 'Uniq ID Project',
  systemId: 'Project ID Sistem',
  title: 'Nama Project',
  type: 'Tipe',
  clientId: 'Client',
  jiraNo: 'No Jira',
  module: 'Modul',
  crNo: 'No CR Client',
  outstanding: 'Project Outstanding',
  date: 'Date',
  costType: 'Cost/Free Mandays',
  mandays: 'Mandays',
  priceTcv: 'Price TCV',
  revenue: 'Revenue',
  grossProfit: 'Gross Profit',
  bast: 'BAST',
  bastDate: 'Tanggal BAST',
  picBank: 'PIC Bank',
  picMlpt: 'PIC MLPT',
  startDate: 'Start',
  target: 'Target',
  endDate: 'Selesai Aktual',
  status: 'Status',
  remark: 'Remark',
  notes: 'Notes',
};

const NUMERIC = ['mandays', 'priceTcv', 'revenue', 'grossProfit'];

/** Project yang boleh dilihat user ini. */
export function list() {
  const allowed = new Set(auth.allowedClientIds());
  return store.filter('projects', (p) => allowed.has(p.clientId)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.code.localeCompare(a.code));
}

export const get = (id) => store.get('projects', id);

/** Uniq ID berikutnya: PRJ-YYMM-0001 (nomor urut per bulan). */
export function nextCode(date = today()) {
  const prefix = `${master.finance().codePrefix || 'PRJ'}-${date.slice(2, 4)}${date.slice(5, 7)}-`;
  const max = store
    .filter('projects', (p) => p.code?.startsWith(prefix))
    .reduce((m, p) => Math.max(m, Number(p.code.slice(prefix.length)) || 0), 0);
  return prefix + String(max + 1).padStart(4, '0');
}

/**
 * Hitung otomatis nilai project dari mandays & harga client:
 *  - Price TCV   = mandays × price per mandays client  (hanya tipe Cost; Free Mandays / Waived → 0)
 *  - Revenue     = Price TCV
 *  - Gross Profit= Revenue − mandays × biaya internal per mandays (Setting)
 */
export function calculate({ clientId, mandays, costType }) {
  const client = clients.get(clientId);
  const md = Number(mandays) || 0;
  const rate = Number(client?.pricePerMandays) || 0;
  const cost = md * (Number(master.finance().costPerMandays) || 0);
  const priceTcv = costType === 'Cost' ? md * rate : 0;
  return { priceTcv, revenue: priceTcv, grossProfit: priceTcv - cost, rate, cost };
}

function clean(input) {
  const out = {};
  Object.keys(FIELDS).forEach((k) => {
    if (!(k in input)) return;
    out[k] = NUMERIC.includes(k) ? Number(input[k]) || 0 : String(input[k] ?? '').trim();
  });
  if (out.costType && !master.COST_TYPES.includes(out.costType)) out.costType = 'Cost';
  return out;
}

const show = (field, v) => {
  if (field === 'clientId') return clients.nameOf(v);
  return v === '' || v == null ? '-' : String(v);
};

/** Bandingkan nilai lama vs baru → daftar perubahan untuk history. */
function diff(before, after) {
  return Object.keys(FIELDS)
    .filter((k) => k in after && String(before[k] ?? '') !== String(after[k] ?? ''))
    .map((k) => ({ field: k, label: FIELDS[k], from: show(k, before[k]), to: show(k, after[k]) }));
}

async function log(projectId, action, changes, note = '') {
  return store.add('history', { projectId, action, changes, note, byEmail: auth.currentUser()?.email || '' });
}

export async function save(id, input, note = '') {
  const data = clean(input);
  if (!data.clientId) throw new Error('Client wajib dipilih');
  if (!auth.canClient(data.clientId)) throw new Error('Anda tidak meng-handle client ini');
  if (!data.type) throw new Error('Tipe wajib dipilih');
  // PRL (dan tipe tanpa biaya lain): tidak ada biaya — Cost/FreeMandays, mandays, TCV, revenue, GP & BAST kosong
  if (master.isNoCost(data.type)) Object.assign(data, { costType: '', mandays: 0, priceTcv: 0, revenue: 0, grossProfit: 0, bast: '', bastDate: '' });

  if (!id) {
    data.code = data.code || nextCode(data.date || today());
    if (store.find('projects', (p) => p.code === data.code)) throw new Error(`Uniq ID ${data.code} sudah dipakai`);
    data.status = data.status || master.statusNames()[0];
    const row = await store.add('projects', { ...data, members: [], createdBy: auth.currentUser()?.email || '' });
    await log(row.id, 'create', [], note || 'Project dibuat');
    return row;
  }

  const before = get(id);
  if (data.code && data.code !== before.code && store.find('projects', (p) => p.code === data.code && p.id !== id)) throw new Error(`Uniq ID ${data.code} sudah dipakai`);
  const changes = diff(before, data);
  if (data.status && master.isClosed(data.status) && !before.endDate && !data.endDate) data.endDate = today();
  const row = await store.update('projects', id, data);
  if (changes.length || note) await log(id, changes.some((c) => c.field === 'status') ? 'status' : 'update', changes, note);
  return row;
}

export async function remove(id) {
  // activity & history ikut terhapus (database: on delete cascade)
  store.filter('activities', (a) => a.projectId === id).forEach((a) => store.remove('activities', a.id).catch(() => {}));
  return store.remove('projects', id);
}

/* ---------- Member assignment ---------- */

export async function setMembers(id, members, note = '') {
  const before = get(id);
  const names = (list) => list.map((m) => store.get('members', m.memberId)?.name || '?').join(', ') || '-';
  const row = await store.update('projects', id, { members });
  await log(id, 'member', [{ field: 'members', label: 'Member', from: names(before.members || []), to: names(members) }], note);
  return row;
}

/* ---------- History update (catatan) ---------- */

/** "2026-11-27" → "27/11/26" (format Remark seperti di tracker). */
const shortDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

/** Remark project = catatan terbaru, mis. "27/11/26 : Waiting UAT". */
async function syncRemark(projectId) {
  const latest = history(projectId).find((h) => h.action === 'note' && h.note);
  if (!latest) return;
  const remark = `${shortDate(latest.createdAt.slice(0, 10))} : ${latest.note}`;
  if (get(projectId)?.remark !== remark) await store.update('projects', projectId, { remark });
}

/** Tanggal (YYYY-MM-DD) → timestamp jam 09:00 WIB; tanggal hari ini memakai jam sekarang. */
const stamp = (date) => (!date || date === today() ? new Date().toISOString() : new Date(`${date}T09:00:00+07:00`).toISOString());

/** Tambah catatan update. updateRemark = Remark project ikut diganti catatan terbaru. */
export async function addNote(id, note, { date = '', updateRemark = true } = {}) {
  const row = await store.add('history', { projectId: id, action: 'note', changes: [], note, byEmail: auth.currentUser()?.email || '', createdAt: stamp(date) });
  if (updateRemark) await syncRemark(id);
  return row;
}

/** Boleh edit / hapus history: admin, atau user yang menulis catatan itu. */
export const canEditHistory = (h) => auth.isAdmin() || (h.byEmail && h.byEmail === auth.currentUser()?.email);

export async function updateHistory(historyId, { note, date }) {
  const h = store.get('history', historyId);
  if (!h) throw new Error('History tidak ditemukan');
  if (!canEditHistory(h)) throw new Error('Hanya admin / penulis catatan yang bisa mengubah');
  if (!String(note || '').trim() && !(h.changes || []).length) throw new Error('Catatan tidak boleh kosong');
  const patch = { note: String(note || '').trim() };
  if (date && date !== h.createdAt.slice(0, 10)) patch.createdAt = new Date(`${date}T09:00:00+07:00`).toISOString();
  await store.update('history', historyId, patch);
  await syncRemark(h.projectId);
}

export async function removeHistory(historyId) {
  const h = store.get('history', historyId);
  if (!h) return;
  if (!canEditHistory(h)) throw new Error('Hanya admin / penulis catatan yang bisa menghapus');
  await store.remove('history', historyId);
  await syncRemark(h.projectId);
}

export const history = (id) => store.filter('history', (h) => h.projectId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/* ---------- Ringkasan ---------- */

export function summary(rows) {
  const sum = (f) => rows.reduce((s, p) => s + (Number(p[f]) || 0), 0);
  return {
    count: rows.length,
    open: rows.filter((p) => !master.isClosed(p.status)).length,
    overdue: rows.filter((p) => !master.isClosed(p.status) && p.target && p.target < today()).length,
    mandays: sum('mandays'),
    priceTcv: sum('priceTcv'),
    revenue: sum('revenue'),
    grossProfit: sum('grossProfit'),
    // mandays per kategori: Cost (berbayar), Free Mandays, Waived
    mandaysByCost: Object.fromEntries(['Cost', 'Free Mandays', 'Waived'].map((k) => [k, rows.filter((p) => p.costType === k).reduce((s, p) => s + (Number(p.mandays) || 0), 0)])),
  };
}

/** Jenis tiket dari No Jira: "BV" (BV-xxxx), "Channel", atau "Lainnya". */
export function ticketKind(p) {
  const j = String(p.jiraNo || '').trim();
  if (/^BV[\s-]?\d/i.test(j)) return 'BV';
  if (/channel/i.test(j)) return 'Channel';
  return 'Lainnya';
}
/**
 * Link tiket Jira (hanya tiket BV-): URL dasar (Setting → Master Data) + No Jira.
 * "BV 5335" / "bv-5335" dirapikan menjadi "BV-5335". Selain BV- (mis. Channel) tidak punya link.
 */
export function jiraUrl(p) {
  if (ticketKind(p) !== 'BV') return '';
  const key = String(p.jiraNo).trim().toUpperCase().replace(/^BV[\s-]?/, 'BV-');
  const base = master.links().jiraUrl || '';
  return base ? base.replace(/\/?$/, '/') + encodeURIComponent(key) : '';
}

export const TICKET_KINDS = [
  { key: 'BV', label: 'Tiket BV-' },
  { key: 'Channel', label: 'Channel' },
  { key: 'Lainnya', label: 'Lainnya' },
];

/** Teks pencarian sederhana di semua field utama. */
export function matches(p, q) {
  if (!q) return true;
  const hay = [p.code, p.systemId, p.title, p.type, p.jiraNo, p.module, p.crNo, p.picBank, p.picMlpt, p.status, p.remark, p.notes, p.outstanding, clients.nameOf(p.clientId)]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}
