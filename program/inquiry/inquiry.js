/**
 * Menu 2 — Inquiry Project
 * Pencarian project dengan banyak filter, ringkasan hasil, dan export CSV.
 */
import * as projects from '../../service/project.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import { downloadExcel } from '../../service/export.service.js';
import { esc, pageHeader, options, emptyState, statCard, attempt } from '../../service/ui.service.js';
import { number, md, rupiahShort, today } from '../../service/format.service.js';
import { projectTable, bindSort, exportColumns, COLUMNS, sortRows } from '../shared/project-table.js';
import { rememberOrder } from '../project/project-form.js';

const KEY = 'pm.inquiry';
const EMPTY = { q: '', clientId: '', type: '', ticket: '', status: '', module: '', costType: '', pic: '', dateFrom: '', dateTo: '', targetFrom: '', targetTo: '', bast: '', flag: '' };

const loadFilter = () => {
  try {
    return { ...EMPTY, ...JSON.parse(sessionStorage.getItem(KEY)) };
  } catch {
    return { ...EMPTY };
  }
};

function apply(f) {
  const t = today();
  return projects.list().filter((p) => {
    if (!projects.matches(p, f.q)) return false;
    if (f.clientId && p.clientId !== f.clientId) return false;
    if (f.type && p.type !== f.type) return false;
    if (f.ticket && projects.ticketKind(p) !== f.ticket) return false;
    if (f.status === '_open' ? master.isClosed(p.status) : f.status && p.status !== f.status) return false;
    if (f.module && p.module !== f.module) return false;
    if (f.costType && p.costType !== f.costType) return false;
    if (f.pic && !`${p.picBank} ${p.picMlpt}`.toLowerCase().includes(f.pic.toLowerCase())) return false;
    if (f.dateFrom && (p.date || '') < f.dateFrom) return false;
    if (f.dateTo && (p.date || '9') > f.dateTo) return false;
    if (f.targetFrom && (p.target || '') < f.targetFrom) return false;
    if (f.targetTo && (p.target || '9') > f.targetTo) return false;
    if (f.bast === 'yes' && !(p.bast || p.bastDate)) return false;
    if (f.bast === 'no' && (p.bast || p.bastDate)) return false;
    if (f.flag === 'overdue' && !(p.target && p.target < t && !master.isClosed(p.status))) return false;
    if (f.flag === 'outstanding' && !p.outstanding) return false;
    return true;
  });
}

