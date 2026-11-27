/**
 * Menu 3 — List Project
 * Daftar project + tambah / edit / hapus. Klik Uniq ID untuk detail
 * (Data Project, Timeline, Member Assignment, History Update).
 */
import * as projects from '../../service/project.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import * as auth from '../../service/auth.service.js';
import { downloadCSV } from '../../service/export.service.js';
import { esc, pageHeader, options, emptyState, confirmDialog, attempt } from '../../service/ui.service.js';
import { today } from '../../service/format.service.js';
import { projectTable, bindSort, csvColumns, sortRows } from '../shared/project-table.js';
import { openProjectForm, rememberOrder } from './project-form.js';

const FILTER_KEY = 'pm.project.filter';

export default {
  path: '/project',
  title: 'List Project',
  render(el, params) {
    const openStatuses = () => master.statuses().filter((s) => !s.closed).map((s) => s.name);
    // filter tersimpan selama tab browser terbuka (kembali dari detail tetap sama)
    let saved = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(FILTER_KEY)) || {};
    } catch { /* abaikan */ }
    const state = {
      q: params.q ?? saved.q ?? '',
      clientId: params.client ?? saved.clientId ?? '',
      costType: params.cost ?? saved.costType ?? '',
      type: saved.type ?? '',
      ticket: saved.ticket ?? '',
      // status bisa lebih dari satu; [] = semua status
      statuses: params.status !== undefined ? (params.status ? params.status.split(',') : []) : saved.statuses ?? openStatuses(),
      sortKey: saved.sortKey || 'date',
      sortDir: saved.sortDir || -1,
    };
    const canCreate = clients.list({ includeInactive: false }).length > 0;

    el.innerHTML = `
      ${pageHeader({
        title: 'List Project',
        subtitle: 'Data project, timeline, member assignment & history update',
        icon: '📁',
        actions: `<button class="btn btn--ghost" data-export>⬇ Export</button><button class="btn btn--primary" data-new ${canCreate ? '' : 'disabled title="Belum ada client"'}>+ Project Baru</button>`,
      })}
      <div class="toolbar">
        <input class="input input--search" data-q placeholder="Cari project…" value="${esc(state.q)}" />
        <select class="input input--sm" data-client>${options(clients.list(), state.clientId, { valueKey: 'id', labelKey: 'name', empty: 'Semua client' })}</select>
        <select class="input input--sm" data-f="type">${options(master.types(), state.type, { empty: 'Semua tipe' })}</select>
        <select class="input input--sm" data-f="ticket">${options(projects.TICKET_KINDS, state.ticket, { valueKey: 'key', labelKey: 'label', empty: 'Semua tiket' })}</select>
        <select class="input input--sm" data-f="costType">${options(master.COST_TYPES, state.costType, { empty: 'Semua kategori biaya' })}</select>
      </div>
      <div class="toolbar">
        <span class="small muted">Status:</span>
        <div class="chips" data-status></div>
      </div>
      <div data-list></div>`;

    const listEl = el.querySelector('[data-list]');
    let rows = [];

    let base = []; // hasil semua filter KECUALI status (untuk angka di chip status)
    const draw = () => {
      base = projects
        .list()
        .filter((p) => projects.matches(p, state.q))
        .filter((p) => !state.clientId || p.clientId === state.clientId)
        .filter((p) => !state.costType || p.costType === state.costType)
        .filter((p) => !state.type || p.type === state.type)
        .filter((p) => !state.ticket || projects.ticketKind(p) === state.ticket);
      rows = base.filter((p) => !state.statuses.length || state.statuses.includes(p.status));
      try {
        sessionStorage.setItem(FILTER_KEY, JSON.stringify(state));
      } catch { /* abaikan */ }
      drawStatusChips();

      const order = sortRows(rows, state.sortKey, state.sortDir).map((p) => p.id);
      rememberOrder(order);
      listEl.innerHTML = rows.length
        ? `<div class="card card--flush">${projectTable(rows, {
            sortKey: state.sortKey,
            sortDir: state.sortDir,
            actions: (p) => `
              <button class="btn btn--icon btn--ghost btn--sm" data-edit="${esc(p.id)}" title="Edit">✏️</button>
              ${auth.isAdmin() ? `<button class="btn btn--icon btn--ghost btn--sm" data-del="${esc(p.id)}" title="Hapus">🗑️</button>` : ''}`,
          })}</div>
          <p class="muted small">${rows.length} project · klik judul kolom untuk mengurutkan</p>`
        : emptyState('📁', 'Belum ada project', canCreate ? 'Klik "+ Project Baru" untuk menambah.' : 'Tambahkan client dulu di menu Monitoring Client.');

      bindSort(listEl, state, draw);
      listEl.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openProjectForm({ id: b.dataset.edit, onSaved: draw, ids: order })));
      listEl.querySelectorAll('[data-del]').forEach(
        (b) =>
          (b.onclick = async () => {
            const p = projects.get(b.dataset.del);
            if (!(await confirmDialog(`Hapus project ${p.code}? Activity & history project ini ikut terhapus.`, { okText: 'Hapus', danger: true }))) return;
            await attempt(() => projects.remove(p.id), 'Project dihapus');
            draw();
          })
      );
    };

    el.querySelector('[data-q]').addEventListener('input', (e) => ((state.q = e.target.value), draw()));
    el.querySelector('[data-client]').addEventListener('change', (e) => ((state.clientId = e.target.value), draw()));
    el.querySelectorAll('[data-f]').forEach((sel) => sel.addEventListener('change', () => ((state[sel.dataset.f] = sel.value), draw())));

    /** Chip status: klik untuk pilih / batal pilih (boleh lebih dari satu). */
    function drawStatusChips() {
      const box = el.querySelector('[data-status]');
      const all = master.statusNames();
      const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
      const count = (name) => base.filter((p) => p.status === name).length;
      box.innerHTML = `
        <button class="chip ${sameSet(state.statuses, openStatuses()) ? 'chip--on' : ''}" data-preset="open">Belum selesai <small>${base.filter((p) => openStatuses().includes(p.status)).length}</small></button>
        <button class="chip ${!state.statuses.length ? 'chip--on' : ''}" data-preset="all">Semua <small>${base.length}</small></button>
        <span class="chips__sep"></span>
        ${all
          .map((s) => `<button class="chip chip--check ${state.statuses.includes(s) ? 'chip--on' : ''}" data-s="${esc(s)}">${state.statuses.includes(s) ? '✓ ' : ''}${esc(s)} <small>${count(s)}</small></button>`)
          .join('')}`;
      box.querySelectorAll('[data-preset]').forEach((b) =>
        b.addEventListener('click', () => {
          state.statuses = b.dataset.preset === 'open' ? openStatuses() : [];
          draw();
        })
      );
      box.querySelectorAll('[data-s]').forEach((b) =>
        b.addEventListener('click', () => {
          const s = b.dataset.s;
          state.statuses = state.statuses.includes(s) ? state.statuses.filter((x) => x !== s) : [...state.statuses, s];
          draw();
        })
      );
    }
    el.querySelector('[data-new]').addEventListener('click', () => openProjectForm({ preset: { clientId: state.clientId }, onSaved: (p) => (location.hash = `#/project/detail?id=${p.id}`) }));
    el.querySelector('[data-export]').addEventListener('click', () => downloadCSV(`list-project-${today()}.csv`, csvColumns(), rows));
    draw();
  },
};
