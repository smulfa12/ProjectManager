/**
 * Maintenance Service — kontrak maintenance per client dan amortisasinya.
 *
 *  - Harga maintenance per tahun (tahun berjalan) disimpan di client.
 *  - TCV kontrak = nilai total kontrak; bila kosong dihitung otomatis:
 *      TCV = harga per tahun × panjang kontrak (bulan) ÷ 12
 *  - Amortisasi: TCV diakui merata per hari sepanjang masa kontrak, sehingga
 *      pengakuan suatu periode = TCV ÷ total hari kontrak × hari kontrak di periode itu.
 */
import * as store from './store.service.js';
import * as auth from './auth.service.js';
import { today, addDays, addYears, diffDays } from './format.service.js';

const MONTH_DAYS = 365.25 / 12;

/** Periode kontrak: mulai = Tanggal Kontrak, akhir = Akhir Kontrak (default 1 tahun). */
export function contract(c) {
  if (!c?.contractDate) return null;
  const start = c.contractDate;
  const end = c.contractEnd && c.contractEnd >= start ? c.contractEnd : addDays(addYears(start, 1), -1);
  const days = diffDays(start, end) + 1;
  return { start, end, days, months: Math.max(1, Math.round(days / MONTH_DAYS)), defaultEnd: !c.contractEnd };
}

/** TCV otomatis dari harga per tahun × panjang kontrak. */
export function autoTcv(price, start, end) {
  if (!price || !start) return 0;
  const k = contract({ contractDate: start, contractEnd: end });
  return Math.round((Number(price) * k.months) / 12);
}

export function tcv(c) {
  const k = contract(c);
  if (!k) return 0;
  return Number(c.maintenanceTcv) || autoTcv(c.maintenancePrice, k.start, k.end);
}

/** Nilai yang diakui pada rentang tanggal {from, to} (inklusif). */
export function recognized(c, { from, to }) {
  const k = contract(c);
  const total = tcv(c);
  if (!k || !total) return 0;
  const s = from > k.start ? from : k.start;
  const e = to < k.end ? to : k.end;
  if (e < s) return 0;
  return (total / k.days) * (diffDays(s, e) + 1);
}

/** Jadwal pengakuan per tahun kalender. */
export function schedule(c) {
  const k = contract(c);
  if (!k) return [];
  const rows = [];
  for (let y = Number(k.start.slice(0, 4)); y <= Number(k.end.slice(0, 4)); y++) {
    const range = { from: `${y}-01-01`, to: `${y}-12-31` };
    const s = range.from > k.start ? range.from : k.start;
    const e = range.to < k.end ? range.to : k.end;
    rows.push({ year: y, from: s, to: e, months: Math.round((diffDays(s, e) + 1) / MONTH_DAYS), amount: recognized(c, range) });
  }
  return rows;
}

/** Ringkasan untuk tahun berjalan. */
export function summary(c, year = Number(today().slice(0, 4))) {
  const k = contract(c);
  const total = tcv(c);
  const t = today();
  if (!k) return { hasContract: false, tcv: 0, price: Number(c.maintenancePrice) || 0 };
  const yearRange = { from: `${year}-01-01`, to: `${year}-12-31` };
  const toDate = recognized(c, { from: k.start, to: t < k.end ? t : k.end });
  return {
    hasContract: true,
    ...k,
    price: Number(c.maintenancePrice) || 0,
    tcv: total,
    tcvAuto: !Number(c.maintenanceTcv),
    monthly: total / k.months,
    year,
    yearAmount: recognized(c, yearRange),
    ytd: recognized(c, { from: yearRange.from, to: t < yearRange.to ? t : yearRange.to }),
    toDate,
    remaining: total - toDate,
    progress: total ? (toDate / total) * 100 : 0,
    status: t < k.start ? 'Belum mulai' : t > k.end ? 'Berakhir' : 'Aktif',
    daysLeft: diffDays(t, k.end),
  };
}

/** Total pengakuan maintenance per tahun untuk client yang boleh dilihat. {year: amount} */
export function byYear(clientId = '') {
  const allowed = new Set(auth.allowedClientIds());
  const out = {};
  store
    .filter('clients', (c) => allowed.has(c.id) && (!clientId || c.id === clientId))
    .forEach((c) => schedule(c).forEach((r) => (out[r.year] = (out[r.year] || 0) + r.amount)));
  return out;
}

/** Pengakuan maintenance per bulan dalam satu tahun. [12 angka] */
export function byMonth(year, clientId = '') {
  const allowed = new Set(auth.allowedClientIds());
  const clients = store.filter('clients', (c) => allowed.has(c.id) && (!clientId || c.id === clientId));
  return Array.from({ length: 12 }, (_, m) => {
    const from = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const to = addDays(m === 11 ? `${year + 1}-01-01` : `${year}-${String(m + 2).padStart(2, '0')}-01`, -1);
    return clients.reduce((s, c) => s + recognized(c, { from, to }), 0);
  });
}
