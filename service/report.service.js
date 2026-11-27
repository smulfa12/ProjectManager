/**
 * Report Service — data Laporan Excel:
 *  1. Laporan Progress Project & PRL
 *  2. Laporan SLA (PRL)
 * Data mengikuti hak akses user (client yang di-handle) dan filter laporan.
 */
import * as projects from './project.service.js';
import * as clients from './client.service.js';
import * as master from './master.service.js';
import * as activities from './activity.service.js';
import * as sla from './sla.service.js';
import * as excel from './excel.service.js';
import { today, dateTimeLabel, dateLabel, inRange } from './format.service.js';

const D = excel.toDate;
const projectDate = (p) => (sla.applies(p) && p.reportedAt ? p.reportedAt.slice(0, 10) : p.date || p.createdAt?.slice(0, 10) || '');
const lastUpdate = (p) => projects.history(p.id).find((h) => h.action !== 'create' && h.note);

/** Project sesuai filter {clientId, from, to, scope: ''|'open'}. */
export function select({ clientId = '', from = '', to = '', scope = '' } = {}) {
  return projects
    .list()
    .filter((p) => (!clientId || p.clientId === clientId) && inRange(projectDate(p), { from, to }))
    .filter((p) => scope !== 'open' || !master.isClosed(p.status))
    .sort((a, b) => clients.nameOf(a.clientId).localeCompare(clients.nameOf(b.clientId)) || (projectDate(b) || '').localeCompare(projectDate(a) || ''));
}

export function counts(filter) {
  const rows = select(filter);
  const prl = rows.filter(sla.applies);
  return { total: rows.length, cr: rows.length - prl.length, prl: prl.length, prlWithSla: prl.filter((p) => p.slaTempDue).length };
}

const titleLines = (judul, f) => [
  judul,
  `Client: ${f.clientId ? clients.nameOf(f.clientId) : 'Semua client'} · Periode: ${f.from ? dateLabel(f.from) : 'awal'} s/d ${f.to ? dateLabel(f.to) : 'sekarang'}${f.scope === 'open' ? ' · hanya yang belum selesai' : ''}`,
  `Dibuat: ${dateTimeLabel(new Date().toISOString())}`,
];

const slaCells = (p, kind) => {
  const due = kind === 'temp' ? p.slaTempDue : p.slaPermDue;
  const done = kind === 'temp' ? p.tempDoneAt : p.permDoneAt;
  return { due: D(due), done: D(done), status: sla.state(due, done).label, hours: sla.actualHours(p, done) };
};

const fileSuffix = (f) => `${f.clientId ? clients.get(f.clientId)?.code || 'client' : 'Semua'}-${today()}`;


/* ---------- Daftar sheet & kolom (untuk pilihan kolom laporan) ---------- */

