/**
 * Tabel Project — dipakai List Project & Inquiry Project.
 * Kolom bisa diurutkan (klik judul kolom) dan di-export ke CSV.
 */
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import { esc, badge } from '../../service/ui.service.js';
import { number, rupiah, dateLabel, daysUntil } from '../../service/format.service.js';

const statusBadge = (p) => badge(p.status || '-', master.statusOf(p.status).tone);

function targetCell(p) {
  if (!p.target) return '-';
  const late = !master.isClosed(p.status) && daysUntil(p.target) < 0;
  return `<span class="${late ? 'text-red' : ''}" title="${late ? 'Lewat target' : ''}">${dateLabel(p.target)}${late ? ' ⚠' : ''}</span>`;
}

/** Definisi semua kolom Data Project. value = nilai mentah (sort & CSV), html = tampilan. */
export const COLUMNS = [
  // 8 kolom utama tampil paling awal
  { key: 'code', nowrap: true, label: 'ID Project', html: (p) => `<a href="#/project/detail?id=${esc(p.id)}"><b>${esc(p.code)}</b></a>` },
  { key: 'clientId', nowrap: true, label: 'Client', value: (p) => clients.nameOf(p.clientId), html: (p) => `<span title="${esc(clients.nameOf(p.clientId))}">${esc(clients.get(p.clientId)?.code || '-')}</span>` },
  { key: 'type', label: 'Tipe' },
  { key: 'jiraNo', nowrap: true, label: 'No Jira' },
  { key: 'title', label: 'Nama Project', html: (p) => `<span class="clamp">${esc(p.title || '-')}</span>` },
  { key: 'picMlpt', label: 'PIC MLPT' },
  { key: 'target', nowrap: true, label: 'Target', html: targetCell },
  { key: 'status', label: 'Status', html: statusBadge },
  { key: 'systemId', label: 'Project ID Sistem' },
  { key: 'module', label: 'Modul' },
  { key: 'crNo', label: 'No CR Client' },
  { key: 'outstanding', label: 'Project Outstanding', html: (p) => `<span class="clamp">${esc(p.outstanding || '-')}</span>` },
  { key: 'date', label: 'Date', html: (p) => dateLabel(p.date) },
  { key: 'costType', label: 'Cost/Free Mandays', html: (p) => (p.costType ? badge(p.costType, master.costTone(p.costType)) : '<span class="muted">-</span>') },
  { key: 'mandays', label: 'Mandays', num: true, html: (p) => number(p.mandays) },
  { key: 'priceTcv', label: 'Price TCV', num: true, html: (p) => rupiah(p.priceTcv) },
  { key: 'revenue', label: 'Revenue', num: true, html: (p) => rupiah(p.revenue) },
  { key: 'grossProfit', label: 'Gross Profit', num: true, html: (p) => `<span class="${p.grossProfit < 0 ? 'text-red' : ''}">${rupiah(p.grossProfit)}</span>` },
  { key: 'bast', label: 'BAST', html: (p) => (p.bast || p.bastDate ? `${esc(p.bast || '✓')}${p.bastDate ? `<br><small class="muted">${dateLabel(p.bastDate)}</small>` : ''}` : '<span class="muted">-</span>') },
  { key: 'picBank', label: 'PIC Bank' },
  { key: 'remark', label: 'Remark', html: (p) => `<span class="clamp">${esc(p.remark || '-')}</span>` },
  { key: 'notes', label: 'Notes', html: (p) => `<span class="clamp">${esc(p.notes || '-')}</span>` },
];

export const COMPACT = ['code', 'clientId', 'type', 'jiraNo', 'title', 'picMlpt', 'target', 'status', 'module', 'mandays', 'priceTcv'];

const colValue = (c, p) => (c.value ? c.value(p) : p[c.key]);

export function sortRows(rows, key, dir = 1) {
  const col = COLUMNS.find((c) => c.key === key);
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    const x = colValue(col, a);
    const y = colValue(col, b);
    if (col.num) return ((Number(x) || 0) - (Number(y) || 0)) * dir;
    return String(x ?? '').localeCompare(String(y ?? '')) * dir;
  });
}

/** HTML tabel. keys = kolom yang ditampilkan. */
export function projectTable(rows, { keys = COMPACT, sortKey = '', sortDir = 1, actions } = {}) {
  const cols = keys.map((k) => COLUMNS.find((c) => c.key === k)).filter(Boolean);
  const sorted = sortRows(rows, sortKey, sortDir);
  return `
    <div class="table-wrap">
      <table class="table table--hover">
        <thead><tr>
          ${cols.map((c) => `<th class="${c.num ? 'num' : ''} sortable" data-sort="${c.key}">${esc(c.label)}${sortKey === c.key ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}
          ${actions ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${sorted
            .map(
              (p) => `
            <tr data-row="${esc(p.id)}">
              ${cols.map((c) => `<td class="${c.num ? 'num' : ''}${c.nowrap ? ' nowrap' : ''}">${c.html ? c.html(p) : esc(colValue(c, p) || '-')}</td>`).join('')}
              ${actions ? `<td class="actions">${actions(p)}</td>` : ''}
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Klik judul kolom → urutkan. onSort(key, dir). */
export function bindSort(root, state, onSort) {
  root.querySelectorAll('[data-sort]').forEach((th) =>
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      state.sortDir = state.sortKey === key ? -state.sortDir : 1;
      state.sortKey = key;
      onSort();
    })
  );
}

/** Kolom untuk export CSV (nilai mentah). */
export const csvColumns = () => COLUMNS.map((c) => ({ label: c.label, value: (p) => colValue(c, p) }));