export default {
  path: '/inquiry',
  title: 'Inquiry Project',
  render(el) {
    const f = loadFilter();
    const view = { sortKey: 'date', sortDir: -1, keys: COLUMNS.map((c) => c.key) };
    const moduleList = [...new Set([...master.modules(), ...projects.list().map((p) => p.module).filter(Boolean)])].sort();

    el.innerHTML = `
      ${pageHeader({ title: 'Inquiry Project', subtitle: 'Cari & tampilkan data project dengan filter lengkap', icon: '🔎', actions: '<button class="btn btn--ghost" data-export>⬇ Export Excel</button>' })}
      <form class="card filter-card" data-filter>
        <div class="form-grid form-grid--6">
          <label class="field span-2"><span>Kata kunci</span><input class="input" name="q" value="${esc(f.q)}" placeholder="Uniq ID, Jira, CR, nama, PIC, remark…" /></label>
          <label class="field"><span>Client</span><select class="input" name="clientId">${options(clients.list(), f.clientId, { valueKey: 'id', labelKey: 'name', empty: 'Semua' })}</select></label>
          <label class="field"><span>Tipe</span><select class="input" name="type">${options(master.types(), f.type, { empty: 'Semua' })}</select></label>
          <label class="field"><span>Tiket</span><select class="input" name="ticket">${options(projects.TICKET_KINDS, f.ticket, { valueKey: 'key', labelKey: 'label', empty: 'Semua' })}</select></label>
          <label class="field"><span>Status</span><select class="input" name="status"><option value="">Semua</option><option value="_open" ${f.status === '_open' ? 'selected' : ''}>Semua yang belum selesai</option>${options(master.statusNames(), f.status)}</select></label>
          <label class="field"><span>Modul</span><select class="input" name="module">${options(moduleList, f.module, { empty: 'Semua' })}</select></label>
          <label class="field"><span>Cost / Free MD</span><select class="input" name="costType">${options(master.COST_TYPES, f.costType, { empty: 'Semua' })}</select></label>
          <label class="field"><span>PIC Bank / MLPT</span><input class="input" name="pic" value="${esc(f.pic)}" /></label>
          <label class="field"><span>Date dari</span><input class="input" type="date" name="dateFrom" value="${esc(f.dateFrom)}" /></label>
          <label class="field"><span>Date s/d</span><input class="input" type="date" name="dateTo" value="${esc(f.dateTo)}" /></label>
          <label class="field"><span>Target dari</span><input class="input" type="date" name="targetFrom" value="${esc(f.targetFrom)}" /></label>
          <label class="field"><span>Target s/d</span><input class="input" type="date" name="targetTo" value="${esc(f.targetTo)}" /></label>
          <label class="field"><span>BAST</span><select class="input" name="bast">${options([{ v: 'yes', l: 'Sudah BAST' }, { v: 'no', l: 'Belum BAST' }], f.bast, { valueKey: 'v', labelKey: 'l', empty: 'Semua' })}</select></label>
          <label class="field"><span>Khusus</span><select class="input" name="flag">${options([{ v: 'overdue', l: 'Lewat target' }, { v: 'outstanding', l: 'Ada outstanding' }], f.flag, { valueKey: 'v', labelKey: 'l', empty: '-' })}</select></label>
          <div class="field span-3 filter-actions"><button type="button" class="btn btn--ghost btn--sm" data-reset>Reset filter</button></div>
        </div>
      </form>
      <div data-result></div>`;

    const form = el.querySelector('[data-filter]');
    const result = el.querySelector('[data-result]');
    let rows = [];

    const draw = () => {
      rows = apply(f);
      rememberOrder(sortRows(rows, view.sortKey, view.sortDir).map((p) => p.id));
      const s = projects.summary(rows);
      result.innerHTML = rows.length
        ? `
        <div class="stats stats--sm">
          ${statCard({ label: 'Hasil', value: `${number(s.count)} project`, hint: `${s.open} open · ${s.overdue} lewat target`, tone: 'blue' })}
          ${statCard({ label: 'Mandays', value: md(s.mandays), tone: 'purple' })}
          ${statCard({ label: 'Price TCV', value: rupiahShort(s.priceTcv), tone: 'teal' })}
          ${statCard({ label: 'Revenue', value: rupiahShort(s.revenue), tone: 'green' })}
          ${statCard({ label: 'Gross Profit', value: rupiahShort(s.grossProfit), tone: s.grossProfit < 0 ? 'red' : 'green' })}
        </div>
        <div class="card card--flush">${projectTable(rows, { keys: view.keys, sortKey: view.sortKey, sortDir: view.sortDir })}</div>`
        : emptyState('🔎', 'Tidak ada project yang cocok', 'Ubah atau reset filter.');
      bindSort(result, view, draw);
      result.querySelectorAll('[data-row]').forEach((tr) =>
        tr.addEventListener('dblclick', () => (location.hash = `#/project/detail?id=${tr.dataset.row}`))
      );
    };

    const update = () => {
      Object.assign(f, Object.fromEntries(new FormData(form).entries()));
      sessionStorage.setItem(KEY, JSON.stringify(f));
      draw();
    };
    let timer;
    form.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(update, 200);
    });
    form.addEventListener('submit', (e) => e.preventDefault());
    form.querySelector('[data-reset]').addEventListener('click', () => {
      sessionStorage.removeItem(KEY);
      Object.assign(f, EMPTY);
      form.reset();
      form.querySelectorAll('input').forEach((i) => (i.value = ''));
      form.querySelectorAll('select').forEach((s) => (s.value = ''));
      draw();
    });
    el.querySelector('[data-export]').addEventListener('click', () =>
      attempt(() => downloadExcel(`inquiry-project-${today()}.xlsx`, 'Inquiry Project', exportColumns(), sortRows(rows, view.sortKey, view.sortDir)))
    );
    draw();
  },
};