const C = {
  ringkasan: ['Client', 'Total Tiket', 'Belum Selesai', 'Selesai', 'CR/Project', 'CR Belum Selesai', 'PRL', 'PRL Belum Selesai', 'PRL Lewat SLA', 'Mandays', 'Price TCV', 'Revenue', 'Gross Profit', 'Belum BAST'],
  project: ['No', 'ID Project', 'Client', 'Tipe', 'No Jira', 'Link Jira', 'Nama Project', 'Modul', 'No CR Client', 'PIC Bank', 'PIC MLPT', 'Date', 'Start', 'Target', 'Selesai Aktual', 'Status', 'Lewat Target', 'Progress Activity (%)', 'Cost/Free Mandays', 'Mandays', 'Price TCV', 'Revenue', 'Gross Profit', 'BAST', 'Tanggal BAST', 'Update Terakhir', 'Isi Update Terakhir', 'Notes'],
  prl: ['No', 'ID Project', 'Client', 'No Jira', 'Link Jira', 'Nama PRL', 'Modul', 'Prioritas', 'PIC Bank', 'PIC MLPT', 'Waktu Lapor', 'Batas Solusi Sementara', 'Solusi Sementara Selesai', 'SLA Sementara', 'Batas Solusi Permanen', 'Solusi Permanen Selesai', 'SLA Permanen', 'Status', 'Update Terakhir', 'Isi Update Terakhir'],
  history: ['Tanggal', 'ID Project', 'Client', 'Tipe', 'No Jira', 'Nama Project', 'Update', 'Oleh'],
  slaSummary: ['Client', 'Prioritas', 'Jumlah PRL', 'Sementara - Tercapai', 'Sementara - Terlambat', 'Sementara - Lewat SLA (belum selesai)', 'Sementara - Berjalan', 'Sementara - % Tercapai', 'Permanen - Tercapai', 'Permanen - Terlambat', 'Permanen - Lewat SLA (belum selesai)', 'Permanen - Berjalan', 'Permanen - % Tercapai'],
  slaDetail: ['No', 'ID Project', 'Client', 'No Jira', 'Nama PRL', 'Prioritas', 'PIC MLPT', 'Waktu Lapor', 'SLA Sementara', 'Batas Sementara', 'Selesai Sementara', 'Durasi Sementara (jam)', 'Status SLA Sementara', 'SLA Permanen', 'Batas Permanen', 'Selesai Permanen', 'Durasi Permanen (jam)', 'Status SLA Permanen', 'Status Tiket'],
  slaRules: ['Client', 'Prioritas', 'Solusi Sementara', 'Solusi Permanen', 'Sumber'],
};

/** Sheet & kolom tiap laporan. Kolom "kunci" (mis. Client / ID Project) selalu ikut. */
export function sheets(kind) {
  if (kind === 'sla')
    return [
      { name: 'Ringkasan SLA', columns: C.slaSummary, key: ['Client', 'Prioritas'] },
      { name: 'Detail SLA', columns: C.slaDetail, key: ['ID Project'] },
      { name: 'Ketentuan SLA', columns: C.slaRules, key: ['Client', 'Prioritas'] },
    ];
  return [
    { name: 'Ringkasan', columns: C.ringkasan, key: ['Client'] },
    { name: 'Per Status', columns: ['Client', ...master.statusNames(), 'Total'], key: ['Client'] },
    { name: 'Project & CR', columns: C.project, key: ['ID Project'] },
    { name: 'PRL', columns: C.prl, key: ['ID Project'] },
    { name: 'History Update', columns: C.history, key: ['Tanggal', 'ID Project'] },
  ];
}

/**
 * Pilihan user: { [sheet]: false | string[] }  (false = sheet tidak dibuat, array = kolom dipilih).
 * Tidak ada entri = semua kolom.
 */
function picker(kind, choice = {}) {
  const list = sheets(kind);
  const on = list.filter((sh) => choice[sh.name] !== false);
  if (!on.length) throw new Error('Pilih minimal satu sheet untuk laporan ini');
  return {
    has: (name) => choice[name] !== false,
    only: (name) => {
      const sh = list.find((x) => x.name === name);
      const sel = Array.isArray(choice[name]) ? choice[name] : sh.columns;
      return sh.columns.filter((c) => sh.key.includes(c) || sel.includes(c));
    },
  };
}

/* ---------- 1. Laporan Progress Project & PRL ---------- */

