/**
 * Import Service — import project dari Excel / CSV dengan format export project
 * (List Project / Inquiry "Export Excel", sheet "Project & CR" / "PRL" dari menu Laporan,
 * maupun format tracker lama: Bank, PID, Project Outstanding, Cost/FreeMandays, ...).
 *
 *  - Kolom dikenali dari judul kolomnya; urutan bebas, kolom tak dikenal diabaikan.
 *  - ID Project sudah ada → project DIPERBARUI (hanya kolom yang ada di file).
 *    ID Project kosong / baru → project BARU (ID otomatis bila kosong).
 *  - Client dicocokkan dengan nama atau kode client.
 */
import * as projects from './project.service.js';
import * as clients from './client.service.js';
import * as master from './master.service.js';
import * as auth from './auth.service.js';
import * as excel from './excel.service.js';
import { parseNumber, toISODate } from './format.service.js';

/** Judul kolom (huruf kecil, tanpa spasi berlebih) → field project. */
const ALIASES = {
  code: ['id project', 'uniq id project', 'uniq id'],
  systemId: ['project id sistem', 'pid'],
  title: ['nama project', 'nama prl', 'judul'],
  type: ['tipe'],
  clientId: ['client', 'bank', 'nama client'],
  jiraNo: ['no jira', 'jira'],
  module: ['modul'],
  crNo: ['no cr client', 'no cr brks', 'no cr'],
  outstanding: ['project outstanding'],
  date: ['date', 'tanggal'],
  costType: ['cost/free mandays', 'cost/freemandays'],
  mandays: ['mandays'],
  priceTcv: ['price tcv', 'tcv'],
  revenue: ['revenue'],
  grossProfit: ['gross profit', 'gp'],
  bast: ['bast'],
  bastDate: ['tanggal bast'],
  picBank: ['pic bank'],
  picMlpt: ['pic mlpt'],
  startDate: ['start'],
  target: ['target'],
  endDate: ['selesai aktual'],
  status: ['status'],
  remark: ['remark'],
  notes: ['notes', 'catatan'],
  priority: ['prioritas'],
  reportedAt: ['waktu lapor'],
  tempDoneAt: ['solusi sementara selesai'],
  permDoneAt: ['solusi permanen selesai'],
};
const LABEL = Object.fromEntries(Object.entries(ALIASES).flatMap(([f, list]) => list.map((l) => [l, f])));
const DATE_FIELDS = ['date', 'bastDate', 'startDate', 'target', 'endDate'];
const DATETIME_FIELDS = ['reportedAt', 'tempDoneAt', 'permDoneAt'];
const NUMBER_FIELDS = ['mandays', 'priceTcv', 'revenue', 'grossProfit'];

/** Nilai sama? (angka, tanggal/jam, teks) — untuk melewati baris yang tidak berubah. */
function same(field, a, b) {
  if (NUMBER_FIELDS.includes(field)) return (Number(a) || 0) === (Number(b) || 0);
  // waktu dibandingkan per menit (Excel membulatkan detik/milidetik)
  if (DATETIME_FIELDS.includes(field)) return (a ? Math.round(new Date(a).getTime() / 60000) : 0) === (b ? Math.round(new Date(b).getTime() / 60000) : 0);
  return String(a ?? '').trim() === String(b ?? '').trim();
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Nilai sel → tanggal ISO (YYYY-MM-DD). Menerima Date, 27/11/2026, 27-11-2026, 2026-11-27, angka serial Excel. */
function toDateValue(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toISODate(v);
  if (typeof v === 'number') return toISODate(new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000));
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Nilai sel → waktu ISO lengkap. */
function toDateTimeValue(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 9), Number(m[5] || 0)).toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Cari baris judul kolom (baris pertama yang memuat ≥ 3 judul dikenal). */
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const known = rows[i].filter((c) => LABEL[norm(c)]).length;
    if (known >= 3) return i;
  }
  return -1;
}

function findClient(v) {
  const s = norm(v);
  if (!s) return null;
  return clients.list().find((c) => norm(c.name) === s || norm(c.code) === s) || null;
}

/**
 * Baca file → rencana import.
 * Hasil: { sheet, mapped:[{label, field}], ignored:[label], items:[{line, action, code, title, input, existing, errors, warnings}] }
 */
