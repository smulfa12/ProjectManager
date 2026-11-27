/**
 * Format Service — angka, rupiah, mandays, tanggal & periode.
 */
const rupiahFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export const rupiah = (n) => rupiahFmt.format(Math.round(Number(n) || 0));
export const number = (n) => numFmt.format(Number(n) || 0);
export const md = (n) => `${number(n)} MD`;
export const pct = (n) => `${Math.round(Number(n) || 0)}%`;

/** "Rp 1,2 jt" — ringkas untuk kartu statistik. */
export function rupiahShort(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}Rp ${(abs / 1e9).toFixed(2).replace('.', ',')} M`;
  if (abs >= 1e6) return `${sign}Rp ${(abs / 1e6).toFixed(1).replace('.', ',')} jt`;
  if (abs >= 1e3) return `${sign}Rp ${Math.round(abs / 1e3)} rb`;
  return rupiah(v);
}

/** "Rp 125.000" / "125.000" / "125000" → 125000. Desimal pakai koma: "2,5" → 2.5 */
export function parseNumber(text) {
  if (typeof text === 'number') return text;
  const s = String(text || '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const today = () => toISODate(new Date());

export function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addYears(iso, n) {
  const d = parseDate(iso);
  d.setFullYear(d.getFullYear() + n);
  return toISODate(d);
}

/** Selisih hari b − a (inklusif = false). */
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

/** Selisih hari dari hari ini ke tanggal (negatif = sudah lewat). */
export const daysUntil = (iso) => (iso ? diffDays(today(), iso) : null);

/** Hari kerja berikutnya bila tanggal jatuh di Sabtu/Minggu. */
export function nextWorkday(iso) {
  let d = iso;
  while ([0, 6].includes(parseDate(d).getDay())) d = addDays(d, 1);
  return d;
}

/** Tanggal selesai untuk n hari kerja mulai dari iso (iso dihitung hari ke-1). */
export function addWorkdays(iso, n) {
  let d = nextWorkday(iso);
  for (let left = Math.max(1, Math.round(n)) - 1; left > 0; ) {
    d = addDays(d, 1);
    if (![0, 6].includes(parseDate(d).getDay())) left--;
  }
  return d;
}

/** Jumlah hari kerja (Senin–Jumat) dari a s/d b, inklusif. */
export function workDays(a, b) {
  if (!a || !b || b < a) return 0;
  let n = 0;
  for (let d = parseDate(a), end = parseDate(b); d <= end; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function dateLabel(iso) {
  if (!iso) return '-';
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export const dayName = (iso) => DAYS[parseDate(iso).getDay()];
export const monthShort = (i) => MONTHS[i];

export function dateTimeLabel(isoTs) {
  if (!isoTs) return '-';
  const d = new Date(isoTs);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Preset periode untuk filter. Mengembalikan {from, to}. */
export function periodRange(preset, custom = {}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'this-month':
      return { from: toISODate(new Date(y, m, 1)), to: toISODate(new Date(y, m + 1, 0)) };
    case 'last-month':
      return { from: toISODate(new Date(y, m - 1, 1)), to: toISODate(new Date(y, m, 0)) };
    case '3-months':
      return { from: toISODate(new Date(y, m - 2, 1)), to: toISODate(new Date(y, m + 1, 0)) };
    case 'this-year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'all':
      return { from: '', to: '' };
    case 'custom':
      return { from: custom.from || '', to: custom.to || '' };
    default:
      return periodRange('this-month');
  }
}

export const inRange = (iso, { from, to }) => (!from || (iso && iso >= from)) && (!to || (iso && iso <= to));