export async function progressReport(filter, choice = {}) {
  const pick = picker('progress', choice);
  const rows = select(filter);
  const isPrl = (p) => sla.applies(p);
  const wb = await excel.workbook();

  // Ringkasan per client
  const byClient = new Map();
  rows.forEach((p) => {
    if (!byClient.has(p.clientId)) byClient.set(p.clientId, []);
    byClient.get(p.clientId).push(p);
  });
  const sum = (list, f) => list.reduce((s, p) => s + (Number(p[f]) || 0), 0);
  const summary = [...byClient.entries()].map(([cid, list]) => {
    const prl = list.filter(isPrl);
    const cr = list.filter((p) => !isPrl(p));
    return {
      Client: clients.nameOf(cid),
      'Total Tiket': list.length,
      'Belum Selesai': list.filter((p) => !master.isClosed(p.status)).length,
      Selesai: list.filter((p) => master.isClosed(p.status)).length,
      'CR/Project': cr.length,
      'CR Belum Selesai': cr.filter((p) => !master.isClosed(p.status)).length,
      PRL: prl.length,
      'PRL Belum Selesai': prl.filter((p) => !master.isClosed(p.status)).length,
      'PRL Lewat SLA': prl.filter((p) => ['overdue', 'breached'].includes(sla.status(p).perm.key)).length,
      Mandays: sum(cr, 'mandays'),
      'Price TCV': sum(cr, 'priceTcv'),
      Revenue: sum(cr, 'revenue'),
      'Gross Profit': sum(cr, 'grossProfit'),
      'Belum BAST': cr.filter((p) => master.isClosed(p.status) && !/cancel/i.test(p.status) && !p.bastDate && !/signed/i.test(p.bast || '')).length,
    };
  });
  if (summary.length > 1) {
    const total = { Client: 'TOTAL' };
    Object.keys(summary[0]).slice(1).forEach((k) => (total[k] = summary.reduce((s, r) => s + r[k], 0)));
    summary.push(total);
  }
  if (pick.has('Ringkasan')) excel.addSheet(wb, 'Ringkasan', summary, { only: pick.only('Ringkasan'), title: titleLines('LAPORAN PROGRESS PROJECT & PRL', filter), columns: ['Client'] });

  // Per status
  const statuses = master.statusNames();
  const perStatus = [...byClient.entries()].map(([cid, list]) => ({
    Client: clients.nameOf(cid),
    ...Object.fromEntries(statuses.map((s) => [s, list.filter((p) => p.status === s).length])),
    Total: list.length,
  }));
  if (pick.has('Per Status')) excel.addSheet(wb, 'Per Status', perStatus, { only: pick.only('Per Status'), columns: ['Client'] });

  // Detail CR / Project
  const crRows = rows.filter((p) => !isPrl(p)).map((p, i) => {
    const acts = activities.ofProject(p.id);
    const lu = lastUpdate(p);
    return {
      No: i + 1,
      'ID Project': p.code,
      Client: clients.nameOf(p.clientId),
      Tipe: p.type,
      'No Jira': p.jiraNo,
      'Link Jira': projects.jiraUrl(p),
      'Nama Project': p.title || p.outstanding,
      Modul: p.module,
      'No CR Client': p.crNo,
      'PIC Bank': p.picBank,
      'PIC MLPT': p.picMlpt,
      Date: D(p.date),
      Start: D(p.startDate),
      Target: D(p.target),
      'Selesai Aktual': D(p.endDate),
      Status: p.status,
      'Lewat Target': p.target && !master.isClosed(p.status) && p.target < today() ? 'Ya' : '',
      'Progress Activity (%)': acts.length ? Math.round(acts.reduce((s, a) => s + (Number(a.progress) || 0), 0) / acts.length) : '',
      'Cost/Free Mandays': p.costType,
      Mandays: Number(p.mandays) || 0,
      'Price TCV': Number(p.priceTcv) || 0,
      Revenue: Number(p.revenue) || 0,
      'Gross Profit': Number(p.grossProfit) || 0,
      BAST: p.bast,
      'Tanggal BAST': D(p.bastDate),
      'Update Terakhir': lu ? D(lu.createdAt) : '',
      'Isi Update Terakhir': lu?.note || p.remark,
      Notes: p.notes,
    };
  });
  if (pick.has('Project & CR')) excel.addSheet(wb, 'Project & CR', crRows, { only: pick.only('Project & CR'), columns: ['ID Project'], widths: { 'Nama Project': 45, 'Isi Update Terakhir': 50, 'Link Jira': 30 } });

  // Detail PRL
  const prlRows = rows.filter(isPrl).map((p, i) => {
    const t = slaCells(p, 'temp');
    const pm = slaCells(p, 'perm');
    const lu = lastUpdate(p);
    return {
      No: i + 1,
      'ID Project': p.code,
      Client: clients.nameOf(p.clientId),
      'No Jira': p.jiraNo,
      'Link Jira': projects.jiraUrl(p),
      'Nama PRL': p.title || p.outstanding,
      Modul: p.module,
      Prioritas: p.priority,
      'PIC Bank': p.picBank,
      'PIC MLPT': p.picMlpt,
      'Waktu Lapor': D(sla.reportedAt(p)),
      'Batas Solusi Sementara': t.due,
      'Solusi Sementara Selesai': t.done,
      'SLA Sementara': t.status,
      'Batas Solusi Permanen': pm.due,
      'Solusi Permanen Selesai': pm.done,
      'SLA Permanen': pm.status,
      Status: p.status,
      'Update Terakhir': lu ? D(lu.createdAt) : '',
      'Isi Update Terakhir': lu?.note || p.remark,
    };
  });
  if (pick.has('PRL')) excel.addSheet(wb, 'PRL', prlRows, { only: pick.only('PRL'), columns: ['ID Project'], widths: { 'Nama PRL': 45, 'Isi Update Terakhir': 50, 'Link Jira': 30 } });

  // History update dalam periode
  const ids = new Set(rows.map((p) => p.id));
  const hist = rows
    .flatMap((p) => projects.history(p.id).filter((h) => h.action !== 'create' && inRange(h.createdAt.slice(0, 10), filter)).map((h) => ({ h, p })))
    .filter(({ p }) => ids.has(p.id))
    .sort((a, b) => b.h.createdAt.localeCompare(a.h.createdAt))
    .map(({ h, p }) => ({
      Tanggal: D(h.createdAt),
      'ID Project': p.code,
      Client: clients.nameOf(p.clientId),
      Tipe: p.type,
      'No Jira': p.jiraNo,
      'Nama Project': p.title || p.outstanding,
      Update: [h.note, ...(h.changes || []).map((c) => `${c.label}: ${c.from} → ${c.to}`)].filter(Boolean).join(' | '),
      Oleh: h.byEmail,
    }));
  if (pick.has('History Update')) excel.addSheet(wb, 'History Update', hist, { only: pick.only('History Update'), columns: ['Tanggal'], widths: { Update: 70, 'Nama Project': 40 } });

  excel.download(wb, `Laporan-Progress-Project-PRL-${fileSuffix(filter)}.xlsx`);
  return { cr: crRows.length, prl: prlRows.length, history: hist.length };
}