export async function parse(file) {
  const sheets = await excel.readFile(file);
  // pilih sheet yang punya baris judul (utamakan sheet project / PRL)
  const candidates = sheets.map((s) => ({ ...s, header: findHeader(s.rows) })).filter((s) => s.header >= 0);
  if (!candidates.length) throw new Error('Judul kolom tidak dikenali. Gunakan file hasil "Export Excel" dari List Project.');

  const items = [];
  const mapped = new Map();
  const ignored = new Set();
  const seenCodes = new Set();
  const statuses = master.statusNames().map(norm);
  const types = master.types().map(norm);

  for (const sh of candidates) {
    const head = sh.rows[sh.header].map((h) => String(h ?? '').trim());
    const fields = head.map((h) => LABEL[norm(h)] || null);
    head.forEach((h, i) => (fields[i] ? mapped.set(h, fields[i]) : h && ignored.add(h)));

    sh.rows.slice(sh.header + 1).forEach((row, ri) => {
      if (!row.some((v) => String(v ?? '').trim())) return; // baris kosong
      const line = `${sh.name} baris ${sh.header + ri + 2}`;
      const input = {};
      const errors = [];
      const warnings = [];
      fields.forEach((f, i) => {
        if (!f) return;
        const raw = row[i];
        if (f === 'clientId') {
          if (String(raw ?? '').trim() === '') return;
          const c = findClient(raw);
          if (c) input.clientId = c.id;
          else errors.push(`Client "${raw}" tidak dikenal / tidak di-handle`);
        } else if (DATE_FIELDS.includes(f)) {
          const d = toDateValue(raw);
          if (d === null) warnings.push(`${head[i]} "${raw}" bukan tanggal, diabaikan`);
          else input[f] = d;
        } else if (DATETIME_FIELDS.includes(f)) {
          const d = toDateTimeValue(raw);
          if (d === null) warnings.push(`${head[i]} "${raw}" bukan tanggal/jam, diabaikan`);
          else input[f] = d;
        } else if (NUMBER_FIELDS.includes(f)) {
          if (String(raw ?? '').trim() === '') return; // sel kosong = tidak diisi
          input[f] = typeof raw === 'number' ? raw : parseNumber(raw);
        } else {
          input[f] = String(raw ?? '').trim();
        }
      });
      // format tracker lama: Project Outstanding = nama project
      if (!input.title && input.outstanding && !head.some((h) => ['nama project', 'nama prl'].includes(norm(h)))) input.title = input.outstanding;
      if (input.status && /^closed$/i.test(input.status)) input.status = master.statusNames().find((s) => /^closed$/i.test(s)) || input.status;

      const existing = input.code ? projects.list().find((p) => norm(p.code) === norm(input.code)) || null : null;
      if (input.code && seenCodes.has(norm(input.code))) errors.push(`ID Project ${input.code} muncul lebih dari sekali di file`);
      if (input.code) seenCodes.add(norm(input.code));
      const clientId = input.clientId || existing?.clientId;
      if (!clientId && !errors.some((e) => e.startsWith('Client'))) errors.push('Client kosong');
      if (clientId && !auth.canClient(clientId)) errors.push('Anda tidak meng-handle client ini');
      if (!input.type && !existing) errors.push('Tipe kosong');
      if (input.type && !types.includes(norm(input.type))) warnings.push(`Tipe "${input.type}" belum ada di master`);
      if (input.status && !statuses.includes(norm(input.status))) warnings.push(`Status "${input.status}" belum ada di master`);
      if (input.costType && !master.COST_TYPES.map(norm).includes(norm(input.costType))) {
        warnings.push(`Cost/Free Mandays "${input.costType}" tidak dikenal → dikosongkan`);
        input.costType = '';
      }

      // project lama: hanya kolom yang berubah; tidak ada perubahan → dilewati
      const changed = existing ? Object.keys(input).filter((f) => f !== 'code' && !same(f, input[f], existing[f])) : [];
      // project baru tipe Cost tanpa Price TCV di file → hitung dari mandays × harga client
      if (!existing && !errors.length && !('priceTcv' in input) && input.mandays && (input.costType || 'Cost') === 'Cost' && !master.isNoCost(input.type)) {
        Object.assign(input, projects.calculate({ clientId, mandays: input.mandays, costType: 'Cost' }));
        delete input.rate;
        delete input.cost;
      }
      const action = errors.length ? 'error' : !existing ? 'new' : changed.length ? 'update' : 'same';
      if (action === 'update') warnings.unshift(`Berubah: ${changed.map((f) => projects.FIELDS[f] || f).join(', ')}`);
      items.push({ line, action, code: input.code || existing?.code || '(otomatis)', title: input.title || existing?.title || '', input, existing, changed, errors, warnings });
    });
  }
  return { sheets: candidates.map((s) => s.name), mapped: [...mapped].map(([label, field]) => ({ label, field })), ignored: [...ignored], items };
}

/**
 * Jalankan import. opts.updateExisting = false → project yang sudah ada dilewati.
 * onProgress(done, total) dipanggil tiap baris.
 */
export async function run(plan, { updateExisting = true, onProgress } = {}) {
  const todo = plan.items.filter((it) => it.action === 'new' || (it.action === 'update' && updateExisting));
  const result = { created: 0, updated: 0, failed: [] };
  for (let i = 0; i < todo.length; i++) {
    const it = todo[i];
    try {
      if (it.existing) {
        const base = Object.fromEntries(Object.keys(projects.FIELDS).map((k) => [k, it.existing[k] ?? '']));
        const patch = Object.fromEntries(it.changed.map((f) => [f, it.input[f]]));
        await projects.save(it.existing.id, { ...base, ...patch }, 'Import Excel');
        result.updated++;
      } else {
        await projects.save('', it.input, 'Project dibuat dari import Excel');
        result.created++;
      }
    } catch (err) {
      result.failed.push({ line: it.line, code: it.code, message: err.message });
    }
    onProgress?.(i + 1, todo.length);
  }
  return result;
}
