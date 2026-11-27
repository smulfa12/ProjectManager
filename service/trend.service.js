/**
 * Trend Service — data grafik History Trend:
 * pergerakan tiket CLOSE dari tahun ke tahun (dan per bulan) per tipe tiket,
 * plus pendapatan maintenance (amortisasi kontrak).
 */
import * as projects from './project.service.js';
import * as master from './master.service.js';
import * as maintenance from './maintenance.service.js';

/** Tanggal close project: selesai aktual → tanggal BAST → target → date. */
export const closeDate = (p) => p.endDate || p.bastDate || p.target || p.date || p.createdAt?.slice(0, 10) || '';

const isCancel = (p) => /cancel/i.test(p.status || '');
export const isDone = (p) => master.isClosed(p.status) && !isCancel(p);

export const METRICS = [
  { key: 'count', label: 'Jumlah tiket close' },
  { key: 'mandays', label: 'Mandays' },
  { key: 'revenue', label: 'Revenue' },
];
export const MAINT_KEY = '__maintenance';

const value = (p, metric) => (metric === 'count' ? 1 : Number(p[metric]) || 0);

/** Project close yang lolos filter. */
export function closed({ clientId = '' } = {}) {
  return projects.list().filter((p) => isDone(p) && closeDate(p) && (!clientId || p.clientId === clientId));
}

/** Tipe tiket yang ada di data close (urut jumlah terbanyak). */
export function typesIn(rows) {
  const count = {};
  rows.forEach((p) => (count[p.type || '-'] = (count[p.type || '-'] || 0) + 1));
  return Object.keys(count).sort((a, b) => count[b] - count[a]);
}

/**
 * Data tahunan. series = tipe tiket (+ MAINT_KEY untuk revenue maintenance kontrak).
 * Hasil: { years:[...], series:[{key, values:[...]}] }
 */
export function yearly({ clientId = '', metric = 'count', series = [] }) {
  const rows = closed({ clientId });
  const maint = series.includes(MAINT_KEY) && metric === 'revenue' ? maintenance.byYear(clientId) : {};
  const yearsSet = new Set(rows.map((p) => Number(closeDate(p).slice(0, 4))));
  // history: hanya sampai tahun berjalan
  Object.keys(maint).forEach((y) => maint[y] && Number(y) <= new Date().getFullYear() && yearsSet.add(Number(y)));
  const years = [...yearsSet].filter(Boolean).sort();
  return {
    years,
    series: series.map((key) => ({
      key,
      values: years.map((y) =>
        key === MAINT_KEY
          ? maint[y] || 0
          : rows.filter((p) => (p.type || '-') === key && Number(closeDate(p).slice(0, 4)) === y).reduce((s, p) => s + value(p, metric), 0)
      ),
    })),
  };
}

/** Data bulanan untuk satu tahun (Jan–Des). */
export function monthly({ clientId = '', metric = 'count', series = [], year }) {
  const rows = closed({ clientId }).filter((p) => closeDate(p).startsWith(String(year)));
  return series.map((key) => ({
    key,
    values:
      key === MAINT_KEY
        ? metric === 'revenue'
          ? maintenance.byMonth(year, clientId)
          : Array(12).fill(0)
        : Array.from({ length: 12 }, (_, m) =>
            rows.filter((p) => (p.type || '-') === key && Number(closeDate(p).slice(5, 7)) === m + 1).reduce((s, p) => s + value(p, metric), 0)
          ),
  }));
}