/* ---------- 2. Laporan SLA ---------- */

export async function slaReport(filter, choice = {}) {
  const pick = picker('sla', choice);
  const rows = select(filter).filter((p) => sla.applies(p));
  const wb = await excel.workbook();
  const priorities = master.prlPriorities();

  // Ringkasan per client × prioritas
  const summary = [];
  const groups = new Map();
  rows.forEach((p) => {
    const k = `${p.clientId}|${p.priority || '(tanpa prioritas)'}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  });
  const rank = (pr) => (priorities.indexOf(pr) < 0 ? 99 : priorities.indexOf(pr));
  const stat = (list, kind) => {
    const s = list.map((p) => sla.status(p)[kind].key);
    const met = s.filter((x) => x === 'met').length;
    const breached = s.filter((x) => x === 'breached').length;
    const overdue = s.filter((x) => x === 'overdue').length;
    const open = s.filter((x) => x === 'open').length;
    const judged = met + breached + overdue;
    return { met, breached, overdue, open, pct: judged ? Math.round((met / judged) * 1000) / 10 : '' };
  };
  const line = (label, pr, list) => {
    const t = stat(list, 'temp');
    const pm = stat(list, 'perm');
    return {
      Client: label,
      Prioritas: pr,
      'Jumlah PRL': list.length,
      'Sementara - Tercapai': t.met,
      'Sementara - Terlambat': t.breached,
      'Sementara - Lewat SLA (belum selesai)': t.overdue,
      'Sementara - Berjalan': t.open,
      'Sementara - % Tercapai': t.pct,
      'Permanen - Tercapai': pm.met,
      'Permanen - Terlambat': pm.breached,
      'Permanen - Lewat SLA (belum selesai)': pm.overdue,
      'Permanen - Berjalan': pm.open,
      'Permanen - % Tercapai': pm.pct,
    };
  };
  [...groups.entries()]
    .sort(([a], [b]) => {
      const [ca, pa] = a.split('|');
      const [cb, pb] = b.split('|');
      return clients.nameOf(ca).localeCompare(clients.nameOf(cb)) || rank(pa) - rank(pb);
    })
    .forEach(([k, list]) => {
      const [cid, pr] = k.split('|');
      summary.push(line(clients.nameOf(cid), pr, list.filter((p) => p.slaTempDue)));
    });
  if (summary.length) summary.push(line('TOTAL', '', rows.filter((p) => p.slaTempDue)));
  if (pick.has('Ringkasan SLA')) excel.addSheet(wb, 'Ringkasan SLA', summary, { only: pick.only('Ringkasan SLA'),
    title: [...titleLines('LAPORAN SLA PRL', filter), '% Tercapai = tercapai ÷ (tercapai + terlambat + lewat SLA). PRL tanpa prioritas tidak dihitung.'],
    columns: ['Client'],
  });

  // Detail per PRL
  const detail = rows
    .sort((a, b) => clients.nameOf(a.clientId).localeCompare(clients.nameOf(b.clientId)) || rank(a.priority) - rank(b.priority))
    .map((p, i) => {
      const r = p.priority ? sla.rule(p.clientId, p.priority) : null;
      const t = slaCells(p, 'temp');
      const pm = slaCells(p, 'perm');
      return {
        No: i + 1,
        'ID Project': p.code,
        Client: clients.nameOf(p.clientId),
        'No Jira': p.jiraNo,
        'Nama PRL': p.title || p.outstanding,
        Prioritas: p.priority || '(belum diisi)',
        'PIC MLPT': p.picMlpt,
        'Waktu Lapor': D(sla.reportedAt(p)),
        'SLA Sementara': r ? sla.ruleLabel(r.temp) : '',
        'Batas Sementara': t.due,
        'Selesai Sementara': t.done,
        'Durasi Sementara (jam)': t.hours,
        'Status SLA Sementara': t.status,
        'SLA Permanen': r ? sla.ruleLabel(r.perm) : '',
        'Batas Permanen': pm.due,
        'Selesai Permanen': pm.done,
        'Durasi Permanen (jam)': pm.hours,
        'Status SLA Permanen': pm.status,
        'Status Tiket': p.status,
      };
    });
  if (pick.has('Detail SLA')) excel.addSheet(wb, 'Detail SLA', detail, { only: pick.only('Detail SLA'), columns: ['ID Project'], widths: { 'Nama PRL': 45 } });

  // Ketentuan SLA tiap client
  const rules = clients
    .list()
    .filter((c) => !filter.clientId || c.id === filter.clientId)
    .flatMap((c) =>
      priorities.map((pr) => {
        const r = sla.rule(c.id, pr);
        return { Client: c.name, Prioritas: pr, 'Solusi Sementara': sla.ruleLabel(r.temp), 'Solusi Permanen': sla.ruleLabel(r.perm), Sumber: c.sla?.[pr] ? 'Khusus client' : 'Bawaan' };
      })
    );
  if (pick.has('Ketentuan SLA')) excel.addSheet(wb, 'Ketentuan SLA', rules, { only: pick.only('Ketentuan SLA'), columns: ['Client'] });

  excel.download(wb, `Laporan-SLA-PRL-${fileSuffix(filter)}.xlsx`);
  return { prl: rows.length };
}
